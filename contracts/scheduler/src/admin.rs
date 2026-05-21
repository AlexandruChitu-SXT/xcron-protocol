multiversx_sc::imports!();

/// Security admin endpoints — owner-only operations for blacklisting,
/// deposit caps, shard registration, and security metrics.
#[multiversx_sc::module]
pub trait AdminModule:
    crate::storage::StorageModule
    + crate::validation::ValidationModule
    + crate::helpers::HelpersModule
    + common::pausable::PausableModule
{
    /// S-3: Blacklist a malicious target contract (owner only).
    #[only_owner]
    #[endpoint(blacklistTarget)]
    fn blacklist_target(&self, target: ManagedAddress) {
        let sc_address = self.blockchain().get_sc_address();
        require!(target != sc_address, "Cannot blacklist the scheduler contract");

        if !self.keeper_registry_addr().is_empty() {
            let registry_address = self.keeper_registry_addr().get();
            require!(target != registry_address, "Cannot blacklist the keeper registry contract");
        }

        self.target_blacklist().insert(target);
    }

    /// S-4: Remove a contract from the blacklist (owner only).
    #[only_owner]
    #[endpoint(removeBlacklist)]
    fn remove_blacklist(&self, target: ManagedAddress) {
        self.target_blacklist().swap_remove(&target);
        self.target_failure_count(&target).set(0u64);
    }

    /// Register scheduling restriction for a target contract.
    /// Only the owner of the target contract (retrieved via on-chain view getOwnerAddress)
    /// can register this restriction.
    #[endpoint(registerTargetRestriction)]
    fn register_target_restriction(&self, target: ManagedAddress) {
        let caller = self.blockchain().get_caller();
        let raw_results = self.tx()
            .to(&target)
            .raw_call("getOwnerAddress")
            .returns(multiversx_sc::types::ReturnsRawResult)
            .sync_call();
        require!(!raw_results.is_empty(), "Failed to get target owner");
        let target_owner = ManagedAddress::top_decode(raw_results.get(0).to_boxed_bytes().as_slice())
            .unwrap_or_else(|_| sc_panic!("Failed to decode target owner"));
        require!(caller == target_owner, "Caller is not the owner of the target contract");
        self.target_owner_restriction(&target).set(&caller);
    }

    /// Remove scheduling restriction for a target contract.
    /// Can only be called by the target owner or the Scheduler owner.
    #[endpoint(removeTargetRestriction)]
    fn remove_target_restriction(&self, target: ManagedAddress) {
        let caller = self.blockchain().get_caller();
        let target_owner = self.target_owner_restriction(&target).get();
        let is_scheduler_owner = caller == self.blockchain().get_owner_address();
        let is_target_owner = !self.target_owner_restriction(&target).is_empty() && caller == target_owner;
        require!(is_scheduler_owner || is_target_owner, "Not authorized to remove target restriction");
        self.target_owner_restriction(&target).clear();
    }

    /// Reset consecutive failure counter for a target contract.
    /// Can be called by Scheduler owner or target owner.
    #[endpoint(resetTargetFailures)]
    fn reset_target_failures(&self, target: ManagedAddress) {
        let caller = self.blockchain().get_caller();
        let target_owner = self.target_owner_restriction(&target).get();
        let is_scheduler_owner = caller == self.blockchain().get_owner_address();
        let is_target_owner = !self.target_owner_restriction(&target).is_empty() && caller == target_owner;
        require!(is_scheduler_owner || is_target_owner, "Not authorized to reset failures");
        self.target_failure_count(&target).set(0u64);
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
