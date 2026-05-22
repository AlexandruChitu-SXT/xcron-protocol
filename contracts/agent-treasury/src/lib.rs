#![no_std]

multiversx_sc::imports!();
multiversx_sc::derive_imports!();

const REWARD_SCALE: u128 = 1_000_000_000_000_000_000_000_000; // 1e24 for precision

#[type_abi]
#[derive(TopEncode, TopDecode, ManagedVecItem, NestedEncode, NestedDecode, Clone)]
pub struct UserInfo<M: ManagedTypeApi> {
    pub staked_amount: BigUint<M>,
    pub staked_nonce: u64,
    pub reward_debt: BigUint<M>,
}

#[multiversx_sc::contract]
pub trait AgentTreasury {
    #[init]
    fn init(&self, agent_sft_token: TokenIdentifier, accepted_payment_token: TokenIdentifier) {
        self.agent_sft_token().set(&agent_sft_token);
        self.accepted_payment_token().set(&accepted_payment_token);
        self.acc_reward_per_share().set(BigUint::zero());
        self.total_staked_sfts().set(BigUint::zero());
    }

    // --- Core Payment Mechanism ---

    /// Endpoint for users to pay for the agent's service
    #[payable("*")]
    #[endpoint(payForService)]
    fn pay_for_service(&self) {
        let payment = self.call_value().single();
        let payment_token: EsdtTokenIdentifier<Self::Api> = payment.token_identifier.clone().into();
        let payment_amount: BigUint<Self::Api> = payment.amount.clone().into_big_uint();
        
        let accepted_token = self.accepted_payment_token().get();
        require!(payment_token == accepted_token, "Invalid payment token");
        
        let total_staked = self.total_staked_sfts().get();
        if total_staked > 0 {
            // scale up to prevent precision loss
            let reward_addition = (payment_amount.clone() * BigUint::from(REWARD_SCALE)) / total_staked;
            self.acc_reward_per_share().update(|acc| *acc += reward_addition);
        } else {
            // If no one is staked, funds are held in reserve or burned.
            // For this implementation, we lock them in protocol reserves.
            self.protocol_reserves().update(|res| *res += payment_amount.clone());
        }
        
        self.service_paid_event(&self.blockchain().get_caller(), &payment_token, &payment_amount);
    }

    // --- Staking Mechanism (Prevents Double-Claiming) ---

    #[payable("*")]
    #[endpoint(stakeSfts)]
    fn stake_sfts(&self) {
        let payment = self.call_value().single();
        let payment_token: EsdtTokenIdentifier<Self::Api> = payment.token_identifier.clone().into();
        let payment_amount: BigUint<Self::Api> = payment.amount.clone().into_big_uint();
        
        let sft_token = self.agent_sft_token().get();
        require!(payment_token == sft_token, "Invalid SFT token");
        
        let caller = self.blockchain().get_caller();
        let amount = payment_amount;
        
        let mut user_info = self.user_info(&caller).get();
        
        // If already staked, claim pending rewards first
        if user_info.staked_amount > 0 {
            let pending = self.calculate_pending_rewards(&user_info);
            if pending > 0 {
                self.send_rewards(&caller, pending);
            }
        }
        
        // Save the staked nonce to allow correct unstaking
        user_info.staked_nonce = payment.token_nonce;
        user_info.staked_amount += amount.clone();
        
        let acc_reward = self.acc_reward_per_share().get();
        user_info.reward_debt = (user_info.staked_amount.clone() * acc_reward) / BigUint::from(REWARD_SCALE);
        
        self.user_info(&caller).set(&user_info);
        self.total_staked_sfts().update(|total| *total += amount);
    }

    #[endpoint(unstakeSfts)]
    fn unstake_sfts(&self, amount: BigUint) {
        let caller = self.blockchain().get_caller();
        let mut user_info = self.user_info(&caller).get();
        
        require!(user_info.staked_amount >= amount, "Not enough staked");
        
        let pending = self.calculate_pending_rewards(&user_info);
        if pending > 0 {
            self.send_rewards(&caller, pending);
        }
        
        user_info.staked_amount -= amount.clone();
        
        let acc_reward = self.acc_reward_per_share().get();
        user_info.reward_debt = (user_info.staked_amount.clone() * acc_reward) / BigUint::from(REWARD_SCALE);
        
        let staked_nonce = user_info.staked_nonce;

        if user_info.staked_amount == BigUint::zero() {
             user_info.staked_nonce = 0;
        }

        self.user_info(&caller).set(&user_info);
        self.total_staked_sfts().update(|total| *total -= amount.clone());
        
        let sft_token = self.agent_sft_token().get();
        self.send().direct_esdt(&caller, &sft_token, staked_nonce, &amount);
    }

    #[endpoint(claimRewards)]
    fn claim_rewards(&self) {
        let caller = self.blockchain().get_caller();
        let mut user_info = self.user_info(&caller).get();
        
        let pending = self.calculate_pending_rewards(&user_info);
        require!(pending > 0, "No rewards to claim");
        
        self.send_rewards(&caller, pending);
        
        let acc_reward = self.acc_reward_per_share().get();
        user_info.reward_debt = (user_info.staked_amount.clone() * acc_reward) / BigUint::from(REWARD_SCALE);
        
        self.user_info(&caller).set(&user_info);
    }

    // --- Internal Helpers ---

    fn calculate_pending_rewards(&self, user_info: &UserInfo<Self::Api>) -> BigUint {
        let acc_reward = self.acc_reward_per_share().get();
        let accumulated = (user_info.staked_amount.clone() * acc_reward) / BigUint::from(REWARD_SCALE);
        if accumulated > user_info.reward_debt {
            accumulated - user_info.reward_debt.clone()
        } else {
            BigUint::zero()
        }
    }

    fn send_rewards(&self, to: &ManagedAddress, amount: BigUint) {
        let reward_token = self.accepted_payment_token().get();
        self.send().direct_esdt(to, &reward_token, 0, &amount);
    }

    // --- Storage & Events ---

    #[event("servicePaid")]
    fn service_paid_event(&self, #[indexed] caller: &ManagedAddress, #[indexed] token: &TokenIdentifier, amount: &BigUint);

    #[view(getAgentSftToken)]
    #[storage_mapper("agentSftToken")]
    fn agent_sft_token(&self) -> SingleValueMapper<TokenIdentifier>;

    #[view(getAcceptedPaymentToken)]
    #[storage_mapper("acceptedPaymentToken")]
    fn accepted_payment_token(&self) -> SingleValueMapper<TokenIdentifier>;

    #[view(getAccRewardPerShare)]
    #[storage_mapper("accRewardPerShare")]
    fn acc_reward_per_share(&self) -> SingleValueMapper<BigUint>;

    #[view(getTotalStakedSfts)]
    #[storage_mapper("totalStakedSfts")]
    fn total_staked_sfts(&self) -> SingleValueMapper<BigUint>;

    #[view(getProtocolReserves)]
    #[storage_mapper("protocolReserves")]
    fn protocol_reserves(&self) -> SingleValueMapper<BigUint>;

    #[view(getUserInfo)]
    #[storage_mapper("userInfo")]
    fn user_info(&self, user: &ManagedAddress) -> SingleValueMapper<UserInfo<Self::Api>>;
}
