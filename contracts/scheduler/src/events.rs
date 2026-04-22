multiversx_sc::imports!();

/// Events emitted by the Scheduler contract.
///
/// All events use `#[indexed]` on key fields for efficient off-chain filtering
/// by indexers, explorers, and the keeper bot.
#[multiversx_sc::module]
pub trait EventsModule {
    /// Emitted when a new Quantum Task is scheduled.
    /// In a stateless architecture, this event guarantees Data Availability (DA).
    /// The keeper indexes this off-chain payload.
    #[event("taskScheduledQuantum")]
    fn task_scheduled_event_quantum(
        &self,
        #[indexed] task_hash: &ManagedByteArray<Self::Api, 32>,
        #[indexed] owner: &ManagedAddress,
        #[indexed] target: &ManagedAddress,
        timestamp_ms: u64,
    );

    /// Emitted when a task owner cancels their pending quantum task.
    #[event("taskCancelledQuantum")]
    fn task_cancelled_event_quantum(&self, #[indexed] task_hash: &ManagedByteArray<Self::Api, 32>);

    /// Emitted when a quantum task expires due to TTL or is recovered from stuck state.
    #[event("taskExpiredQuantum")]
    fn task_expired_event_quantum(&self, #[indexed] task_hash: &ManagedByteArray<Self::Api, 32>);

    /// Emitted after async callback resolves a quantum task execution.
    #[event("taskExecutedQuantum")]
    fn task_executed_event_quantum(
        &self,
        #[indexed] task_hash: &ManagedByteArray<Self::Api, 32>,
        #[indexed] keeper: &ManagedAddress,
        success: bool,
    );

    /// Emitted when a keeper is paid for successful quantum execution.
    #[event("keeperPaidQuantum")]
    fn keeper_paid_event_quantum(
        &self,
        #[indexed] task_hash: &ManagedByteArray<Self::Api, 32>,
        #[indexed] keeper: &ManagedAddress,
        amount: &BigUint,
    );

    /// Emitted when a task owner receives a refund (failure or remaining deposit) for a quantum task.
    #[event("userRefundedQuantum")]
    fn user_refunded_event_quantum(
        &self,
        #[indexed] task_hash: &ManagedByteArray<Self::Api, 32>,
        #[indexed] owner: &ManagedAddress,
        amount: &BigUint,
    );

    /// Emitted when protocol fee is forwarded to the Rewards contract for a quantum task.
    #[event("protocolFeePaidQuantum")]
    fn protocol_fee_paid_event_quantum(&self, #[indexed] task_hash: &ManagedByteArray<Self::Api, 32>, amount: &BigUint);

    // ═══════════════════════════════════════════════════════════════════
    //  INTENT EVENTS (XCron V2 Vanguard)
    // ═══════════════════════════════════════════════════════════════════

    /// Emitted when a new declarative intent is created by a user.
    #[event("intentCreated")]
    fn intent_created_event(
        &self,
        #[indexed] intent_id: u64,
        #[indexed] owner: &ManagedAddress,
    );
}
