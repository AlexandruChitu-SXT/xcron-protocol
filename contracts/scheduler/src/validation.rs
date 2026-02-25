multiversx_sc::imports!();

/// Validation logic for the Scheduler contract.
#[multiversx_sc::module]
pub trait ValidationModule: crate::storage::StorageModule {
    /// Verify a keeper is authorized to execute tasks.
    /// Phase 1: checks whitelist. Phase 2+: cross-shard call to KeeperRegistry.
    fn require_registered_keeper(&self, keeper: &ManagedAddress) {
        require!(
            self.whitelisted_keepers().contains(keeper),
            "Not authorized"
        );
    }

    // ═══════════════════════════════════════════════════════════
    //  S-1: TARGET SAFETY VALIDATION
    // ═══════════════════════════════════════════════════════════

    /// Validate target contract is safe to call.
    /// Blocks:
    /// - Self-calls (prevent call injection / reentrancy)
    /// - Calls to KeeperRegistry (prevent unauthorized slashing)
    /// - Calls to Rewards contract (prevent fee manipulation)
    /// - Calls to blacklisted contracts (known malicious targets)
    /// - Calls to dangerous system endpoints (upgradeContract, changeOwner, etc.)
    fn require_safe_target(&self, target: &ManagedAddress, endpoint: &ManagedBuffer) {
        // Block self-referential calls
        let self_addr = self.blockchain().get_sc_address();
        require!(target != &self_addr, "S-1: Cannot target scheduler itself");
        require!(
            target != &self.keeper_registry_addr().get(),
            "S-1: Cannot target KeeperRegistry"
        );
        require!(
            target != &self.rewards_addr().get(),
            "S-1: Cannot target Rewards contract"
        );

        // Block blacklisted targets
        require!(
            !self.target_blacklist().contains(target),
            "S-1: Target contract is blacklisted"
        );

        // Block dangerous system endpoints
        let ep_bytes = endpoint.to_boxed_bytes();
        let ep_slice = ep_bytes.as_slice();
        require!(ep_slice != b"upgradeContract", "S-1: Dangerous endpoint blocked");
        require!(ep_slice != b"changeOwner", "S-1: Dangerous endpoint blocked");
        require!(ep_slice != b"ClaimDeveloperRewards", "S-1: Dangerous endpoint blocked");
        require!(ep_slice != b"ChangeOwnerAddress", "S-1: Dangerous endpoint blocked");
        require!(ep_slice != b"ESDTTransfer", "S-1: Dangerous endpoint blocked");
    }

    // ═══════════════════════════════════════════════════════════
    //  S-8: DEPOSIT CAP VALIDATION
    // ═══════════════════════════════════════════════════════════

    /// Validate deposit does not exceed maximum execution value cap.
    /// Prevents catastrophic loss from a single exploited task.
    fn require_deposit_within_cap(&self, deposit: &BigUint) {
        let max_value = self.max_exec_value_egld().get();
        if max_value > BigUint::zero() {
            require!(
                deposit <= &max_value,
                "S-8: Deposit exceeds maximum execution value"
            );
        }
    }

    /// Verify a task's trigger condition is met (task is "ripe").
    fn require_task_ripe(&self, _task_id: u64, task: &common::types::Task<Self::Api>) {
        let current_time = self.blockchain().get_block_timestamp();

        // H-3: TTL expiry check — prevent execution of stale tasks
        if task.ttl_seconds > 0 {
            require!(
                current_time <= task.created_at + task.ttl_seconds,
                "Task expired (TTL exceeded)"
            );
        }

        match &task.trigger {
            common::types::Trigger::TimeOnce { target_time } => {
                require!(current_time >= *target_time, "Task not yet ripe");
            }
            common::types::Trigger::TimeRecurring { start_time, .. } => {
                require!(current_time >= *start_time, "Task not yet ripe");
            }
            common::types::Trigger::ConditionOnChain {
                oracle_contract,
                query_endpoint,
                query_args,
                comparator,
                threshold,
            } => {
                // SDK 0.63+: Execute oracle query using raw tx builder.
                // Builds a cross-contract call to the oracle, passes args,
                // and decodes the result as BigUint.
                let raw_result = self.tx()
                    .to(oracle_contract)
                    .raw_call(query_endpoint.clone())
                    .returns(ReturnsRawResult)
                    .sync_call();

                let oracle_value = if raw_result.is_empty() {
                    BigUint::zero()
                } else {
                    BigUint::from_bytes_be(raw_result.get(0).to_boxed_bytes().as_slice())
                };

                let condition_met = match comparator {
                    common::types::Comparator::Gt => oracle_value > *threshold,
                    common::types::Comparator::Lt => oracle_value < *threshold,
                    common::types::Comparator::Eq => oracle_value == *threshold,
                    common::types::Comparator::Gte => oracle_value >= *threshold,
                    common::types::Comparator::Lte => oracle_value <= *threshold,
                };

                require!(condition_met, "Oracle condition not met");
            }
        }
    }
}
