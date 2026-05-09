/// FIPS-204 / ML-DSA (Dilithium) Quantum Signature Verification
/// This module isolates the Post-Quantum Cryptography logic for XSE Protocol.

use pqcrypto_dilithium::dilithium2::{verify_detached_signature, PublicKey, DetachedSignature};
use pqcrypto_traits::sign::{PublicKey as TraitPubKey, DetachedSignature as TraitSig};

pub fn verify_post_quantum_authorization(payload: &[u8], signature_bytes: &[u8], pubkey_bytes: &[u8]) -> Result<(), String> {
    // 🛡️ XCRON-PROTECT: Real FIPS-204 (ML-DSA-44 / Dilithium2) implementation
    let pk = PublicKey::from_bytes(pubkey_bytes)
        .map_err(|_| "Invalid Dilithium2 Public Key Format".to_string())?;
        
    let sig = DetachedSignature::from_bytes(signature_bytes)
        .map_err(|_| "Invalid Dilithium2 Signature Format".to_string())?;

    match verify_detached_signature(&sig, payload, &pk) {
        Ok(_) => Ok(()),
        Err(_) => Err("FATAL: Quantum Authorization Failed. FIPS-204 Signature Verification Invalid.".to_string())
    }
}
