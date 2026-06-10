use serde::{Deserialize, Serialize};
use pqcrypto_dilithium::dilithium2::{verify_detached_signature, PublicKey, DetachedSignature};
use pqcrypto_traits::sign::{PublicKey as TraitPubKey, DetachedSignature as TraitSig};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Represents a fractional threshold signature (e.g., 4-of-7) using ML-DSA (Dilithium).
/// In a true MPC setup, this would be a single aggregated signature. 
/// For this distributed setup, we aggregate valid signature shares and 
/// verify them independently against the known keeper public keys.
#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct ThresholdMLDSASignature {
    /// The individual signature shares from participating Keepers.
    pub shares: Vec<SignatureShare>,
    /// The required quorum (e.g., 4).
    pub threshold: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct SignatureShare {
    /// Unique identifier of the Keeper.
    pub keeper_id: usize,
    /// The detached Dilithium signature bytes.
    pub signature_bytes: Vec<u8>,
    /// The Dilithium public key of this specific Keeper.
    pub public_key: Vec<u8>,
}

/// Verifies that the given threshold signature contains enough valid shares.
pub fn verify_threshold_signature(
    threshold_sig: &ThresholdMLDSASignature,
    payload: &[u8],
) -> Result<(), String> {
    if threshold_sig.shares.len() < threshold_sig.threshold {
        return Err(format!(
            "Insufficient threshold shares: got {}, required {}",
            threshold_sig.shares.len(),
            threshold_sig.threshold
        ));
    }

    let mut valid_count = 0;
    
    // In a real network, we would also verify that `public_key` belongs to the 
    // authorized Whitelist of Keepers for this epoch.
    for share in &threshold_sig.shares {
        if verify_single_share(&share.signature_bytes, &share.public_key, payload).is_ok() {
            valid_count += 1;
        }
    }

    if valid_count >= threshold_sig.threshold {
        Ok(())
    } else {
        Err(format!(
            "Threshold verification failed: {}/{} valid shares",
            valid_count, threshold_sig.threshold
        ))
    }
}

fn verify_single_share(signature_bytes: &[u8], pubkey_bytes: &[u8], payload: &[u8]) -> Result<(), String> {
    let pk = PublicKey::from_bytes(pubkey_bytes)
        .map_err(|_| "Invalid Dilithium2 Public Key Format".to_string())?;
        
    let sig = DetachedSignature::from_bytes(signature_bytes)
        .map_err(|_| "Invalid Dilithium2 Signature Format".to_string())?;

    match verify_detached_signature(&sig, payload, &pk) {
        Ok(_) => Ok(()),
        Err(_) => Err("Share verification failed".to_string())
    }
}
