multiversx_sc::imports!();

/// Access control validation for the Rewards contract.
#[multiversx_sc::module]
pub trait ValidationModule: crate::storage::StorageModule {
    /// Verify the caller is an authorized Scheduler contract.
    fn require_scheduler_caller(&self) {
        let caller = self.blockchain().get_caller();
        require!(
            self.authorized_schedulers().contains(&caller)
                || caller == self.blockchain().get_owner_address(),
            "Not authorized"
        );
    }
}
