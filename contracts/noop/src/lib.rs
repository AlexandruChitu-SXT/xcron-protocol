#![no_std]

multiversx_sc::imports!();

/// A minimal "noop" contract for XCron task testing.
/// Accepts any call to `noop` endpoint without reverting.
#[multiversx_sc::contract]
pub trait Noop {
    #[init]
    fn init(&self) {}

    #[upgrade]
    fn upgrade(&self) {}

    #[endpoint]
    fn noop(&self) {}

    #[endpoint]
    fn execute(&self) {}

    #[endpoint]
    fn process(&self) {}

    #[payable("EGLD")]
    #[endpoint]
    fn receive(&self) {}
}
