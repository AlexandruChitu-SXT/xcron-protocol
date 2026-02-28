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
    /// Schedule a new automation task.
    ///
    /// Payment: EGLD deposit covering gas budget + protocol fee.
    /// For Clone-Keys: pass deposit amount as `requested_deposit` (EGLD is pre-deposited).
    /// For normal wallets: send EGLD with the transaction (requested_deposit is ignored).
    #[payable("EGLD")]
    #[endpoint(scheduleTask)]
    fn schedule_task(
        &self,
        target_contract: ManagedAddress,
        target_endpoint: ManagedBuffer,
        target_args: ManagedVec<ManagedBuffer>,
        trigger: common::types::Trigger<Self::Api>,
        max_gas: u64,
        max_retries: u8,
        ttl_seconds: u64,
        requested_deposit: OptionalValue<BigUint>,
    ) -> u64 {
        self.require_not_paused();

        // Resolve caller: if Clone-Key, get main wallet; otherwise use caller directly
        let raw_caller = self.blockchain().get_caller();
        let (effective_owner, is_clone_key) = self.resolve_caller();
        let caller = effective_owner;

        // Determine deposit: Clone-Key uses pre-deposited funds, normal wallet uses payment
        let deposit = if is_clone_key {
            let req = match requested_deposit {
                OptionalValue::Some(val) => val,
                OptionalValue::None => sc_panic!("Clone-Key must specify requested_deposit"),
            };
            // Charge the clone key's spend limit
            self.charge_clone_key(&raw_caller, &req);
            req
        } else {
            self.call_value().egld().clone_value()
        };

        // Checks
        require!(deposit >= self.min_deposit().get(), "Deposit below minimum");
        require!(max_gas >= common::constants::MIN_GAS_LIMIT, "max_gas too low");
        require!(ttl_seconds >= common::constants::MIN_TTL_SECONDS, "TTL too short");

        // S-1: Full target safety validation
        self.require_safe_target(&target_contract, &target_endpoint);

        // S-13: Endpoint name validation
        require!(
            target_endpoint.len() >= 1 && target_endpoint.len() <= common::constants::MAX_ENDPOINT_NAME_BYTES,
            "S-13: Invalid endpoint name length (1-64 bytes)"
        );

        // S-8: Deposit cap
        self.require_deposit_within_cap(&deposit);

        // S-9: Rate limiting — max 100 active tasks per address
        let caller_active = self.owner_tasks(&caller).len();
        require!(caller_active < 100, "S-9: Too many active tasks (max 100)");

        // S-11: Per-round rate limiting — prevent spam bursts
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

        // S-12: Argument size validation
        require!(
            target_args.len() <= common::constants::MAX_TASK_ARGS,
            "S-12: Too many arguments (max 10)"
        );
        for arg in target_args.iter() {
            require!(
                arg.len() <= common::constants::MAX_ARG_SIZE_BYTES,
                "S-12: Argument too large (max 4096 bytes)"
            );
        }

        // Effects
        let task_id = self.task_nonce().get() + 1;
        self.task_nonce().set(task_id);

        let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();

        let task = common::types::Task {
            id: task_id,
            owner: caller.clone(),
            target_contract,
            target_endpoint,
            target_args,
            trigger: trigger.clone(),
            max_gas,
            deposit,
            max_retries,
            retry_count: 0,
            ttl_seconds,
            created_at: current_time,
            status: common::types::TaskStatus::Pending,
            assigned_keeper: None,
            completed_at: 0,
            post_task_id: None,
        };

        self.tasks(task_id).set(&task);
        self.owner_tasks(&task.owner).insert(task_id);

        // Index for keeper discovery
        self.index_task(task_id, &trigger);

        // Emit event
        self.task_scheduled_event(task_id, &task.owner, &task.target_contract, current_time);
        task_id
    }

    /// Cancel a pending task and refund the deposit to the owner.
    #[endpoint(cancelTask)]
    fn cancel_task(&self, task_id: u64) {
        self.require_not_paused();
        let mut task = self.tasks(task_id).get();
        let raw_caller = self.blockchain().get_caller();
        let (effective_owner, _is_clone_key) = self.resolve_caller();

        // Checks: allow task owner OR the resolved clone-key owner to cancel
        require!(
            task.owner == raw_caller || task.owner == effective_owner,
            "Not task owner"
        );
        require!(task.status == common::types::TaskStatus::Pending, "Can only cancel Pending tasks");

        // Effects
        task.status = common::types::TaskStatus::Cancelled;
        self.tasks(task_id).set(&task);
        self.remove_from_indices(task_id, &task);
        self.owner_tasks(&task.owner).swap_remove(&task_id);

        // Interactions — refund goes to task.owner (always the main wallet)
        self.send().direct_egld(&task.owner, &task.deposit);

        self.task_cancelled_event(task_id);
    }

    /// Set metadata for a task (hybrid oracle conditions).
    #[endpoint(setTaskMetadata)]
    fn set_task_metadata(&self, task_id: u64, metadata: ManagedBuffer) {
        let task = self.tasks(task_id).get();
        let caller = self.blockchain().get_caller();

        require!(task.owner == caller, "Not task owner");
        require!(task.status == common::types::TaskStatus::Pending, "Can only set metadata on Pending tasks");
        require!(metadata.len() <= 512, "Metadata too large (max 512 bytes)");

        self.task_metadata(task_id).set(&metadata);
    }

    /// Link two tasks: when `task_id` completes successfully, `post_task_id` is activated.
    ///
    /// Both tasks must belong to the same owner and be in Pending status.
    /// Maximum chain depth: 5 (prevents gas-bomb chains).
    #[endpoint(setPostTask)]
    fn set_post_task(&self, task_id: u64, post_task_id: u64) {
        self.require_not_paused();

        require!(task_id != post_task_id, "Cannot chain a task to itself");

        let mut task = self.tasks(task_id).get();
        let post_task = self.tasks(post_task_id).get();
        let (effective_owner, _is_clone_key) = self.resolve_caller();
        let raw_caller = self.blockchain().get_caller();

        // Both tasks must belong to the caller
        require!(
            task.owner == raw_caller || task.owner == effective_owner,
            "Not owner of source task"
        );
        require!(
            post_task.owner == task.owner,
            "Post-task must belong to same owner"
        );

        // Both must be Pending
        require!(
            task.status == common::types::TaskStatus::Pending,
            "Source task must be Pending"
        );
        require!(
            post_task.status == common::types::TaskStatus::Pending,
            "Post-task must be Pending"
        );

        // Prevent circular chains — walk the chain, max depth 5
        let max_chain_depth: u64 = 5;
        let mut current_id = post_task_id;
        for _ in 0..max_chain_depth {
            let t = self.tasks(current_id).get();
            match t.post_task_id {
                Some(next_id) => {
                    require!(next_id != task_id, "Circular chain detected");
                    current_id = next_id;
                }
                None => break,
            }
        }

        task.post_task_id = Some(post_task_id);
        self.tasks(task_id).set(&task);
    }
}
