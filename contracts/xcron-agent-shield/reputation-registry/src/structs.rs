multiversx_sc::imports!();
multiversx_sc::derive_imports!();

/// ERC-8004 feedback data — stores raw signal, not computed scores.
#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, PartialEq, Debug)]
pub struct FeedbackData<M: ManagedTypeApi> {
    pub value: i64,
    pub value_decimals: u8,
    pub tag1: ManagedBuffer<M>,
    pub tag2: ManagedBuffer<M>,
    pub is_revoked: bool,
}
