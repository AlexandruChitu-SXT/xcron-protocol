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
    ///
    /// Payment: EGLD deposit covering gas budget + protocol fee.
    /// The full task payload is passed in calldata, hashed, emitted as an event (for Data Availability),
    /// and ONLY the 32-byte Quantum Seal and deposit are stored in the State Trie.
    #[payable("EGLD")]
    #[endpoint(scheduleQuantumTask)]
    fn schedule_quantum_task(
        &self,
        task_payload: common::types::Task<Self::Api>,
        requested_deposit: OptionalValue<BigUint>,
    ) -> ManagedByteArray<Self::Api, 32> {
        self.require_not_paused();

        // Resolve caller
        let raw_caller = self.blockchain().get_caller();
        let (effective_owner, is_clone_key) = self.resolve_caller();
        let caller = effective_owner;

        // Determine deposit
        let deposit = if is_clone_key {
            // 🛡️ CRITICAL SECURITY PATCH: Prevent EGLD loss.
            // Clone Keys use pre-funded spend limits. If they attach raw EGLD to this call,
            // it would be silently absorbed by the contract and locked forever.
            require!(
                self.call_value().egld().clone_value() == BigUint::zero(),
                "Clone-Keys cannot attach raw EGLD. Use requested_deposit instead."
            );

            let req = match requested_deposit {
                OptionalValue::Some(val) => val,
                OptionalValue::None => sc_panic!("Clone-Key must specify requested_deposit"),
            };
            self.charge_clone_key(&raw_caller, &req);
            req
        } else {
            self.call_value().egld().clone_value()
        };

        // Enforce minimum deposit
        require!(deposit >= self.min_deposit().get(), "Deposit below minimum");
        
        // S-8: Deposit cap protection
        self.require_deposit_within_cap(&deposit);

        // Calculate the Quantum Seal (SHA-256 Hash of the serialized payload)
        // This is the ONLY thing we will store.
        let mut encoded_payload = ManagedBuffer::new();
        let _ = task_payload.top_encode(&mut encoded_payload);
        let task_hash = self.crypto().sha256(&encoded_payload);
        
        // Ensure this exact task hasn't been scheduled and left pending already
        require!(self.quantum_tasks(&task_hash).is_empty(), "Task hash already exists");

        // Rate limiting — max tasks per address (using hash sets now)
        let caller_active = self.owner_tasks(&caller).len();
        require!(caller_active < 100, "S-9: Too many active tasks (max 100)");

        let current_round = self.blockchain().get_block_round();
        let tasks_this_round = self.tasks_per_round(&caller, current_round).get();
        let max_per_round = self.max_tasks_per_round().get();
        if max_per_round > 0 {
            require!(
                tasks_this_round < max_per_round,
                "S-11: Too many tasks this round (anti-spam)"
            );
        }
        self.tasks_per_round(&caller, current_round).set(tasks_this_round + 1);

        // Store ONLY the Quantum State (Stateless)
        let state = common::types::QuantumTaskState {
            owner: caller.clone(),
            deposit: deposit.clone(),
            status: common::types::TaskStatus::Pending,
        };
        self.quantum_tasks(&task_hash).set(&state);
        self.owner_tasks(&caller).insert(task_hash.clone());

        // We DO NOT store the task. We emit it for the off-chain Keepers to index.
        // Data Availability is guaranteed by the Event Log.
        let current_time_ms = self.get_timestamp_ms();
        
        // WARNING: Time boundaries MUST be managed in MILLISECONDS.
        // The Keeper off-chain must interpret task_payload.ttl_ms and target_time strictly in MILLISECONDS.
        self.task_scheduled_event_quantum(&task_hash, &caller, &task_payload.target_contract, current_time_ms);

        task_hash
    }

    /// Cancel a pending quantum task and refund the deposit to the owner.
    #[endpoint(cancelQuantumTask)]
    fn cancel_quantum_task(&self, task_hash: ManagedByteArray<Self::Api, 32>) {
        self.require_not_paused();
        
        require!(!self.quantum_tasks(&task_hash).is_empty(), "Task hash not found");
        let task_state = self.quantum_tasks(&task_hash).get();
        let raw_caller = self.blockchain().get_caller();
        let (effective_owner, _is_clone_key) = self.resolve_caller();

        // Checks: allow task owner OR the resolved clone-key owner to cancel
        require!(
            task_state.owner == raw_caller || task_state.owner == effective_owner,
            "Not task owner"
        );
        require!(
            task_state.status == common::types::TaskStatus::Pending,
            "Can only cancel Pending tasks"
        );

        // Effects (STATE PRUNING / ANTI-BLOAT)
        self.quantum_tasks(&task_hash).clear();
        self.owner_tasks(&task_state.owner).swap_remove(&task_hash);
        // Time indexing is handled off-chain now, no need to remove from indices

        // Interactions — ANTI-SPAM FEE
        let penalty_fee = &task_state.deposit * self.protocol_fee_bps().get() as u64 / 10000u64;
        let refund = if task_state.deposit > penalty_fee {
            &task_state.deposit - &penalty_fee
        } else {
            BigUint::zero()
        };

        if refund > BigUint::zero() {
            self.send().direct_egld(&task_state.owner, &refund);
        }
        
        if penalty_fee > BigUint::zero() {
            self.accrued_protocol_fees().update(|v| *v += &penalty_fee);
        }

        self.task_cancelled_event_quantum(&task_hash);
    }

    /// Endpoint to schedule Sovereign Enclave API tasks (Zero-Knowledge Routing).
    /// Instead of storing execution hooks, this emits an event carrying an encrypted payload.
    /// The XSE Hardware Enclave intercepts the event and executes it via Web2 APIs.
    #[payable("EGLD")]
    #[endpoint(scheduleSovereignTask)]
    fn schedule_sovereign_task(
        &self,
        encrypted_payload_hex: ManagedBuffer,
        requested_deposit: OptionalValue<BigUint>,
    ) {
        self.require_not_paused();

        // Resolve caller
        let raw_caller = self.blockchain().get_caller();
        let (effective_owner, is_clone_key) = self.resolve_caller();
        let caller = effective_owner;

        // Determine deposit (same security logic as Quantum Tasks)
        let deposit = if is_clone_key {
            require!(
                self.call_value().egld().clone_value() == BigUint::zero(),
                "Clone-Keys cannot attach raw EGLD. Use requested_deposit instead."
            );

            let req = match requested_deposit {
                OptionalValue::Some(val) => val,
                OptionalValue::None => sc_panic!("Clone-Key must specify requested_deposit"),
            };
            self.charge_clone_key(&raw_caller, &req);
            req
        } else {
            self.call_value().egld().clone_value()
        };

        // Enforce minimum deposit
        require!(deposit >= self.min_deposit().get(), "Deposit below minimum");
        
        self.require_deposit_within_cap(&deposit);

        // Emit the event so the XSE Enclave can capture it immediately
        self.xse_payload_triggered_event(&caller, &encrypted_payload_hex);
    }
}
