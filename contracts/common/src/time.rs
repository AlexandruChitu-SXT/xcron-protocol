use multiversx_sc::api::BlockchainApi;
use multiversx_sc::api::ManagedTypeApi;
use multiversx_sc::contract_base::BlockchainWrapper;

/// Normalizes block timestamp from seconds or milliseconds to seconds.
/// Mitigates the temporal asymmetry issue in 600ms PBFT environments.
pub fn get_safe_block_timestamp<API: BlockchainApi + ManagedTypeApi>(
    blockchain: &BlockchainWrapper<API>,
) -> u64 {
    let ts = blockchain.get_block_timestamp_seconds().as_u64_seconds();
    if ts > 50_000_000_000 {
        ts / 1000
    } else {
        ts
    }
}
