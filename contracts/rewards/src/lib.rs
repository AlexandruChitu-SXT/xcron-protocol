#![no_std]

multiversx_sc::imports!();

pub mod config;
pub mod events;
pub mod storage;
pub mod validation;
pub mod views;

/// XCron Rewards Contract
///
/// Aggregates execution fees from Scheduler contracts, distributes keeper rewards,
/// and manages the protocol treasury.
#[multiversx_sc::contract]
pub trait RewardsContract:
    storage::StorageModule
    + events::EventsModule
    + views::ViewsModule
    + config::ConfigModule
    + validation::ValidationModule
{
    #[init]
    fn init(
        &self,
        keeper_registry: ManagedAddress,
        treasury_split_bps: u64,
    ) {
        self.keeper_registry_addr().set(&keeper_registry);
        self.treasury_split_bps().set(treasury_split_bps);
        self.treasury_balance().set(BigUint::zero());
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
    //  FEE RECEPTION
    // ═══════════════════════════════════════════════════════════

    /// Called by Scheduler after successful execution.
    /// Receives EGLD = protocol fee portion.
    #[payable("EGLD")]
    #[endpoint(receiveExecutionFee)]
    fn receive_execution_fee(&self, keeper: ManagedAddress, task_id: u64) {
        self.require_scheduler_caller();

        let fee = self.call_value().egld().clone_value();
        let treasury_cut =
            &fee * self.treasury_split_bps().get() / common::constants::BPS_DENOMINATOR;
        let keeper_bonus = &fee - &treasury_cut;

        self.treasury_balance().update(|bal| *bal += &treasury_cut);
        self.pending_rewards(&keeper).update(|bal| *bal += &keeper_bonus);

        self.reward_accrued_event(task_id, &keeper, &keeper_bonus);
    }

    // ═══════════════════════════════════════════════════════════
    //  REWARD CLAIMS
    // ═══════════════════════════════════════════════════════════

    /// Keepers claim their accumulated rewards.
    #[endpoint(claimRewards)]
    fn claim_rewards(&self) {
        self.require_not_paused();
        let caller = self.blockchain().get_caller();
        let amount = self.pending_rewards(&caller).get();

        require!(amount > BigUint::zero(), "No pending rewards");

        // Clear BEFORE transfer (CEI pattern)
        self.pending_rewards(&caller).clear();
        self.send().direct_egld(&caller, &amount);
        self.rewards_claimed_event(&caller, &amount);
    }

    // ═══════════════════════════════════════════════════════════
    //  TREASURY MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /// Withdraw treasury funds for protocol development.
    #[only_owner]
    #[endpoint(withdrawTreasury)]
    fn withdraw_treasury(&self, to: ManagedAddress, amount: BigUint) {
        let bal = self.treasury_balance().get();
        require!(amount <= bal, "Insufficient treasury");

        self.treasury_balance().update(|b| *b -= &amount);
        self.send().direct_egld(&to, &amount);
        self.treasury_withdrawn_event(&to, &amount);
    }
}
