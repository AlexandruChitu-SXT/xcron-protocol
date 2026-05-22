#![no_std]

multiversx_sc::imports!();

/// TestDex — simulates an xExchange pair contract for XCron testing.
/// Implements `swapTokensFixedInput` as a payable endpoint that accepts EGLD
/// and records the swap. In a real deployment, this would be the actual
/// xExchange pair contract address.
#[multiversx_sc::contract]
pub trait TestDex {
    #[init]
    fn init(&self) {
        self.swap_count().set(0u64);
        self.total_swapped().set(BigUint::zero());
    }

    #[upgrade]
    fn upgrade(&self) {}

    /// Accepts EGLD and records a swap (simulates xExchange pair).
    /// The vault calls this with EGLD payment and expects success.
    #[payable("EGLD")]
    #[endpoint(swapTokensFixedInput)]
    fn swap_tokens_fixed_input(&self, _min_amount_out: BigUint) {
        let payment = self.call_value().egld().clone_value();
        require!(payment > 0u64, "No EGLD sent");

        self.swap_count().update(|c| *c += 1);
        self.total_swapped().update(|t| *t += &payment);
    }

    #[view(getSwapCount)]
    #[storage_mapper("swap_count")]
    fn swap_count(&self) -> SingleValueMapper<u64>;

    #[view(getTotalSwapped)]
    #[storage_mapper("total_swapped")]
    fn total_swapped(&self) -> SingleValueMapper<BigUint>;
}
