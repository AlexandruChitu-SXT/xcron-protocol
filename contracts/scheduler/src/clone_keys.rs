multiversx_sc::imports!();

/// Clone-Keys (Burner Wallets) module.
///
/// Allows a main wallet to authorize a disposable "clone" wallet to interact
/// with XCron on its behalf. The clone has hard-capped spend limits and expiry.
///
/// # Security model
/// - Clone-Key can ONLY schedule/cancel tasks within XCron
/// - Spend limit is enforced on-chain — cannot be exceeded
/// - Expiry timestamp is immutable once set
/// - Main wallet can revoke at any time (instant kill switch)
/// - Refunds always go to the main wallet, never the clone
#[multiversx_sc::module]
pub trait CloneKeysModule:
    crate::storage::StorageModule
    + common::pausable::PausableModule
{
    // ═══════════════════════════════════════════════════════════
    //  EVENTS (colocated to avoid SDK 0.63 macro issue)
    // ═══════════════════════════════════════════════════════════

    /// Emitted when a main wallet authorizes a new Clone-Key.
    #[event("cloneKeyAuthorized")]
    fn clone_key_authorized_event(
        &self,
        #[indexed] main_wallet: &ManagedAddress,
        #[indexed] clone_key: &ManagedAddress,
        #[indexed] expiry: u64,
        spend_limit: &BigUint,
    );

    /// Emitted when a main wallet revokes a Clone-Key.
    #[event("cloneKeyRevoked")]
    fn clone_key_revoked_event(
        &self,
        #[indexed] main_wallet: &ManagedAddress,
        #[indexed] clone_key: &ManagedAddress,
        refunded: &BigUint,
    );

    /// Emitted when a main wallet adds more funds to a Clone-Key.
    #[event("cloneKeyFunded")]
    fn clone_key_funded_event(
        &self,
        #[indexed] clone_key: &ManagedAddress,
        added_amount: &BigUint,
    );
    // ═══════════════════════════════════════════════════════════
    //  PUBLIC ENDPOINTS
    // ═══════════════════════════════════════════════════════════

    /// Authorize a new Clone-Key. Caller = Main Wallet.
    ///
    /// Payment: EGLD to fund the clone's spend limit.
    /// The clone_address should be a fresh wallet generated client-side.
    #[payable("EGLD")]
    #[endpoint(authorizeCloneKey)]
    fn authorize_clone_key(
        &self,
        clone_address: ManagedAddress,
        ttl_seconds: u64,
    ) {
        self.require_not_paused();
        let caller = self.blockchain().get_caller();
        let deposit = self.call_value().egld().clone_value();

        // Validate deposit (spend limit)
        require!(deposit > BigUint::zero(), "Must deposit EGLD as spend limit");
        require!(
            deposit <= BigUint::from(common::constants::MAX_CLONE_KEY_SPEND_LIMIT),
            "Spend limit exceeds maximum (2 EGLD)"
        );

        // Validate TTL
        require!(
            ttl_seconds >= common::constants::MIN_CLONE_KEY_TTL_SECONDS,
            "TTL too short (minimum 1 hour)"
        );
        require!(
            ttl_seconds <= common::constants::MAX_CLONE_KEY_TTL_SECONDS,
            "TTL too long (maximum 30 days)"
        );

        // Cannot authorize self as clone
        require!(clone_address != caller, "Cannot authorize self as Clone-Key");

        // Cannot authorize an already-active clone key
        require!(
            self.clone_key_props(&clone_address).is_empty(),
            "Clone-Key already authorized"
        );

        // Max clone keys per wallet
        let current_count = self.wallet_clone_keys(&caller).len();
        require!(
            current_count < common::constants::MAX_CLONE_KEYS_PER_WALLET,
            "Too many Clone-Keys (max 3)"
        );

        // Calculate expiry
        let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
        let expiry = current_time + ttl_seconds;

        // Store clone key properties
        let props = common::types::CloneKeyProperties {
            main_address: caller.clone(),
            spend_limit: deposit.clone(),
            spent_amount: BigUint::zero(),
            expiry_timestamp: expiry,
        };
        self.clone_key_props(&clone_address).set(&props);
        self.wallet_clone_keys(&caller).insert(clone_address.clone());

        // Emit event
        self.clone_key_authorized_event(&caller, &clone_address, expiry, &deposit);
    }

    /// Revoke a Clone-Key immediately. Caller = Main Wallet.
    ///
    /// Remaining unspent balance is refunded to the main wallet.
    #[endpoint(revokeCloneKey)]
    fn revoke_clone_key(&self, clone_address: ManagedAddress) {
        let caller = self.blockchain().get_caller();

        // Verify the clone key exists and belongs to caller
        require!(
            !self.clone_key_props(&clone_address).is_empty(),
            "Clone-Key not found"
        );
        let props = self.clone_key_props(&clone_address).get();
        require!(
            props.main_address == caller,
            "Not the owner of this Clone-Key"
        );

        // Calculate refund (unspent balance)
        let refund = if props.spend_limit > props.spent_amount {
            &props.spend_limit - &props.spent_amount
        } else {
            BigUint::zero()
        };

        // Clean up storage
        self.clone_key_props(&clone_address).clear();
        self.wallet_clone_keys(&caller).swap_remove(&clone_address);

        // Refund unspent balance
        if refund > BigUint::zero() {
            self.send().direct_egld(&caller, &refund);
        }

        // Emit event
        self.clone_key_revoked_event(&caller, &clone_address, &refund);
    }

    /// Add more funds to an existing Clone-Key. Caller = Main Wallet.
    #[payable("EGLD")]
    #[endpoint(fundCloneKey)]
    fn fund_clone_key(&self, clone_address: ManagedAddress) {
        self.require_not_paused();
        let caller = self.blockchain().get_caller();
        let added = self.call_value().egld().clone_value();

        require!(added > BigUint::zero(), "Must send EGLD");

        // Verify ownership
        require!(
            !self.clone_key_props(&clone_address).is_empty(),
            "Clone-Key not found"
        );
        let mut props = self.clone_key_props(&clone_address).get();
        require!(
            props.main_address == caller,
            "Not the owner of this Clone-Key"
        );

        // Check expiry — no point funding an expired key
        let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
        require!(
            current_time < props.expiry_timestamp,
            "Clone-Key has expired — revoke and create a new one"
        );

        // Check new total doesn't exceed max
        let new_limit = &props.spend_limit + &added;
        require!(
            new_limit <= BigUint::from(common::constants::MAX_CLONE_KEY_SPEND_LIMIT),
            "New spend limit would exceed maximum (2 EGLD)"
        );

        // Update spend limit
        props.spend_limit = new_limit;
        self.clone_key_props(&clone_address).set(&props);

        // Emit event
        self.clone_key_funded_event(&clone_address, &added);
    }

    // ═══════════════════════════════════════════════════════════
    //  VIEW ENDPOINTS
    // ═══════════════════════════════════════════════════════════

    /// Get Clone-Key properties. Returns empty if not found.
    #[view(getCloneKeyInfo)]
    fn get_clone_key_info(
        &self,
        clone_address: ManagedAddress,
    ) -> OptionalValue<common::types::CloneKeyProperties<Self::Api>> {
        if self.clone_key_props(&clone_address).is_empty() {
            OptionalValue::None
        } else {
            OptionalValue::Some(self.clone_key_props(&clone_address).get())
        }
    }

    /// Get all Clone-Keys for a main wallet.
    #[view(getWalletCloneKeys)]
    fn get_wallet_clone_keys(
        &self,
        main_wallet: ManagedAddress,
    ) -> MultiValueEncoded<ManagedAddress> {
        let mut result = MultiValueEncoded::new();
        for clone in self.wallet_clone_keys(&main_wallet).iter() {
            result.push(clone);
        }
        result
    }

    // ═══════════════════════════════════════════════════════════
    //  INTERNAL FUNCTIONS (used by scheduling.rs)
    // ═══════════════════════════════════════════════════════════

    /// Resolve the effective owner for a transaction.
    ///
    /// If the caller is a valid (non-expired) Clone-Key, returns
    /// `(main_address, true)`. Otherwise returns `(caller, false)`.
    fn resolve_caller(&self) -> (ManagedAddress, bool) {
        let caller = self.blockchain().get_caller();

        if self.clone_key_props(&caller).is_empty() {
            return (caller, false);
        }

        let props = self.clone_key_props(&caller).get();
        let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();

        // Expired clone keys are treated as non-existent
        if current_time >= props.expiry_timestamp {
            return (caller, false);
        }

        (props.main_address, true)
    }

    /// Charge a Clone-Key's spend limit for a task deposit.
    ///
    /// Verifies the clone has enough remaining budget and increments spent_amount.
    /// Returns error if budget would be exceeded.
    fn charge_clone_key(&self, clone_address: &ManagedAddress, amount: &BigUint) {
        let mut props = self.clone_key_props(clone_address).get();

        // Check expiry
        let current_time = self.blockchain().get_block_timestamp_seconds().as_u64_seconds();
        require!(
            current_time < props.expiry_timestamp,
            "Clone-Key has expired"
        );

        // Check remaining budget
        let new_spent = &props.spent_amount + amount;
        require!(
            new_spent <= props.spend_limit,
            "Clone-Key spend limit exceeded"
        );

        // Update spent amount
        props.spent_amount = new_spent;
        self.clone_key_props(clone_address).set(&props);
    }
}
