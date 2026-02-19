#![no_std]
multiversx_sc::imports!();

/// Minimal "ping" contract for testing XCron task execution.
/// Has a single mutable endpoint that always succeeds.
#[multiversx_sc::contract]
pub trait PingContract {
    #[init]
    fn init(&self) {
        self.ping_count().set(0u64);
    }

    #[upgrade]
    fn upgrade(&self) {}

    /// Mutable endpoint — increments a counter and succeeds.
    /// Used as a safe target for XCron scheduled tasks.
    #[endpoint(ping)]
    fn ping(&self) {
        self.ping_count().update(|c| *c += 1);
    }

    #[view(getPingCount)]
    #[storage_mapper("ping_count")]
    fn ping_count(&self) -> SingleValueMapper<u64>;
}
