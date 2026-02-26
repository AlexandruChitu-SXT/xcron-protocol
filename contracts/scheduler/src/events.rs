multiversx_sc::imports!();

/// Events emitted by the Scheduler contract.
///
/// All events use `#[indexed]` on key fields for efficient off-chain filtering
/// by indexers, explorers, and the keeper bot.
#[multiversx_sc::module]
pub trait EventsModule {
    /// Emitted when a new task is scheduled.
    #[event("taskScheduled")]
    fn task_scheduled_event(
        &self,
        #[indexed] task_id: u64,
        #[indexed] owner: &ManagedAddress,
        #[indexed] target: &ManagedAddress,
        timestamp: u64,
    );

    /// Emitted when a task owner cancels their pending task.
    #[event("taskCancelled")]
    fn task_cancelled_event(&self, #[indexed] task_id: u64);

    /// Emitted when a task expires due to TTL or is recovered from stuck state.
    #[event("taskExpired")]
    fn task_expired_event(&self, #[indexed] task_id: u64);

    /// Emitted after async callback resolves a task execution.
    #[event("taskExecuted")]
    fn task_executed_event(
        &self,
        #[indexed] task_id: u64,
        #[indexed] keeper: &ManagedAddress,
        success: bool,
    );

    /// Emitted when a keeper submits a commit hash (anti-MEV phase 1).
    #[event("commitSubmitted")]
    fn commit_event(&self, #[indexed] task_id: u64, #[indexed] keeper: &ManagedAddress);

    /// Emitted when a commit expires or is slashed.
    #[event("commitVoided")]
    fn commit_voided_event(&self, #[indexed] task_id: u64, #[indexed] keeper: &ManagedAddress);
}
