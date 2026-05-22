use multiversx_sc::types::TokenIdentifier;

fn check_egld(id: TokenIdentifier<multiversx_sc::api::GenericApi>) -> bool {
    id.is_egld()
}
