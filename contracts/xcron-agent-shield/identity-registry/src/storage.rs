use crate::AgentDetails;

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

#[multiversx_sc::module]
pub trait StorageModule {
    #[view(get_agent_token_id)]
    #[storage_mapper("agentTokenId")]
    fn agent_token_id(&self) -> NonFungibleTokenMapper;

    #[view(get_agent_id)]
    #[storage_mapper("agents")]
    fn agents(&self) -> BiDiMapper<u64, ManagedAddress<Self::Api>>;

    #[view(get_agent_details)]
    #[storage_mapper("agentDetails")]
    fn agent_details(&self, nonce: u64) -> SingleValueMapper<AgentDetails<Self::Api>>;

    #[view(get_agent_metadata)]
    #[storage_mapper("agentMetadatas")]
    fn agent_metadata(&self, nonce: u64) -> MapMapper<ManagedBuffer, ManagedBuffer>;

    #[view(get_agent_service)]
    #[storage_mapper("agentServiceConfigs")]
    fn agent_service_config(&self, nonce: u64) -> MapMapper<u32, Payment<Self::Api>>;
}
