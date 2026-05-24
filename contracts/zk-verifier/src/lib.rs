//! XCron ZK-Verifier Contract (Pillar C — Historical Automation)
//!
//! Verifies zero-knowledge proofs submitted by Keepers that attest to
//! historical blockchain state. This allows tasks to be triggered based
//! on conditions spanning years of blockchain history without requiring
//! expensive on-chain state queries.
//!
//! # Architecture
//!
//! Phase 1 (current): Hash-based commitment scheme (Pedersen-simplified).
//! Keepers fetch historical data off-chain, compute a commitment, and
//! submit it for verification. The verifier checks the commitment against
//! known block hashes.
//!
//! Phase 2 (future): Replace with real zk-SNARK/STARK circuits using
//! a Prover SDK (e.g., Risc0, SP1, or Plonky3).
//!
//! # Proof Flow
//!
//! 1. Keeper queries historical block data from MultiversX API
//! 2. Keeper computes: commitment = hash(block_hash || claimed_value || salt)
//! 3. Keeper submits proof to this contract
//! 4. Scheduler calls `is_proof_valid(task_id)` before executing
//! 5. If valid → task executes. If invalid → task skipped.

#![no_std]

multiversx_sc::imports!();

// ── Proof Data Type ──

use multiversx_sc::derive_imports::*;

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct ProofData<M: ManagedTypeApi> {
    /// SHA-256 commitment hash submitted by the keeper
    pub commitment: ManagedByteArray<M, 32>,
    /// Block nonce (height) that the proof references
    pub block_nonce: u64,
    /// The claimed value from the historical state
    pub claimed_value: BigUint<M>,
    /// Keeper who submitted the proof
    pub prover: ManagedAddress<M>,
    /// Timestamp when proof was submitted
    pub submitted_at: u64,
    /// Whether the proof has been verified
    pub verified: bool,
}

// ── Contract ──

#[multiversx_sc::contract]
pub trait ZkVerifierContract {
    #[init]
    fn init(&self, scheduler_addr: ManagedAddress) {
        require!(!scheduler_addr.is_zero(), "Scheduler address cannot be zero");
        self.scheduler_addr().set(&scheduler_addr);
        self.version().set(1u32);
    }

    #[upgrade]
    fn upgrade(&self) {
        self.version().update(|v| *v += 1);
    }

    // ═════════════════════════════════════════════════════════
    //  KEEPER WHITELIST
    // ═════════════════════════════════════════════════════════

    #[only_owner]
    #[endpoint(addKeeper)]
    fn add_keeper(&self, keeper: ManagedAddress) {
        self.whitelisted_keepers().insert(keeper);
    }

    #[only_owner]
    #[endpoint(removeKeeper)]
    fn remove_keeper(&self, keeper: ManagedAddress) {
        self.whitelisted_keepers().swap_remove(&keeper);
    }

    // ═════════════════════════════════════════════════════════
    //  PROOF SUBMISSION
    // ═════════════════════════════════════════════════════════

    /// Keeper submits a ZK proof (hash-based commitment) for a task.
    ///
    /// The commitment is structured to prevent hash collisions using MultiversX serialization:
    /// SHA-256(top_encode((block_hash, claimed_value, salt, prover_address)))
    /// where block_hash is the hash of the referenced historical block.
    #[payable("EGLD")]
    #[endpoint(submitProof)]
    fn submit_proof(
        &self,
        task_id: u64,
        commitment: ManagedByteArray<Self::Api, 32>,
        block_nonce: u64,
        claimed_value: BigUint,
    ) {
        let caller = self.blockchain().get_caller();
        require!(self.whitelisted_keepers().contains(&caller), "Not an authorized keeper");

        let payment = self.call_value().egld_value().clone_value();
        let min_stake = BigUint::from(10_000_000_000_000_000u64);
        require!(payment >= min_stake, "Insufficient stake for proof submission");
        let now = self
            .blockchain()
            .get_block_timestamp_seconds()
            .as_u64_seconds();

        // Prevent overwriting existing verified proofs
        if !self.proofs(task_id).is_empty() {
            let existing = self.proofs(task_id).get();
            require!(!existing.verified, "Proof already verified — cannot overwrite");
            require!(
                existing.prover == caller || now >= existing.submitted_at + 3600,
                "Proof already submitted and unverified by another prover"
            );
        }

        let proof = ProofData {
            commitment,
            block_nonce,
            claimed_value,
            prover: caller.clone(),
            submitted_at: now,
            verified: false,
        };

        self.proofs(task_id).set(&proof);
        self.proof_submitted_event(task_id, &caller, block_nonce);
    }

    // ═════════════════════════════════════════════════════════
    //  VERIFICATION
    // ═════════════════════════════════════════════════════════

    /// Verify a submitted proof against the on-chain block hash.
    ///
    /// The verifier recomputes: expected = SHA-256(top_encode((block_hash, claimed_value, salt, prover_address)))
    /// and checks it matches the submitted commitment.
    ///
    /// For Phase 1, we use a simplified verification: we trust the commitment
    /// if the block_nonce is valid and the proof was submitted by a registered keeper.
    /// Full cryptographic verification requires the Prover SDK (Phase 2).
    #[endpoint(verifyProof)]
    fn verify_proof(&self, task_id: u64, salt: ManagedBuffer) {
        let caller = self.blockchain().get_caller();
        require!(self.whitelisted_keepers().contains(&caller), "Not an authorized keeper");

        require!(!self.proofs(task_id).is_empty(), "No proof submitted");
        let mut proof = self.proofs(task_id).get();
        require!(!proof.verified, "Already verified");

        // Verify that the block hash is registered
        let block_nonce = proof.block_nonce;
        let block_hash_mapper = self.block_hashes(block_nonce);
        require!(!block_hash_mapper.is_empty(), "Block hash not registered");
        let block_hash = block_hash_mapper.get();

        // Recompute commitment using structured serialization to prevent hash collisions.
        // The nested encode adds length prefixes for dynamic types (BigUint, ManagedBuffer).
        let mut hash_input = ManagedBuffer::new();
        let _ = (block_hash, &proof.claimed_value, &salt, &proof.prover).top_encode(&mut hash_input);

        let computed_hash = self.crypto().sha256(&hash_input);

        require!(
            computed_hash == proof.commitment,
            "ZK verification failed: commitment mismatch"
        );

        proof.verified = true;
        self.proofs(task_id).set(&proof);
        self.proof_verified_event(task_id, true);
    }

    /// Admin endpoint to register a trusted block hash for a given block nonce.
    #[only_owner]
    #[endpoint(registerBlockHash)]
    fn register_block_hash(&self, block_nonce: u64, hash: ManagedByteArray<Self::Api, 32>) {
        self.block_hashes(block_nonce).set(&hash);
    }

    // ═════════════════════════════════════════════════════════
    //  QUERY ENDPOINTS
    // ═════════════════════════════════════════════════════════

    /// Check if a keeper is authorized.
    #[view(isKeeperWhitelisted)]
    fn is_keeper_whitelisted(&self, keeper: ManagedAddress) -> bool {
        self.whitelisted_keepers().contains(&keeper)
    }

    /// Check if a proof for a task is valid (used by Scheduler before execution).
    #[view(isProofValid)]
    fn is_proof_valid(&self, task_id: u64) -> bool {
        if self.proofs(task_id).is_empty() {
            return false;
        }
        self.proofs(task_id).get().verified
    }

    /// Get the full proof data for a task.
    #[view(getProof)]
    fn get_proof(&self, task_id: u64) -> ProofData<Self::Api> {
        require!(!self.proofs(task_id).is_empty(), "No proof found");
        self.proofs(task_id).get()
    }

    // ═════════════════════════════════════════════════════════
    //  STORAGE
    // ═════════════════════════════════════════════════════════

    #[storage_mapper("whitelisted_keepers")]
    fn whitelisted_keepers(&self) -> UnorderedSetMapper<ManagedAddress>;

    #[storage_mapper("proofs")]
    fn proofs(&self, task_id: u64) -> SingleValueMapper<ProofData<Self::Api>>;

    #[storage_mapper("blockHashes")]
    fn block_hashes(&self, block_nonce: u64) -> SingleValueMapper<ManagedByteArray<Self::Api, 32>>;

    #[storage_mapper("schedulerAddr")]
    fn scheduler_addr(&self) -> SingleValueMapper<ManagedAddress>;

    #[storage_mapper("version")]
    fn version(&self) -> SingleValueMapper<u32>;

    // ═════════════════════════════════════════════════════════
    //  EVENTS
    // ═════════════════════════════════════════════════════════

    #[event("proof_submitted")]
    fn proof_submitted_event(
        &self,
        #[indexed] task_id: u64,
        #[indexed] prover: &ManagedAddress,
        block_nonce: u64,
    );

    #[event("proof_verified")]
    fn proof_verified_event(
        &self,
        #[indexed] task_id: u64,
        valid: bool,
    );
}
