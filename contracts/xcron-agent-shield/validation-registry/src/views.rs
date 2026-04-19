multiversx_sc::imports!();
multiversx_sc::derive_imports!();

use crate::structs::{JobData, ValidationRequestData};

#[multiversx_sc::module]
pub trait ViewsModule:
    common::cross_contract::CrossContractModule + crate::storage::ExternalStorageModule
{
    #[view(is_job_verified)]
    fn is_job_verified(&self, job_id: ManagedBuffer) -> bool {
        let job_mapper = self.job_data(&job_id);
        !job_mapper.is_empty() && job_mapper.get().status == crate::structs::JobStatus::Verified
    }

    #[view(get_job_data)]
    fn get_job_data(&self, job_id: ManagedBuffer) -> OptionalValue<JobData<Self::Api>> {
        let job_mapper = self.job_data(&job_id);
        if job_mapper.is_empty() {
            OptionalValue::None
        } else {
            OptionalValue::Some(job_mapper.get())
        }
    }

    /// ERC-8004: Returns validation status for a request hash.
    #[view(get_validation_status)]
    fn get_validation_status(
        &self,
        request_hash: ManagedBuffer,
    ) -> OptionalValue<ValidationRequestData<Self::Api>> {
        let mapper = self.validation_request_data(&request_hash);
        if mapper.is_empty() {
            OptionalValue::None
        } else {
            OptionalValue::Some(mapper.get())
        }
    }

    /// ERC-8004: Returns all validation request hashes for an agent.
    #[view(get_agent_validations)]
    fn get_agent_validations(&self, agent_nonce: u64) -> ManagedVec<ManagedBuffer> {
        let mut result = ManagedVec::new();
        for hash in self.agent_validations(agent_nonce).iter() {
            result.push(hash);
        }
        result
    }
}
