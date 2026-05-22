#![no_std]

multiversx_sc::imports!();

/// TestNft — simulates an NFT collection contract for XCron testing.
/// Implements a configurable `mint` endpoint that accepts EGLD payment
/// and records the mint. In a real deployment, this would be the actual
/// NFT collection contract address (e.g., XOXNO, Dead Brothers, etc.).
#[multiversx_sc::contract]
pub trait TestNft {
    #[init]
    fn init(&self) {
        self.mint_count().set(0u64);
        self.total_paid().set(BigUint::zero());
    }

    #[upgrade]
    fn upgrade(&self) {}

    /// Accepts EGLD and records a mint (simulates NFT collection).
    /// The vault calls this with EGLD payment and a mint_count argument.
    #[payable("EGLD")]
    #[endpoint(mint)]
    fn mint(&self, _count: u64) {
        let payment = self.call_value().egld().clone_value();
        require!(payment > 0u64, "No EGLD sent");

        self.mint_count().update(|c| *c += 1);
        self.total_paid().update(|t| *t += &payment);
    }

    #[view(getMintCount)]
    #[storage_mapper("mint_count")]
    fn mint_count(&self) -> SingleValueMapper<u64>;

    #[view(getTotalPaid)]
    #[storage_mapper("total_paid")]
    fn total_paid(&self) -> SingleValueMapper<BigUint>;
}
