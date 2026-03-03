multiversx_sc::imports!();

#[multiversx_sc::module]
pub trait ConfigModule: crate::storage::StorageModule + crate::events::EventsModule {
    #[endpoint(setGateThreshold)]
    fn set_gate_threshold(&self, permille: u64) {
        self.require_owner();
        require!(permille > 0 && permille < 1000, "threshold out of range");
        self.gate_threshold_permille().set(permille);
    }

    #[endpoint(setAlphaBounds)]
    fn set_alpha_bounds(&self, min_x1000: u64, max_x1000: u64) {
        self.require_owner();
        require!(min_x1000 < max_x1000, "min must be < max");
        require!(max_x1000 <= 1000, "max alpha cannot exceed 1.0");
        self.alpha_min_x1000().set(min_x1000);
        self.alpha_max_x1000().set(max_x1000);
    }

    #[endpoint(setTrendBoost)]
    fn set_trend_boost(&self, boost_x1000: u64) {
        self.require_owner();
        require!(boost_x1000 <= 500, "boost too high");
        self.trend_boost_x1000().set(boost_x1000);
    }

    #[endpoint(setGateBoost)]
    fn set_gate_boost(&self, boost_x1000: u64) {
        self.require_owner();
        require!(boost_x1000 <= 500, "boost too high");
        self.gate_boost_x1000().set(boost_x1000);
    }

    #[endpoint(setFreshnessBlocks)]
    fn set_freshness_blocks(&self, blocks: u64) {
        self.require_owner();
        require!(blocks > 0 && blocks <= 20, "freshness out of range");
        self.freshness_blocks().set(blocks);
    }

    #[endpoint(setConsensusMin)]
    fn set_consensus_min(&self, permille: u64) {
        self.require_owner();
        require!(permille >= 500 && permille <= 1000, "consensus out of range");
        self.consensus_min_permille().set(permille);
    }

    #[endpoint(registerKeeper)]
    fn register_keeper(&self, keeper: ManagedAddress) {
        self.require_owner();
        self.registered_keepers().insert(keeper.clone());
        self.keeper_registry_updated_event(&keeper, true);
    }

    #[endpoint(removeKeeper)]
    fn remove_keeper(&self, keeper: ManagedAddress) {
        self.require_owner();
        self.registered_keepers().swap_remove(&keeper);
        self.keeper_registry_updated_event(&keeper, false);
    }

    #[endpoint(setPoolAddress)]
    fn set_pool_address(&self, pool: ManagedAddress) {
        self.require_owner();
        self.pool_address().set(pool);
    }

    fn require_owner(&self) {
        let caller = self.blockchain().get_caller();
        let owner = self.owner_address().get();
        require!(caller == owner, "only owner");
    }
}
