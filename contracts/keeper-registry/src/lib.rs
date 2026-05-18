//! XCron KeeperRegistry Contract
//!
//! Manages keeper enrollment, EGLD staking, progressive slashing, and
//! reputation tracking. Keepers stake EGLD to participate in task execution
//! and earn rewards proportional to their reliability.

#![no_std]

multiversx_sc::imports!();

pub mod config;
pub mod events;
pub mod storage;
pub mod validation;
pub mod views;

#[multiversx_sc::contract]
pub trait KeeperRegistryContract:
    storage::StorageModule
    + events::EventsModule
    + views::ViewsModule
    + config::ConfigModule
    + validation::ValidationModule
    + common::pausable::PausableModule
{
    #[init]
    fn init(
        &self,
        min_stake: BigUint,
        slash_pct_bps: u64,
        cooldown_seconds: u64,
        treasury_addr: ManagedAddress,
    ) {
        require!(slash_pct_bps <= 10_000, "Slash percentage cannot exceed 100%");
        // L-5: Prevent deploying with zero treasury — slashed funds would be burned
        require!(!treasury_addr.is_zero(), "Treasury address cannot be zero");

        self.min_stake().set(&min_stake);
        self.slash_pct_bps().set(slash_pct_bps);
        self.cooldown_seconds().set(cooldown_seconds);
        self.treasury_addr().set(&treasury_addr);
        self.paused().set(false);
        self.version().set(1u32);
    }

    /// Safe upgrade — preserves storage, bumps version, initializes new mappers.
    #[upgrade]
    fn upgrade(&self) {
        self.version().update(|v| *v += 1);
        // set_if_empty: only sets values on first upgrade that adds them
        self.cooldown_seconds().set_if_empty(common::constants::UNSTAKE_COOLDOWN_SECONDS);
        self.total_committed_cooldown_egld().set_if_empty(BigUint::zero());
    }

    // ── Circuit Breaker ── (provided by common::pausable::PausableModule)

    // ═══════════════════════════════════════════════════════════
    //  KEEPER REGISTRATION
    // ═══════════════════════════════════════════════════════════

    /// Register as a keeper by staking EGLD ≥ min_stake.
    #[payable("EGLD")]
    #[endpoint(registerKeeper)]
    fn register_keeper(&self) {
        self.require_not_paused();
        let caller = self.blockchain().get_caller();
        let stake = self.call_value().egld().clone_value();

        require!(self.keepers(&caller).is_empty(), "Keeper already registered");
        require!(stake >= self.min_stake().get(), "Stake below minimum");

        let info = common::types::KeeperInfo {
            addr: caller.clone(),
            stake,
            registered_at: self.blockchain().get_block_timestamp_seconds().as_u64_seconds(),
            total_executions: 0,
            successful_execs: 0,
            failed_execs: 0,
            slashed_amount: BigUint::zero(),
            active: true,
            consecutive_failures: 0,
        };

        self.keepers(&caller).set(&info);
        self.active_keeper_set().insert(caller.clone());
        self.keeper_registered_event(&caller);
    }

    /// Add more stake to an existing registration.
    #[payable("EGLD")]
    #[endpoint(addStake)]
    fn add_stake(&self) {
        self.require_not_paused();
        let caller = self.blockchain().get_caller();
        require!(!self.keepers(&caller).is_empty(), "Keeper not registered");

        let additional = self.call_value().egld().clone_value();
        let mut info = self.keepers(&caller).get();
        info.stake += additional;
        self.keepers(&caller).set(&info);
        // I-6: Event for stake tracking
        self.keeper_registered_event(&caller);
    }

    // ═══════════════════════════════════════════════════════════
    //  UNSTAKING
    // ═══════════════════════════════════════════════════════════

    /// Request unstake — triggers cooldown period.
    /// 🛡️ V3/V5: Atomically tracks committed EGLD for liquidity reserve.
    #[endpoint(requestUnstake)]
    fn request_unstake(&self) {
        self.require_not_paused();
        let caller = self.blockchain().get_caller();
        let mut info = self.keepers(&caller).get();

        require!(info.active, "Keeper not active");

        info.active = false;
        self.keepers(&caller).set(&info);
        self.active_keeper_set().swap_remove(&caller);
        self.unstake_request_time(&caller)
            .set(self.blockchain().get_block_timestamp_seconds().as_u64_seconds());
        
        // V3/V5 FIX: Track committed cooldown EGLD atomically
        self.total_committed_cooldown_egld().update(|total| *total += &info.stake);
    }

    /// Withdraw stake after cooldown period has elapsed.
    /// If withdrawing before 30 days since registration: 5% early exit penalty.
    /// 🛡️ V3/V5: Atomically releases committed EGLD from liquidity reserve.
    #[endpoint(withdrawStake)]
    fn withdraw_stake(&self) {
        let caller = self.blockchain().get_caller();
        let info = self.keepers(&caller).get();

        require!(!info.active, "Must request unstake first");

        let request_time = self.unstake_request_time(&caller).get();
        let current = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
        require!(
            current >= request_time + self.cooldown_seconds().get(),
            "Cooldown not elapsed"
        );

        // V3/V5 FIX: Release committed EGLD from cooldown tracker
        let stake_to_release = info.stake.clone();
        self.total_committed_cooldown_egld().update(|total| {
            if *total >= stake_to_release {
                *total -= &stake_to_release;
            } else {
                *total = BigUint::zero();
            }
        });

        // Early exit penalty: 5% if withdrawing before 30 days
        let mut amount = info.stake.clone();
        if current < info.registered_at + common::constants::MIN_KEEPER_DAYS_SECONDS {
            let penalty = &amount * common::constants::EARLY_EXIT_PENALTY_BPS / common::constants::BPS_DENOMINATOR;
            amount -= &penalty;
            let treasury = self.treasury_addr().get();
            self.send().direct_egld(&treasury, &penalty);
        }

        self.keepers(&caller).clear();
        self.unstake_request_time(&caller).clear();

        self.send().direct_egld(&caller, &amount);
        self.keeper_unregistered_event(&caller);
    }

    // ═══════════════════════════════════════════════════════════
    //  SLASHING
    // ═══════════════════════════════════════════════════════════

    /// Slash a keeper's stake. Only callable by authorized contracts.
    #[endpoint(slashKeeper)]
    fn slash_keeper(&self, keeper: ManagedAddress, reason: ManagedBuffer) {
        self.require_authorized_caller();

        let mut info = self.keepers(&keeper).get();
        let calculated_slash =
            &info.stake * self.slash_pct_bps().get() / common::constants::BPS_DENOMINATOR;
            
        let slash_amount = if info.stake > calculated_slash {
            calculated_slash
        } else {
            info.stake.clone()
        };

        info.stake -= &slash_amount;
        info.slashed_amount += &slash_amount;

        // Auto-deactivate if stake falls below minimum
        if info.stake < self.min_stake().get() {
            info.active = false;
            self.active_keeper_set().swap_remove(&keeper);
        }

        // V3/V5 FIX (Destructor-Hardened): Prevent Cooldown Leak
        // If the keeper is slashed while in cooldown, reduce the committed EGLD
        if !info.active && !self.unstake_request_time(&keeper).is_empty() {
            self.total_committed_cooldown_egld().update(|total| {
                if *total >= slash_amount {
                    *total -= &slash_amount;
                } else {
                    *total = BigUint::zero();
                }
            });
        }

        self.keepers(&keeper).set(&info);

        // Send slashed amount to treasury if we have liquid funds, otherwise register debt
        let treasury = self.treasury_addr().get();
        let provider = if self.staking_provider_addr().is_empty() {
            ManagedAddress::zero()
        } else {
            self.staking_provider_addr().get()
        };

        if provider.is_zero() {
            // Liquid system — transfer directly
            self.send().direct_egld(&treasury, &slash_amount);
        } else {
            // Delegated system — V-23 PATCH: Do not `sync_call` unDelegate
            // Accumulate debt. Admin can unDelegate in bulk later.
            // Prevents Panic from min-unbond limits skipping the slash penalty.
            self.slashed_pending_unbond(&keeper).update(|debt| *debt += &slash_amount);
        }

        self.keeper_slashed_event(&keeper, &slash_amount, &reason);
    }

    // ═══════════════════════════════════════════════════════════
    //  REPUTATION
    // ═══════════════════════════════════════════════════════════

    /// Record an execution result for a keeper's reputation.
    /// On success: resets consecutive_failures.
    /// On failure: progressive slashing — Strike 1: 5%, Strike 2: 15%, Strike 3: 20% + expulsion.
    #[endpoint(recordExecution)]
    fn record_execution(&self, keeper: ManagedAddress, success: bool) {
        self.require_authorized_caller();

        let mut info = self.keepers(&keeper).get();
        info.total_executions += 1;
        if success {
            info.successful_execs += 1;
            info.consecutive_failures = 0;
        } else {
            info.failed_execs += 1;
            info.consecutive_failures += 1;

            // Progressive slash based on consecutive failures
            let slash_bps = match info.consecutive_failures {
                1 => common::constants::SLASH_STRIKE_1_BPS,    // 5%
                2 => common::constants::SLASH_STRIKE_2_BPS,    // 15%
                _ => common::constants::SLASH_STRIKE_3_BPS,    // 20%
            };

            let calculated_slash =
                &info.stake * slash_bps / common::constants::BPS_DENOMINATOR;
            
            let slash_amount = if info.stake > calculated_slash {
                calculated_slash
            } else {
                info.stake.clone()
            };

            info.stake -= &slash_amount;
            info.slashed_amount += &slash_amount;

            let treasury = self.treasury_addr().get();
            let provider = self.staking_provider_addr().get();

            if provider.is_zero() {
                self.send().direct_egld(&treasury, &slash_amount);
            } else {
                // V-23 PATCH: Do not `sync_call` unDelegate
                self.slashed_pending_unbond(&keeper).update(|debt| *debt += &slash_amount);
            }

            self.keeper_slashed_event(&keeper, &slash_amount, &ManagedBuffer::from(
                match info.consecutive_failures {
                    1 => b"Strike 1 - 5% slash" as &[u8],
                    2 => b"Strike 2 - 15% slash" as &[u8],
                    _ => b"Strike 3 - 20% slash + expulsion" as &[u8],
                }
            ));

            // 🛡️ XCRON-ECONOMIC-SHIELD: Maintenance Margin Floor (75% de min_stake)
            // Permite absorber Strike 1 (queda 95%) y Strike 2 (queda 80.75%) intactos,
            // pero bloquea la insolvencia severa si el stake cae por debajo del umbral crítico.
            let maintenance_threshold = self.min_stake().get() * 75u64 / 100u64;
            if info.consecutive_failures >= common::constants::MAX_STRIKES || info.stake < maintenance_threshold {
                info.active = false;
                self.active_keeper_set().swap_remove(&keeper);
            }
            
            // V3/V5 FIX (Destructor-Hardened): Prevent Cooldown Leak
            // If the keeper is slashed while in cooldown, reduce the committed EGLD
            if !info.active && !self.unstake_request_time(&keeper).is_empty() {
                self.total_committed_cooldown_egld().update(|total| {
                    if *total >= slash_amount {
                        *total -= &slash_amount;
                    } else {
                        *total = BigUint::zero();
                    }
                });
            }
        }
        self.keepers(&keeper).set(&info);
    }

    // ═══════════════════════════════════════════════════════════
    //  STAKING V5 DELEGATION (ADMIN OPS)
    // ═══════════════════════════════════════════════════════════

    /// 🛡️ XCRON-PROTECT: V3/V5 FIX (Destructor-Hardened) — Liquidity Reserve Guard
    /// Delegate EGLD from the registry to the configured Staking Provider.
    /// CRITICAL: Uses O(1) `total_committed_cooldown_egld` mapper to calculate
    /// EGLD that must remain liquid for keepers in unstake cooldown.
    /// NOTE: Keepers requesting unstake are REMOVED from active_keeper_set,
    /// so we cannot iterate it. Instead, requestUnstake/withdrawStake
    /// maintain the committed total atomically.
    #[only_owner]
    #[endpoint(delegateStake)]
    fn delegate_stake(&self, amount: BigUint) {
        let provider = self.staking_provider_addr().get();
        require!(!provider.is_zero(), "Staking provider not set");
        
        let balance = self.blockchain().get_sc_balance(&EgldOrEsdtTokenIdentifier::egld(), 0);
        
        // V3/V5 FIX: Read committed EGLD from atomic mapper (updated in requestUnstake/withdrawStake)
        let committed_egld = self.total_committed_cooldown_egld().get();
        
        let delegable = if balance > committed_egld {
            &balance - &committed_egld
        } else {
            BigUint::zero()
        };
        
        require!(amount <= delegable, "V3: Would leave insufficient liquidity for pending keeper withdrawals");

        let _ = self.tx()
            .to(&provider)
            .raw_call("delegate")
            .egld(amount)
            .sync_call();
    }

    /// Request unstake from the Staking Provider. (e.g. to cover keeper withdrawals)
    #[only_owner]
    #[endpoint(unDelegateStake)]
    fn undelegate_stake(&self, amount: BigUint) {
        let provider = self.staking_provider_addr().get();
        require!(!provider.is_zero(), "Staking provider not set");

        let _ = self.tx()
            .to(&provider)
            .raw_call("unDelegate")
            .argument(&amount)
            .sync_call();
    }

    /// 🛡️ XCRON-PROTECT: V4 FIX — Yield Claim Observability
    /// Claim native EGLD yield generated by delegated stakes.
    /// This yield belongs 100% to the protocol treasury.
    /// Now emits event with exact yield amount for monitoring.
    #[only_owner]
    #[endpoint(claimProviderRewards)]
    fn claim_provider_rewards(&self) {
        let provider = self.staking_provider_addr().get();
        require!(!provider.is_zero(), "Staking provider not set");

        let initial_balance = self.blockchain().get_sc_balance(&EgldOrEsdtTokenIdentifier::egld(), 0);

        let _ = self.tx()
            .to(&provider)
            .raw_call("claimRewards")
            .sync_call();

        let final_balance = self.blockchain().get_sc_balance(&EgldOrEsdtTokenIdentifier::egld(), 0);
        
        // V4 FIX: Require that we actually received yield
        require!(final_balance >= initial_balance, "V4: Provider claim returned less than initial balance");
        
        if final_balance > initial_balance {
            let yield_generated = final_balance - initial_balance;
            self.total_yield_generated().update(|total| *total += &yield_generated);
            
            let treasury = self.treasury_addr().get();
            if !treasury.is_zero() {
                self.send().direct_egld(&treasury, &yield_generated);
            }
        }
    }

    /// Withdraw funds that have completed the 10-day provider unbonding period.
    /// This is used to sweep slashed funds to the treasury or prepare for keeper withdrawals.
    #[only_owner]
    #[endpoint(withdrawProviderStake)]
    fn withdraw_provider_stake(&self) {
        let provider = self.staking_provider_addr().get();
        require!(!provider.is_zero(), "Staking provider not set");

        let _ = self.tx()
            .to(&provider)
            .raw_call("withdraw")
            .sync_call();
    }

    /// Sweep unbonded slashed debt to the treasury. (Admin manually calls this once unbonding is over)
    #[only_owner]
    #[endpoint(sweepSlashedDebt)]
    fn sweep_slashed_debt(&self, keeper: ManagedAddress) {
        let debt = self.slashed_pending_unbond(&keeper).get();
        require!(debt > BigUint::zero(), "No unbonded debt");

        // Assumes `withdrawProviderStake` was called first to have liquid EGLD
        let treasury = self.treasury_addr().get();
        self.send().direct_egld(&treasury, &debt);
        self.slashed_pending_unbond(&keeper).clear();
    }
}
