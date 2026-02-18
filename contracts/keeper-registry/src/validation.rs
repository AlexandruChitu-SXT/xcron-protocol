multiversx_sc::imports!();

/// Access control validation for KeeperRegistry.
#[multiversx_sc::module]
pub trait ValidationModule: crate::storage::StorageModule {
    /// Verify the caller is an authorized contract (Scheduler or Rewards).
    fn require_authorized_caller(&self) {
        let caller = self.blockchain().get_caller();
        require!(
            self.authorized_callers().contains(&caller)
                || caller == self.blockchain().get_owner_address(),
            "Not authorized"
        );
    }
}
