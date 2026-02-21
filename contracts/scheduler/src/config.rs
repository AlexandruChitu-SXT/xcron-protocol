multiversx_sc::imports!();

/// Owner-only configuration endpoints for protocol parameter updates.
#[multiversx_sc::module]
pub trait ConfigModule: crate::storage::StorageModule {
    #[only_owner]
    #[endpoint(setMinDeposit)]
    fn set_min_deposit(&self, value: BigUint) {
        self.min_deposit().set(&value);
    }

    #[only_owner]
    #[endpoint(setProtocolFeeBps)]
    fn set_protocol_fee_bps(&self, value: u64) {
        require!(
            value <= common::constants::BPS_DENOMINATOR,
            "Fee exceeds 100%"
        );
        self.protocol_fee_bps().set(value);
    }

    #[only_owner]
    #[endpoint(setRevealWindow)]
    fn set_reveal_window(&self, value: u64) {
        self.reveal_window().set(value);
    }

    #[only_owner]
    #[endpoint(setCommitBond)]
    fn set_commit_bond(&self, value: BigUint) {
        self.commit_bond().set(&value);
    }

    #[only_owner]
    #[endpoint(setKeeperRegistryAddr)]
    fn set_keeper_registry_addr(&self, addr: ManagedAddress) {
        self.keeper_registry_addr().set(&addr);
    }

    #[only_owner]
    #[endpoint(setRewardsAddr)]
    fn set_rewards_addr(&self, addr: ManagedAddress) {
        self.rewards_addr().set(&addr);
    }

    /// Phase 1: whitelist a keeper by address.
    #[only_owner]
    #[endpoint(addWhitelistedKeeper)]
    fn add_whitelisted_keeper(&self, keeper: ManagedAddress) {
        self.whitelisted_keepers().insert(keeper);
    }

    /// Phase 1: remove a keeper from the whitelist.
    #[only_owner]
    #[endpoint(removeWhitelistedKeeper)]
    fn remove_whitelisted_keeper(&self, keeper: ManagedAddress) {
        self.whitelisted_keepers().swap_remove(&keeper);
    }

    /// Set the maximum reward a keeper can earn per execution.
    /// Excess deposit is refunded to the task owner.
    #[only_owner]
    #[endpoint(setMaxRewardPerExec)]
    fn set_max_reward_per_exec(&self, value: BigUint) {
        self.max_reward_per_exec().set(&value);
    }
}
