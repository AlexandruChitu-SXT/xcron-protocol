multiversx_sc::imports!();

/// Security admin endpoints — owner-only operations for blacklisting,
/// deposit caps, shard registration, and security metrics.
#[multiversx_sc::module]
pub trait AdminModule:
    crate::storage::StorageModule
    + crate::validation::ValidationModule
    + common::pausable::PausableModule
{
    /// S-3: Blacklist a malicious target contract (owner only).
    #[only_owner]
    #[endpoint(blacklistTarget)]
    fn blacklist_target(&self, target: ManagedAddress) {
        self.target_blacklist().insert(target);
    }

    /// S-4: Remove a contract from the blacklist (owner only).
    #[only_owner]
    #[endpoint(removeBlacklist)]
    fn remove_blacklist(&self, target: ManagedAddress) {
        self.target_blacklist().swap_remove(&target);
    }

    /// S-5: Set maximum EGLD deposit per task (owner only).
    #[only_owner]
    #[endpoint(setMaxExecValue)]
    fn set_max_exec_value(&self, max_value: BigUint) {
        self.max_exec_value_egld().set(&max_value);
    }

    /// S-10: Cache keeper shard for shard-aware task assignment.
    #[endpoint(registerKeeperShard)]
    fn register_keeper_shard(&self) {
        let keeper = self.blockchain().get_caller();
        self.require_registered_keeper(&keeper);
        let shard = self.blockchain().get_shard_of_address(&keeper);
        self.keeper_shard(&keeper).set(shard);
    }

    /// View: get security metrics (success/failure/blacklist counts).
    #[view(getSecurityMetrics)]
    fn get_security_metrics(&self) -> MultiValue3<u64, u64, usize> {
        (
            self.total_successful_execs().get(),
            self.total_failed_execs().get(),
            self.target_blacklist().len(),
        )
            .into()
    }

    /// View: check if a target is blacklisted.
    #[view(isBlacklisted)]
    fn is_blacklisted(&self, target: ManagedAddress) -> bool {
        self.target_blacklist().contains(&target)
    }

    /// View: get target failure count.
    #[view(getTargetFailures)]
    fn get_target_failures(&self, target: ManagedAddress) -> u64 {
        self.target_failure_count(&target).get()
    }
}
