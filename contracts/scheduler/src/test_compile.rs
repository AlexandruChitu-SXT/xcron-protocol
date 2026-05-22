use multiversx_sc::imports::*;
pub fn test_egld<M: ManagedTypeApi>(payment: &Payment<M>) -> bool {
    payment.token_identifier == TokenIdentifier::egld().into()
}
