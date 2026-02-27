/// Error messages as static byte slices per MultiversX best practices.
/// This avoids string allocation overhead and enables consistent error reporting.

// ── Security Errors (S-1 to S-10) ──────────────────────────────────
pub static ERR_S1_TARGET_SELF: &[u8] = b"S-1: Cannot target scheduler itself";
pub static ERR_S1_TARGET_REGISTRY: &[u8] = b"S-1: Cannot target KeeperRegistry";
pub static ERR_S1_TARGET_REWARDS: &[u8] = b"S-1: Cannot target Rewards contract";
pub static ERR_S1_TARGET_BLACKLISTED: &[u8] = b"S-1: Target contract is blacklisted";
pub static ERR_S1_DANGEROUS_ENDPOINT: &[u8] = b"S-1: Dangerous endpoint blocked";
pub static ERR_S8_DEPOSIT_EXCEEDS_CAP: &[u8] = b"S-8: Deposit exceeds maximum execution value";
pub static ERR_S9_TOO_MANY_TASKS: &[u8] = b"S-9: Too many active tasks (max 100)";
pub static ERR_S11_RATE_LIMITED: &[u8] = b"S-11: Too many tasks this round (anti-spam)";
pub static ERR_S12_TOO_MANY_ARGS: &[u8] = b"S-12: Too many arguments (max 10)";
pub static ERR_S12_ARG_TOO_LARGE: &[u8] = b"S-12: Argument too large (max 4096 bytes)";
pub static ERR_S13_ENDPOINT_LENGTH: &[u8] = b"S-13: Invalid endpoint name length (1-64 bytes)";
pub static ERR_TASK_NOT_COMMITTED_STATE: &[u8] = b"Task not in Committed state";

// ── Scheduler Errors ────────────────────────────────────────────────
pub static ERR_DEPOSIT_BELOW_MIN: &[u8] = b"Deposit below minimum";
pub static ERR_GAS_TOO_LOW: &[u8] = b"max_gas too low";
pub static ERR_TTL_TOO_SHORT: &[u8] = b"TTL too short";
pub static ERR_NOT_TASK_OWNER: &[u8] = b"Not task owner";
pub static ERR_ONLY_PENDING: &[u8] = b"Can only cancel Pending tasks";
pub static ERR_TASK_NOT_PENDING: &[u8] = b"Task not Pending";
pub static ERR_TASK_NOT_COMMITTED: &[u8] = b"Task not Committed";
pub static ERR_COMMIT_BOND_LOW: &[u8] = b"Bond below minimum";
pub static ERR_NOT_COMMITTED_KEEPER: &[u8] = b"Not the committing keeper";
pub static ERR_REVEAL_EXPIRED: &[u8] = b"Reveal window expired -- bond slashed";
pub static ERR_INVALID_REVEAL: &[u8] = b"Hash mismatch -- invalid salt";
pub static ERR_REVEAL_NOT_EXPIRED: &[u8] = b"Reveal window not expired yet";
pub static ERR_TASK_NOT_RIPE: &[u8] = b"Task not yet ripe";
pub static ERR_TASK_NOT_EXECUTING: &[u8] = b"Task not in Executing state";
pub static ERR_TASK_NOT_STUCK: &[u8] = b"Task not stuck yet (wait 24h)";
pub static ERR_METADATA_TOO_LARGE: &[u8] = b"Metadata too large (max 512 bytes)";
pub static ERR_REENTRANCY: &[u8] = b"Reentrancy blocked";
pub static ERR_INSUFFICIENT_GAS: &[u8] = b"Insufficient gas for full execution";
pub static ERR_ROUND_ROBIN_GRACE: &[u8] = b"Task assigned to another keeper -- wait 30s grace period";
pub static ERR_FEE_EXCEEDS_100: &[u8] = b"Fee exceeds 100%";
pub static ERR_ORACLE_CONDITION: &[u8] = b"Oracle condition not met";
pub static ERR_TASK_EXPIRED: &[u8] = b"Task expired (TTL exceeded)";
pub static ERR_ONLY_PENDING_METADATA: &[u8] = b"Can only set metadata on Pending tasks";

// ── KeeperRegistry Errors ───────────────────────────────────────────
pub static ERR_STAKE_BELOW_MIN: &[u8] = b"Stake below minimum";
pub static ERR_KEEPER_NOT_ACTIVE: &[u8] = b"Keeper not active";
pub static ERR_MUST_UNSTAKE_FIRST: &[u8] = b"Must request unstake first";
pub static ERR_COOLDOWN_NOT_ELAPSED: &[u8] = b"Cooldown not elapsed";
pub static ERR_KEEPER_ALREADY_REGISTERED: &[u8] = b"Keeper already registered";
pub static ERR_KEEPER_NOT_REGISTERED: &[u8] = b"Keeper not registered";

// ── Rewards Errors ──────────────────────────────────────────────────
pub static ERR_NO_PENDING_REWARDS: &[u8] = b"No pending rewards";
pub static ERR_INSUFFICIENT_TREASURY: &[u8] = b"Insufficient treasury";

// ── Access Control ──────────────────────────────────────────────────
pub static ERR_NOT_AUTHORIZED: &[u8] = b"Not authorized";
pub static ERR_NOT_AUTHORIZED_EXPIRE: &[u8] = b"Not authorized to expire tasks";
pub static ERR_PAUSED: &[u8] = b"Contract is paused";
