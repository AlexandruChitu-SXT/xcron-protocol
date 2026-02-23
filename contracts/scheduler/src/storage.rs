multiversx_sc::imports!();

/// Storage mappers for the Scheduler contract.
///
/// Each mapper has a unique storage key to prevent collisions.
#[multiversx_sc::module]
pub trait StorageModule {
    // ── Global counters ──────────────────────────────────────
    #[storage_mapper("taskNonce")]
    fn task_nonce(&self) -> SingleValueMapper<u64>;

    // ── Task store ───────────────────────────────────────────
    #[storage_mapper("tasks")]
    fn tasks(&self, task_id: u64) -> SingleValueMapper<common::types::Task<Self::Api>>;

    // ── Time-based index: time → set of task IDs ───────────
    #[storage_mapper("timeIndex")]
    fn time_index(&self, timestamp: u64) -> UnorderedSetMapper<u64>;

    // ── Condition-based pending set ──────────────────────────
    #[storage_mapper("conditionTasks")]
    fn condition_tasks(&self) -> UnorderedSetMapper<u64>;

    // ── Owner → tasks mapping ────────────────────────────────
    #[storage_mapper("ownerTasks")]
    fn owner_tasks(&self, owner: &ManagedAddress) -> UnorderedSetMapper<u64>;

    // ── Task metadata (hybrid oracle conditions) ────────────
    // Stores JSON-encoded conditions evaluated off-chain by the keeper.
    // Example: {"price":{"token":"EGLD","condition":"above","threshold":50}}
    #[storage_mapper("taskMetadata")]
    fn task_metadata(&self, task_id: u64) -> SingleValueMapper<ManagedBuffer>;

    // ── Commit-reveal store (Phase 3+) ──────────────────────
    #[storage_mapper("commits")]
    fn commits(&self, task_id: u64) -> SingleValueMapper<common::types::CommitInfo<Self::Api>>;

    // ── Protocol parameters ──────────────────────────────────
    #[storage_mapper("keeperRegistryAddr")]
    fn keeper_registry_addr(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("rewardsAddr")]
    fn rewards_addr(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("minDeposit")]
    fn min_deposit(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("protocolFeeBps")]
    fn protocol_fee_bps(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("revealWindow")]
    fn reveal_window(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("commitBond")]
    fn commit_bond(&self) -> SingleValueMapper<BigUint>;

    // ── Keeper whitelist (Phase 1 only) ─────────────────────
    #[storage_mapper("whitelistedKeepers")]
    fn whitelisted_keepers(&self) -> UnorderedSetMapper<ManagedAddress>;

    /// Max reward a keeper can earn per single execution.
    /// Prevents disproportionate rewards on large deposits.
    #[storage_mapper("maxRewardPerExec")]
    fn max_reward_per_exec(&self) -> SingleValueMapper<BigUint>;

    // ── Protocol safety ─────────────────────────────────────
    /// Circuit breaker — pauses all user-facing endpoints.
    #[storage_mapper("paused")]
    fn paused(&self) -> SingleValueMapper<bool>;

    /// Reentrancy guard for execute_task.
    #[storage_mapper("executingGuard")]
    fn executing_guard(&self) -> SingleValueMapper<bool>;

    /// Contract version for safe upgrades.
    #[storage_mapper("version")]
    fn version(&self) -> SingleValueMapper<u32>;
}
