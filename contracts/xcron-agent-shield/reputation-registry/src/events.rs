multiversx_sc::imports!();
multiversx_sc::derive_imports!();

/// ERC-8004 new feedback event data — packed as a single data argument.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode)]
pub struct NewFeedbackEventData<M: ManagedTypeApi> {
    pub feedback_index: u64,
    pub value: i64,
    pub value_decimals: u8,
    pub tag1: ManagedBuffer<M>,
    pub tag2: ManagedBuffer<M>,
    pub endpoint: ManagedBuffer<M>,
    pub feedback_uri: ManagedBuffer<M>,
    pub feedback_hash: ManagedBuffer<M>,
}

#[multiversx_sc::module]
pub trait EventsModule {
    #[event("reputationUpdated")]
    fn reputation_updated_event(&self, #[indexed] agent_nonce: u64, new_score: BigUint);

    #[event("newFeedback")]
    fn new_feedback_event(
        &self,
        #[indexed] agent_nonce: u64,
        #[indexed] client_address: ManagedAddress,
        data: NewFeedbackEventData<Self::Api>,
    );

    #[event("feedbackRevoked")]
    fn feedback_revoked_event(
        &self,
        #[indexed] agent_nonce: u64,
        #[indexed] client_address: ManagedAddress,
        #[indexed] feedback_index: u64,
    );

    #[event("responseAppended")]
    fn response_appended_event(
        &self,
        #[indexed] agent_nonce: u64,
        #[indexed] client_address: ManagedAddress,
        #[indexed] feedback_index: u64,
    );
}
