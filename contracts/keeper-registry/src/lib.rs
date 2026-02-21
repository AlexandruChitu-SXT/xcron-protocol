#![no_std]

multiversx_sc::imports!();

pub mod config;
pub mod events;
pub mod storage;
pub mod validation;
pub mod views;

/// XCron KeeperRegistry Contract
///
/// Manages keeper enrollment, EGLD staking, slashing, and reputation tracking.
#[multiversx_sc::contract]
pub trait KeeperRegistryContract:
    storage::StorageModule
    + events::EventsModule
    + views::ViewsModule
    + config::ConfigModule
    + validation::ValidationModule
{
    #[init]
    fn init(
        &self,
        min_stake: BigUint,
        slash_pct_bps: u64,
        cooldown_rounds: u64,
        treasury_addr: ManagedAddress,
    ) {
        self.min_stake().set(&min_stake);
        self.slash_pct_bps().set(slash_pct_bps);
        self.cooldown_rounds().set(cooldown_rounds);
        self.treasury_addr().set(&treasury_addr);
        self.paused().set(false);
        self.version().set(1u32);
    }

    /// Safe upgrade — preserves storage, bumps version.
    #[upgrade]
    fn upgrade(&self) {
        self.version().set(self.version().get() + 1);
    }

    // ── Circuit Breaker ─────────────────────────────────────

    #[only_owner]
    #[endpoint(pause)]
    fn pause(&self) {
        self.paused().set(true);
    }

    #[only_owner]
    #[endpoint(unpause)]
    fn unpause(&self) {
        self.paused().set(false);
    }

    fn require_not_paused(&self) {
        require!(!self.paused().get(), "Contract is paused");
    }

    // ═══════════════════════════════════════════════════════════
    //  KEEPER REGISTRATION
    // ═══════════════════════════════════════════════════════════

    /// Register as a keeper by staking EGLD ≥ min_stake.
    #[payable("EGLD")]
    #[endpoint(registerKeeper)]
    fn register_keeper(&self) {
        self.require_not_paused();
        let caller = self.blockchain().get_caller();
        let stake = self.call_value().egld_value().clone_value();

        require!(self.keepers(&caller).is_empty(), "Keeper already registered");
        require!(stake >= self.min_stake().get(), "Stake below minimum");

        let info = common::types::KeeperInfo {
            addr: caller.clone(),
            stake,
            registered_round: self.blockchain().get_block_round(),
            total_executions: 0,
            successful_execs: 0,
            failed_execs: 0,
            slashed_amount: BigUint::zero(),
            active: true,
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

        let additional = self.call_value().egld_value().clone_value();
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
    #[endpoint(requestUnstake)]
    fn request_unstake(&self) {
        let caller = self.blockchain().get_caller();
        let mut info = self.keepers(&caller).get();

        require!(info.active, "Keeper not active");

        info.active = false;
        self.keepers(&caller).set(&info);
        self.active_keeper_set().swap_remove(&caller);
        self.unstake_request_round(&caller)
            .set(self.blockchain().get_block_round());
    }

    /// Withdraw stake after cooldown period has elapsed.
    #[endpoint(withdrawStake)]
    fn withdraw_stake(&self) {
        let caller = self.blockchain().get_caller();
        let info = self.keepers(&caller).get();

        require!(!info.active, "Must request unstake first");

        let request_round = self.unstake_request_round(&caller).get();
        let current = self.blockchain().get_block_round();
        require!(
            current >= request_round + self.cooldown_rounds().get(),
            "Cooldown not elapsed"
        );

        let amount = info.stake.clone();
        self.keepers(&caller).clear();
        self.unstake_request_round(&caller).clear();

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
        let slash_amount =
            &info.stake * self.slash_pct_bps().get() / common::constants::BPS_DENOMINATOR;

        info.stake -= &slash_amount;
        info.slashed_amount += &slash_amount;

        // Auto-deactivate if stake falls below minimum
        if info.stake < self.min_stake().get() {
            info.active = false;
            self.active_keeper_set().swap_remove(&keeper);
        }

        self.keepers(&keeper).set(&info);

        // Send slashed amount to treasury
        let treasury = self.treasury_addr().get();
        self.send().direct_egld(&treasury, &slash_amount);

        self.keeper_slashed_event(&keeper, &slash_amount, &reason);
    }

    // ═══════════════════════════════════════════════════════════
    //  REPUTATION
    // ═══════════════════════════════════════════════════════════

    /// Record an execution result for a keeper's reputation.
    #[endpoint(recordExecution)]
    fn record_execution(&self, keeper: ManagedAddress, success: bool) {
        self.require_authorized_caller();

        let mut info = self.keepers(&keeper).get();
        info.total_executions += 1;
        if success {
            info.successful_execs += 1;
        } else {
            info.failed_execs += 1;
        }
        self.keepers(&keeper).set(&info);
    }
}
