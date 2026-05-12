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
    /// Schedule a Quantum Task (Stateless Architecture)
    #[payable("EGLD")]
    #[endpoint(scheduleQuantumTask)]
    fn schedule_quantum_task(
        &self,
        task_payload: common::types::Task<Self::Api>,
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

        self.validate_task_parameters(&task_payload, &deposit);

        let mut encoded_payload = ManagedBuffer::new();
        let _ = task_payload.top_encode(&mut encoded_payload);
        let task_hash: ManagedByteArray<Self::Api, 32> = self.crypto().sha256(&encoded_payload).into();
        
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

        self.task_scheduled_event_quantum(&task_hash, &caller, &task_payload.target_contract, self.get_timestamp_ms());

        task_hash
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
        require!(deposit >= &self.min_deposit().get(), "Deposit below minimum");
        self.require_deposit_within_cap(deposit);
        
        // 🛡️ XCRON-PROTECT: Vector 24 - Keeper Poisoning
        require!(task_payload.max_gas <= 400_000_000u64, "max_gas too high");
        
        // 🛡️ XCRON-PROTECT: Vector 28 - Fast-Fail Farming Protection
        require!(task_payload.max_gas >= 5_000_000u64, "XCRON-PROTECT: max_gas too low");

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
    fn cancel_quantum_task(&self, task_hash: ManagedByteArray<Self::Api, 32>) {
        self.require_not_paused();
        let task_state = self.quantum_tasks(&task_hash).get();
        require!(!task_state.owner.is_zero(), "Task not found");
        
        let (effective_owner, _) = self.resolve_caller();
        require!(task_state.owner == effective_owner, "Not task owner");
        require!(task_state.status == common::types::TaskStatus::Pending, "Only Pending tasks can be cancelled");

        self.quantum_tasks(&task_hash).clear();
        self.owner_tasks(&task_state.owner).swap_remove(&task_hash);

        let fee_bps = self.protocol_fee_bps().get() as u64;
        let penalty_fee = &task_state.deposit * fee_bps / 10000u64;
        let refund = if task_state.deposit > penalty_fee { &task_state.deposit - &penalty_fee } else { BigUint::zero() };

        if refund > BigUint::zero() { self.send().direct_egld(&task_state.owner, &refund); }
        if penalty_fee > BigUint::zero() { self.accrued_protocol_fees().update(|v| *v += &penalty_fee); }

        self.task_cancelled_event_quantum(&task_hash);
    }
}
