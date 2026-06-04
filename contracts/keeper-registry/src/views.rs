multiversx_sc::imports!();

/// View functions for the KeeperRegistry contract.
#[multiversx_sc::module]
pub trait ViewsModule: crate::storage::StorageModule {
    #[view(isActiveKeeper)]
    fn is_active_keeper(&self, addr: &ManagedAddress) -> bool {
        if self.keepers(addr).is_empty() {
            return false;
        }
        self.keepers(addr).get().active
    }

    #[view(getKeeperInfo)]
    fn get_keeper_info(&self, addr: &ManagedAddress) -> common::types::KeeperInfo<Self::Api> {
        self.keepers(addr).get()
    }

    #[view(getActiveKeeperCount)]
    fn get_active_keeper_count(&self) -> usize {
        self.active_keeper_set().len()
    }

    #[view(getKeeperStake)]
    fn get_keeper_stake(&self, addr: &ManagedAddress) -> BigUint {
        if self.keepers(addr).is_empty() {
            return BigUint::zero();
        }
        self.keepers(addr).get().stake
    }

    #[view(getMinStake)]
    fn get_min_stake(&self) -> BigUint {
        self.min_stake().get()
    }

    #[view(totalCommittedCooldownEgld)]
    fn get_total_committed_cooldown_egld(&self) -> BigUint {
        self.total_committed_cooldown_egld().get()
    }
}
