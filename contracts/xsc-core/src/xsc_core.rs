#![no_std]

multiversx_sc::imports!();

/// XCron State Compression (XSC) - Institutional Fortified Protocol v4
/// 
/// Optimized for:
/// - Single-Argument Merkle Proofs (Packed Proofs)
/// - Zero-Heap Execution
/// - Post-Quantum Resistance Ready (SHA-256)
/// - Emergency Pause & Replay Protection
#[multiversx_sc::contract]
pub trait XscCore {
    #[init]
    fn init(&self, authorized_keeper: ManagedAddress) {
        self.authorized_keeper().set(&authorized_keeper);
        self.root_nonce().set(0u64);
        self.is_paused().set(false);
    }

    #[upgrade]
    fn upgrade(&self, authorized_keeper: ManagedAddress) {
        self.authorized_keeper().set(&authorized_keeper);
    }

    // ==================
    // ADMINISTRATIVE
    // ==================

    /// Protocol Circuit Breaker
    #[endpoint(setPaused)]
    #[only_owner]
    fn set_paused(&self, paused: bool) {
        self.is_paused().set(paused);
    }

    /// Update the authorized Keeper address
    #[endpoint(setAuthorizedKeeper)]
    #[only_owner]
    fn set_authorized_keeper(&self, new_keeper: ManagedAddress) {
        self.authorized_keeper().set(&new_keeper);
    }

    // ==================
    // STATE UPDATES
    // ==================

    /// Updates the Merkle Root. Incrementing nonce ensures replay protection.
    #[endpoint(updateRoot)]
    fn update_root(&self, new_root: ManagedBuffer) {
        self.require_not_paused();
        
        let caller = self.blockchain().get_caller();
        require!(
            caller == self.authorized_keeper().get(),
            "Unauthorized Keeper"
        );
        require!(new_root.len() == 32, "Invalid Root Length");

        let nonce = self.root_nonce().get() + 1;
        self.root_nonce().set(nonce);
        self.merkle_root().set(&new_root);

        self.root_updated_event(&new_root, nonce);
    }

    // ==================
    // VERIFICATION (PACKED PROOFS)
    // ==================

    /// Verifies if a leaf exists in the compressed state using a PACKED proof.
    /// @param leaf: 32-byte leaf hash.
    /// @param packed_proof: Concatenated 32-byte siblings (single buffer).
    /// 
    /// This eliminates the 'Too many arguments' limitation of gateways.
    #[view(verifyProof)]
    fn verify_proof(&self, leaf: ManagedBuffer, packed_proof: ManagedBuffer) -> bool {
        self.require_not_paused();
        require!(leaf.len() == 32, "Invalid Leaf Length");
        require!(packed_proof.len() % 32 == 0, "Invalid Packed Proof Length");

        let current_root = self.merkle_root().get();
        let mut computed_hash = leaf;

        let proof_len = packed_proof.len();
        let mut offset = 0usize;

        while offset < proof_len {
            // copy_slice is extremely gas efficient in MultiversX VM
            let sibling = packed_proof.copy_slice(offset, 32).unwrap();
            computed_hash = self.compute_parent_hash(&computed_hash, &sibling);
            offset += 32;
        }

        computed_hash == current_root
    }

    // ==================
    // CRYPTO INTERNALS
    // ==================

    fn compute_parent_hash(&self, a: &ManagedBuffer, b: &ManagedBuffer) -> ManagedBuffer {
        let mut concat = ManagedBuffer::new();

        if self.buf_compare(a, b) <= 0 {
            concat.append(a);
            concat.append(b);
        } else {
            concat.append(b);
            concat.append(a);
        }

        self.crypto().sha256(&concat).as_managed_buffer().clone()
    }

    /// Zero-Heap comparison for gas efficiency
    fn buf_compare(&self, a: &ManagedBuffer, b: &ManagedBuffer) -> i8 {
        let mut a_bytes = [0u8; 32];
        let mut b_bytes = [0u8; 32];
        
        let _ = a.load_slice(0, &mut a_bytes);
        let _ = b.load_slice(0, &mut b_bytes);

        for i in 0..32 {
            if a_bytes[i] < b_bytes[i] { return -1; }
            if a_bytes[i] > b_bytes[i] { return 1; }
        }
        0
    }

    fn require_not_paused(&self) {
        require!(!self.is_paused().get(), "Protocol Paused");
    }

    // ==================
    // STORAGE
    // ==================

    #[view(getMerkleRoot)]
    #[storage_mapper("merkleRoot")]
    fn merkle_root(&self) -> SingleValueMapper<ManagedBuffer>;

    #[view(getAuthorizedKeeper)]
    #[storage_mapper("authorizedKeeper")]
    fn authorized_keeper(&self) -> SingleValueMapper<ManagedAddress>;

    #[view(getRootNonce)]
    #[storage_mapper("rootNonce")]
    fn root_nonce(&self) -> SingleValueMapper<u64>;

    #[view(isPaused)]
    #[storage_mapper("isPaused")]
    fn is_paused(&self) -> SingleValueMapper<bool>;

    // ==================
    // EVENTS
    // ==================

    #[event("rootUpdated")]
    fn root_updated_event(&self, #[indexed] new_root: &ManagedBuffer, #[indexed] nonce: u64);
}
