multiversx_sc::imports!();
multiversx_sc::derive_imports!();

/// Escrow settlement status.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, PartialEq, Debug)]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
}

/// On-chain escrow record.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, PartialEq, Debug)]
pub struct EscrowData<M: ManagedTypeApi> {
    pub employer: ManagedAddress<M>,
    pub receiver: ManagedAddress<M>,
    pub token_id: EgldOrEsdtTokenIdentifier<M>,
    pub token_nonce: u64,
    pub amount: BigUint<M>,
    pub poa_hash: ManagedBuffer<M>,
    pub deadline: TimestampSeconds,
    pub status: EscrowStatus,
}

#[multiversx_sc::module]
pub trait StorageModule {
    #[view(get_escrow)]
    #[storage_mapper("escrowData")]
    fn escrow_data(&self, job_id: &ManagedBuffer) -> SingleValueMapper<EscrowData<Self::Api>>;

    #[view(get_validation_contract_address)]
    #[storage_mapper("validationContractAddress")]
    fn validation_contract_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[view(get_identity_contract_address)]
    #[storage_mapper("identityContractAddress")]
    fn identity_contract_address(&self) -> SingleValueMapper<ManagedAddress>;
}
