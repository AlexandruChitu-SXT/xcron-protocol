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
      
      let mut hash_input = ManagedBuffer::new();
      hash_input.append(secret.as_managed_buffer());
      hash_input.append(task_payload.owner.as_managed_buffer());
      hash_input.append(&ManagedBuffer::from(&task_payload.id.to_be_bytes()[..]));
      hash_input.append(task_payload.target_contract.as_managed_buffer());
      
      let computed_hash = self.crypto().keccak256(&hash_input);
      require!(computed_hash.as_managed_buffer() == expected_hash.as_managed_buffer(), "Q-1: CL-CRIB Hash Seal broken");
    }

    if let Some(assigned) = &task_payload.assigned_keeper {
      require!(&keeper == assigned, "MEV Protection: Locked task");
    }

    // Skip Round Robin for Quantum tasks, since they are secured by the secret itself
    if !matches!(task_payload.trigger, common::types::Trigger::QuantumSealedHash { .. }) {
      self.perform_round_robin_check(&task_payload, &task_hash, &keeper);
    }

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
    
    let keeper_shard_actual = self.blockchain().get_shard_of_address(&keeper);
    self.keeper_shard(&keeper).set(keeper_shard_actual);

    let cross_shard_overhead = if !is_cross_shard {
      0u64
    } else if keeper_shard_actual == target_shard {
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
    require!(self.blockchain().get_gas_left() >= min_gas_needed, "Insufficient gas for full execution");

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

    self.executing_task_owner().set(&task_payload.owner);

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
    self.executing_task_owner().clear();
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
      let refund = &deposit - &total_spent;
      self.claimable_refunds(&owner).update(|v| *v += &refund);
    }

    self.forward_protocol_fee(&keeper, 0, &protocol_fee);
    self.forward_keeper_result(&keeper, true);
    self.task_executed_event_quantum(&task_hash, &keeper, true);
  }

  /// ️ XCRON-PROTECT: V1 FIX — Zero Reward on Failure
  /// Keepers are NOT paid when target execution fails. The full deposit
  /// is returned to the task owner. This prevents the "fail-to-earn" attack
  /// where a malicious keeper targets always-reverting contracts to farm rewards.
  /// The keeper absorbs the gas cost as economic disincentive.
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
    self.used_compressed_tasks(&task_hash).set(true);
    self.assigned_enclave_keeper(&task_hash).clear();

    self.total_failed_execs().update(|v| *v += 1);
    let failures = self.target_failure_count(&target_contract).get() + 1;
    self.target_failure_count(&target_contract).set(failures);

    if failures >= common::constants::MAX_TARGET_FAILURES {
      self.target_blacklist().insert(target_contract.clone());
    }

    // V1 FIX (Destructor-Hardened): Free Spam & Fail-to-Earn Protection
    // 1. User pays the protocol_fee as a penalty (deters 100% free spam).
    // 2. Keeper gets 0 reward. They lose gas money. This forces keepers to
    //  simulate tasks off-chain and ONLY execute tasks that will succeed.
    // 3. Protocol receives the fee.
    
    let fee_bps = self.protocol_fee_bps().get();
    let protocol_fee = &deposit * fee_bps / common::constants::BPS_DENOMINATOR;

    // Keeper gets nothing for a failed execution
    // self.send().direct_egld(&keeper, &BigUint::zero());
    
    if deposit > protocol_fee {
      let refund = &deposit - &protocol_fee;
      self.claimable_refunds(&owner).update(|v| *v += &refund);
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

  /// ️ XCRON-PROTECT: V8 FIX — Strict Boolean Decode for Oracle Gate
  /// Previously, ANY non-empty response was treated as "safe" (including a `false` byte).
  /// Now we properly decode the boolean value from the XWAP oracle response.
  fn require_xwap_market_safe(&self) {
    let xwap_addr = if !self.xwap_address().is_empty() { self.xwap_address().get() } else { ManagedAddress::zero() };
    if !xwap_addr.is_zero() {
      let raw_results = self.tx().to(&xwap_addr).raw_call("isSafeToExecute").returns(multiversx_sc::types::ReturnsRawResult).sync_call();
      let is_safe = if !raw_results.is_empty() {
        bool::top_decode(raw_results.get(0).to_boxed_bytes().as_slice()).unwrap_or(false)
      } else {
        false
      };
      require!(is_safe, "XWAP Oracle unsafe: market conditions not met");
    }
  }

  fn perform_round_robin_check(&self, task_payload: &common::types::Task<Self::Api>, task_hash: &ManagedByteArray<Self::Api, 32>, keeper: &ManagedAddress) {
    let keeper_count = self.keeper_list().len();
    if keeper_count > 1 {
      let ripe_time = match &task_payload.trigger {
        common::types::Trigger::TimeOnce { target_time } => *target_time,
        common::types::Trigger::TimeRecurring { start_time, .. } => *start_time,
        _ => self.get_timestamp_ms(),
      };

      let is_legacy = {
        let mut bytes = [0u8; 32];
        let _ = task_hash.as_managed_buffer().load_slice(0, &mut bytes);
        bytes[0..24].iter().all(|&b| b == 0)
      };

      let mut hash_data = ManagedBuffer::new();
      if is_legacy {
        hash_data.append(&ManagedBuffer::from(task_payload.id.to_be_bytes().as_ref()));
      } else {
        hash_data.append(task_hash.as_managed_buffer());
      }
      hash_data.append(&ManagedBuffer::from(ripe_time.to_be_bytes().as_ref()));
      hash_data.append(self.blockchain().get_block_random_seed().as_managed_buffer());

      let hash = self.crypto().sha256(&hash_data);
      let mut hash_bytes = [0u8; 8];
      let _ = hash.as_managed_buffer().load_slice(0, &mut hash_bytes);

      let assigned_index = (u64::from_be_bytes(hash_bytes) % keeper_count as u64) as usize + 1;
      let assigned_keeper = self.keeper_list().get(assigned_index);
      if *keeper != assigned_keeper {
        let current_time_ms = self.get_timestamp_ms();
        require!(
          current_time_ms >= ripe_time + (common::constants::ROUND_ROBIN_GRACE_SECONDS * 1000),
          "Task assigned to another keeper -- wait 30s grace period"
        );
      }
    }
  }

  #[endpoint(triggerXseEnclave)]
  fn trigger_xse_enclave(&self, encrypted_payload_hex: ManagedBuffer) {
    let caller = self.blockchain().get_caller();
    self.require_registered_keeper(&caller);
    self.xse_payload_triggered_event(&caller, &encrypted_payload_hex);
  }

  /// ️ XCRON-PROTECT: V12 FIX — 24-Hour Safety Valve for Stuck XSE Tasks
  /// If a keeper puts a task into Executing state (for XSE enclave processing)
  /// but never calls settleXseTask, the task is stuck forever and the deposit locked.
  /// This endpoint allows the task owner to rescue their deposit after 24 hours.
  /// The keeper responsible is reported as failed (reputation strike).
  #[endpoint(rescueStuckXseTask)]
  fn rescue_stuck_xse_task(&self, task_hash: ManagedByteArray<Self::Api, 32>) {
    self.require_not_paused();

    require!(!self.quantum_tasks(&task_hash).is_empty(), "Task not found");
    let quantum_state = self.quantum_tasks(&task_hash).get();

    require!(
      quantum_state.status == common::types::TaskStatus::Executing,
      "V12: Task is not in Executing state"
    );

    let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
    let stuck_threshold = 24 * 60 * 60; // 24 hours in seconds
    require!(
      current_time >= quantum_state.executing_at + stuck_threshold,
      "V12: Task has not been stuck for 24 hours yet"
    );

    // Only the task owner or the contract owner can rescue
    let caller = self.blockchain().get_caller();
    require!(
      caller == quantum_state.owner || caller == self.blockchain().get_owner_address(),
      "V12: Only task owner or protocol owner can rescue"
    );

    // Punish the assigned keeper (if any) with a failure record
    let assigned_keeper = self.assigned_enclave_keeper(&task_hash).get();
    if !assigned_keeper.is_zero() {
      self.forward_keeper_result(&assigned_keeper, false);
    }

    // Clean up and refund
    let deposit = quantum_state.deposit.clone();
    let owner = quantum_state.owner.clone();
    self.quantum_tasks(&task_hash).clear();
    self.owner_tasks(&owner).swap_remove(&task_hash);
    self.assigned_enclave_keeper(&task_hash).clear();

    self.claimable_refunds(&owner).update(|v| *v += &deposit);
    self.task_executed_event_quantum(&task_hash, &assigned_keeper, false);
  }

  /// Wrapper legacy para ejecutar una tarea por ID (usado en tests)
  #[endpoint(executeTask)]
  fn execute_task(
    &self,
    task_id: u64,
    _quantum_secret: OptionalValue<ManagedByteArray<Self::Api, 32>>,
  ) {
    self.require_not_paused();

    let keeper = self.blockchain().get_caller();
    self.require_registered_keeper(&keeper);

    require!(!self.tasks(task_id).is_empty(), "Task not found");
    let task_payload = self.tasks(task_id).get();

    let mut hash_bytes = [0u8; 32];
    hash_bytes[24..32].copy_from_slice(&task_id.to_be_bytes());
    let task_hash = ManagedByteArray::new_from_bytes(&hash_bytes);

    require!(!self.quantum_tasks(&task_hash).is_empty(), "Task not found");
    let quantum_state = self.quantum_tasks(&task_hash).get();

    require!(
      quantum_state.status == common::types::TaskStatus::Pending || quantum_state.status == common::types::TaskStatus::Committed,
      "Task not Pending"
    );

    self.perform_round_robin_check(&task_payload, &task_hash, &keeper);

    if task_payload.confidential {
      self.assigned_enclave_keeper(&task_hash).set(&keeper);
    }

    self.dispatch_task_execution(task_hash, task_payload, keeper, quantum_state);
  }

  /// Wrapper legacy para recuperar tareas atascadas por ID (usado en tests)
  #[only_owner]
  #[endpoint(recoverStuckTask)]
  fn recover_stuck_task(&self, task_id: u64) {
    self.require_not_paused();

    let mut hash_bytes = [0u8; 32];
    hash_bytes[24..32].copy_from_slice(&task_id.to_be_bytes());
    let task_hash = ManagedByteArray::new_from_bytes(&hash_bytes);

    require!(!self.quantum_tasks(&task_hash).is_empty(), "Task not found");
    let quantum_state = self.quantum_tasks(&task_hash).get();

    require!(
      quantum_state.status == common::types::TaskStatus::Executing,
      "Task not in Executing state"
    );

    let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
    let stuck_threshold = 24 * 60 * 60; // 24 hours
    require!(
      current_time >= quantum_state.executing_at + stuck_threshold,
      "Task not stuck yet (wait 24h)"
    );

    let deposit = quantum_state.deposit.clone();
    let owner = quantum_state.owner.clone();
    self.quantum_tasks(&task_hash).clear();
    self.owner_tasks(&owner).swap_remove(&task_hash);
    self.tasks(task_id).clear();
    self.assigned_enclave_keeper(&task_hash).clear();

    self.claimable_refunds(&owner).update(|v| *v += &deposit);
    self.task_expired_event_quantum(&task_hash);
  }

  /// Wrapper legacy para expirar tareas pasadas de TTL por ID (usado en tests)
  #[endpoint(expireStaleTasks)]
  fn expire_stale_tasks(&self, args: MultiValueEncoded<ManagedBuffer>) {
    let caller = self.blockchain().get_caller();
    require!(
      self.whitelisted_keepers().contains(&caller) || caller == self.blockchain().get_owner_address(),
      "Not authorized to expire tasks"
    );

    let current_time_ms = self.get_timestamp_ms();
    for arg in args {
      let arg_bytes = arg.to_boxed_bytes();
      let arg_len = arg_bytes.len();
      
      let (task_hash, is_legacy, legacy_id) = if arg_len == 32 {
        let mut hash_bytes = [0u8; 32];
        let _ = arg.load_to_byte_array(&mut hash_bytes);
        (ManagedByteArray::new_from_bytes(&hash_bytes), false, 0u64)
      } else {
        let task_id = u64::top_decode(arg_bytes.as_slice()).unwrap_or(0);
        let mut hash_bytes = [0u8; 32];
        hash_bytes[24..32].copy_from_slice(&task_id.to_be_bytes());
        (ManagedByteArray::new_from_bytes(&hash_bytes), true, task_id)
      };

      if self.quantum_tasks(&task_hash).is_empty() {
        continue;
      }
      let quantum_state = self.quantum_tasks(&task_hash).get();
      if quantum_state.status != common::types::TaskStatus::Pending {
        continue;
      }

      let should_expire = if is_legacy {
        if self.tasks(legacy_id).is_empty() {
          false
        } else {
          let task_payload = self.tasks(legacy_id).get();
          task_payload.ttl_seconds > 0 && current_time_ms > task_payload.created_at + (task_payload.ttl_seconds * 1000)
        }
      } else {
        false
      };

      if should_expire {
        let deposit = quantum_state.deposit.clone();
        let owner = quantum_state.owner.clone();
        self.quantum_tasks(&task_hash).clear();
        self.owner_tasks(&owner).swap_remove(&task_hash);
        if is_legacy {
          self.tasks(legacy_id).clear();
        }
        self.claimable_refunds(&owner).update(|v| *v += &deposit);
        self.task_expired_event_quantum(&task_hash);
      }
    }
  }
}
