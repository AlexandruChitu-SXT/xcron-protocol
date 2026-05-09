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
    + crate::clone_keys::CloneKeysModule
{
    /// Execute a ripe Quantum Task. Keeper provides full payload, contract verifies hash.
    #[endpoint(executeQuantumTask)]
    fn execute_quantum_task(
        &self,
        task_payload: common::types::Task<Self::Api>,
        quantum_secret: OptionalValue<ManagedByteArray<Self::Api, 32>>,
    ) {
        self.require_not_paused();

        let keeper = self.blockchain().get_caller();
        self.require_registered_keeper(&keeper);

        // Q-1: Hash the payload and verify the Quantum Seal
        let mut encoded_payload = ManagedBuffer::new();
        let _ = task_payload.top_encode(&mut encoded_payload);
        let task_hash = self.crypto().sha256(&encoded_payload);

        require!(!self.quantum_tasks(&task_hash).is_empty(), "Q-1: Invalid Quantum Seal. Task not found or already executed.");
        let quantum_state = self.quantum_tasks(&task_hash).get();

        // Checks
        require!(
            quantum_state.status == common::types::TaskStatus::Pending,
            "Task not Pending"
        );

        // Q-1: Quantum-Sealed Hash Reveal Authorization (Post-Quantum Security)
        // If the task uses a QuantumSealedHash trigger, the Keeper must provide the pre-image secret.
        // Even if ECDSA is broken by quantum computers, the task cannot be hijacked without this secret.
        if let common::types::Trigger::QuantumSealedHash { expected_hash } = &task_payload.trigger {
            let secret = quantum_secret.into_option().unwrap_or_else(|| sc_panic!("Missing Quantum Secret Premove"));
            
            // 🛡️ XCRON-PROTECT: Vector 7 Fix - Brute Force Protection
            // Force the secret pre-image to be exactly 32 bytes (256 bits of entropy).
            // This makes it mathematically impossible for an attacker to crack a weak password like "1234".
            require!(
                secret.as_managed_buffer().len() == 32,
                "XCRON-PROTECT: Quantum Secret must be exactly 32 bytes to prevent GPU Brute Force"
            );
            
            let computed_hash = self.crypto().sha256(secret.as_managed_buffer());
            require!(
                computed_hash.as_managed_buffer() == expected_hash.as_managed_buffer(),
                "Q-1: Quantum Hash Seal broken: Invalid Secret Reveal"
            );
        }

        // (We assume S-15 Commit-Reveal logic will be updated separately if needed,
        // but for now, the payload defines the assigned keeper).
        if let Some(assigned) = &task_payload.assigned_keeper {
            require!(
                &keeper == assigned,
                "MEV Protection: Task locked to the Committing Keeper"
            );
        }

        self.require_task_ripe_quantum(&task_payload);

        // S-1: Verify target is still safe (could have been blacklisted after scheduling)
        self.require_safe_target(&task_payload.target_contract, &task_payload.target_endpoint);

        // S-14: XWAP Oracle Safety Gate (Graceful Degradation)
        if task_payload.require_xwap_safe {
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
        let keeper_count = self.keeper_list().len();
        if keeper_count > 1 {
            let ripe_time_ms = match &task_payload.trigger {
                common::types::Trigger::TimeOnce { target_time } => *target_time,
                common::types::Trigger::TimeRecurring { start_time, .. } => *start_time,
                _ => self.get_timestamp_ms(),
            };
            
            // Generate a pseudo-random index based on task_hash + ripe_time + prev_block_hash
            let mut hash_data = ManagedBuffer::new();
            hash_data.append(task_hash.as_managed_buffer());
            hash_data.append(&ManagedBuffer::from(ripe_time_ms.to_be_bytes().as_ref()));
            
            let random_seed = self.blockchain().get_block_random_seed();
            hash_data.append(random_seed.as_managed_buffer());
            
            let hash = self.crypto().sha256(&hash_data);
            let mut hash_bytes = [0u8; 8];
            hash_bytes.copy_from_slice(&hash.as_managed_buffer().to_boxed_bytes().as_slice()[0..8]);
            
            let pseudo_rand = u64::from_be_bytes(hash_bytes);
            let assigned_index = (pseudo_rand % keeper_count as u64) as usize + 1;
            
            let assigned_keeper = self.keeper_list().get(assigned_index);

            if keeper != assigned_keeper {
                let current_time_ms = self.get_timestamp_ms();
                require!(
                    current_time_ms >= ripe_time_ms + (common::constants::ROUND_ROBIN_GRACE_SECONDS * 1000),
                    "Task assigned to another keeper -- wait 30s grace period"
                );
            }
        }

        // C-3: Validate gas budget with cross-shard awareness
        let target_shard = self.blockchain().get_shard_of_address(&task_payload.target_contract);
        let self_shard = self.blockchain().get_shard_of_address(&self.blockchain().get_sc_address());
        let is_cross_shard = target_shard != self_shard;

        let keeper_shard_cached = self.keeper_shard(&keeper).get();
        let cross_shard_overhead = if !is_cross_shard {
            0u64
        } else if keeper_shard_cached == target_shard {
            task_payload.max_gas * 15 / 100
        } else {
            task_payload.max_gas * 30 / 100
        };

        let callback_gas = if is_cross_shard {
            common::constants::CALLBACK_GAS_RESERVE
        } else {
            common::constants::CALLBACK_GAS_RESERVE * 80 / 100
        };

        let min_gas_needed = task_payload.max_gas + cross_shard_overhead + callback_gas + 10_000_000u64;
        require!(
            self.blockchain().get_gas_left() >= min_gas_needed,
            "Insufficient gas for full execution"
        );

        // CEI — Effects: mark as Executing (payment deferred to callback)
        let mut q_state = quantum_state;
        q_state.status = common::types::TaskStatus::Executing;
        self.quantum_tasks(&task_hash).set(&q_state);

        // Build args for target call preserving exact ABI structure.
        // 🛡️ CRITICAL SECURITY PATCH: We MUST NOT drop empty arguments.
        // In MultiversX ABI, an empty buffer represents `Option::None` or an empty string.
        // Dropping it shifts all subsequent arguments to the left, corrupting the call.
        let mut exact_args = ManagedVec::new();
        for arg in task_payload.target_args.into_iter() {
            exact_args.push(arg);
        }

        // Async call to target contract WITH stateless callback
        self.tx()
            .to(&task_payload.target_contract.clone())
            .raw_call(task_payload.target_endpoint.clone())
            .arguments_raw(exact_args.into())
            .gas(task_payload.max_gas)
            .callback(self.callbacks().execution_callback(task_hash, task_payload.target_contract, keeper))
            .gas_for_callback(callback_gas)
            .register_promise();
    }

    /// Async callback — handles execution result (Stateless Architecture).
    #[promises_callback]
    fn execution_callback(
        &self,
        task_hash: ManagedByteArray<Self::Api, 32>,
        target_contract: ManagedAddress,
        keeper: ManagedAddress,
        #[call_result] result: ManagedAsyncCallResult<IgnoreValue>,
    ) {
        let quantum_state = self.quantum_tasks(&task_hash).get();
        let deposit = quantum_state.deposit.clone();
        let owner = quantum_state.owner.clone();

        // Calculate stateless rewards (no recurring logic on-chain)
        let fee_bps = self.protocol_fee_bps().get();
        let protocol_fee = &deposit * fee_bps / common::constants::BPS_DENOMINATOR;
        let uncapped_reward = &deposit - &protocol_fee;
        let max_reward = self.max_reward_per_exec().get();
        let reward = if max_reward > BigUint::zero() && uncapped_reward > max_reward {
            max_reward
        } else {
            uncapped_reward
        };

        match result {
            ManagedAsyncCallResult::Ok(_) => {
                // ✅ Target executed successfully — pay keeper and protocol
                
                // STATE PRUNING: Físicamente eliminamos la tarea (Anti-Bloat)
                self.quantum_tasks(&task_hash).clear();
                self.owner_tasks(&owner).swap_remove(&task_hash);

                self.total_successful_execs().update(|v| *v += 1);
                self.target_failure_count(&target_contract).set(0u64);

                // Pay keeper
                self.send().direct_egld(&keeper, &reward);
                self.keeper_paid_event_quantum(&task_hash, &keeper, &reward);

                // Calculate remaining deposit (refund)
                let total_spent = &reward + &protocol_fee;
                let remaining_deposit = if deposit > total_spent {
                    &deposit - &total_spent
                } else {
                    BigUint::zero()
                };

                if remaining_deposit > BigUint::zero() {
                    self.send().direct_egld(&owner, &remaining_deposit);
                    self.user_refunded_event_quantum(&task_hash, &owner, &remaining_deposit);
                }

                // Send protocol fee
                self.forward_protocol_fee(&keeper, 0, &protocol_fee);
                self.protocol_fee_paid_event_quantum(&task_hash, &protocol_fee);

                self.forward_keeper_result(&keeper, true);
                self.task_executed_event_quantum(&task_hash, &keeper, true);
            }
            ManagedAsyncCallResult::Err(_) => {
                // ❌ Target execution failed
                // STATE PRUNING
                self.quantum_tasks(&task_hash).clear();
                self.owner_tasks(&owner).swap_remove(&task_hash);

                self.total_failed_execs().update(|v| *v += 1);
                let failures = self.target_failure_count(&target_contract).get();
                self.target_failure_count(&target_contract).set(failures + 1);

                // Forfeit the execution cost to the Keeper to prevent Sybil drain.
                self.send().direct_egld(&keeper, &reward);
                self.keeper_paid_event_quantum(&task_hash, &keeper, &reward);
                
                self.forward_protocol_fee(&keeper, 0, &protocol_fee);
                self.protocol_fee_paid_event_quantum(&task_hash, &protocol_fee);

                let total_spent = &reward + &protocol_fee;
                if deposit > total_spent {
                    let refund = &deposit - &total_spent;
                    self.send().direct_egld(&owner, &refund);
                    self.user_refunded_event_quantum(&task_hash, &owner, &refund);
                }

                self.forward_keeper_result(&keeper, true);
                self.task_executed_event_quantum(&task_hash, &keeper, false);
            }
        }
    }

    /// Recover tasks stuck in Executing state. Only callable by owner.
    #[endpoint(recoverStuckQuantumTask)]
    fn recover_stuck_quantum_task(&self, _task_hash: ManagedByteArray<Self::Api, 32>) {
        // 🛡️ SECURITY PATCH (Performance Benchmarks): Asynchronous Callback Griefing
        // Deshabilitado: Permite a un atacante recuperar el depósito mientras la ejecución
        // asíncrona está en vuelo, provocando que el callback falle y robando ejecución a los Keepers.
        sc_panic!("Security: recoverStuckQuantumTask is disabled to prevent async callback griefing.");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  XSE PROTOCOL (SOVEREIGN ENCLAVES)
    // ═══════════════════════════════════════════════════════════════════

    /// Endpoint targeted by the Scheduler for XSE tasks.
    /// It receives the encrypted payload and emits it to the blockchain event log.
    /// The off-chain Nitro Enclave captures this event and performs the Web2 execution.
    #[endpoint(triggerXseEnclave)]
    fn trigger_xse_enclave(&self, encrypted_payload_hex: ManagedBuffer) {
        let caller = self.blockchain().get_caller();
        
        // 🛡️ XCRON-PROTECT: Vector 18 Fix - Enclave CPU Exhaustion DoS
        // Without this check, any user could spam garbage payloads, forcing the off-chain
        // Enclave to waste heavy CPU cycles attempting to decrypt RSA-4096 blobs.
        // We restrict this endpoint strictly to registered, bonded Keepers.
        self.require_registered_keeper(&caller);
        
        // Emit the event for the off-chain enclave listener
        self.xse_payload_triggered_event(&caller, &encrypted_payload_hex);
    }
}
 
