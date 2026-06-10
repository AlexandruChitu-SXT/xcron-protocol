/// FIPS-204 / ML-DSA (Dilithium) and ML-KEM (Kyber) Integration
/// This module isolates the Post-Quantum Cryptography logic for XSE Protocol.

use pqcrypto_kyber::kyber1024::*;
use pqcrypto_traits::kem::{Ciphertext as KemCiphertext, SecretKey as KemSecretKey, SharedSecret};
use crate::threshold_mldsa::{ThresholdMLDSASignature, verify_threshold_signature};

/// Decapsulates the ML-KEM shared secret, which is then used to decrypt the actual payload via AES-GCM.
pub fn derive_shared_secret_ml_kem(
    ciphertext_bytes: &[u8],
    secret_key_bytes: &[u8],
) -> Result<Vec<u8>, String> {
    let sk = SecretKey::from_bytes(secret_key_bytes)
        .map_err(|_| "Invalid Kyber Secret Key Format".to_string())?;
        
    let ct = Ciphertext::from_bytes(ciphertext_bytes)
        .map_err(|_| "Invalid Kyber Ciphertext Format".to_string())?;

    let shared_secret = decapsulate(&ct, &sk);
    
    Ok(shared_secret.as_bytes().to_vec())
}

/// Verifies a multi-keeper threshold post-quantum signature
pub fn verify_post_quantum_authorization_threshold(
    payload: &[u8],
    threshold_sig: &ThresholdMLDSASignature,
) -> Result<(), String> {
    verify_threshold_signature(threshold_sig, payload)
}
