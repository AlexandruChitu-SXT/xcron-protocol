//! XCron ZK-Verifier Contract (Pillar C — Historical Automation)
//!
//! Verifies zero-knowledge proofs submitted by Keepers that attest to
//! historical blockchain state. This allows tasks to be triggered based
//! on conditions spanning years of blockchain history without requiring
//! expensive on-chain state queries.

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
    fn init(&self, scheduler_addr: ManagedAddress, pcr0: ManagedByteArray<Self::Api, 32>) {
        require!(!scheduler_addr.is_zero(), "Scheduler address cannot be zero");
        require!(!pcr0.is_empty(), "PCR0 cannot be empty");
        self.scheduler_addr().set(&scheduler_addr);
        self.authorized_pcr0().set(&pcr0);
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
    #[payable("EGLD")]
    #[endpoint(submitProof)]
    fn submit_proof(
        &self,
        task_hash: ManagedByteArray<Self::Api, 32>,
        commitment: ManagedByteArray<Self::Api, 32>,
        block_nonce: u64,
        claimed_value: BigUint,
    ) {
        let caller = self.blockchain().get_caller();
        require!(self.whitelisted_keepers().contains(&caller), "Not an authorized keeper");

        let payment = self.call_value().egld_value().clone_value();
        let min_stake = BigUint::from(10_000_000_000_000_000u64);
        require!(payment >= min_stake, "Insufficient stake for proof submission");
        let now = common::time::get_safe_block_timestamp(&self.blockchain());

        // Prevent overwriting existing verified proofs
        if !self.proofs(&task_hash).is_empty() {
            let existing = self.proofs(&task_hash).get();
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

        self.proofs(&task_hash).set(&proof);
        self.proof_submitted_event(task_hash.clone(), &caller, block_nonce);
    }

    // ═════════════════════════════════════════════════════════
    //  VERIFICATION
    // ═════════════════════════════════════════════════════════

    /// Verify a submitted Ed25519 signature from an authorized Nitro Enclave (Phase 2 / v2.7 Hardened).
    ///
    /// Recomputes: expected_binding_hash = SHA-256(task_hash || ephemeral_pubkey || authorized_pcr0)
    /// and verifies the Ed25519 signature against this statement.
    #[endpoint(verifyProof)]
    fn verify_proof(
        &self,
        task_hash: ManagedByteArray<Self::Api, 32>,
        zk_proof: ManagedBuffer, // This is treated as the 64-byte Ed25519 signature from the Enclave
        ephemeral_pubkey: ManagedByteArray<Self::Api, 32>,
    ) -> bool {
        let caller = self.blockchain().get_caller();
        require!(self.whitelisted_keepers().contains(&caller), "Not an authorized keeper");

        // Validar que la clave efímera del enclave esté registrada y autorizada en L1
        require!(
            self.authorized_enclave_keys(&ephemeral_pubkey).get(),
            "XSE: Ephemeral enclave key is not authorized in L1 registry"
        );

        // Reconstruye el binding hash esperado en L1: SHA-256(task_hash || ephemeral_pubkey || authorized_pcr0)
        let expected_pcr0 = self.authorized_pcr0().get();
        // ERR-11 Fix: Validar que PCR0 no esté vacío
        require!(!expected_pcr0.is_empty(), "PCR0 not initialized by governance");

        let mut hash_input = ManagedBuffer::new();
        let _ = (&task_hash, &ephemeral_pubkey, &expected_pcr0).top_encode(&mut hash_input);
        
        let expected_binding_hash = self.crypto().sha256(&hash_input);

        // Verifica la firma Ed25519 generada por el Enclave Nitro atestado.
        // Panics si es inválida, revirtiendo la transacción de forma segura en L1.
        self.crypto().verify_ed25519(
            &ephemeral_pubkey.as_managed_buffer(),
            &expected_binding_hash.as_managed_buffer(),
            &zk_proof,
        );

        // ERR-10 Fix: Guardar el estado verificado para que is_proof_valid devuelva true
        if !self.proofs(&task_hash).is_empty() {
            let mut proof = self.proofs(&task_hash).get();
            proof.verified = true;
            self.proofs(&task_hash).set(&proof);
        }

        self.proof_verified_event(task_hash, true); // Log event
        true
    }

    /// Admin endpoint to register a trusted block hash for a given block nonce.
    #[only_owner]
    #[endpoint(registerBlockHash)]
    fn register_block_hash(&self, block_nonce: u64, hash: ManagedByteArray<Self::Api, 32>) {
        self.block_hashes(block_nonce).set(&hash);
    }

    /// Admin endpoint to set the authorized PCR0 of the Nitro Enclave (Governance controlled).
    #[only_owner]
    #[endpoint(setAuthorizedPcr0)]
    fn set_authorized_pcr0(&self, pcr0: ManagedByteArray<Self::Api, 32>) {
        self.authorized_pcr0().set(&pcr0);
    }

    /// Register a trusted ephemeral enclave key (Admin only).
    #[only_owner]
    #[endpoint(registerEnclaveKey)]
    fn register_enclave_key(&self, ephemeral_pubkey: ManagedByteArray<Self::Api, 32>) {
        self.authorized_enclave_keys(&ephemeral_pubkey).set(true);
    }

    /// Revoke an ephemeral enclave key (Admin only).
    #[only_owner]
    #[endpoint(revokeEnclaveKey)]
    fn revoke_enclave_key(&self, ephemeral_pubkey: ManagedByteArray<Self::Api, 32>) {
        self.authorized_enclave_keys(&ephemeral_pubkey).clear();
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
    fn is_proof_valid(&self, task_hash: ManagedByteArray<Self::Api, 32>) -> bool {
        if self.proofs(&task_hash).is_empty() {
            return false;
        }
        self.proofs(&task_hash).get().verified
    }

    /// Get the full proof data for a task.
    #[view(getProof)]
    fn get_proof(&self, task_hash: ManagedByteArray<Self::Api, 32>) -> ProofData<Self::Api> {
        require!(!self.proofs(&task_hash).is_empty(), "No proof found");
        self.proofs(&task_hash).get()
    }

    // ═════════════════════════════════════════════════════════
    //  STORAGE
    // ═════════════════════════════════════════════════════════

    #[storage_mapper("whitelisted_keepers")]
    fn whitelisted_keepers(&self) -> UnorderedSetMapper<ManagedAddress>;

    #[storage_mapper("proofs")]
    fn proofs(&self, task_hash: &ManagedByteArray<Self::Api, 32>) -> SingleValueMapper<ProofData<Self::Api>>;

    #[storage_mapper("blockHashes")]
    fn block_hashes(&self, block_nonce: u64) -> SingleValueMapper<ManagedByteArray<Self::Api, 32>>;

    #[storage_mapper("authorizedPcr0")]
    fn authorized_pcr0(&self) -> SingleValueMapper<ManagedByteArray<Self::Api, 32>>;

    #[storage_mapper("authorizedEnclaveKeys")]
    fn authorized_enclave_keys(&self, ephemeral_pubkey: &ManagedByteArray<Self::Api, 32>) -> SingleValueMapper<bool>;

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
        #[indexed] task_hash: ManagedByteArray<Self::Api, 32>,
        #[indexed] prover: &ManagedAddress,
        block_nonce: u64,
    );

    #[event("proof_verified")]
    fn proof_verified_event(
        &self,
        #[indexed] task_hash: ManagedByteArray<Self::Api, 32>,
        valid: bool,
    );
}
