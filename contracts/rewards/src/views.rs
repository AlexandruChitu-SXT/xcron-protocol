multiversx_sc::imports!();

/// View functions for the Rewards contract.
#[multiversx_sc::module]
pub trait ViewsModule: crate::storage::StorageModule {
    #[view(getPendingRewards)]
    fn get_pending_rewards(&self, keeper: &ManagedAddress) -> BigUint {
        if self.pending_rewards(keeper).is_empty() {
            return BigUint::zero();
        }
        self.pending_rewards(keeper).get()
    }

    #[view(getTreasuryBalance)]
    fn get_treasury_balance(&self) -> BigUint {
        self.treasury_balance().get()
    }

    #[view(getTreasurySplitBps)]
    fn get_treasury_split_bps(&self) -> u64 {
        self.treasury_split_bps().get()
    }
}
