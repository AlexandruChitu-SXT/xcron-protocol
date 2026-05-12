multiversx_sc::imports!();

/// Task execution and async callback handling.
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

        let mut encoded_payload = ManagedBuffer::new();
        let _ = task_payload.top_encode(&mut encoded_payload);
        let task_hash: ManagedByteArray<Self::Api, 32> = self.crypto().sha256(&encoded_payload).into();

        require!(!self.quantum_tasks(&task_hash).is_empty(), "Q-1: Invalid Quantum Seal.");
        let quantum_state = self.quantum_tasks(&task_hash).get();

        require!(quantum_state.status == common::types::TaskStatus::Pending, "Task not Pending");

        if let common::types::Trigger::QuantumSealedHash { expected_hash } = &task_payload.trigger {
            let secret = quantum_secret.into_option().unwrap_or_else(|| sc_panic!("Missing Quantum Secret"));
            require!(secret.as_managed_buffer().len() == 32, "XCRON-PROTECT: Quantum Secret must be 32 bytes");
            let computed_hash = self.crypto().sha256(secret.as_managed_buffer());
            require!(computed_hash.as_managed_buffer() == expected_hash.as_managed_buffer(), "Q-1: Quantum Hash Seal broken");
        }

        if let Some(assigned) = &task_payload.assigned_keeper {
            require!(&keeper == assigned, "MEV Protection: Locked task");
        }

        self.perform_round_robin_check(&task_payload, &task_hash, &keeper);

        if task_payload.confidential {
            self.assigned_enclave_keeper(&task_hash).set(&keeper);
        }

        self.dispatch_task_execution(task_hash, task_payload, keeper, quantum_state);
    }

    /// Execute a Compressed Task verified via XSC Core.
    #[endpoint(executeCompressedTask)]
    fn execute_compressed_task(
        &self,
        task_payload: common::types::Task<Self::Api>,
        packed_proof: ManagedBuffer,
    ) {
        self.require_not_paused();
        let keeper = self.blockchain().get_caller();
        self.require_registered_keeper(&keeper);

        let mut encoded_payload = ManagedBuffer::new();
        let _ = task_payload.top_encode(&mut encoded_payload);
        let task_hash: ManagedByteArray<Self::Api, 32> = self.crypto().sha256(&encoded_payload).into();

        require!(!self.used_compressed_tasks(&task_hash).get(), "XSC: Task already executed");

        let xsc_addr = self.xsc_address().get();
        require!(!xsc_addr.is_zero(), "XSC: Core address not configured");

        let raw_result = self.tx()
            .to(&xsc_addr)
            .raw_call("verifyProof")
            .argument(&task_hash.as_managed_buffer())
            .argument(&packed_proof)
            .returns(ReturnsRawResult)
            .sync_call();

        let is_valid = if raw_result.is_empty() {
            false
        } else {
            bool::top_decode(raw_result.get(0).to_boxed_bytes().as_slice()).unwrap_or(false)
        };

        require!(is_valid, "XSC: Invalid State Proof");

        let virtual_state = common::types::QuantumTaskState {
            owner: task_payload.owner.clone(),
            deposit: task_payload.deposit.clone(),
            status: common::types::TaskStatus::Pending,
            executing_at: 0,
        };

        self.dispatch_task_execution(task_hash, task_payload, keeper, virtual_state);
    }

    /// Settle a Confidential Task executed inside an XSE Sovereign Enclave.
    #[endpoint(settleXseTask)]
    fn settle_xse_task(
        &self,
        task_hash: ManagedByteArray<Self::Api, 32>,
        zk_proof: ManagedBuffer,
    ) {
        self.require_not_paused();
        let enforcer = self.blockchain().get_caller();
        self.require_registered_keeper(&enforcer);

        let assigned = self.assigned_enclave_keeper(&task_hash).get();
        require!(enforcer == assigned, "XSE: Unauthorized settler");

        let quantum_state = self.quantum_tasks(&task_hash).get();
        require!(quantum_state.status == common::types::TaskStatus::Executing, "XSE: Task not in execution state");

        let zk_verifier = self.zk_verifier_addr().get();
        if !zk_verifier.is_zero() {
            let raw_result = self.tx()
                .to(&zk_verifier)
                .raw_call("verifyZkProof")
                .argument(&task_hash.as_managed_buffer())
                .argument(&zk_proof)
                .returns(ReturnsRawResult)
                .sync_call();

            let is_proof_valid = if raw_result.is_empty() {
                false
            } else {
                bool::top_decode(raw_result.get(0).to_boxed_bytes().as_slice()).unwrap_or(false)
            };

            require!(is_proof_valid, "XSE: Invalid Enclave ZK-Proof");
        }

        self.finalize_successful_execution(task_hash, ManagedAddress::zero(), enforcer, quantum_state.deposit, quantum_state.owner);
    }

    fn dispatch_task_execution(
        &self,
        task_hash: ManagedByteArray<Self::Api, 32>,
        task_payload: common::types::Task<Self::Api>,
        keeper: ManagedAddress,
        mut quantum_state: common::types::QuantumTaskState<Self::Api>,
    ) {
        self.require_task_ripe_quantum(&task_payload);
        self.require_safe_target(&task_payload.target_contract, &task_payload.target_endpoint);

        if task_payload.require_xwap_safe {
            self.require_xwap_market_safe();
        }

        let target_shard = self.blockchain().get_shard_of_address(&task_payload.target_contract);
        let is_cross_shard = target_shard != self.blockchain().get_shard_of_address(&self.blockchain().get_sc_address());
        
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
        require!(self.blockchain().get_gas_left() >= min_gas_needed, "Insufficient gas");

        quantum_state.status = common::types::TaskStatus::Executing;
        quantum_state.executing_at = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
        self.quantum_tasks(&task_hash).set(&quantum_state);

        if task_payload.confidential {
            self.xse_payload_triggered_event(&keeper, &task_hash.as_managed_buffer());
            return;
        }

        let mut exact_args = ManagedVec::new();
        for arg in task_payload.target_args.into_iter() {
            exact_args.push(arg);
        }

        self.tx()
            .to(&task_payload.target_contract)
            .raw_call(task_payload.target_endpoint.clone())
            .arguments_raw(exact_args.into())
            .gas(task_payload.max_gas)
            .callback(self.callbacks().execution_callback(task_hash, task_payload.target_contract.clone(), keeper))
            .gas_for_callback(callback_gas)
            .register_promise();
    }

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

        match result {
            ManagedAsyncCallResult::Ok(_) => {
                self.finalize_successful_execution(task_hash, target_contract, keeper, deposit, owner);
            }
            ManagedAsyncCallResult::Err(_) => {
                self.finalize_failed_execution(task_hash, target_contract, keeper, deposit, owner);
            }
        }
    }

    fn finalize_successful_execution(
        &self,
        task_hash: ManagedByteArray<Self::Api, 32>,
        target_contract: ManagedAddress,
        keeper: ManagedAddress,
        deposit: BigUint,
        owner: ManagedAddress,
    ) {
        self.quantum_tasks(&task_hash).clear();
        self.owner_tasks(&owner).swap_remove(&task_hash);
        self.used_compressed_tasks(&task_hash).set(true);
        self.assigned_enclave_keeper(&task_hash).clear();

        self.total_successful_execs().update(|v| *v += 1);
        if !target_contract.is_zero() {
            self.target_failure_count(&target_contract).set(0u64);
        }

        let reward = self.calculate_reward(&deposit);
        let fee_bps = self.protocol_fee_bps().get();
        let protocol_fee = &deposit * fee_bps / common::constants::BPS_DENOMINATOR;

        self.send().direct_egld(&keeper, &reward);
        let total_spent = &reward + &protocol_fee;
        if deposit > total_spent {
            self.send().direct_egld(&owner, &(&deposit - &total_spent));
        }

        self.forward_protocol_fee(&keeper, 0, &protocol_fee);
        self.forward_keeper_result(&keeper, true);
        self.task_executed_event_quantum(&task_hash, &keeper, true);
    }

    fn finalize_failed_execution(
        &self,
        task_hash: ManagedByteArray<Self::Api, 32>,
        target_contract: ManagedAddress,
        keeper: ManagedAddress,
        deposit: BigUint,
        owner: ManagedAddress,
    ) {
        self.quantum_tasks(&task_hash).clear();
        self.owner_tasks(&owner).swap_remove(&task_hash);
        self.assigned_enclave_keeper(&task_hash).clear();

        self.total_failed_execs().update(|v| *v += 1);
        let failures = self.target_failure_count(&target_contract).get() + 1;
        self.target_failure_count(&target_contract).set(failures);

        if failures >= common::constants::MAX_TARGET_FAILURES {
            self.target_blacklist().insert(target_contract.clone());
        }

        let reward = self.calculate_reward(&deposit);
        let fee_bps = self.protocol_fee_bps().get();
        let protocol_fee = &deposit * fee_bps / common::constants::BPS_DENOMINATOR;

        self.send().direct_egld(&keeper, &reward);
        let total_spent = &reward + &protocol_fee;
        if deposit > total_spent {
            self.send().direct_egld(&owner, &(&deposit - &total_spent));
        }

        self.forward_protocol_fee(&keeper, 0, &protocol_fee);
        self.forward_keeper_result(&keeper, false);
        self.task_executed_event_quantum(&task_hash, &keeper, false);
    }

    fn calculate_reward(&self, deposit: &BigUint) -> BigUint {
        let fee_bps = self.protocol_fee_bps().get();
        let protocol_fee = deposit * fee_bps / common::constants::BPS_DENOMINATOR;
        let uncapped_reward = if *deposit > protocol_fee { deposit - &protocol_fee } else { BigUint::zero() };
        let max_reward = self.max_reward_per_exec().get();
        if max_reward > BigUint::zero() && uncapped_reward > max_reward { max_reward } else { uncapped_reward }
    }

    fn require_xwap_market_safe(&self) {
        let xwap_addr = self.xwap_address().get();
        if !xwap_addr.is_zero() {
            let raw_results = self.tx().to(&xwap_addr).raw_call("isSafeToExecute").returns(multiversx_sc::types::ReturnsRawResult).sync_call();
            let mut is_safe = false;
            if !raw_results.is_empty() {
                let raw_val = raw_results.get(0);
                if !raw_val.is_empty() { is_safe = true; }
            }
            require!(is_safe, "XWAP Oracle unsafe");
        }
    }

    fn perform_round_robin_check(&self, task_payload: &common::types::Task<Self::Api>, task_hash: &ManagedByteArray<Self::Api, 32>, keeper: &ManagedAddress) {
        let keeper_count = self.keeper_list().len();
        if keeper_count > 1 {
            let ripe_time_ms = match &task_payload.trigger {
                common::types::Trigger::TimeOnce { target_time } => *target_time,
                common::types::Trigger::TimeRecurring { start_time, .. } => *start_time,
                _ => self.blockchain().get_block_timestamp_seconds().as_u64_seconds() * 1000,
            };
            let mut hash_data = ManagedBuffer::new();
            hash_data.append(task_hash.as_managed_buffer());
            hash_data.append(&ManagedBuffer::from(ripe_time_ms.to_be_bytes().as_ref()));
            hash_data.append(self.blockchain().get_block_random_seed().as_managed_buffer());
            let hash = self.crypto().sha256(&hash_data);
            let mut hash_bytes = [0u8; 8];
            let _ = hash.as_managed_buffer().load_slice(0, &mut hash_bytes);
            let assigned_index = (u64::from_be_bytes(hash_bytes) % keeper_count as u64) as usize + 1;
            let assigned_keeper = self.keeper_list().get(assigned_index);
            if *keeper != assigned_keeper {
                let current_time_ms = self.blockchain().get_block_timestamp_seconds().as_u64_seconds() * 1000;
                require!(current_time_ms >= ripe_time_ms + (common::constants::ROUND_ROBIN_GRACE_SECONDS * 1000), "Task assigned to another keeper");
            }
        }
    }

    #[endpoint(triggerXseEnclave)]
    fn trigger_xse_enclave(&self, encrypted_payload_hex: ManagedBuffer) {
        let caller = self.blockchain().get_caller();
        self.require_registered_keeper(&caller);
        self.xse_payload_triggered_event(&caller, &encrypted_payload_hex);
    }
}
