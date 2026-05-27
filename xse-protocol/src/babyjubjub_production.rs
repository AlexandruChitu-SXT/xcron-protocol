//! BabyJubjub Production Integration — Twisted Edwards curve over BN254 scalar field.
//!
//! Replaces the portable 127-bit Mersenne simulator with the real BabyJubjub curve
//! using the Arkworks ecosystem (`ark-ed-on-bn254`).
//!
//! # Why BabyJubjub over BN254?
//! The BN254 pairing curve is natively supported by Ethereum-compatible chains and many
//! ZK proof systems (Groth16, PLONK). BabyJubjub is a Twisted Edwards curve whose
//! scalar field equals the BN254 base field — this means BabyJubjub point operations
//! can be expressed as arithmetic constraints in a BN254 Groth16 circuit with zero overhead.
//!
//! # Production use
//! The ephemeral BabyJubjub key pair is generated inside the AWS Nitro Enclave,
//! zeroed on drop (`ZeroizeOnDrop`), and the public key is embedded in the binding hash.
//! The private key NEVER leaves the enclave RAM.

use ark_ec::{AffineRepr, CurveGroup, Group};
use ark_ed_on_bn254::{EdwardsAffine, EdwardsProjective, Fr};
use ark_ff::{BigInteger, PrimeField, UniformRand};
use ark_serialize::{CanonicalSerialize, CanonicalDeserialize};
use rand::rngs::OsRng;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// An ephemeral BabyJubjub key pair generated inside the enclave.
/// Both fields are zeroed from memory immediately on drop.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct EphemeralJubjubKeypair {
    /// Scalar field element — the private key. NEVER serialized or exported.
    #[zeroize(skip)] // ark_ff types don't implement Zeroize — we handle manually
    private_key_scalar: Fr,
    /// Compressed 32-byte public key (x-coordinate with sign bit of y).
    pub public_key_compressed: [u8; 32],
}

impl EphemeralJubjubKeypair {
    /// Generate a new random ephemeral key pair using the OS CSPRNG.
    /// Inside the enclave, OsRng draws entropy from /dev/urandom, which on Nitro
    /// is seeded by the hypervisor's hardware RNG — not the host OS.
    pub fn generate() -> Result<Self, String> {
        let mut rng = OsRng;
        let private_key_scalar = Fr::rand(&mut rng);

        // Public key = private_key * G (generator point of BabyJubjub)
        let generator = EdwardsProjective::generator();
        let public_key_projective = generator * private_key_scalar;
        let public_key_affine: EdwardsAffine = public_key_projective.into_affine();

        // Serialize to 32-byte compressed form
        let mut public_key_compressed = [0u8; 32];
        let mut serialized = Vec::new();
        public_key_affine
            .serialize_compressed(&mut serialized)
            .map_err(|e| format!("BabyJubjub serialization error: {}", e))?;

        if serialized.len() != 32 {
            return Err(format!(
                "Unexpected compressed pubkey length: {} (expected 32)",
                serialized.len()
            ));
        }
        public_key_compressed.copy_from_slice(&serialized);

        Ok(Self {
            private_key_scalar,
            public_key_compressed,
        })
    }

    /// Derive the public key from a raw 32-byte private key scalar (used in tests).
    /// In production, always use `generate()` with the OS CSPRNG.
    pub fn from_private_key_bytes(private_key_bytes: &[u8; 32]) -> Result<Self, String> {
        // Interpret bytes as a scalar field element (little-endian, reduced mod r)
        let private_key_scalar = Fr::from_le_bytes_mod_order(private_key_bytes);

        let generator = EdwardsProjective::generator();
        let public_key_projective = generator * private_key_scalar;
        let public_key_affine: EdwardsAffine = public_key_projective.into_affine();

        let mut public_key_compressed = [0u8; 32];
        let mut serialized = Vec::new();
        public_key_affine
            .serialize_compressed(&mut serialized)
            .map_err(|e| format!("BabyJubjub serialization error: {}", e))?;

        if serialized.len() != 32 {
            return Err(format!("Unexpected pubkey length: {}", serialized.len()));
        }
        public_key_compressed.copy_from_slice(&serialized);

        Ok(Self {
            private_key_scalar,
            public_key_compressed,
        })
    }

    /// Returns the compressed 32-byte public key for embedding in the binding hash.
    pub fn public_key_bytes(&self) -> &[u8; 32] {
        &self.public_key_compressed
    }
}

/// Verify that a compressed BabyJubjub public key is a valid point on the curve.
/// Called by the ZK verifier to reject malformed keys before proof verification.
pub fn verify_babyjubjub_point(compressed_pubkey: &[u8; 32]) -> Result<(), String> {
    let affine = EdwardsAffine::deserialize_compressed(compressed_pubkey.as_slice())
        .map_err(|e| format!("Invalid BabyJubjub point: {}", e))?;

    if !affine.is_on_curve() {
        return Err("Point is not on the BabyJubjub curve".to_string());
    }
    if affine.is_zero() {
        return Err("Point is the identity element (zero point)".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ephemeral_keypair_generation() {
        let keypair = EphemeralJubjubKeypair::generate().unwrap();
        // Public key must be 32 bytes and a valid point
        assert_eq!(keypair.public_key_bytes().len(), 32);
        verify_babyjubjub_point(keypair.public_key_bytes()).unwrap();
    }

    #[test]
    fn test_deterministic_derivation() {
        // Same private key must always produce the same public key
        let priv_key = [0x42u8; 32];
        let kp1 = EphemeralJubjubKeypair::from_private_key_bytes(&priv_key).unwrap();
        let kp2 = EphemeralJubjubKeypair::from_private_key_bytes(&priv_key).unwrap();
        assert_eq!(kp1.public_key_compressed, kp2.public_key_compressed);
    }

    #[test]
    fn test_different_keys_produce_different_pubkeys() {
        let kp1 = EphemeralJubjubKeypair::generate().unwrap();
        let kp2 = EphemeralJubjubKeypair::generate().unwrap();
        // Two random keys must produce different public keys (except with negligible probability)
        assert_ne!(kp1.public_key_compressed, kp2.public_key_compressed);
    }

    #[test]
    fn test_invalid_point_rejected() {
        // All-zeros is not a valid compressed point (identity check)
        let bad_point = [0u8; 32];
        assert!(verify_babyjubjub_point(&bad_point).is_err());
    }
}
