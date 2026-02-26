multiversx_sc::imports!();

/// Shared Pausable module — DRY circuit breaker for all XCron contracts.
///
/// Provides `pause`, `unpause`, `require_not_paused` with consistent
/// storage key and behavior across Scheduler, KeeperRegistry, and Rewards.
#[multiversx_sc::module]
pub trait PausableModule {
    /// Pause all user-facing endpoints. Only callable by contract owner.
    #[only_owner]
    #[endpoint(pause)]
    fn pause(&self) {
        self.paused().set(true);
    }

    /// Resume normal operations. Only callable by contract owner.
    #[only_owner]
    #[endpoint(unpause)]
    fn unpause(&self) {
        self.paused().set(false);
    }

    /// Internal guard — reverts if the contract is paused.
    fn require_not_paused(&self) {
        require!(!self.paused().get(), "Contract is paused");
    }

    /// View: returns whether the contract is currently paused.
    #[view(isPaused)]
    fn is_paused(&self) -> bool {
        self.paused().get()
    }

    // ── Storage ──

    #[storage_mapper("paused")]
    fn paused(&self) -> SingleValueMapper<bool>;
}
