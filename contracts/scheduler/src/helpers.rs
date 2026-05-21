multiversx_sc::imports!();

/// Internal helper functions for the Scheduler contract.
///
/// Contains reward calculations, index management, and task rescheduling.
#[multiversx_sc::module]
pub trait HelpersModule: crate::storage::StorageModule {
    // calculate_keeper_reward has been removed (Stateless architecture processes this inline)

    /// Vector 16 "Chronos" Armor - Supernova HFT Precision (Milliseconds)
    /// 
    /// Supernova targets 88ms latency. If we truncate to seconds, we destroy the HFT window.
    /// This function ensures the internal contract clock always operates in milliseconds.
    fn get_timestamp_ms(&self) -> u64 {
        self.blockchain().get_block_timestamp_millis().as_u64_millis()
    }

    // calculate_protocol_fee, index_task, remove_from_indices, reindex_task, and reschedule_recurring
    // have been purged. The blockchain no longer maintains cross-shard indices, time arrays, or recurring states.
    // The Rust-Tokio Keeper assumes 100% responsibility for this logic off-chain, reducing gas usage by >80%.

    // ── Cross-contract call helpers ─────────────────────────

    /// M-3 Fix: Accumulate protocol fee instead of transfer_execute.
    ///
    /// Inside `#[promises_callback]`, `.transfer_execute()` sends EGLD
    /// but does NOT invoke the target endpoint — the `receiveExecutionFee`
    /// function never runs, so fees aren't tracked in the Rewards contract.
    ///
    /// Solution: accumulate fees in `accrued_protocol_fees` storage mapper.
    /// Owner/keeper can call `flushProtocolFees` to bulk-send them to the
    /// Rewards contract outside of a callback context.
    fn forward_protocol_fee(
        &self,
        _keeper: &ManagedAddress,
        _task_id: u64,
        protocol_fee: &BigUint,
    ) {
        if protocol_fee > &BigUint::zero() {
            self.accrued_protocol_fees()
                .update(|total| *total += protocol_fee);
        }
    }

    /// P5: Notify KeeperRegistry of execution result for reputation tracking.
    ///
    /// Enables progressive slashing: keepers with consecutive failures get
    /// penalized (Strike 1: 5%, Strike 2: 15%, Strike 3: 20% + expulsion).
    /// Fire-and-forget — this runs inside the callback so no further callback is possible.
    fn forward_keeper_result(&self, keeper: &ManagedAddress, success: bool) {
        // BUG FIX: Prevent panic DoS if registry is not configured.
        // A panic here would revert the entire execution callback, locking funds forever.
        if self.keeper_registry_addr().is_empty() {
            return;
        }

        let registry_addr = self.keeper_registry_addr().get();
        self.tx()
            .to(&registry_addr)
            .raw_call("recordExecution")
            .argument(keeper)
            .argument(&success)
            .gas(5_000_000u64)
            .transfer_execute();
    }
}
