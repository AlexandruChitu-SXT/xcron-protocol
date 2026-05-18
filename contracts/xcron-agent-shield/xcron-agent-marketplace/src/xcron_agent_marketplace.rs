#![no_std]

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

pub mod proxy_reputation {
    use multiversx_sc::imports::*;
    use multiversx_sc::proxy_imports::*;

    pub struct Proxy;

    impl<Env, From, To, Gas> TxProxyTrait<Env, From, To, Gas> for Proxy
    where
        Env: TxEnv,
        From: TxFrom<Env>,
        To: TxTo<Env>,
        Gas: TxGas<Env>,
    {
        type TxProxyMethods = ProxyMethods<Env, From, To, Gas>;

        fn proxy_methods(self, tx: Tx<Env, From, To, (), Gas, (), ()>) -> Self::TxProxyMethods {
            ProxyMethods { wrapped_tx: tx }
        }
    }

    pub struct ProxyMethods<Env, From, To, Gas>
    where
        Env: TxEnv,
        From: TxFrom<Env>,
        To: TxTo<Env>,
        Gas: TxGas<Env>,
    {
        wrapped_tx: Tx<Env, From, To, (), Gas, (), ()>,
    }

    impl<Env, From, To, Gas> ProxyMethods<Env, From, To, Gas>
    where
        Env: TxEnv,
        Env::Api: VMApi,
        From: TxFrom<Env>,
        To: TxTo<Env>,
        Gas: TxGas<Env>,
    {
        pub fn evaluate_agent_fair_value<
            Arg0: ProxyArg<u64>,
            Arg1: ProxyArg<BigUint<Env::Api>>,
            Arg2: ProxyArg<u32>,
        >(
            self,
            agent_nonce: Arg0,
            net_monthly_earnings: Arg1,
            expected_apr_basis_points: Arg2,
        ) -> TxTypedCall<Env, From, To, NotPayable, Gas, BigUint<Env::Api>> {
            self.wrapped_tx
                .payment(NotPayable)
                .raw_call("evaluateAgentFairValue")
                .argument(&agent_nonce)
                .argument(&net_monthly_earnings)
                .argument(&expected_apr_basis_points)
                .original_result()
        }
    }
}


#[multiversx_sc::contract]
pub trait XcronAgentMarketplace {
    #[init]
    fn init(
        &self,
        reputation_registry_address: ManagedAddress,
        treasury_address: ManagedAddress,
        xcron_agent_token_id: TokenId,
    ) {
        self.reputation_registry_address()
            .set(&reputation_registry_address);
        self.treasury_address().set(&treasury_address);
        self.agent_nft_token_id().set(&xcron_agent_token_id);
    }

    #[upgrade]
    fn upgrade(&self) {}

    #[storage_mapper("reputationRegistryAddress")]
    fn reputation_registry_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("treasuryAddress")]
    fn treasury_address(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("agentNftTokenId")]
    fn agent_nft_token_id(&self) -> SingleValueMapper<TokenId>;

    #[storage_mapper("listings")]
    fn listings(&self, nonce: u64) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("listingEarnings")]
    fn listing_earnings(&self, nonce: u64) -> SingleValueMapper<BigUint>;

    #[storage_mapper("listingApr")]
    fn listing_apr(&self, nonce: u64) -> SingleValueMapper<u32>;

    /// Lists an Agent NFT for sale. 
    /// The actual price will be calculated dynamically by the AVS upon purchase.
    #[payable("*")]
    #[endpoint(listAgent)]
    fn list_agent(&self, net_monthly_earnings: BigUint, expected_apr_basis_points: u32) {
        let payment = self.call_value().single();

        let expected_token_id = self.agent_nft_token_id().get();
        require!(
            payment.token_identifier == expected_token_id,
            "Invalid Agent NFT Token ID"
        );
        require!(
            payment.amount == NonZeroBigUint::new_or_panic(BigUint::from(1u32)),
            "Must list exactly 1 Agent NFT"
        );
        require!(expected_apr_basis_points > 0, "Invalid Expected APR");

        let nonce = payment.token_nonce;
        let caller = self.blockchain().get_caller();

        self.listings(nonce).set(&caller);
        self.listing_earnings(nonce).set(&net_monthly_earnings);
        self.listing_apr(nonce).set(&expected_apr_basis_points);
    }

    /// Cancels a listing and returns the NFT to the original owner.
    #[endpoint(cancelListing)]
    fn cancel_listing(&self, agent_nonce: u64) {
        let caller = self.blockchain().get_caller();
        let listing_mapper = self.listings(agent_nonce);
        require!(!listing_mapper.is_empty(), "Agent not listed");

        let seller = listing_mapper.get();
        require!(caller == seller, "Only seller can cancel listing");

        let token_id = self.agent_nft_token_id().get();

        self.tx()
            .to(&seller)
            .payment(Payment::new(
                token_id,
                agent_nonce,
                NonZeroBigUint::new_or_panic(BigUint::from(1u32)),
            ))
            .transfer();

        listing_mapper.clear();
        self.listing_earnings(agent_nonce).clear();
        self.listing_apr(agent_nonce).clear();
    }

    /// Institutional Buy: Purchases an Agent at its exact AVS Fair Value.
    /// Splits the payment: 95% to the seller, 5% to the XCron Treasury.
    #[payable("EGLD")]
    #[endpoint(buyAgent)]
    fn buy_agent(&self, agent_nonce: u64) {
        let caller = self.blockchain().get_caller();
        let listing_mapper = self.listings(agent_nonce);
        require!(!listing_mapper.is_empty(), "Agent not listed");

        let seller = listing_mapper.get();

        // 1. Get Valuation from ReputationRegistry (AVS)
        let reputation_addr = self.reputation_registry_address().get();
        let earnings = self.listing_earnings(agent_nonce).get();
        let apr = self.listing_apr(agent_nonce).get();

        // Dynamic pricing calculation via proxy
        let fair_value: BigUint = self.tx()
            .to(&reputation_addr)
            .typed(proxy_reputation::Proxy)
            .evaluate_agent_fair_value(agent_nonce, earnings, apr)
            .returns(ReturnsResult)
            .sync_call();

        // 2. Validate Payment
        let payment_amount = self.call_value().egld().clone_value();
        require!(
            payment_amount == fair_value,
            "Payment must perfectly match AVS Fair Value"
        );

        // 3. Fee Split Calculation
        // 5% to Treasury, 95% to Seller
        let five_percent = (fair_value.clone() * 5u32) / 100u32;
        let ninety_five_percent = fair_value.clone() - five_percent.clone();

        let treasury = self.treasury_address().get();
        let token_id = self.agent_nft_token_id().get();

        // 4. Send Agent NFT to Buyer
        self.tx()
            .to(&caller)
            .payment(Payment::new(
                token_id,
                agent_nonce,
                NonZeroBigUint::new_or_panic(BigUint::from(1u32)),
            ))
            .transfer();

        // 5. Route Funds
        // 95% to seller
        if ninety_five_percent > 0 {
            self.tx()
                .to(&seller)
                .egld(&ninety_five_percent)
                .transfer();
        }
        
        // 5% to treasury
        if five_percent > 0 {
            self.tx()
                .to(&treasury)
                .egld(&five_percent)
                .transfer();
        }

        // 6. Clear storage
        listing_mapper.clear();
        self.listing_earnings(agent_nonce).clear();
        self.listing_apr(agent_nonce).clear();
    }
}
