multiversx_sc::imports!();

#[multiversx_sc::module]
pub trait ConfigModule:
    common::cross_contract::CrossContractModule + crate::storage::ExternalStorageModule
{
    #[only_owner]
    #[endpoint(set_identity_registry_address)]
    fn set_identity_registry_address(&self, address: ManagedAddress) {
        self.identity_registry_address().set(&address);
    }

    #[only_owner]
    #[endpoint(addWhitelistedValidator)]
    fn add_whitelisted_validator(&self, address: ManagedAddress) {
        self.whitelisted_validators().insert(address);
    }

    #[only_owner]
    #[endpoint(removeWhitelistedValidator)]
    fn remove_whitelisted_validator(&self, address: ManagedAddress) {
        self.whitelisted_validators().swap_remove(&address);
    }
}
