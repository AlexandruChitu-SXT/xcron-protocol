use multiversx_sc::derive_imports::*;

multiversx_sc::imports!();

// ═══════════════════════════════════════════════════════════════════
//  INTENT TYPES (XCron V2)
// ═══════════════════════════════════════════════════════════════════

/// A declarative Intent created by a user, defining a financial outcome rather
/// than an imperative instruction. Solvers race to execute it efficiently.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct Intent<M: ManagedTypeApi> {
    /// Unique, monotonically increasing intent identifier.
    pub id: u64,
    /// Address that created this intent and provided the `token_in` funds.
    pub owner: ManagedAddress<M>,
    /// The ESDT token identifier the user has pre-deposited.
    pub token_in: TokenIdentifier<M>,
    /// The exact amount of `token_in` locked in the contract for this intent.
    pub amount_in: BigUint<M>,
    /// The ESDT token identifier the user desires to receive.
    pub token_out: TokenIdentifier<M>,
    /// The absolute minimum amount of `token_out` the user will accept.
    /// Acts as slip-protect and profit-guarantee.
    pub min_return: BigUint<M>,
    /// Block timestamp (seconds) after which this intent becomes invalid.
    pub deadline: u64,
    /// The EGLD fee dedicated to the Solver who successfully settles this intent.
    pub solver_fee: BigUint<M>,
    /// Current status of the intent in its lifecycle.
    pub status: IntentStatus,
    /// The solver address that successfully completed the intent (if any).
    pub settled_by: Option<ManagedAddress<M>>,
}

/// Current status of an Intent.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone, PartialEq, Debug)]
pub enum IntentStatus {
    /// Available for Solvers to route and execute.
    Pending,
    /// Successfully routed and settled on-chain.
    Settled,
    /// Revoked manually by the creator (funds refunded).
    Cancelled,
    /// Deadline passed without successful execution.
    Expired,
}

// ═══════════════════════════════════════════════════════════════════
//  TASK TYPES
// ═══════════════════════════════════════════════════════════════════

/// A scheduled automation task in the XCron protocol.
///
/// Lifecycle: `Pending → [Committed →] Executing → Completed | Failed | Expired | Cancelled`
///
/// Storage: one `SingleValueMapper<Task>` per `task_id` in the Scheduler contract.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct Task<M: ManagedTypeApi> {
    /// Unique, monotonically increasing task identifier (1-indexed).
    pub id: u64,
    /// Address that scheduled (and funded) this task. Receives refunds on cancel/fail.
    pub owner: ManagedAddress<M>,
    /// Smart contract to call when the trigger fires.
    /// Validated against blacklist and self-call protection (S-1).
    pub target_contract: ManagedAddress<M>,
    /// Endpoint name on the target contract (e.g. `"claimRewards"`).
    /// Validated against dangerous endpoints like `upgradeContract` (S-1b).
    pub target_endpoint: ManagedBuffer<M>,
    /// ABI-encoded arguments passed to the target endpoint.
    pub target_args: ManagedVec<M, ManagedBuffer<M>>,
    /// When this task should fire — time-based or condition-based.
    pub trigger: Trigger<M>,
    /// Maximum gas allocated for the target contract call.
    /// Must be ≥ `MIN_GAS_LIMIT`. Cross-shard calls get +30% overhead (S-10).
    pub max_gas: u64,
    /// EGLD deposited by the owner to cover keeper reward + protocol fee.
    /// For recurring tasks, divided proportionally across executions.
    pub deposit: BigUint<M>,
    /// Maximum retry attempts on failure before marking as Failed.
    pub max_retries: u8,
    /// Current retry count. Incremented on each failed attempt.
    pub retry_count: u8,
    /// Time-to-live in seconds from `created_at`. Task expires if not executed within this window.
    pub ttl_seconds: u64,
    /// Block timestamp (seconds) when the task was created.
    pub created_at: u64,
    /// Current lifecycle status. Updated atomically with state transitions.
    pub status: TaskStatus,
    /// Keeper assigned via round-robin or commit-reveal. `None` while Pending.
    pub assigned_keeper: Option<ManagedAddress<M>>,
    /// Block timestamp (seconds) when execution completed. 0 while pending.
    /// Used for metrics, anomaly detection, and stuck task recovery (24h threshold).
    pub completed_at: u64,
    /// Optional ID of a task to activate upon successful completion (task chaining).
    /// The chained task must exist, belong to the same owner, and be in Pending status.
    pub post_task_id: Option<u64>,
    /// Whether this task requires the XWAP Oracle Gate to be OPEN before executing.
    /// Used to opt-in to high volatility protection.
    pub require_xwap_safe: bool,
}

/// Current status of a task in its lifecycle.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone, PartialEq, Debug)]
pub enum TaskStatus {
    /// Awaiting keeper pickup
    Pending,
    /// Keeper committed, awaiting reveal
    Committed,
    /// Currently being executed
    Executing,
    /// Successfully completed
    Completed,
    /// Execution failed after all retries
    Failed,
    /// Cancelled by owner
    Cancelled,
    /// TTL expired without execution
    Expired,
}

/// Defines when a task should be triggered for execution.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub enum Trigger<M: ManagedTypeApi> {
    /// Execute once at or after a specific timestamp
    TimeOnce {
        target_time: u64,
    },
    /// Execute repeatedly at fixed intervals (in seconds)
    TimeRecurring {
        start_time: u64,
        interval: u64,
        remaining_execs: u64,
    },
    /// Execute when an on-chain condition is met (Phase 2+)
    ConditionOnChain {
        oracle_contract: ManagedAddress<M>,
        query_endpoint: ManagedBuffer<M>,
        query_args: ManagedVec<M, ManagedBuffer<M>>,
        comparator: Comparator,
        threshold: BigUint<M>,
    },
}

/// Comparison operators for condition-based triggers.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone, PartialEq, Debug)]
pub enum Comparator {
    Gt,
    Lt,
    Eq,
    Gte,
    Lte,
}

// ═══════════════════════════════════════════════════════════════════
//  COMMIT-REVEAL TYPES
// ═══════════════════════════════════════════════════════════════════

/// Information stored during the commit phase of the anti-MEV protocol.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct CommitInfo<M: ManagedTypeApi> {
    pub keeper: ManagedAddress<M>,
    pub commit_hash: ManagedByteArray<M, 32>,
    pub commit_timestamp: u64,
    pub bond: BigUint<M>,
}

// ═══════════════════════════════════════════════════════════════════
//  KEEPER TYPES
// ═══════════════════════════════════════════════════════════════════

/// Registration and performance data for a keeper in the network.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct KeeperInfo<M: ManagedTypeApi> {
    pub addr: ManagedAddress<M>,
    pub stake: BigUint<M>,
    pub registered_at: u64,
    pub total_executions: u64,
    pub successful_execs: u64,
    pub failed_execs: u64,
    pub slashed_amount: BigUint<M>,
    pub active: bool,
    /// Consecutive failures — resets on success. 3 strikes = auto-expulsion.
    pub consecutive_failures: u64,
}

// ═══════════════════════════════════════════════════════════════════
//  CLONE-KEY TYPES (Burner Wallets)
// ═══════════════════════════════════════════════════════════════════

/// Properties of a Clone-Key (Burner Wallet) authorized by a main wallet.
///
/// A Clone-Key allows automated task scheduling without exposing the main
/// wallet's private keys. Spend limits and expiry provide hard security caps.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct CloneKeyProperties<M: ManagedTypeApi> {
    /// The main wallet that authorized this clone key.
    pub main_address: ManagedAddress<M>,
    /// Maximum EGLD the clone key can spend (set at authorization time).
    pub spend_limit: BigUint<M>,
    /// Total EGLD already spent by this clone key (incremented on each task).
    pub spent_amount: BigUint<M>,
    /// Unix timestamp when this clone key expires. After this, all operations fail.
    pub expiry_timestamp: u64,
}
