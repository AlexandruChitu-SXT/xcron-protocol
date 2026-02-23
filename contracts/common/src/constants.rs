/// Protocol-wide constants for the XCron system.

/// Basis points denominator (100% = 10,000 BPS)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Protocol fee: 30% (3,000 BPS) — protocol keeps 30%, keeper gets 70%.
pub const DEFAULT_PROTOCOL_FEE_BPS: u64 = 3_000;

/// Minimum gas limit for task execution (5 million)
pub const MIN_GAS_LIMIT: u64 = 5_000_000;

/// Minimum TTL in seconds (1 minute)
pub const MIN_TTL_SECONDS: u64 = 60;

/// Default reveal window for commit-reveal (in seconds)
pub const DEFAULT_REVEAL_WINDOW_SECONDS: u64 = 60;

/// Default cooldown period for keeper unstaking: 12 hours (43,200 seconds)
pub const DEFAULT_COOLDOWN_SECONDS: u64 = 43_200;

/// Slash percentage: 20% (2,000 BPS) per failure. 3 strikes = 60% lost.
pub const DEFAULT_SLASH_PCT_BPS: u64 = 2_000;

/// 1 EGLD = 10^18 denomination units
pub const EGLD_DECIMALS: u64 = 1_000_000_000_000_000_000;

/// Gas reserved for callback execution
pub const CALLBACK_GAS_RESERVE: u64 = 10_000_000;

/// Maximum tasks processed per batch in expire_stale_tasks
pub const MAX_EXPIRE_BATCH: usize = 50;

/// Default max keeper reward per execution: 0.05 EGLD (in denomination units)
/// At $4/EGLD this is $0.20. The fee is fixed in EGLD.
pub const DEFAULT_MAX_REWARD_PER_EXEC: u64 = 50_000_000_000_000_000; // 0.05 EGLD

