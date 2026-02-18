multiversx_sc::imports!();

/// Events emitted by the Rewards contract.
#[multiversx_sc::module]
pub trait EventsModule {
    #[event("rewardAccrued")]
    fn reward_accrued_event(
        &self,
        #[indexed] task_id: u64,
        #[indexed] keeper: &ManagedAddress,
        amount: &BigUint,
    );

    #[event("rewardsClaimed")]
    fn rewards_claimed_event(&self, #[indexed] keeper: &ManagedAddress, amount: &BigUint);

    #[event("treasuryWithdrawn")]
    fn treasury_withdrawn_event(&self, #[indexed] to: &ManagedAddress, amount: &BigUint);
}
