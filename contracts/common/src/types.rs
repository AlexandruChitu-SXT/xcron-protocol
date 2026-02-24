use multiversx_sc::derive_imports::*;

multiversx_sc::imports!();

// ═══════════════════════════════════════════════════════════════════
//  TASK TYPES
// ═══════════════════════════════════════════════════════════════════

/// A scheduled automation task in the XCron protocol.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct Task<M: ManagedTypeApi> {
    pub id: u64,
    pub owner: ManagedAddress<M>,
    pub target_contract: ManagedAddress<M>,
    pub target_endpoint: ManagedBuffer<M>,
    pub target_args: ManagedVec<M, ManagedBuffer<M>>,
    pub trigger: Trigger<M>,
    pub max_gas: u64,
    pub deposit: BigUint<M>,
    pub max_retries: u8,
    pub retry_count: u8,
    pub ttl_seconds: u64,
    pub created_at: u64,
    pub status: TaskStatus,
    pub assigned_keeper: Option<ManagedAddress<M>>,
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
