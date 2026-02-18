multiversx_sc::imports!();

/// Events emitted by the Scheduler contract.
///
/// All events use `#[indexed]` on key fields for efficient off-chain filtering.
#[multiversx_sc::module]
pub trait EventsModule {
    #[event("taskScheduled")]
    fn task_scheduled_event(
        &self,
        #[indexed] task_id: u64,
        #[indexed] owner: &ManagedAddress,
        #[indexed] target: &ManagedAddress,
        round: u64,
    );

    #[event("taskCancelled")]
    fn task_cancelled_event(&self, #[indexed] task_id: u64);

    #[event("taskExpired")]
    fn task_expired_event(&self, #[indexed] task_id: u64);

    #[event("taskExecuted")]
    fn task_executed_event(
        &self,
        #[indexed] task_id: u64,
        #[indexed] keeper: &ManagedAddress,
        success: bool,
    );

    #[event("commitSubmitted")]
    fn commit_event(&self, #[indexed] task_id: u64, #[indexed] keeper: &ManagedAddress);

    #[event("commitVoided")]
    fn commit_voided_event(&self, #[indexed] task_id: u64, #[indexed] keeper: &ManagedAddress);
}
