multiversx_sc::imports!();

/// Commit-reveal anti-MEV protection endpoints.
///
/// Implements a 2-phase commitment scheme: keeper commits hash(task_id, salt) +
/// bond → reveals salt within window → task executes. Prevents frontrunning
/// profitable tasks.
#[multiversx_sc::module]
pub trait CommitRevealModule:
    crate::storage::StorageModule
    + crate::events::EventsModule
    + crate::validation::ValidationModule
    + crate::helpers::HelpersModule
    + common::pausable::PausableModule
{
    fn get_safe_block_timestamp(&self) -> u64 {
        self.blockchain().get_block_timestamp_seconds().as_u64_seconds()
    }

    /// CR-1: Commit to execute a task (prevents frontrunning).
    #[payable("EGLD")]
    #[endpoint(commitTask)]
    fn commit_task(&self, task_id: u64, commit_hash: ManagedByteArray<Self::Api, 32>) {
        self.require_not_paused();
        let keeper = self.blockchain().get_caller();
        self.require_registered_keeper(&keeper);

        let task = self.tasks(task_id).get();
        require!(
            task.status == common::types::TaskStatus::Pending,
            "Task not Pending"
        );

        let bond = self.call_value().egld().clone_value();
        let min_bond = self.commit_bond().get();
        require!(bond >= min_bond, "Bond below minimum");

        let commit_info = common::types::CommitInfo {
            keeper: keeper.clone(),
            commit_hash,
            commit_timestamp: self.get_safe_block_timestamp(),
            bond,
        };

        self.commits(task_id).set(&commit_info);

        // Mark task as Committed
        let mut task = task;
        task.status = common::types::TaskStatus::Committed;
        task.assigned_keeper = Some(keeper);
        self.tasks(task_id).set(&task);
    }

    /// CR-2: Reveal commitment and execute the task.
    #[endpoint(revealTask)]
    fn reveal_task(&self, task_id: u64, salt: ManagedBuffer) {
        self.require_not_paused();
        let keeper = self.blockchain().get_caller();

        let task = self.tasks(task_id).get();
        require!(
            task.status == common::types::TaskStatus::Committed,
            "Task not Committed"
        );

        let commit_info = self.commits(task_id).get();
        require!(commit_info.keeper == keeper, "Not the committing keeper");

        // Check reveal window
        let current_time = self.get_safe_block_timestamp();
        let reveal_window = self.reveal_window().get();
        require!(
            current_time <= commit_info.commit_timestamp + reveal_window,
            "Reveal window expired -- bond slashed"
        );

        // Verify hash: keccak256(task_id_bytes ++ salt) == commit_hash
        let mut data_to_hash = ManagedBuffer::new();
        data_to_hash.append(&ManagedBuffer::from(&task_id.to_be_bytes()[..]));
        data_to_hash.append(&salt);
        let computed_hash = self.crypto().keccak256(&data_to_hash);

        require!(
            computed_hash.as_managed_buffer() == commit_info.commit_hash.as_managed_buffer(),
            "Hash mismatch -- invalid salt"
        );

        // Return bond to keeper
        self.send().direct_egld(&keeper, &commit_info.bond);

        // Move task back to Pending for normal execution
        let mut task = task;
        task.status = common::types::TaskStatus::Pending;
        self.tasks(task_id).set(&task);
        self.commits(task_id).clear();
    }

    /// CR-3: Slash expired commits (anyone can call).
    #[endpoint(slashExpiredCommit)]
    fn slash_expired_commit(&self, task_id: u64) {
        // P2: Verify task is actually in Committed state
        let task = self.tasks(task_id).get();
        require!(
            task.status == common::types::TaskStatus::Committed,
            "Task not in Committed state"
        );

        let commit_info = self.commits(task_id).get();
        let current_time = self.get_safe_block_timestamp();
        let reveal_window = self.reveal_window().get();

        require!(
            current_time > commit_info.commit_timestamp + reveal_window,
            "Reveal window not expired yet"
        );

        // Slash: send bond to protocol (rewards contract)
        let rewards_addr = self.rewards_addr().get();
        self.send().direct_egld(&rewards_addr, &commit_info.bond);

        // Reset task to Pending
        let mut task = self.tasks(task_id).get();
        task.status = common::types::TaskStatus::Pending;
        task.assigned_keeper = None;
        self.tasks(task_id).set(&task);
        self.commits(task_id).clear();
    }
}
