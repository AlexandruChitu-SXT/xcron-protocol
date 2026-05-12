multiversx_sc::imports!();

/// Storage mappers for the Scheduler contract.
///
/// Each mapper has a unique storage key to prevent collisions.
#[multiversx_sc::module]
pub trait StorageModule {
    // ── Global counters ──────────────────────────────────────
    #[storage_mapper("taskNonce")]
    fn task_nonce(&self) -> SingleValueMapper<u64>;

    // ── Stateless Task store (Quantum Sealed) ───────────────────────────
    /// Maps the Quantum Seal (SHA-256 Hash of Task payload) to its on-chain state.
    /// This eliminates >80% of storage bloat.
    #[view(getQuantumTask)]
    #[storage_mapper("quantumTasks")]
    fn quantum_tasks(&self, task_hash: &ManagedByteArray<Self::Api, 32>) -> SingleValueMapper<common::types::QuantumTaskState<Self::Api>>;

    // time_index, condition_tasks, task_metadata, and commits have been removed.
    // The Keeper indices are managed entirely in RAM off-chain via Event DA.

    // ── Owner → tasks mapping (for rate limiting) ────────────────────────────────
    #[storage_mapper("ownerTasks")]
    fn owner_tasks(&self, owner: &ManagedAddress) -> UnorderedSetMapper<ManagedByteArray<Self::Api, 32>>;

    // ── Protocol parameters ──────────────────────────────────
    #[storage_mapper("keeperRegistryAddr")]
    fn keeper_registry_addr(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("rewardsAddr")]
    fn rewards_addr(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("xwapAddress")]
    fn xwap_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("minDeposit")]
    fn min_deposit(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("zkVerifierAddr")]
    fn zk_verifier_addr(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("xscAddress")]
    fn xsc_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("usedCompressedTasks")]
    fn used_compressed_tasks(&self, task_hash: &ManagedByteArray<32>) -> SingleValueMapper<bool>;

    #[storage_mapper("assignedEnclaveKeeper")]
    fn assigned_enclave_keeper(&self, task_hash: &ManagedByteArray<32>) -> SingleValueMapper<ManagedAddress>;

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
    // NOTE: `paused` storage mapper is provided by common::pausable::PausableModule

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

    // ═══════════════════════════════════════════════════════════════════
    //  INTENTS STORAGE (XCron V2 Vanguard)
    // ═══════════════════════════════════════════════════════════════════

    #[view(getIntentNonce)]
    #[storage_mapper("intent_nonce")]
    fn intent_nonce(&self) -> SingleValueMapper<u64>;

    #[view(getIntent)]
    #[storage_mapper("intent_by_id")]
    fn intent_by_id(&self, intent_id: u64) -> SingleValueMapper<common::types::Intent<Self::Api>>;

    // ═══════════════════════════════════════════════════════════════════
    //  PRE-COGNITIVE INTENTS STORAGE (PCIT)
    // ═══════════════════════════════════════════════════════════════════

    #[view(getPreCognitiveIntentNonce)]
    #[storage_mapper("pre_cognitive_intent_nonce")]
    fn pre_cognitive_intent_nonce(&self) -> SingleValueMapper<u64>;

    #[view(getPreCognitiveIntent)]
    #[storage_mapper("pre_cognitive_intent_by_id")]
    fn pre_cognitive_intent_by_id(&self, intent_id: u64) -> SingleValueMapper<common::types::PreCognitiveIntent<Self::Api>>;

    // ═══════════════════════════════════════════════════════════════════
    //  TASKS STORAGE
    // ═══════════════════════════════════════════════════════════════════
    // ── Security: Rate limiting per round ───────────────────
    /// Tasks scheduled by address in a given block round (anti-spam).
    /// Key: (caller_address, round_number). Cleared automatically by new rounds.
    #[storage_mapper("tasksPerRound")]
    fn tasks_per_round(&self, caller: &ManagedAddress, round: u64) -> SingleValueMapper<u32>;

    /// Maximum tasks any single address can schedule per round.
    #[storage_mapper("maxTasksPerRound")]
    fn max_tasks_per_round(&self) -> SingleValueMapper<u32>;

    // shard_task_index removed: Cross-shard affinity is managed by the off-chain keeper routing.

    // ── Cross-shard optimization: Execution stats per shard ─
    /// Tracks successful cross-shard vs intra-shard executions for metrics.
    #[storage_mapper("crossShardExecs")]
    fn cross_shard_execs(&self) -> SingleValueMapper<u64>;

    #[storage_mapper("intraShardExecs")]
    fn intra_shard_execs(&self) -> SingleValueMapper<u64>;

    // ── M-3 Fix: Accrued protocol fees ──────────────────────
    /// Protocol fees accumulated during execution callbacks.
    /// Since `transfer_execute` inside `#[promises_callback]` sends EGLD
    /// but does NOT invoke the target endpoint, fees are stored here
    /// and flushed to the Rewards contract via `flushProtocolFees`.
    #[storage_mapper("accruedProtocolFees")]
    fn accrued_protocol_fees(&self) -> SingleValueMapper<BigUint>;

    // ── Clone-Keys (Burner Wallets) ─────────────────────────
    /// Clone-Key address → its properties (main wallet link, limits, expiry).
    #[storage_mapper("cloneKeyProps")]
    fn clone_key_props(
        &self,
        clone: &ManagedAddress,
    ) -> SingleValueMapper<common::types::CloneKeyProperties<Self::Api>>;

    /// Main Wallet → set of authorized Clone-Key addresses.
    #[storage_mapper("walletCloneKeys")]
    fn wallet_clone_keys(&self, main_wallet: &ManagedAddress)
        -> UnorderedSetMapper<ManagedAddress>;
    #[view(getAcceptedPaymentTokens)]
    #[storage_mapper("acceptedPaymentTokens")]
    fn accepted_payment_tokens(&self, token_identifier: &TokenIdentifier) -> SingleValueMapper<bool>;
}
