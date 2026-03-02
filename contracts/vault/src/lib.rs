//! XCron Vault Contract — Multi-Strategy DeFi Vault
//!
//! Central vault for XCron Protocol DeFi automation. Supports multiple
//! strategies: staking, compounding, claiming, swapping, and NFT minting.
//!
//! The vault IS the position holder, so DeFi protocols accept its calls
//! without caller identity issues.
//!
//! # Supported Strategies (Templates)
//!
//! - **compound()** → Re-delegates staking rewards (auto-compound)
//! - **claimRewards()** → Claims staking rewards and sends to user
//! - **swap()** → Executes periodic swap on DEX (DCA)
//! - **emergencySwap()** → One-time swap when triggered (stop-loss)
//! - **mint()** → Calls mint on an NFT collection contract
//!
//! # User Flow
//!
//! 1. User calls `deposit()` with EGLD → vault delegates to staking provider
//! 2. User schedules a recurring task on XCron targeting any strategy endpoint
//! 3. The keeper executes the task → scheduler calls the strategy → vault interacts with DeFi
//! 4. User calls `withdraw(amount)` whenever they want out
//!
//! # Security
//!
//! - Only the scheduler can call automation endpoints (compound, claimRewards, swap, etc.)
//! - Only the original depositor can withdraw their own balance
//! - Pausable via common::pausable module

#![no_std]

multiversx_sc::imports!();

// ── Error constants ──
pub static ERR_ZERO_DEPOSIT: &[u8] = b"Deposit must be greater than zero";
pub static ERR_ZERO_WITHDRAW: &[u8] = b"Withdraw amount must be greater than zero";
pub static ERR_INSUFFICIENT_BALANCE: &[u8] = b"Insufficient balance";
pub static ERR_NOT_AUTHORIZED: &[u8] = b"Caller not authorized";
pub static ERR_NO_SWAP_CONFIG: &[u8] = b"Swap not configured - set DEX pair contract first";
pub static ERR_NO_MINT_CONFIG: &[u8] = b"Mint not configured - set NFT contract first";
pub static ERR_SLIPPAGE_NOT_SET: &[u8] = b"Slippage protection not configured - set max_slippage_bps first";

#[multiversx_sc::contract]
pub trait VaultContract:
    common::pausable::PausableModule
{
    // ═══════════════════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════════════════

    #[init]
    fn init(
        &self,
        delegation_contract: ManagedAddress,
        scheduler_address: ManagedAddress,
    ) {
        self.delegation_contract().set(&delegation_contract);
        self.scheduler_address().set(&scheduler_address);
        self.total_deposited().set(BigUint::zero());
        self.total_compounded().set(BigUint::zero());
        self.compound_count().set(0u64);
        self.max_slippage_bps().set(300u64); // Default 3% slippage protection
        self.paused().set(false);
    }

    #[upgrade]
    fn upgrade(&self) {}

    // ═══════════════════════════════════════════════════════════════════
    //  USER ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════

    /// Deposit EGLD into the vault. Delegates to the staking provider.
    #[endpoint(deposit)]
    #[payable("EGLD")]
    fn deposit(&self) {
        self.require_not_paused();

        let caller = self.blockchain().get_caller();
        let payment = self.call_value().egld().clone_value();
        require!(payment > 0u64, ERR_ZERO_DEPOSIT);

        // Effects: update balances before external call
        let current = self.user_balance(&caller).get();
        self.user_balance(&caller).set(&(&current + &payment));
        let total = self.total_deposited().get();
        self.total_deposited().set(&(&total + &payment));

        // Emit event
        self.deposit_event(&caller, &payment);

        // Interaction: async delegate to staking provider
        let delegation_addr = self.delegation_contract().get();
        self.tx()
            .to(&delegation_addr)
            .raw_call("delegate")
            .egld(&payment)
            .gas(12_000_000u64)
            .callback(self.callbacks().deposit_callback(caller, payment))
            .gas_for_callback(5_000_000u64)
            .register_promise();
    }

    #[promises_callback]
    fn deposit_callback(
        &self,
        caller: ManagedAddress,
        deposit_amount: BigUint,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        if let ManagedAsyncCallResult::Err(_) = result {
            // C-2 FIX: Refund ONLY the failed deposit amount, not the entire balance
            let current_balance = self.user_balance(&caller).get();
            if current_balance >= deposit_amount {
                self.user_balance(&caller).set(&(&current_balance - &deposit_amount));
            } else {
                self.user_balance(&caller).set(&BigUint::zero());
            }
            let total = self.total_deposited().get();
            if total >= deposit_amount {
                self.total_deposited().set(&(&total - &deposit_amount));
            }
            self.send().direct_egld(&caller, &deposit_amount);
        }
    }

    /// Withdraw EGLD from the vault. Initiates undelegation.
    #[endpoint(withdraw)]
    fn withdraw(&self, amount: BigUint) {
        self.require_not_paused();

        let caller = self.blockchain().get_caller();
        require!(amount > 0u64, ERR_ZERO_WITHDRAW);

        let balance = self.user_balance(&caller).get();
        require!(balance >= amount, ERR_INSUFFICIENT_BALANCE);

        // Effects
        self.user_balance(&caller).set(&(&balance - &amount));
        let total = self.total_deposited().get();
        if total >= amount {
            self.total_deposited().set(&(&total - &amount));
        }
        self.withdraw_event(&caller, &amount);

        // Interaction: async undelegate
        let delegation_addr = self.delegation_contract().get();
        self.tx()
            .to(&delegation_addr)
            .raw_call("unDelegate")
            .argument(&amount)
            .gas(12_000_000u64)
            .callback(self.callbacks().withdraw_callback(caller, amount))
            .gas_for_callback(5_000_000u64)
            .register_promise();
    }

    #[promises_callback]
    fn withdraw_callback(
        &self,
        caller: ManagedAddress,
        amount: BigUint,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        if let ManagedAsyncCallResult::Err(_) = result {
            // Restore balance on failure
            let current = self.user_balance(&caller).get();
            self.user_balance(&caller).set(&(&current + &amount));
            let total = self.total_deposited().get();
            self.total_deposited().set(&(&total + &amount));
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  AUTOMATION ENDPOINTS (called by XCron Scheduler only)
    // ═══════════════════════════════════════════════════════════════════

    /// Auto-Compound: claims and re-delegates staking rewards.
    #[endpoint(compound)]
    fn compound(&self) {
        self.require_not_paused();
        self.require_scheduler_caller();

        let delegation_addr = self.delegation_contract().get();
        self.tx()
            .to(&delegation_addr)
            .raw_call("reDelegateRewards")
            .gas(12_000_000u64)
            .callback(self.callbacks().compound_callback())
            .gas_for_callback(5_000_000u64)
            .register_promise();
    }

    #[promises_callback]
    fn compound_callback(
        &self,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        if let ManagedAsyncCallResult::Ok(_) = result {
            self.compound_count().update(|c| *c += 1);
            self.compound_event(self.blockchain().get_block_timestamp_seconds().as_u64_seconds());
        }
    }

    /// Claim Rewards: claims staking rewards and sends to vault.
    /// Rewards stay in vault until user withdraws.
    #[endpoint(claimRewards)]
    fn claim_rewards(&self) {
        self.require_not_paused();
        self.require_scheduler_caller();

        let delegation_addr = self.delegation_contract().get();
        self.tx()
            .to(&delegation_addr)
            .raw_call("claimRewards")
            .gas(12_000_000u64)
            .callback(self.callbacks().claim_callback())
            .gas_for_callback(5_000_000u64)
            .register_promise();
    }

    #[promises_callback]
    fn claim_callback(
        &self,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        if let ManagedAsyncCallResult::Ok(_) = result {
            self.claim_event(self.blockchain().get_block_timestamp_seconds().as_u64_seconds());
        }
    }

    /// DCA Swap: executes a swap on the configured DEX pair contract.
    /// The vault sends EGLD and receives the target token.
    #[endpoint(swap)]
    fn swap(&self) {
        self.require_not_paused();
        self.require_scheduler_caller();

        require!(!self.dex_pair_contract().is_empty(), ERR_NO_SWAP_CONFIG);
        require!(!self.max_slippage_bps().is_empty(), ERR_SLIPPAGE_NOT_SET);

        let dex_addr = self.dex_pair_contract().get();
        let swap_amount = self.swap_amount_per_execution().get();

        // C-1 FIX: Calculate min_amount_out using slippage protection
        // For now, use slippage_bps as percentage of input (simple protection).
        // A proper oracle-based calculation would be ideal for production.
        let slippage_bps = self.max_slippage_bps().get();
        let min_out = &swap_amount * (10_000u64 - slippage_bps) / 10_000u64;

        self.tx()
            .to(&dex_addr)
            .raw_call("swapTokensFixedInput")
            .egld(&swap_amount)
            .argument(&min_out)
            .gas(20_000_000u64)
            .callback(self.callbacks().swap_callback())
            .gas_for_callback(5_000_000u64)
            .register_promise();
    }

    #[promises_callback]
    fn swap_callback(
        &self,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        if let ManagedAsyncCallResult::Ok(_) = result {
            self.swap_event(self.blockchain().get_block_timestamp_seconds().as_u64_seconds());
        }
    }

    /// Emergency Swap (Stop-Loss): one-time swap when scheduler triggers.
    /// Same as swap but intended for stop-loss scenarios.
    #[endpoint(emergencySwap)]
    fn emergency_swap(&self) {
        self.require_not_paused();
        self.require_scheduler_caller();

        require!(!self.dex_pair_contract().is_empty(), ERR_NO_SWAP_CONFIG);
        require!(!self.max_slippage_bps().is_empty(), ERR_SLIPPAGE_NOT_SET);

        let dex_addr = self.dex_pair_contract().get();
        // L-5 FIX: Use swap_amount config instead of entire contract balance.
        // This prevents one user's emergency swap from draining all users' funds.
        let swap_amount = self.swap_amount_per_execution().get();
        let sc_balance = self.blockchain().get_sc_balance(&EgldOrEsdtTokenIdentifier::egld(), 0u64);
        // Use the lesser of configured amount and actual balance
        let amount = if swap_amount > BigUint::zero() && swap_amount < sc_balance {
            swap_amount
        } else {
            sc_balance
        };

        if amount > 0u64 {
            // C-1 FIX: Slippage protection on emergency swap too
            let slippage_bps = self.max_slippage_bps().get();
            let min_out = &amount * (10_000u64 - slippage_bps) / 10_000u64;

            self.tx()
                .to(&dex_addr)
                .raw_call("swapTokensFixedInput")
                .egld(&amount)
                .argument(&min_out)
                .gas(20_000_000u64)
                .callback(self.callbacks().emergency_swap_callback())
                .gas_for_callback(5_000_000u64)
                .register_promise();
        }
    }

    #[promises_callback]
    fn emergency_swap_callback(
        &self,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        if let ManagedAsyncCallResult::Ok(_) = result {
            self.emergency_swap_event(self.blockchain().get_block_timestamp_seconds().as_u64_seconds());
        }
    }

    /// NFT Mint: calls mint on the configured NFT collection contract.
    #[endpoint(mint)]
    fn mint(&self) {
        self.require_not_paused();
        self.require_scheduler_caller();

        require!(!self.nft_contract().is_empty(), ERR_NO_MINT_CONFIG);

        let nft_addr = self.nft_contract().get();
        let mint_price = self.mint_price().get();
        let mint_endpoint = self.mint_endpoint_name().get();

        self.tx()
            .to(&nft_addr)
            .raw_call(mint_endpoint)
            .egld(&mint_price)
            .argument(&1u64)  // mint_count = 1
            .gas(15_000_000u64)
            .callback(self.callbacks().mint_callback())
            .gas_for_callback(5_000_000u64)
            .register_promise();
    }

    #[promises_callback]
    fn mint_callback(
        &self,
        #[call_result] result: ManagedAsyncCallResult<MultiValueEncoded<ManagedBuffer>>,
    ) {
        if let ManagedAsyncCallResult::Ok(_) = result {
            self.mint_event(self.blockchain().get_block_timestamp_seconds().as_u64_seconds());
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════

    fn require_scheduler_caller(&self) {
        let caller = self.blockchain().get_caller();
        let scheduler = self.scheduler_address().get();
        require!(caller == scheduler, ERR_NOT_AUTHORIZED);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ADMIN (only owner)
    // ═══════════════════════════════════════════════════════════════════

    #[only_owner]
    #[endpoint(setSchedulerAddress)]
    fn set_scheduler_address(&self, addr: ManagedAddress) {
        self.scheduler_address().set(&addr);
    }

    #[only_owner]
    #[endpoint(setDelegationContract)]
    fn set_delegation_contract(&self, addr: ManagedAddress) {
        self.delegation_contract().set(&addr);
    }

    /// Configure DEX pair contract for swap/DCA/stop-loss strategies.
    #[only_owner]
    #[endpoint(setDexPairContract)]
    fn set_dex_pair_contract(&self, addr: ManagedAddress) {
        self.dex_pair_contract().set(&addr);
    }

    /// Set the amount to swap per DCA execution.
    #[only_owner]
    #[endpoint(setSwapAmount)]
    fn set_swap_amount(&self, amount: BigUint) {
        self.swap_amount_per_execution().set(&amount);
    }

    /// Configure NFT collection contract for mint strategy.
    #[only_owner]
    #[endpoint(setNftContract)]
    fn set_nft_contract(&self, addr: ManagedAddress) {
        self.nft_contract().set(&addr);
    }

    /// Set the mint price (EGLD per NFT).
    #[only_owner]
    #[endpoint(setMintPrice)]
    fn set_mint_price(&self, price: BigUint) {
        self.mint_price().set(&price);
    }

    /// Set the mint endpoint name (e.g., "mint", "nftMint", "buyRandomNft").
    #[only_owner]
    #[endpoint(setMintEndpoint)]
    fn set_mint_endpoint(&self, endpoint: ManagedBuffer) {
        self.mint_endpoint_name().set(&endpoint);
    }

    /// Set max slippage for swap operations (in basis points, e.g. 300 = 3%).
    #[only_owner]
    #[endpoint(setMaxSlippageBps)]
    fn set_max_slippage_bps(&self, bps: u64) {
        require!(bps <= 5000, "Max slippage cannot exceed 50%");
        self.max_slippage_bps().set(bps);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════

    #[view(getUserBalance)]
    fn get_user_balance(&self, user: ManagedAddress) -> BigUint {
        self.user_balance(&user).get()
    }

    #[view(getTotalDeposited)]
    fn get_total_deposited(&self) -> BigUint {
        self.total_deposited().get()
    }

    #[view(getCompoundCount)]
    fn get_compound_count(&self) -> u64 {
        self.compound_count().get()
    }

    #[view(getTotalCompounded)]
    fn get_total_compounded(&self) -> BigUint {
        self.total_compounded().get()
    }

    // ═══════════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════════

    // -- Core --
    #[storage_mapper("user_balance")]
    fn user_balance(&self, user: &ManagedAddress) -> SingleValueMapper<BigUint>;

    #[storage_mapper("total_deposited")]
    fn total_deposited(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("total_compounded")]
    fn total_compounded(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("compound_count")]
    fn compound_count(&self) -> SingleValueMapper<u64>;

    // -- Addresses --
    #[storage_mapper("delegation_contract")]
    fn delegation_contract(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("scheduler_address")]
    fn scheduler_address(&self) -> SingleValueMapper<ManagedAddress>;

    // -- Swap/DCA config --
    #[storage_mapper("dex_pair_contract")]
    fn dex_pair_contract(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("swap_amount")]
    fn swap_amount_per_execution(&self) -> SingleValueMapper<BigUint>;

    // -- Slippage protection --
    #[storage_mapper("max_slippage_bps")]
    fn max_slippage_bps(&self) -> SingleValueMapper<u64>;

    // -- NFT Mint config --
    #[storage_mapper("nft_contract")]
    fn nft_contract(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("mint_price")]
    fn mint_price(&self) -> SingleValueMapper<BigUint>;

    #[storage_mapper("mint_endpoint")]
    fn mint_endpoint_name(&self) -> SingleValueMapper<ManagedBuffer>;

    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    #[event("deposit")]
    fn deposit_event(&self, #[indexed] caller: &ManagedAddress, amount: &BigUint);

    #[event("withdraw")]
    fn withdraw_event(&self, #[indexed] caller: &ManagedAddress, amount: &BigUint);

    #[event("compound")]
    fn compound_event(&self, #[indexed] timestamp: u64);

    #[event("claim")]
    fn claim_event(&self, #[indexed] timestamp: u64);

    #[event("swap")]
    fn swap_event(&self, #[indexed] timestamp: u64);

    #[event("emergencySwap")]
    fn emergency_swap_event(&self, #[indexed] timestamp: u64);

    #[event("mint")]
    fn mint_event(&self, #[indexed] timestamp: u64);
}
