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

    #[only_owner]
    #[endpoint(setXwapAddress)]
    fn set_xwap_address(&self, addr: ManagedAddress) {
        self.xwap_address().set(&addr);
    }

    #[only_owner]
    #[endpoint(setXscAddress)]
    fn set_xsc_address(&self, addr: ManagedAddress) {
        self.xsc_address().set(&addr);
    }

    #[only_owner]
    #[endpoint(setZkVerifierAddr)]
    fn set_zk_verifier_addr(&self, addr: ManagedAddress) {
        self.zk_verifier_addr().set(&addr);
    }

    /// Phase 1: whitelist a keeper by address.
    /// Also adds to keeper_list for round-robin task assignment.
    #[only_owner]
    #[endpoint(addWhitelistedKeeper)]
    fn add_whitelisted_keeper(&self, keeper: ManagedAddress) {
        self.whitelisted_keepers().insert(keeper.clone());
        self.keeper_list().push(&keeper);
        // Initialize round-robin counter if first keeper
        if self.round_robin_counter().is_empty() {
            self.round_robin_counter().set(0u64);
        }
    }

    /// Phase 1: remove a keeper from the whitelist.
    /// Also removes from keeper_list for round-robin.
    #[only_owner]
    #[endpoint(removeWhitelistedKeeper)]
    fn remove_whitelisted_keeper(&self, keeper: ManagedAddress) {
        self.whitelisted_keepers().swap_remove(&keeper);
        // Remove from keeper_list by finding and swapping with last
        // O(n) scan — acceptable for Phase 1 (≤50 keepers).
        // Phase 2: switch to UnorderedSetMapper + separate index.
        let len = self.keeper_list().len();
        require!(len <= 50, "Keeper list too large for linear scan");
        for i in 1..=len {
            if self.keeper_list().get(i) == keeper {
                // Swap with last element and remove
                if i < len {
                    let last = self.keeper_list().get(len);
                    self.keeper_list().set(i, &last);
                }
                self.keeper_list().clear_entry(len);
                break;
            }
        }
    }

    /// Set the maximum reward a keeper can earn per execution.
    /// Excess deposit is refunded to the task owner.
    #[only_owner]
    #[endpoint(setMaxRewardPerExec)]
    fn set_max_reward_per_exec(&self, value: BigUint) {
        self.max_reward_per_exec().set(&value);
    }

    /// M-3 Fix: Flush accumulated protocol fees to the Rewards contract.
    ///
    /// Protocol fees are accumulated in `accrued_protocol_fees` during execution
    /// callbacks (because `transfer_execute` inside a callback cannot invoke
    /// SC endpoints). This endpoint sends them properly outside the callback.
    ///
    /// Callable by owner or any whitelisted keeper (incentivizes keepers to
    /// flush regularly since the rewards contract tracks their bonus).
    #[endpoint(flushProtocolFees)]
    fn flush_protocol_fees(&self) {
        let caller = self.blockchain().get_caller();
        require!(
            self.whitelisted_keepers().contains(&caller)
                || caller == self.blockchain().get_owner_address(),
            "Not authorized"
        );

        let accrued = self.accrued_protocol_fees().get();
        require!(accrued > BigUint::zero(), "No fees to flush");

        // Clear BEFORE transfer (CEI pattern)
        self.accrued_protocol_fees().clear();

        let rewards_addr = self.rewards_addr().get();
        self.tx()
            .to(&rewards_addr)
            .raw_call("receiveExecutionFee")
            .argument(&caller) // keeper who flushed
            .argument(&0u64) // task_id = 0 (bulk flush)
            .egld(&accrued)
            .gas(10_000_000u64)
            .transfer_execute();
    }

    /// View: check how many protocol fees have accumulated since last flush.
    #[view(getAccruedProtocolFees)]
    fn get_accrued_protocol_fees(&self) -> BigUint {
        self.accrued_protocol_fees().get()
    }

    /// View: Get the XWAP oracle address.
    #[view(getXwapAddress)]
    fn get_xwap_address(&self) -> ManagedAddress {
        self.xwap_address().get()
    }
}
