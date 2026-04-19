multiversx_sc::imports!();

use crate::structs::{JobData, ValidationRequestData};

#[multiversx_sc::module]
pub trait ExternalStorageModule: common::cross_contract::CrossContractModule {
    // ── Local storage ──

    #[storage_mapper("jobData")]
    fn job_data(&self, job_id: &ManagedBuffer) -> SingleValueMapper<JobData<Self::Api>>;

    #[storage_mapper("identityRegistryAddress")]
    fn identity_registry_address(&self) -> SingleValueMapper<ManagedAddress>;

    // ── ERC-8004 Validation storage ──

    #[storage_mapper("validationRequestData")]
    fn validation_request_data(
        &self,
        request_hash: &ManagedBuffer,
    ) -> SingleValueMapper<ValidationRequestData<Self::Api>>;

    #[storage_mapper("agentValidations")]
    fn agent_validations(&self, agent_nonce: u64) -> UnorderedSetMapper<ManagedBuffer>;

    #[storage_mapper("whitelistedValidators")]
    fn whitelisted_validators(&self) -> UnorderedSetMapper<ManagedAddress>;
}
