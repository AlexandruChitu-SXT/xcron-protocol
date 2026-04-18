/// Protocol-wide constants for the XCron system.

/// Basis points denominator (100% = 10,000 BPS)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Protocol fee: 30% (3,000 BPS) — protocol keeps 30%, keeper gets 70%.
pub const DEFAULT_PROTOCOL_FEE_BPS: u64 = 3_000;

/// Minimum gas limit for task execution (5 million)
pub const MIN_GAS_LIMIT: u64 = 5_000_000;

/// Maximum gas limit allowed for task execution (300 million)
/// S-20 FIX: Prevents "Unexecutable Gas Trap" and node exhaustion
pub const MAX_GAS_LIMIT: u64 = 300_000_000;

/// Minimum TTL in seconds (1 minute)
pub const MIN_TTL_SECONDS: u64 = 60;

/// Default reveal window for commit-reveal (in seconds)
pub const DEFAULT_REVEAL_WINDOW_SECONDS: u64 = 60;

/// Default cooldown period for keeper unstaking: 12 hours (43,200 seconds)
pub const DEFAULT_COOLDOWN_SECONDS: u64 = 43_200;
/// Alias for use in set_if_empty during contract upgrade
pub const UNSTAKE_COOLDOWN_SECONDS: u64 = DEFAULT_COOLDOWN_SECONDS;

/// Slash percentage: progressive per consecutive failure.
/// Strike 1: 5% (500 BPS)
pub const SLASH_STRIKE_1_BPS: u64 = 500;
/// Strike 2: 15% (1,500 BPS)
pub const SLASH_STRIKE_2_BPS: u64 = 1_500;
/// Strike 3: 20% (2,000 BPS) + auto-expulsion
pub const SLASH_STRIKE_3_BPS: u64 = 2_000;

/// 1 EGLD = 10^18 denomination units
pub const EGLD_DECIMALS: u64 = 1_000_000_000_000_000_000;

/// Gas reserved for callback execution.
/// Must cover: 1 storage read+write (~2M), up to 3 direct_egld (~3M each = 9M),
/// 1 forward_protocol_fee (~5M), 1 forward_keeper_result (~5M),
/// 1 reschedule_recurring (~3M) = ~24M min. Set to 25M with safety margin.
pub const CALLBACK_GAS_RESERVE: u64 = 25_000_000;

/// Maximum tasks processed per batch in expire_stale_tasks
pub const MAX_EXPIRE_BATCH: usize = 50;

/// Maximum endpoint name length in bytes.
pub const MAX_ENDPOINT_NAME_BYTES: usize = 64;

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

// ── Anti-spam constants ──────────────────────────────────

/// Maximum tasks any single address can schedule per block round (anti-spam burst protection).
pub const MAX_TASKS_PER_ROUND: u32 = 10;

/// Maximum number of arguments per scheduled task (prevents storage bloat).
pub const MAX_TASK_ARGS: usize = 10;

/// Maximum size of a single argument in bytes (prevents oversized payloads).
pub const MAX_ARG_SIZE_BYTES: usize = 4_096;

// ── Clone-Key (Burner Wallet) constants ─────────────────
// Gas costs in MultiversX are fixed in EGLD regardless of EGLD price,
// so these limits are based on actual protocol usage, not fiat value.

/// Maximum spend limit for a single Clone-Key: 2 EGLD.
/// DCA diario × 1 año ≈ 0.73 EGLD — 2 EGLD cubre de sobra con margen.
pub const MAX_CLONE_KEY_SPEND_LIMIT: u64 = 2 * EGLD_DECIMALS;

/// Maximum Clone-Keys a single main wallet can have active simultaneously.
pub const MAX_CLONE_KEYS_PER_WALLET: usize = 3;

/// Maximum Clone-Key validity: 30 days. Forces renewal = more secure.
pub const MAX_CLONE_KEY_TTL_SECONDS: u64 = 30 * 24 * 60 * 60; // 2,592,000s

/// Minimum Clone-Key validity: 1 hour.
pub const MIN_CLONE_KEY_TTL_SECONDS: u64 = 3_600;
