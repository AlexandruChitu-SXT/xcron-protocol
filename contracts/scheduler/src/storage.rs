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

    // ── Round-robin task assignment ──────────────────────────
    /// Ordered list of active keepers for round-robin assignment.
    /// Index 0..n used for deterministic task-to-keeper mapping.
    #[storage_mapper("keeperList")]
    fn keeper_list(&self) -> VecMapper<ManagedAddress>;

    /// Counter that rotates through keeper_list for assignment.
    #[storage_mapper("roundRobinCounter")]
    fn round_robin_counter(&self) -> SingleValueMapper<u64>;

    // ── Security: Target blacklist ──────────────────────────
    /// Contracts that are blocked from being called as targets.
    /// Auto-populated when a target fails >MAX_TARGET_FAILURES times.
    #[storage_mapper("targetBlacklist")]
    fn target_blacklist(&self) -> UnorderedSetMapper<ManagedAddress>;

    /// Per-target consecutive failure counter for anomaly detection.
    #[storage_mapper("targetFailureCount")]
    fn target_failure_count(&self, target: &ManagedAddress) -> SingleValueMapper<u64>;

    // ── Security: Execution metrics ─────────────────────────
    /// Total successful executions across all tasks.
    #[storage_mapper("totalSuccessfulExecs")]
    fn total_successful_execs(&self) -> SingleValueMapper<u64>;

    /// Total failed executions across all tasks.
    #[storage_mapper("totalFailedExecs")]
    fn total_failed_execs(&self) -> SingleValueMapper<u64>;

    // ── Security: Deposit / value cap ───────────────────────
    /// Maximum EGLD deposit per task. Prevents catastrophic loss from a single exploit.
    #[storage_mapper("maxExecValueEgld")]
    fn max_exec_value_egld(&self) -> SingleValueMapper<BigUint>;

    // ── Security: Keeper-shard mapping ──────────────────────
    /// Cached shard ID for each keeper (0, 1, 2, or 4294967295 for metachain).
    #[storage_mapper("keeperShard")]
    fn keeper_shard(&self, keeper: &ManagedAddress) -> SingleValueMapper<u32>;
}
