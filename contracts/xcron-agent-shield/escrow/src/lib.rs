#![no_std]

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

pub mod errors;
pub mod events;
pub mod storage;

use storage::{EscrowData, EscrowStatus};

/// 🛡️ Agent Shield (Security Vault)
/// Defines strict mathematical boundaries for Autonomous AI Agents to ensure absolute fund security.
#[multiversx_sc::contract]
pub trait XcronAgentShield:
    common::cross_contract::CrossContractModule + storage::StorageModule + events::EventsModule
{
    #[init]
    fn init(
        &self,
        validation_contract_address: ManagedAddress,
        identity_contract_address: ManagedAddress,
        agent_role_address: ManagedAddress,
    ) {
        self.validation_contract_address()
            .set(&validation_contract_address);
        self.identity_contract_address()
            .set(&identity_contract_address);
        self.authorized_agent().set(&agent_role_address);
        self.is_paused().set(false);
    }

    #[upgrade]
    fn upgrade(&self) {}

    // ==========================================================
    // SHIELD LIMITS & ROLES
    // ==========================================================

    #[view(getAuthorizedAgent)]
    #[storage_mapper("authorized_agent")]
    fn authorized_agent(&self) -> SingleValueMapper<ManagedAddress>;

    #[view(isPaused)]
    #[storage_mapper("is_paused")]
    fn is_paused(&self) -> SingleValueMapper<bool>;

    #[view(getShieldDailyLimit)]
    #[storage_mapper("shield_daily_limit")]
    fn shield_daily_limit(&self, token_identifier: &TokenIdentifier) -> SingleValueMapper<BigUint>;

    #[view(getDailySpent)]
    #[storage_mapper("daily_spent")]
    fn daily_spent(
        &self,
        token_identifier: &TokenIdentifier,
        day_epoch: u64,
    ) -> SingleValueMapper<BigUint>;

    #[endpoint(setShieldLimit)]
    #[only_owner]
    fn set_shield_limit(&self, token_identifier: TokenIdentifier, max_daily_amount: BigUint) {
        self.shield_daily_limit(&token_identifier)
            .set(max_daily_amount);
    }

    #[endpoint(pauseShield)]
    #[only_owner]
    fn pause_shield(&self) {
        self.is_paused().set(true);
    }

    #[endpoint(unpauseShield)]
    #[only_owner]
    fn unpause_shield(&self) {
        self.is_paused().set(false);
    }

    // ==========================================================
    // TREASURY FUNDING
    // ==========================================================

    #[payable("*")]
    #[endpoint(fundTreasury)]
    fn fund_treasury(&self) {
        // Human owner or investors fund the Shield. The AI acts on this capital but doesn't hold the keys.
    }

    // ==========================================================
    // SECURE ESCROW LOGIC & INTENT EXECUTION
    // ==========================================================

    /// The Agent (OpenClaw) proposes an action. It cannot spend funds directly.
    /// The Shield runs the "Mathematical Auditor" logic to prevent unauthorized actions.
    #[endpoint(agentProposeExecution)]
    fn agent_propose_execution(
        &self,
        target_contract: ManagedAddress,
        token_id: TokenIdentifier,
        amount: BigUint,
        func_name: ManagedBuffer,
        args: MultiValueEncoded<ManagedBuffer>,
    ) {
        require!(!self.is_paused().get(), "Shield is Paused (Breaker Active)");

        // Structural Validation: Ensure valid Token Identifier
        require!(token_id.is_valid_esdt_identifier(), "Invalid Token Format");

        let caller = self.blockchain().get_caller();
        require!(
            caller == self.authorized_agent().get(),
            "Only AI Agent can propose"
        );

        // 🛡️ SECURITY PATCH (Battle of Nodes): Prevent Limit Bypass via 0-amount raw token transfers
        require!(
            func_name != ManagedBuffer::from(b"ESDTTransfer") &&
            func_name != ManagedBuffer::from(b"ESDTNFTTransfer") &&
            func_name != ManagedBuffer::from(b"MultiESDTNFTTransfer") &&
            func_name != ManagedBuffer::from(b"approve") &&
            func_name != ManagedBuffer::from(b"setLocalRoles"),
            "Agent Shield: Raw token transfers and approvals are strictly prohibited"
        );

        // Limit Check: Validate Daily Limits
        require!(
            !self.shield_daily_limit(&token_id).is_empty(),
            "Token not authorized in Security Vault"
        );

        let limit = self.shield_daily_limit(&token_id).get();

        // Time Boundary Check: Safe Timestamp evaluation
        let raw_time = self
            .blockchain()
            .get_block_timestamp_seconds()
            .as_u64_seconds();
        let safe_time = if raw_time > 100_000_000_000 {
            raw_time / 1000
        } else {
            raw_time
        };
        let current_day = safe_time / 86400; // Epoch Days

        let mut spent_today = self.daily_spent(&token_id, current_day).get();
        spent_today += &amount;

        if spent_today > limit {
            // AUTOMATIC FREEZE
            self.is_paused().set(true);
            sc_panic!(
                "Threshold exceeded: Spend exceeds daily shield limits! VAULT FROZEN."
            );
        }

        // Update tracking
        self.daily_spent(&token_id, current_day).set(&spent_today);

        // Security Patch: Hard validation of Target
        require!(
            target_contract != self.blockchain().get_sc_address(),
            "Agent cannot reference the Shield directly"
        );

        // Safe Execution (Managed Async with Callback for Shield Recovery)
        let gas_left = self.blockchain().get_gas_left();
        let gas_for_call = if gas_left > 15_000_000 {
            gas_left - 10_000_000
        } else {
            gas_left
        };

        if amount > 0 {
            self.tx()
                .to(target_contract.clone())
                .raw_call(func_name.clone())
                .single_esdt(&token_id, 0, &amount)
                .arguments_raw(args.to_arg_buffer())
                .gas(gas_for_call)
                .callback(
                    self.callbacks()
                        .agent_execution_callback(token_id.clone(), current_day, amount.clone()),
                )
                .gas_for_callback(5_000_000u64)
                .register_promise();
        } else {
            self.tx()
                .to(target_contract.clone())
                .raw_call(func_name.clone())
                .arguments_raw(args.to_arg_buffer())
                .gas(gas_for_call)
                .callback(
                    self.callbacks()
                        .agent_execution_callback(token_id.clone(), current_day, amount.clone()),
                )
                .gas_for_callback(5_000_000u64)
                .register_promise();
        }
    }

    #[promises_callback]
    fn agent_execution_callback(
        &self,
        token_id: TokenIdentifier,
        current_day: u64,
        amount: BigUint,
        #[call_result] result: ManagedAsyncCallResult<IgnoreValue>,
    ) {
        if let ManagedAsyncCallResult::Err(_) = result {
            // Shield Recovery: If the execution failed (e.g. invalid target or panic),
            // refund the daily limit so the Agent's quota is not wasted on a failed transaction.
            let mut spent_today = self.daily_spent(&token_id, current_day).get();
            if spent_today >= amount {
                spent_today -= &amount;
                self.daily_spent(&token_id, current_day).set(&spent_today);
            }
        }
    }

    // ==========================================================
    // OWNER CONTROLS
    // ==========================================================

    #[endpoint(emergencyWithdraw)]
    #[only_owner]
    fn emergency_withdraw(&self, token_identifier: TokenIdentifier, amount: BigUint) {
        let caller = self.blockchain().get_caller();
        self.tx()
            .to(&caller)
            .single_esdt(&token_identifier, 0, &amount)
            .transfer();
    }
}
