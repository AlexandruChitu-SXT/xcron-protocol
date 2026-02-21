/// Protocol-wide constants for the XCron system.

/// Basis points denominator (100% = 10,000 BPS)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Default protocol fee: 15% (1,500 BPS) — MultiversX ecosystem rate.
/// For other chain deployments, set 20% (2,000 BPS) via setProtocolFeeBps.
pub const DEFAULT_PROTOCOL_FEE_BPS: u64 = 1_500;

/// Default keeper margin over gas cost: 15% (1,500 BPS)
pub const DEFAULT_KEEPER_MARGIN_BPS: u64 = 1_500;

/// Minimum gas limit for task execution (5 million)
pub const MIN_GAS_LIMIT: u64 = 5_000_000;

/// Minimum TTL in rounds (≈ 1 minute at 6s/round)
pub const MIN_TTL_ROUNDS: u64 = 10;

/// Default reveal window for commit-reveal (in rounds)
pub const DEFAULT_REVEAL_WINDOW: u64 = 10;

/// Default cooldown period for keeper unstaking (in rounds, ≈ 1 hour)
pub const DEFAULT_COOLDOWN_ROUNDS: u64 = 600;

/// Default slash percentage: 10% (1,000 BPS)
pub const DEFAULT_SLASH_PCT_BPS: u64 = 1_000;

/// ═══ Progressive Fee Tiers ═══
/// Tier thresholds defined in whole EGLD units (multiplied by 10^18 at runtime)
/// Tier 1: deposits up to 5 EGLD → 15% protocol fee (1,500 BPS)
pub const TIER1_EGLD: u64 = 5;
pub const TIER1_FEE_BPS: u64 = 1_500;

/// Tier 2: deposits 5–25 EGLD → 12% protocol fee (1,200 BPS)
pub const TIER2_EGLD: u64 = 25;
pub const TIER2_FEE_BPS: u64 = 1_200;

/// Tier 3: deposits above 25 EGLD → 10% protocol fee (1,000 BPS)
pub const TIER3_FEE_BPS: u64 = 1_000;

/// 1 EGLD = 10^18 denomination units
pub const EGLD_DECIMALS: u64 = 1_000_000_000_000_000_000;

/// Gas reserved for callback execution
pub const CALLBACK_GAS_RESERVE: u64 = 10_000_000;

/// Maximum tasks processed per batch in expire_stale_tasks
pub const MAX_EXPIRE_BATCH: usize = 50;
