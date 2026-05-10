#![no_std]

multiversx_sc::imports!();

/// XCron State Compression (XSC) Core Contract
/// This is the production-ready implementation of a Merkle Tree state root verifier
/// to enable cNFTs and Compressed State for AI Agents on MultiversX.
#[multiversx_sc::contract]
pub trait XscCore {
    #[init]
    fn init(&self, authorized_keeper: ManagedAddress) {
        self.authorized_keeper().set(&authorized_keeper);
        
        // Initialize an empty root (32 bytes of zeros)
        let empty_root = ManagedBuffer::new_from_bytes(&[0u8; 32]);
        self.merkle_root().set(&empty_root);
    }

    // ==================
    // ENDPOINTS (WRITE)
    // ==================

    /// Updates the Merkle Root. Only the authorized XCron Keeper can call this.
    /// This happens when off-chain cNFTs are minted, burned, or updated.
    #[endpoint(updateRoot)]
    fn update_root(&self, new_root: ManagedBuffer) {
        let caller = self.blockchain().get_caller();
        require!(
            caller == self.authorized_keeper().get(),
            "Only the authorized XCron Keeper can update the state root"
        );
        require!(new_root.len() == 32, "Merkle Root must be exactly 32 bytes");

        self.merkle_root().set(&new_root);
        
        // Emit an event so indexers know the state has been compressed and updated
        self.root_updated_event(&new_root);
    }

    /// Allows the owner to change the authorized Keeper server
    #[endpoint(setAuthorizedKeeper)]
    #[only_owner]
    fn set_authorized_keeper(&self, new_keeper: ManagedAddress) {
        self.authorized_keeper().set(&new_keeper);
    }

    // ==================
    // VIEWS (READ/VERIFY)
    // ==================

    /// The core cryptography function.
    /// Verifies if a specific `leaf` (e.g., a cNFT hash) exists in the current Merkle Tree.
    /// Used by other Smart Contracts to validate ownership before acting.
    #[view(verifyProof)]
    fn verify_proof(&self, leaf: ManagedBuffer, proof: MultiValueEncoded<ManagedBuffer>) -> bool {
        let current_root = self.merkle_root().get();
        let mut computed_hash = leaf;

        for sibling in proof.into_iter() {
            require!(sibling.len() == 32, "Invalid proof sibling length");
            computed_hash = self.hash_pair(computed_hash, sibling);
        }

        computed_hash == current_root
    }

    // ==================
    // INTERNAL CRYPTO LOGIC
    // ==================

    /// Sorts two hashes and concatenates them to compute the parent hash.
    /// Sorting prevents the need to pass left/right directions in the proof.
    fn hash_pair(&self, a: ManagedBuffer, b: ManagedBuffer) -> ManagedBuffer {
        let mut concat = ManagedBuffer::new();
        
        // Lexicographical sorting
        if self.is_less_than(&a, &b) {
            concat.append(&a);
            concat.append(&b);
        } else {
            concat.append(&b);
            concat.append(&a);
        }

        self.crypto().sha256(&concat).as_managed_buffer().clone()
    }

    /// Helper to compare two ManagedBuffers lexicographically
    fn is_less_than(&self, a: &ManagedBuffer, b: &ManagedBuffer) -> bool {
        let a_bytes = a.to_boxed_bytes();
        let b_bytes = b.to_boxed_bytes();
        let a_slice = a_bytes.as_slice();
        let b_slice = b_bytes.as_slice();
        
        for i in 0..32 {
            if a_slice[i] < b_slice[i] {
                return true;
            } else if a_slice[i] > b_slice[i] {
                return false;
            }
        }
        false
    }

    // ==================
    // STORAGE MAPPERS
    // ==================

    #[view(getMerkleRoot)]
    #[storage_mapper("merkleRoot")]
    fn merkle_root(&self) -> SingleValueMapper<ManagedBuffer>;

    #[view(getAuthorizedKeeper)]
    #[storage_mapper("authorizedKeeper")]
    fn authorized_keeper(&self) -> SingleValueMapper<ManagedAddress>;

    // ==================
    // EVENTS
    // ==================

    #[event("rootUpdated")]
    fn root_updated_event(&self, #[indexed] new_root: &ManagedBuffer);
}
