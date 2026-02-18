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

/// Default treasury split from rewards: 20% (2,000 BPS)
pub const DEFAULT_TREASURY_SPLIT_BPS: u64 = 2_000;

/// Gas reserved for callback execution
pub const CALLBACK_GAS_RESERVE: u64 = 10_000_000;
