multiversx_sc::imports!();

/// Task execution and async callback handling.
///
/// Contains the core execution flow: keeper triggers task → async call
/// to target contract → callback verifies result → keeper paid or user refunded.
/// Also handles stuck task recovery and TTL expiration.
#[multiversx_sc::module]
pub trait ExecutionModule:
    crate::storage::StorageModule
    + crate::events::EventsModule
    + crate::validation::ValidationModule
    + crate::helpers::HelpersModule
    + common::pausable::PausableModule
{
    /// Execute a ripe task. Keeper triggers execution, payment via async callback.
    #[endpoint(executeTask)]
    fn execute_task(&self, task_id: u64) {
        self.require_not_paused();

        // 🛡️ SECURITY PATCH (Vector 24): Global Async Lock Extirpated
        // Removed `executing_guard` to unleash 100% concurrent execution.
        // Reentrancy is naturally mitigated since task.status shifts to Executing immediately.

        let task = self.tasks(task_id).get();
        let keeper = self.blockchain().get_caller();

        // Checks
        require!(
            task.status == common::types::TaskStatus::Pending,
            "Task not Pending"
        );
        self.require_registered_keeper(&keeper);

        // S-15: MEV / Commit-Reveal Guard
        // If a task passed through Commit-Reveal, it is exclusively locked to the assigned keeper.
        if let Some(assigned) = &task.assigned_keeper {
            require!(
                &keeper == assigned,
                "MEV Protection: Task locked to the Committing Keeper"
            );
        }

        self.require_task_ripe(task_id, &task);


        // S-1: Verify target is still safe (could have been blacklisted after scheduling)
        self.require_safe_target(&task.target_contract, &task.target_endpoint);

        // S-14: XWAP Oracle Safety Gate (Graceful Degradation)
        // Opt-in protection: If the user flagged this task as sensitive to volatility,
        // we proactively query XWAP and fail execution if the gate is closed.
        if task.require_xwap_safe {
            let xwap_addr = self.xwap_address().get();
            if !xwap_addr.is_zero() {
                let raw_results = self
                    .tx()
                    .to(&xwap_addr)
                    .raw_call("isSafeToExecute")
                    .returns(multiversx_sc::types::ReturnsRawResult)
                    .sync_call();

                let mut is_safe = false;
                if !raw_results.is_empty() {
                    let raw_val = raw_results.get(0);
                    if !raw_val.is_empty() {
                        is_safe = true;
                    }
                }

                require!(is_safe, "XWAP Oracle reports unsafe market conditions");
            }
        }

        // Round-robin assignment: fair task distribution among keepers
        // S-13: Crypto-Round-Robin (Anti Front-Running). Target timestamp + task_id prevents 
        // keepers from pre-calculating their assigned tasks and hoarding them out of greed.
        let keeper_count = self.keeper_list().len();
        if keeper_count > 1 {
            let ripe_time = match &task.trigger {
                common::types::Trigger::TimeOnce { target_time } => *target_time,
                common::types::Trigger::TimeRecurring { start_time, .. } => *start_time,
                _ => self.get_safe_block_timestamp(),
            };
            
            // Generate a pseudo-random index based on task_id + ripe_time + prev_block_hash
            // This ensures assignments are stable for the same task in the same block but unpredictable in advance
            let mut hash_data = ManagedBuffer::new();
            hash_data.append(&ManagedBuffer::from(task_id.to_be_bytes().as_ref()));
            hash_data.append(&ManagedBuffer::from(ripe_time.to_be_bytes().as_ref()));
            
            // SECURITY PATCH (Vector 19): Inject on-chain entropy to prevent off-chain prediction
            // get_block_nonce is predictable off-chain. By adding `get_block_random_seed()` (available 0.40+),
            // a Keeper cannot predict MEV assignments off-chain and selectively grief the network.
            let random_seed = self.blockchain().get_block_random_seed();
            hash_data.append(random_seed.as_managed_buffer());
            
            let hash = self.crypto().sha256(&hash_data);
            let mut hash_bytes = [0u8; 8];
            hash_bytes.copy_from_slice(&hash.as_managed_buffer().to_boxed_bytes().as_slice()[0..8]);
            
            let pseudo_rand = u64::from_be_bytes(hash_bytes);
            let assigned_index = (pseudo_rand % keeper_count as u64) as usize + 1;
            
            let assigned_keeper = self.keeper_list().get(assigned_index);

            if keeper != assigned_keeper {
                let current_time = self.get_safe_block_timestamp();
                require!(
                    current_time >= ripe_time + common::constants::ROUND_ROBIN_GRACE_SECONDS,
                    "Task assigned to another keeper -- wait 30s grace period"
                );
            }
        }

        // C-3: Validate gas budget with cross-shard awareness
        // Dynamic callback gas: lower for intra-shard (less coordination needed)
        let target_shard = self
            .blockchain()
            .get_shard_of_address(&task.target_contract);
        let self_shard = self
            .blockchain()
            .get_shard_of_address(&self.blockchain().get_sc_address());
        let is_cross_shard = target_shard != self_shard;

        // Shard-aware gas: if keeper registered their shard, check affinity
        let keeper_shard_cached = self.keeper_shard(&keeper).get();
        let cross_shard_overhead = if !is_cross_shard {
            0u64 // Intra-shard: no overhead
        } else if keeper_shard_cached == target_shard {
            // Keeper is in same shard as target — only scheduler→keeper is cross-shard
            task.max_gas * 15 / 100 // 15% vs 30% — half the overhead
        } else {
            task.max_gas * 30 / 100 // Full cross-shard overhead
        };

        // Dynamic callback gas: cross-shard callbacks need more gas for coordination
        let callback_gas = if is_cross_shard {
            common::constants::CALLBACK_GAS_RESERVE // 25M for cross-shard
        } else {
            common::constants::CALLBACK_GAS_RESERVE * 80 / 100 // 20M for intra-shard
        };

        let min_gas_needed = task.max_gas + cross_shard_overhead + callback_gas + 10_000_000u64;
        require!(
            self.blockchain().get_gas_left() >= min_gas_needed,
            "Insufficient gas for full execution"
        );

        // CEI — Effects: mark as Executing (payment deferred to callback)
        let mut task = task;
        task.status = common::types::TaskStatus::Executing;
        task.assigned_keeper = Some(keeper.clone());
        self.tasks(task_id).set(&task);
        self.remove_from_indices(task_id, &task);

        // BUG FIX: Reentrancy Guard MUST NOT be released before the async call.
        // It remains locked until execution_callback returns.
        // REMOVED: self.executing_guard().set(false);

        // Build clean args for target call
        let mut clean_args = ManagedVec::new();
        for arg in task.target_args.into_iter() {
            if !arg.is_empty() {
                clean_args.push(arg);
            }
        }

        // Async call to target contract WITH callback
        self.tx()
            .to(&task.target_contract)
            .raw_call(task.target_endpoint.clone())
            .arguments_raw(clean_args.into())
            .gas(task.max_gas)
            .callback(self.callbacks().execution_callback(task_id, keeper))
            .gas_for_callback(callback_gas)
            .register_promise();
    }

    /// Async callback — handles execution result.
    #[promises_callback]
    fn execution_callback(
        &self,
        task_id: u64,
        keeper: ManagedAddress,
        #[call_result] result: ManagedAsyncCallResult<IgnoreValue>,
    ) {
        let mut task = self.tasks(task_id).get();

        match result {
            ManagedAsyncCallResult::Ok(_) => {
                // ✅ Target executed successfully — pay keeper and protocol
                task.completed_at = self.get_safe_block_timestamp();
                
                // STATE PRUNING: Físicamente eliminamos la tarea en lugar de guardar el estado Completed (Anti-Bloat)
                self.tasks(task_id).clear();
                self.owner_tasks(&task.owner).swap_remove(&task_id);

                // S-2: Record execution metrics
                self.total_successful_execs().update(|v| *v += 1);

                // S-6: Reset target failure count on success
                self.target_failure_count(&task.target_contract).set(0u64);

                // Cross-shard metrics
                let target_shard = self
                    .blockchain()
                    .get_shard_of_address(&task.target_contract);
                let self_shard = self
                    .blockchain()
                    .get_shard_of_address(&self.blockchain().get_sc_address());
                if target_shard != self_shard {
                    self.cross_shard_execs().update(|v| *v += 1);
                } else {
                    self.intra_shard_execs().update(|v| *v += 1);
                }

                let reward = self.calculate_keeper_reward(&task);
                let protocol_fee = self.calculate_protocol_fee(&task);

                // Pay keeper
                self.send().direct_egld(&keeper, &reward);
                self.keeper_paid_event(task_id, &keeper, &reward);

                // Calculate remaining deposit
                let total_spent = &reward + &protocol_fee;
                let remaining_deposit = if task.deposit > total_spent {
                    &task.deposit - &total_spent
                } else {
                    BigUint::zero()
                };

                // Handle recurring tasks
                if let common::types::Trigger::TimeRecurring {
                    interval,
                    remaining_execs,
                    ..
                } = &task.trigger
                {
                    let min_dep = self.min_deposit().get();
                    if *remaining_execs > 1 && remaining_deposit >= min_dep {
                        self.reschedule_recurring(
                            &task,
                            *interval,
                            *remaining_execs - 1,
                            remaining_deposit,
                        );
                    } else if remaining_deposit > BigUint::zero() {
                        self.send().direct_egld(&task.owner, &remaining_deposit);
                        self.user_refunded_event(task_id, &task.owner, &remaining_deposit);
                    }
                } else if remaining_deposit > BigUint::zero() {
                    self.send().direct_egld(&task.owner, &remaining_deposit);
                    self.user_refunded_event(task_id, &task.owner, &remaining_deposit);
                }

                // Send protocol fee to Rewards contract
                self.forward_protocol_fee(&keeper, task_id, &protocol_fee);
                self.protocol_fee_paid_event(task_id, &protocol_fee);

                // P5: Notify KeeperRegistry of success (resets consecutive failures)
                self.forward_keeper_result(&keeper, true);

                self.task_executed_event(task_id, &keeper, true);

                // ── Task Chaining: activate post-task if configured ──
                if let Some(post_id) = task.post_task_id {
                    if !self.tasks(post_id).is_empty() {
                        let mut post_task = self.tasks(post_id).get();
                        // Only activate if same owner and still Pending
                        if post_task.owner == task.owner
                            && post_task.status == common::types::TaskStatus::Pending
                        {
                            // Update trigger time to NOW so keeper picks it up immediately
                            let now = self.get_safe_block_timestamp();
                            match &mut post_task.trigger {
                                common::types::Trigger::TimeOnce { target_time } => {
                                    *target_time = now;
                                }
                                common::types::Trigger::TimeRecurring { start_time, .. } => {
                                    *start_time = now;
                                }
                                _ => {} // StateDriven and EventDriven keep their original conditions
                            }
                            self.tasks(post_id).set(&post_task);
                            // Re-index for immediate discovery
                            self.time_index(now).insert(post_id);
                        }
                    }
                }
            }
            ManagedAsyncCallResult::Err(_) => {
                // ❌ Target execution failed — Vector 18 PATCH:
                // If the target contract panics, it is NOT the Keeper's fault!
                // The Keeper paid Gas and successfully triggered the network.
                // Refunding the owner and slashing the Keeper allows the owner to Grief Keeper Gas indefinitely!
                
                task.assigned_keeper = None;
                task.completed_at = self.get_safe_block_timestamp();
                
                // STATE PRUNING
                self.tasks(task_id).clear();
                self.owner_tasks(&task.owner).swap_remove(&task_id);

                self.total_failed_execs().update(|v| *v += 1);
                let failures = self.target_failure_count(&task.target_contract).get();
                self.target_failure_count(&task.target_contract).set(failures + 1);

                // Forfeit the execution cost to the Keeper to prevent Sybil drain.
                let reward = self.calculate_keeper_reward(&task);
                let protocol_fee = self.calculate_protocol_fee(&task);
                self.send().direct_egld(&keeper, &reward);
                self.keeper_paid_event(task_id, &keeper, &reward);
                
                self.forward_protocol_fee(&keeper, task_id, &protocol_fee);
                self.protocol_fee_paid_event(task_id, &protocol_fee);

                // Refund ONLY the remaining deposit (if recurring bounds exceed spend).
                let total_spent = &reward + &protocol_fee;
                if task.deposit > total_spent {
                    let refund = &task.deposit - &total_spent;
                    self.send().direct_egld(&task.owner, &refund);
                    self.user_refunded_event(task_id, &task.owner, &refund);
                }

                // P5: Keeper executed successfully, DO NOT slash them.
                self.forward_keeper_result(&keeper, true);
                // Mark Task as failed internally
                self.task_executed_event(task_id, &keeper, false);
            }
        }
    }

    /// Recover tasks stuck in Executing state. Only callable by owner.
    #[only_owner]
    #[endpoint(recoverStuckTask)]
    fn recover_stuck_task(&self, task_id: u64) {
        let mut task = self.tasks(task_id).get();
        require!(
            task.status == common::types::TaskStatus::Executing,
            "Task not in Executing state"
        );

        let current_time = self.get_safe_block_timestamp();
        let stuck_threshold = 60 * 60; // 1 hour
        require!(
            current_time > task.created_at + stuck_threshold,
            "Task not stuck yet (wait 1h)"
        );

        task.completed_at = current_time;
        // STATE PRUNING
        self.tasks(task_id).clear();
        // P3: Clean owner_tasks index on recovery
        self.owner_tasks(&task.owner).swap_remove(&task_id);

        self.total_failed_execs().update(|v| *v += 1);
        self.send().direct_egld(&task.owner, &task.deposit);
        self.task_expired_event(task_id);
    }

    /// Mark tasks past their TTL as Expired and refund owners.
    #[endpoint(expireStaleTasks)]
    fn expire_stale_tasks(&self, task_ids: MultiValueEncoded<u64>) {
        let caller = self.blockchain().get_caller();
        require!(
            self.whitelisted_keepers().contains(&caller)
                || caller == self.blockchain().get_owner_address(),
            "Not authorized to expire tasks"
        );

        let current_time = self.get_safe_block_timestamp();
        let mut processed: usize = 0;
        for task_id in task_ids {
            if processed >= common::constants::MAX_EXPIRE_BATCH {
                break;
            }
            let task = self.tasks(task_id).get();
            if task.status != common::types::TaskStatus::Pending {
                continue;
            }
            if current_time > task.created_at + task.ttl_seconds {
                // STATE PRUNING
                self.tasks(task_id).clear();
                self.remove_from_indices(task_id, &task);
                self.owner_tasks(&task.owner).swap_remove(&task_id);
                self.send().direct_egld(&task.owner, &task.deposit);
                self.task_expired_event(task_id);
                processed += 1;
            }
        }
    }
}
 
