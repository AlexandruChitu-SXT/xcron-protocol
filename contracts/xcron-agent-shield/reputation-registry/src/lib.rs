#![no_std]

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

pub mod config;
mod errors;
mod events;
pub mod storage;
pub mod structs;
mod utils;

use errors::*;
use events::NewFeedbackEventData;
use structs::FeedbackData;

#[multiversx_sc::contract]
pub trait ReputationRegistry:
    common::cross_contract::CrossContractModule
    + storage::StorageModule
    + events::EventsModule
    + config::ConfigModule
    + utils::UtilsModule
{
    #[init]
    fn init(
        &self,
        validation_contract_address: ManagedAddress,
        identity_contract_address: ManagedAddress,
    ) {
        self.validation_contract_address()
            .set(&validation_contract_address);
        self.identity_contract_address()
            .set(&identity_contract_address);
    }

    #[upgrade]
    fn upgrade(&self) {}

    // ── giveFeedbackSimple (MX-8004 original — on-chain scoring) ──

    /// Simple feedback for a job. Caller must be the employer who created the job.
    /// Computes a cumulative moving average on-chain.
    #[endpoint(giveFeedbackSimple)]
    fn give_feedback_simple(&self, job_id: ManagedBuffer, agent_nonce: u64, rating: BigUint) {
        let caller = self.blockchain().get_caller();
        let validation_addr = self.validation_contract_address().get();

        // 1. Authenticity: Read job data directly from validation-registry storage
        let job_mapper = self.external_job_data(validation_addr, &job_id);
        require!(!job_mapper.is_empty(), ERR_JOB_NOT_FOUND);
        let job_data = job_mapper.get();

        // 2. Frontrunning Protection: Verify caller is the employer
        require!(caller == job_data.employer, ERR_NOT_EMPLOYER);

        // 3. Duplicate Prevention
        require!(
            !self.has_given_feedback(job_id.clone()).get(),
            ERR_FEEDBACK_ALREADY_PROVIDED
        );

        let new_score = self.calculate_new_score(agent_nonce, rating);

        self.reputation_score(agent_nonce).set(&new_score);
        self.has_given_feedback(job_id).set(true);

        self.reputation_updated_event(agent_nonce, new_score);
    }

    // ── giveFeedback (ERC-8004 compliant — raw signals) ──

    /// ERC-8004: Anyone can give feedback (except the agent owner).
    /// Stores raw signals — no on-chain scoring. Off-chain aggregation expected.
    #[endpoint(giveFeedback)]
    fn give_feedback(
        &self,
        agent_nonce: u64,
        value: i64,
        value_decimals: u8,
        tag1: ManagedBuffer,
        tag2: ManagedBuffer,
        endpoint: ManagedBuffer,
        feedback_uri: ManagedBuffer,
        feedback_hash: ManagedBuffer,
    ) {
        let caller = self.blockchain().get_caller();

        // 1. Caller MUST NOT be the agent owner
        let identity_addr = self.identity_contract_address().get();
        let agent_mapper = self.external_agents(identity_addr);
        let opt_owner_nonce = agent_mapper.get_id(&caller);
        if opt_owner_nonce != 0 {
            require!(
                opt_owner_nonce != agent_nonce,
                ERR_AGENT_OWNER_CANNOT_SELF_REVIEW
            );
        }

        // 2. Validate decimals
        require!(value_decimals <= 18, ERR_INVALID_VALUE_DECIMALS);

        // 3. Increment feedback index for this (agent, client) pair
        let new_index = self
            .last_feedback_index(agent_nonce, &caller)
            .update(|idx| {
                *idx += 1;
                *idx
            });

        // 4. Track client
        self.feedback_clients(agent_nonce).insert(caller.clone());

        // 5. Store feedback data
        let data = FeedbackData {
            value,
            value_decimals,
            tag1: tag1.clone(),
            tag2: tag2.clone(),
            is_revoked: false,
        };
        self.feedback_data(agent_nonce, &caller, new_index)
            .set(data);

        // 6. Emit event
        let event_data = NewFeedbackEventData {
            feedback_index: new_index,
            value,
            value_decimals,
            tag1,
            tag2,
            endpoint,
            feedback_uri,
            feedback_hash,
        };
        self.new_feedback_event(agent_nonce, caller, event_data);
    }

    // ── revokeFeedback (ERC-8004) ──

    /// ERC-8004: Only the original feedback author can revoke their feedback.
    #[endpoint(revokeFeedback)]
    fn revoke_feedback(&self, agent_nonce: u64, feedback_index: u64) {
        let caller = self.blockchain().get_caller();

        let mapper = self.feedback_data(agent_nonce, &caller, feedback_index);
        require!(!mapper.is_empty(), ERR_FEEDBACK_NOT_FOUND);

        mapper.update(|data| {
            require!(!data.is_revoked, ERR_FEEDBACK_ALREADY_REVOKED);
            data.is_revoked = true;
        });

        self.feedback_revoked_event(agent_nonce, caller, feedback_index);
    }

    // ── readFeedback (ERC-8004 view) ──

    #[view(readFeedback)]
    fn read_feedback(
        &self,
        agent_nonce: u64,
        client: ManagedAddress,
        feedback_index: u64,
    ) -> FeedbackData<Self::Api> {
        let mapper = self.feedback_data(agent_nonce, &client, feedback_index);
        require!(!mapper.is_empty(), ERR_FEEDBACK_NOT_FOUND);
        mapper.get()
    }

    // ── append_response (legacy, kept for backwards compat) ──

    /// ERC-8004: Anyone can append a response to feedback (e.g., agent showing refund,
    /// data aggregator tagging feedback as spam).
    #[endpoint(append_response)]
    fn append_response(&self, job_id: ManagedBuffer, response_uri: ManagedBuffer) {
        let validation_addr = self.validation_contract_address().get();
        let job_mapper = self.external_job_data(validation_addr, &job_id);
        require!(!job_mapper.is_empty(), ERR_JOB_NOT_FOUND);

        // Per ERC-8004: anyone can append responses — no caller check
        self.agent_response(job_id).set(response_uri);
    }
}
