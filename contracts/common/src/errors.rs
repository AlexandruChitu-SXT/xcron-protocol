/// Error messages as static byte slices per MultiversX best practices.
/// This avoids string allocation overhead and enables consistent error reporting.

// ── Scheduler Errors ────────────────────────────────────────────────
pub static ERR_DEPOSIT_BELOW_MIN: &[u8] = b"Deposit below minimum";
pub static ERR_GAS_TOO_LOW: &[u8] = b"max_gas too low";
pub static ERR_TTL_TOO_SHORT: &[u8] = b"TTL too short";
pub static ERR_NOT_TASK_OWNER: &[u8] = b"Not task owner";
pub static ERR_ONLY_PENDING: &[u8] = b"Can only cancel Pending tasks";
pub static ERR_TASK_NOT_PENDING: &[u8] = b"Task not Pending";
pub static ERR_TASK_NOT_COMMITTED: &[u8] = b"Task not Committed";
pub static ERR_COMMIT_BOND_LOW: &[u8] = b"Insufficient commit bond";
pub static ERR_NOT_COMMITTED_KEEPER: &[u8] = b"Not committed keeper";
pub static ERR_REVEAL_EXPIRED: &[u8] = b"Reveal window expired";
pub static ERR_INVALID_REVEAL: &[u8] = b"Invalid reveal";
pub static ERR_REVEAL_NOT_EXPIRED: &[u8] = b"Reveal window not expired";
pub static ERR_TASK_NOT_RIPE: &[u8] = b"Task not yet ripe";

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

// ── Access Control Errors ───────────────────────────────────────────
pub static ERR_NOT_AUTHORIZED: &[u8] = b"Not authorized";
