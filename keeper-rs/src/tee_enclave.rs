//! TEE Enclave Simulator (Pillar B — Confidential Automation)
//!
//! Simulates a Trusted Execution Environment for anti-MEV task protection.
//! Tasks marked `confidential` have their conditions encrypted so mempool
//! observers cannot front-run execution.
//!
//! Crypto stack:
//!   - AES-256-GCM for authenticated encryption
//!   - HKDF-SHA256 for key derivation
//!   - HMAC-SHA256 for attestation signatures
//!
//! Production upgrade path: Intel SGX via Gramine or AWS Nitro Enclaves.
//! The API is designed as a drop-in replacement.

use aes_gcm::{
    aead::Aead,
    Aes256Gcm, Nonce, KeyInit,
};
use hkdf::Hkdf;
use hmac::Hmac;
use rand::{RngCore, rngs::OsRng};
use sha2::Sha256;
use tracing::info;

type HmacSha256 = Hmac<Sha256>;

// ── Types ──

/// Encrypted payload produced by `seal()`.
#[derive(Debug, Clone)]
pub struct SealedPayload {
    /// AES-256-GCM nonce (12 bytes)
    pub iv: Vec<u8>,
    /// Encrypted data
    pub ciphertext: Vec<u8>,
    /// Key derivation salt (32 bytes)
    pub salt: Vec<u8>,
}

/// Attestation report proving correct execution inside the enclave.
#[derive(Debug, Clone)]
pub struct AttestationReport {
    /// Unique enclave instance identifier
    pub enclave_id: String,
    /// ISO timestamp
    pub timestamp: String,
    /// SHA-256 hash of inputs
    pub input_hash: String,
    /// SHA-256 hash of outputs
    pub output_hash: String,
    /// HMAC-SHA256 signature (simulated SGX quote)
    pub signature: String,
}

/// Result of a confidential execution.
#[derive(Debug)]
pub struct ConfidentialResult {
    pub success: bool,
    pub attestation: AttestationReport,
    pub decrypted_metadata: Option<String>,
    pub error: Option<String>,
}

// ── TEE Enclave ──

pub struct TeeEnclave {
    enclave_id: String,
    enclave_key: [u8; 32],
}

impl TeeEnclave {
    /// Create a new enclave derived from the keeper's private key.
    pub fn new(keeper_private_key: &[u8]) -> Self {
        // Derive enclave ID
        use sha2::Digest;
        let id_input = format!(
            "xcron-tee-enclave-{}",
            hex::encode(&keeper_private_key[..8.min(keeper_private_key.len())])
        );
        let id_hash = sha2::Sha256::digest(id_input.as_bytes());
        let enclave_id = hex::encode(&id_hash[..8]);

        // Derive enclave master key via HKDF
        let hk = Hkdf::<Sha256>::new(Some(b"xcron-tee-v1"), keeper_private_key);
        let mut enclave_key = [0u8; 32];
        hk.expand(b"enclave-master", &mut enclave_key)
            .expect("HKDF expand failed");

        info!("🔒 TEE Enclave initialized: {}", enclave_id);

        Self {
            enclave_id,
            enclave_key,
        }
    }

    /// Seal (encrypt) task metadata. Called client-side before scheduling.
    pub fn seal(&self, plaintext: &str) -> SealedPayload {
        let mut salt = [0u8; 32];
        OsRng.fill_bytes(&mut salt);

        let task_key = self.derive_task_key(&salt);

        let cipher = Aes256Gcm::new_from_slice(&task_key).expect("AES key init");
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .expect("AES-GCM encryption failed");

        SealedPayload {
            iv: nonce_bytes.to_vec(),
            ciphertext,
            salt: salt.to_vec(),
        }
    }

    /// Unseal (decrypt) task metadata inside the enclave.
    pub fn unseal(&self, sealed: &SealedPayload) -> Result<String, String> {
        let task_key = self.derive_task_key(&sealed.salt);

        let cipher =
            Aes256Gcm::new_from_slice(&task_key).map_err(|e| format!("AES key: {}", e))?;
        let nonce = Nonce::from_slice(&sealed.iv);

        let plaintext = cipher
            .decrypt(nonce, sealed.ciphertext.as_ref())
            .map_err(|e| format!("AES-GCM decrypt: {}", e))?;

        String::from_utf8(plaintext).map_err(|e| format!("UTF-8: {}", e))
    }

    /// Execute a task inside the simulated enclave with attestation.
    pub async fn execute_confidential<F, Fut>(
        &self,
        task_id: u64,
        sealed_metadata: Option<&SealedPayload>,
        execution_fn: F,
    ) -> ConfidentialResult
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = bool>,
    {
        let timestamp = chrono::Utc::now().to_rfc3339();
        info!(
            "🔒 [Enclave {}] Processing task #{} in secure context",
            self.enclave_id, task_id
        );

        // Step 1: Unseal metadata
        let decrypted = sealed_metadata.map(|s| self.unseal(s));
        let decrypted_metadata = match decrypted {
            Some(Ok(text)) => {
                info!(
                    "🔒 [Enclave] Task #{} metadata decrypted ({} bytes)",
                    task_id,
                    text.len()
                );
                Some(text)
            }
            Some(Err(e)) => {
                return ConfidentialResult {
                    success: false,
                    attestation: self.generate_attestation(
                        &task_id.to_string(),
                        "decryption-failed",
                        &timestamp,
                    ),
                    decrypted_metadata: None,
                    error: Some(format!("Metadata decryption failed: {}", e)),
                };
            }
            None => None,
        };

        // Step 2: Execute
        let exec_success = execution_fn().await;
        let output_hash = {
            use sha2::Digest;
            let input = format!("result:{}:{}:{}", exec_success, task_id, timestamp);
            hex::encode(sha2::Sha256::digest(input.as_bytes()))
        };

        // Step 3: Attestation
        let attestation =
            self.generate_attestation(&task_id.to_string(), &output_hash, &timestamp);
        info!(
            "🔒 [Enclave] Task #{} attestation: {}...",
            task_id,
            &attestation.signature[..16]
        );

        ConfidentialResult {
            success: exec_success,
            attestation,
            decrypted_metadata,
            error: None,
        }
    }

    /// Get enclave ID for telemetry.
    pub fn enclave_id(&self) -> &str {
        &self.enclave_id
    }

    // ── Internal ──

    fn derive_task_key(&self, salt: &[u8]) -> [u8; 32] {
        let hk = Hkdf::<Sha256>::new(Some(salt), &self.enclave_key);
        let mut key = [0u8; 32];
        hk.expand(b"task-seal", &mut key)
            .expect("HKDF task key expand");
        key
    }

    fn generate_attestation(
        &self,
        input_data: &str,
        output_data: &str,
        timestamp: &str,
    ) -> AttestationReport {
        use sha2::Digest;

        let input_hash = hex::encode(sha2::Sha256::digest(input_data.as_bytes()));
        let output_hash = hex::encode(sha2::Sha256::digest(output_data.as_bytes()));

        // Simulated SGX quote: HMAC of report body
        let report_body = format!(
            "{}:{}:{}:{}",
            self.enclave_id, timestamp, input_hash, output_hash
        );
        let mut mac = <HmacSha256 as hmac::Mac>::new_from_slice(&self.enclave_key)
            .expect("HMAC key");
        hmac::Mac::update(&mut mac, report_body.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        AttestationReport {
            enclave_id: self.enclave_id.clone(),
            timestamp: timestamp.to_string(),
            input_hash,
            output_hash,
            signature,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_unseal_roundtrip() {
        let key = [42u8; 32];
        let enclave = TeeEnclave::new(&key);

        let plaintext = "confidential task metadata: swap 1000 EGLD when price > $50";
        let sealed = enclave.seal(plaintext);
        let decrypted = enclave.unseal(&sealed).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = [42u8; 32];
        let key2 = [99u8; 32];
        let enclave1 = TeeEnclave::new(&key1);
        let enclave2 = TeeEnclave::new(&key2);

        let sealed = enclave1.seal("secret data");
        let result = enclave2.unseal(&sealed);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn confidential_execution() {
        let key = [42u8; 32];
        let enclave = TeeEnclave::new(&key);

        let sealed = enclave.seal("execute when EGLD > $50");
        let result = enclave
            .execute_confidential(1, Some(&sealed), || async { true })
            .await;

        assert!(result.success);
        assert!(result.decrypted_metadata.is_some());
        assert!(!result.attestation.signature.is_empty());
    }
}
