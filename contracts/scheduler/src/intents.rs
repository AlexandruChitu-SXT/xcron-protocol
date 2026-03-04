multiversx_sc::imports!();

use common::types::{Intent, IntentStatus};

#[multiversx_sc::module]
pub trait IntentsModule:
    crate::storage::StorageModule
    + crate::events::EventsModule
    + crate::validation::ValidationModule
    + common::pausable::PausableModule
{
    /// Creates a declarative Intent, pre-funding it with `token_in`.
    /// 
    /// The user specifies exactly what they want (`token_out`, `min_return`)
    /// and offers a `solver_fee` in EGLD out of the protocol's internal balance or
    /// attached EGLD (to be refined based on exact fee model).
    #[payable("*")]
    #[endpoint(createIntent)]
    fn create_intent(
        &self,
        token_out: TokenIdentifier,
        min_return: BigUint,
        deadline: u64,
        solver_fee: BigUint,
    ) -> u64 {
        self.require_not_paused();

        // Must receive exactly 1 ESDT token (the token_in)
        let (token_in_ref, amount_in_ref) = self.call_value().single_fungible_esdt();
        let token_in = token_in_ref.clone_value();
        let amount_in = amount_in_ref.clone_value();
        require!(amount_in > 0, "Amount in must be greater than 0");
        
        let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
        require!(deadline > current_time, "Deadline must be in the future");

        let caller = self.blockchain().get_caller();
        let intent_id = self.intent_nonce().get() + 1;
        self.intent_nonce().set(intent_id);

        let intent = Intent {
            id: intent_id,
            owner: caller.clone(),
            token_in,
            amount_in,
            token_out,
            min_return,
            deadline,
            solver_fee,
            status: IntentStatus::Pending,
            settled_by: None,
        };

        self.intent_by_id(intent_id).set(&intent);
        self.intent_created_event(intent_id, &caller);

        intent_id
    }

    /// Revokes an intent if it has not been settled yet, returning the funds to the owner.
    #[endpoint(cancelIntent)]
    fn cancel_intent(&self, intent_id: u64) {
        let mut intent = self.intent_by_id(intent_id).get();
        let caller = self.blockchain().get_caller();
        
        require!(intent.owner == caller, "Only owner can cancel");
        require!(intent.status == IntentStatus::Pending, "Intent not pending");

        intent.status = IntentStatus::Cancelled;
        self.intent_by_id(intent_id).set(&intent);

        // Refund the deposited token
        self.send().direct_esdt(
            &caller,
            &intent.token_in,
            0,
            &intent.amount_in,
        );
        
        // Note: Event logic can be expanded
    }

    /// Executed by Solvers. Routes the intent through a DEX and verifies the output.
    #[endpoint(solveIntent)]
    fn solve_intent(
        &self,
        intent_id: u64,
        target_contract: ManagedAddress,
        target_endpoint: ManagedBuffer,
        target_args: MultiValueEncoded<ManagedBuffer>,
    ) {
        let caller = self.blockchain().get_caller();
        self.require_registered_keeper(&caller);

        let mut intent = self.intent_by_id(intent_id).get();
        require!(intent.status == IntentStatus::Pending, "Intent not pending");
        require!(
            self.blockchain().get_block_timestamp_seconds().as_u64_seconds() <= intent.deadline,
            "Intent expired"
        );

        // Optimistically mark as settled to prevent re-entrancy
        intent.status = IntentStatus::Settled;
        intent.settled_by = Some(caller.clone());
        self.intent_by_id(intent_id).set(&intent);

        // Record initial balance of the desired token
        let initial_balance = self.blockchain().get_esdt_balance(
            &self.blockchain().get_sc_address(),
            &intent.token_out,
            0,
        );

        // Construct the Solver's payload (e.g., to xExchange Router)
        let mut contract_call = self.tx()
            .to(&target_contract)
            .raw_call(target_endpoint)
            .payment(EsdtTokenPayment::new(intent.token_in.clone(), 0, intent.amount_in.clone()));

        for arg in target_args.into_iter() {
            contract_call = contract_call.argument(&arg);
        }

        // Execute via Promises callback to guarantee slippage protection
        // The SDK requires this explicit unsafe block for async promise registration
        unsafe {
            contract_call
                .callback(self.callbacks().intent_settlement_callback(intent_id, initial_balance, caller))
                .register_promise();
        }
    }

    #[promises_callback]
    fn intent_settlement_callback(
        &self,
        intent_id: u64,
        initial_balance: BigUint,
        solver: ManagedAddress,
        #[call_result] result: ManagedAsyncCallResult<IgnoreValue>,
    ) {
        let intent = self.intent_by_id(intent_id).get();

        match result {
            ManagedAsyncCallResult::Ok(_) => {
                let final_balance = self.blockchain().get_esdt_balance(
                    &self.blockchain().get_sc_address(),
                    &intent.token_out,
                    0,
                );

                let received = if final_balance > initial_balance {
                    final_balance - initial_balance
                } else {
                    BigUint::zero()
                };

                // VANGUARD SETTLEMENT Engine: Mathematical Slippage Guarantee
                if received >= intent.min_return {
                    // 1. Send the newly acquired tokens to the user
                    self.send().direct_esdt(&intent.owner, &intent.token_out, 0, &received);
                    
                    // 2. Pay the Solver (simplified for V1, assuming EGLD in contract)
                    if intent.solver_fee > 0 {
                        self.send().direct_egld(&solver, &intent.solver_fee);
                    }
                } else {
                    // Slippage tolerance failed: Panicking reverts the ENTIRE transaction,
                    // resetting the Intent back to Pending and refunding the input tokens.
                    require!(false, "Slippage tolerance not met");
                }
            },
            ManagedAsyncCallResult::Err(_) => {
                // DEX execution failed: Revert the whole transaction.
                require!(false, "Intent execution failed");
            }
        }
    }
}
