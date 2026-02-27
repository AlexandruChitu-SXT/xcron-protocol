/// Protocol-wide constants for the XCron system.

/// Basis points denominator (100% = 10,000 BPS)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Protocol fee: 15% (1,500 BPS) — protocol keeps 15%, keeper gets 85%.
pub const DEFAULT_PROTOCOL_FEE_BPS: u64 = 1_500;

/// Minimum gas limit for task execution (5 million)
pub const MIN_GAS_LIMIT: u64 = 5_000_000;

/// Minimum TTL in seconds (1 minute)
pub const MIN_TTL_SECONDS: u64 = 60;

/// Default reveal window for commit-reveal (in seconds)
pub const DEFAULT_REVEAL_WINDOW_SECONDS: u64 = 60;

/// Default cooldown period for keeper unstaking: 12 hours (43,200 seconds)
pub const DEFAULT_COOLDOWN_SECONDS: u64 = 43_200;

/// Slash percentage: progressive per consecutive failure.
/// Strike 1: 5% (500 BPS)
pub const SLASH_STRIKE_1_BPS: u64 = 500;
/// Strike 2: 15% (1,500 BPS)
pub const SLASH_STRIKE_2_BPS: u64 = 1_500;
/// Strike 3: 20% (2,000 BPS) + auto-expulsion
pub const SLASH_STRIKE_3_BPS: u64 = 2_000;

/// 1 EGLD = 10^18 denomination units
pub const EGLD_DECIMALS: u64 = 1_000_000_000_000_000_000;

/// Gas reserved for callback execution
pub const CALLBACK_GAS_RESERVE: u64 = 10_000_000;

/// Maximum tasks processed per batch in expire_stale_tasks
pub const MAX_EXPIRE_BATCH: usize = 50;

/// Default max keeper reward per execution: 0.05 EGLD (in denomination units)
/// At $4/EGLD this is $0.20. The fee is fixed in EGLD.
pub const DEFAULT_MAX_REWARD_PER_EXEC: u64 = 50_000_000_000_000_000; // 0.05 EGLD

/// Early exit penalty: 5% (500 BPS) — keepers withdrawing before MIN_KEEPER_DAYS lose 5% of stake.
pub const EARLY_EXIT_PENALTY_BPS: u64 = 500;

/// Minimum days a keeper must stay before withdrawing without penalty (30 days).
pub const MIN_KEEPER_DAYS_SECONDS: u64 = 30 * 24 * 60 * 60; // 2,592,000 seconds

/// Maximum consecutive failures before automatic expulsion.
pub const MAX_STRIKES: u64 = 3;

/// Round-robin grace period: seconds the assigned keeper has exclusive rights
/// before the task becomes available to any keeper.
pub const ROUND_ROBIN_GRACE_SECONDS: u64 = 30;

// ── Security constants ──────────────────────────────────

/// Maximum consecutive failures on a single target before auto-blacklist.
pub const MAX_TARGET_FAILURES: u64 = 10;

/// Cross-shard gas overhead percentage (30 = 30% extra gas for cross-shard calls).
pub const CROSS_SHARD_GAS_OVERHEAD_PCT: u64 = 30;
