multiversx_sc::imports!();

/// Task scheduling and cancellation endpoints.
///
/// Handles the creation of new automation tasks, metadata attachment,
/// and owner-initiated cancellations with deposit refunds.
#[multiversx_sc::module]
pub trait SchedulingModule:
  crate::storage::StorageModule
  + crate::events::EventsModule
  + crate::validation::ValidationModule
  + crate::helpers::HelpersModule
  + crate::clone_keys::CloneKeysModule
  + common::pausable::PausableModule
{
  /// Schedule a Quantum Task (Stateless Architecture with legacy compatibility)
  #[payable("EGLD")]
  #[endpoint(scheduleQuantumTask)]
  fn schedule_quantum_task(
    &self,
    args: MultiValueEncoded<ManagedBuffer>,
  ) -> MultiValueEncoded<ManagedBuffer> {
    self.require_not_paused();

    let raw_caller = self.blockchain().get_caller();
    let (effective_owner, is_clone_key) = self.resolve_caller();
    let caller = effective_owner;

    let args_vec = args.to_vec();
    let num_args = args_vec.len();
    require!(num_args > 0, "Missing scheduling arguments");

    let (task_payload, requested_deposit, task_id_opt) = if num_args <= 2 {
      // Production path
      let payload_buf = args_vec.get(0);
      let payload = common::types::Task::top_decode(payload_buf.to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode task payload"));
      
      let req_dep = if num_args == 2 {
        let dep_buf = args_vec.get(1);
        let dep_val = BigUint::top_decode(dep_buf.to_boxed_bytes().as_slice())
          .unwrap_or_else(|_| sc_panic!("Failed to decode requested deposit"));
        OptionalValue::Some(dep_val)
      } else {
        OptionalValue::None
      };
      (payload, req_dep, None)
    } else {
      // Legacy compatibility path
      require!(num_args >= 7, "Invalid legacy argument count");
      let target_contract = ManagedAddress::top_decode(args_vec.get(0).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode target_contract"));
      let target_endpoint = ManagedBuffer::top_decode(args_vec.get(1).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode target_endpoint"));
      let target_args = ManagedVec::top_decode(args_vec.get(2).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode target_args"));
      let trigger = common::types::Trigger::top_decode(args_vec.get(3).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode trigger"));
      let max_gas = u64::top_decode(args_vec.get(4).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode max_gas"));
      let max_retries = u8::top_decode(args_vec.get(5).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode max_retries"));
      let ttl_seconds = u64::top_decode(args_vec.get(6).to_boxed_bytes().as_slice())
        .unwrap_or_else(|_| sc_panic!("Failed to decode ttl_seconds"));
      require!(ttl_seconds >= 10, "TTL too short");

      let (require_xwap_safe, confidential) = if num_args >= 9 {
        let rx = bool::top_decode(args_vec.get(7).to_boxed_bytes().as_slice())
          .unwrap_or_else(|_| sc_panic!("Failed to decode require_xwap_safe"));
        let conf = bool::top_decode(args_vec.get(8).to_boxed_bytes().as_slice())
          .unwrap_or_else(|_| sc_panic!("Failed to decode confidential"));
        (rx, conf)
      } else {
        (false, false)
      };

      let req_dep = if num_args == 8 {
        let dep_buf = args_vec.get(7);
        let dep_val = BigUint::top_decode(dep_buf.to_boxed_bytes().as_slice())
          .unwrap_or_else(|_| sc_panic!("Failed to decode requested deposit"));
        OptionalValue::Some(dep_val)
      } else if num_args == 10 {
        let dep_buf = args_vec.get(9);
        let dep_val = BigUint::top_decode(dep_buf.to_boxed_bytes().as_slice())
          .unwrap_or_else(|_| sc_panic!("Failed to decode requested deposit"));
        OptionalValue::Some(dep_val)
      } else {
        OptionalValue::None
      };

      let task_id = self.task_nonce().get() + 1;
      self.task_nonce().set(task_id);

      let payload = common::types::Task {
        id: task_id,
        owner: caller.clone(),
        target_contract,
        target_endpoint,
        target_args,
        trigger,
        max_gas,
        deposit: BigUint::zero(), // filled in validate_task_parameters
        max_retries,
        retry_count: 0u8,
        ttl_seconds,
        created_at: self.get_timestamp_ms(),
        status: common::types::TaskStatus::Pending,
        assigned_keeper: None,
        completed_at: 0u64,
        post_task_id: None,
        require_xwap_safe,
        confidential,
      };

      (payload, req_dep, Some(task_id))
    };

    let deposit = if is_clone_key {
      require!(self.call_value().egld().clone_value() == BigUint::zero(), "Clone-Keys cannot attach raw EGLD");
      let req = requested_deposit.into_option().unwrap_or_else(|| sc_panic!("Clone-Key must specify requested_deposit"));
      self.charge_clone_key(&raw_caller, &req);
      req
    } else {
      self.call_value().egld().clone_value()
    };

    // Apply deposit to task payload for storage in legacy map
    let mut final_payload = task_payload;
    final_payload.deposit = deposit.clone();

    self.validate_task_parameters(&final_payload, &deposit);

    let task_hash = if let Some(task_id) = task_id_opt {
      // Store payload in legacy mapper for executeTask / commit_reveal compatibility
      self.tasks(task_id).set(&final_payload);

      // Derive compatibility key/hash for quantum_tasks
      let mut hash_bytes = [0u8; 32];
      hash_bytes[24..32].copy_from_slice(&task_id.to_be_bytes());
      ManagedByteArray::new_from_bytes(&hash_bytes)
    } else {
      let mut encoded_payload = ManagedBuffer::new();
      let _ = final_payload.top_encode(&mut encoded_payload);
      self.crypto().sha256(&encoded_payload).into()
    };

    require!(self.quantum_tasks(&task_hash).is_empty(), "Task hash already exists");

    self.enforce_rate_limits(&caller);

    let state = common::types::QuantumTaskState {
      owner: caller.clone(),
      deposit: deposit.clone(),
      status: common::types::TaskStatus::Pending,
      executing_at: 0u64,
    };
    self.quantum_tasks(&task_hash).set(&state);
    self.owner_tasks(&caller).insert(task_hash.clone());

    self.task_scheduled_event_quantum(&task_hash, &caller, &final_payload.target_contract, self.get_timestamp_ms());

    let mut result = MultiValueEncoded::new();
    if let Some(task_id) = task_id_opt {
      let mut id_buf = ManagedBuffer::new();
      let _ = task_id.top_encode(&mut id_buf);
      result.push(id_buf);
    } else {
      result.push(task_hash.as_managed_buffer().clone());
    }
    result
  }

  /// Endpoint to schedule Sovereign Enclave API tasks (Zero-Knowledge Routing).
  /// Updated: Now stores task state for secure settlement.
  #[payable("EGLD")]
  #[endpoint(scheduleSovereignTask)]
  fn schedule_sovereign_task(
    &self,
    encrypted_payload_hex: ManagedBuffer,
    requested_deposit: OptionalValue<BigUint>,
  ) -> ManagedByteArray<Self::Api, 32> {
    self.require_not_paused();

    let raw_caller = self.blockchain().get_caller();
    let (effective_owner, is_clone_key) = self.resolve_caller();
    let caller = effective_owner;

    let deposit = if is_clone_key {
      require!(self.call_value().egld().clone_value() == BigUint::zero(), "Clone-Keys cannot attach raw EGLD");
      let req = requested_deposit.into_option().unwrap_or_else(|| sc_panic!("Clone-Key must specify requested_deposit"));
      self.charge_clone_key(&raw_caller, &req);
      req
    } else {
      self.call_value().egld().clone_value()
    };

    require!(deposit >= self.min_deposit().get(), "Deposit below minimum");
    self.require_deposit_within_cap(&deposit);

    // Generate Task Hash for Sovereign Task (Encrypted Payload + Owner + Deposit)
    let mut hash_data = ManagedBuffer::new();
    hash_data.append(&encrypted_payload_hex);
    hash_data.append(caller.as_managed_buffer());
    let _ = deposit.top_encode(&mut hash_data);
    let task_hash: ManagedByteArray<Self::Api, 32> = self.crypto().sha256(&hash_data).into();

    require!(self.quantum_tasks(&task_hash).is_empty(), "Sovereign task already exists");

    let state = common::types::QuantumTaskState {
      owner: caller.clone(),
      deposit: deposit.clone(),
      status: common::types::TaskStatus::Pending,
      executing_at: 0u64,
    };
    self.quantum_tasks(&task_hash).set(&state);
    self.owner_tasks(&caller).insert(task_hash.clone());

    self.xse_payload_triggered_event(&caller, &encrypted_payload_hex);
    
    task_hash
  }

  fn validate_task_parameters(&self, task_payload: &common::types::Task<Self::Api>, deposit: &BigUint) {
    self.require_safe_target(&task_payload.target_contract, &task_payload.target_endpoint);
    
    // Validate target owner restriction to prevent execution hijacking
    let target = &task_payload.target_contract;
    if !self.target_owner_restriction(target).is_empty() {
      let (effective_owner, _) = self.resolve_caller();
      let allowed_owner = self.target_owner_restriction(target).get();
      require!(effective_owner == allowed_owner, "Target contract scheduling restricted to owner");
    }

    require!(deposit >= &self.min_deposit().get(), "Deposit below minimum");
    self.require_deposit_within_cap(deposit);
    
    // ️ XCRON-PROTECT: Vector 24 - Keeper Poisoning
    require!(task_payload.max_gas <= 400_000_000u64, "max_gas too high");
    
    // ️ XCRON-PROTECT: Vector 28 - Fast-Fail Farming Protection
    require!(task_payload.max_gas >= 5_000_000u64, "max_gas too low");

    require!(task_payload.ttl_seconds <= 157_680_000u64, "ttl_seconds exceeds 5 years");
    require!(task_payload.created_at <= 200_000_000_000_000u64, "created_at malformed");

    match &task_payload.trigger {
      common::types::Trigger::TimeOnce { target_time } => {
        require!(*target_time <= 200_000_000_000_000u64, "target_time too large");
      }
      common::types::Trigger::TimeRecurring { start_time, .. } => {
        require!(*start_time <= 200_000_000_000_000u64, "start_time too large");
      }
      _ => {}
    }
  }

  fn enforce_rate_limits(&self, caller: &ManagedAddress) {
    let caller_active = self.owner_tasks(caller).len();
    require!(caller_active < 100, "S-9: Too many active tasks");

    let current_round = self.blockchain().get_block_round();
    let tasks_this_round = self.tasks_per_round(caller, current_round).get();
    let max_per_round = self.max_tasks_per_round().get();
    if max_per_round > 0 {
      require!(tasks_this_round < max_per_round, "S-11: Too many tasks this round");
    }
    self.tasks_per_round(caller, current_round).set(tasks_this_round + 1);
  }

  #[endpoint(cancelQuantumTask)]
  fn cancel_quantum_task(&self, args: MultiValueEncoded<ManagedBuffer>) {
    self.require_not_paused();

    let args_vec = args.to_vec();
    require!(args_vec.len() == 1, "Invalid number of arguments");
    let arg = args_vec.get(0);
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

    let task_state = self.quantum_tasks(&task_hash).get();
    require!(!task_state.owner.is_zero(), "Task not found");
    
    let (effective_owner, is_clone_key) = self.resolve_caller();
    require!(!is_clone_key, "Clone-Keys cannot cancel tasks");
    require!(task_state.owner == effective_owner, "Not task owner");
    require!(task_state.status == common::types::TaskStatus::Pending, "Only Pending tasks can be cancelled");

    self.quantum_tasks(&task_hash).clear();
    self.owner_tasks(&task_state.owner).swap_remove(&task_hash);
    if is_legacy {
      self.tasks(legacy_id).clear();
    }

    let mut bypass_fee = false;
    let xwap_addr = if !self.xwap_address().is_empty() { self.xwap_address().get() } else { ManagedAddress::zero() };
    if !xwap_addr.is_zero() {
      let raw_results = self.tx().to(&xwap_addr).raw_call("isSafeToExecute").returns(multiversx_sc::types::ReturnsRawResult).sync_call();
      let is_safe = if !raw_results.is_empty() {
        bool::top_decode(raw_results.get(0).to_boxed_bytes().as_slice()).unwrap_or(false)
      } else {
        false
      };

      if !is_safe {
        let last_update_results = self.tx().to(&xwap_addr).raw_call("getLastUpdateBlock").returns(multiversx_sc::types::ReturnsRawResult).sync_call();
        let last_update_block = if !last_update_results.is_empty() {
          u64::top_decode(last_update_results.get(0).to_boxed_bytes().as_slice()).unwrap_or(0)
        } else {
          0
        };
        
        let current_block = self.blockchain().get_block_nonce();
        // 600 blocks is ~1 hour on MultiversX at 6s blocks
        if current_block > last_update_block && current_block.saturating_sub(last_update_block) > 600 {
          bypass_fee = true;
        }
      }
    }

    let fee_bps = if bypass_fee { 0u64 } else { self.protocol_fee_bps().get() as u64 };
    let penalty_fee = &task_state.deposit * fee_bps / 10000u64;
    let refund = if task_state.deposit > penalty_fee { &task_state.deposit - &penalty_fee } else { BigUint::zero() };

    if refund > BigUint::zero() {
      if is_legacy {
        self.send().direct_egld(&task_state.owner, &refund);
      } else {
        self.claimable_refunds(&task_state.owner).update(|v| *v += &refund);
      }
    }
    if penalty_fee > BigUint::zero() {
      self.accrued_protocol_fees().update(|v| *v += &penalty_fee);
    }

    self.task_cancelled_event_quantum(&task_hash);
  }
}
