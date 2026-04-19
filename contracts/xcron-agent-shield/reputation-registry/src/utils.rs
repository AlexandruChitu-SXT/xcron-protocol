multiversx_sc::imports!();

#[multiversx_sc::module]
pub trait UtilsModule:
    common::cross_contract::CrossContractModule + crate::storage::StorageModule
{
    /// Cumulative moving average: new_score = (current * (n-1) + rating) / n
    fn calculate_new_score(&self, agent_nonce: u64, rating: BigUint) -> BigUint {
        let total_jobs = self.total_jobs(agent_nonce).update(|n| {
            *n += 1;
            *n
        });

        let current_score = self.reputation_score(agent_nonce).get();
        let total_big = BigUint::from(total_jobs);
        let prev_total = &total_big - 1u32;
        let weighted_score = current_score * prev_total;

        (weighted_score + rating) / total_big
    }
}
