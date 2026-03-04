//! ZK Prover (Pillar C — Historical Automation)
//!
//! Off-chain proof generator for the keeper. Fetches historical block data,
//! computes SHA-256 commitments, and submits/verifies proofs to the
//! ZK-Verifier contract on-chain.
//!
//! Phase 1: SHA-256 commitment scheme (simplified Pedersen).
//! Phase 2: Real zk-SNARK circuits via Risc0/SP1/Plonky3.

use crate::types::VmQueryResponse;

use rand::RngCore;
use sha2::{Digest, Sha256};
use tracing::{info, debug};

// ── Types ──

/// A generated historical proof ready for on-chain submission.
#[derive(Debug, Clone)]
pub struct HistoricalProof {
    /// SHA-256 commitment: hash(block_nonce_be || value_be_len || value_be || salt)
    pub commitment: Vec<u8>,
    /// Block nonce (height)
    pub block_nonce: u64,
    /// Claimed historical value
    pub claimed_value: u64,
    /// Random salt (32 bytes) — needed for on-chain verification
    pub salt: Vec<u8>,
    /// Timestamp of generation
    pub generated_at: String,
}

/// ZK contract addresses.
#[derive(Debug, Clone)]
pub struct ZkConfig {
    pub zk_verifier: String,
    pub scheduler: String,
}

// ── ZK Prover ──

pub struct ZkProver {
    api_url: String,
    gateway_url: String,
    zk_config: ZkConfig,
    keeper_address: String,
    private_key: Vec<u8>,
    #[allow(dead_code)]
    public_key: Vec<u8>,
    http_client: reqwest::Client,
    chain_id: String,
}

impl ZkProver {
    pub fn new(
        api_url: &str,
        gateway_url: &str,
        zk_config: ZkConfig,
        keeper_address: &str,
        private_key: Vec<u8>,
        public_key: Vec<u8>,
    ) -> Self {
        let chain_id = if gateway_url.contains("testnet") {
            "T".to_string()
        } else if gateway_url.contains("devnet") {
            "D".to_string()
        } else {
            "1".to_string()
        };

        info!("🧮 ZK Prover initialized");

        Self {
            api_url: api_url.to_string(),
            gateway_url: gateway_url.to_string(),
            zk_config,
            keeper_address: keeper_address.to_string(),
            private_key,
            public_key,
            http_client: reqwest::Client::new(),
            chain_id,
        }
    }

    /// Generate a historical proof for a specific block.
    ///
    /// Commitment = SHA-256(block_nonce_be_8 || value_len_be_4 || value_be || salt_32)
    pub async fn generate_proof(
        &self,
        block_nonce: u64,
        claimed_value: u64,
    ) -> Result<HistoricalProof, String> {
        info!("🧮 Generating proof for block #{}...", block_nonce);

        // Verify the block exists (best-effort)
        let url = format!("{}/blocks?nonce={}&shard=0", self.api_url, block_nonce);
        match self.http_client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!("Block #{} verified on-chain", block_nonce);
            }
            _ => {
                debug!("Block #{} verification skipped (non-critical)", block_nonce);
            }
        }

        // Generate salt
        let mut salt = vec![0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut salt);

        // Compute commitment
        let commitment = Self::compute_commitment(block_nonce, claimed_value, &salt);

        info!(
            "🧮 Proof generated: commitment={}...",
            hex::encode(&commitment[..8])
        );

        Ok(HistoricalProof {
            commitment,
            block_nonce,
            claimed_value,
            salt,
            generated_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    /// Submit a proof to the ZK-Verifier contract on-chain.
    pub async fn submit_proof(
        &mut self,
        task_id: u64,
        proof: &HistoricalProof,
    ) -> Result<String, String> {
        info!("🧮 Submitting proof for task #{}...", task_id);

        let nonce = self.get_nonce().await?;

        // Build data: submitProof@taskId@commitment@blockNonce@claimedValue
        let task_hex = Self::u64_to_hex(task_id);
        let commitment_hex = hex::encode(&proof.commitment);
        let block_hex = Self::u64_to_hex(proof.block_nonce);
        let value_hex = Self::u64_to_hex(proof.claimed_value);

        let data_field = format!(
            "submitProof@{}@{}@{}@{}",
            task_hex, commitment_hex, block_hex, value_hex
        );

        let tx_hash = self
            .send_transaction(&self.zk_config.zk_verifier.clone(), &data_field, nonce, 15_000_000)
            .await?;

        info!("🧮 Proof submitted: {}", tx_hash);
        Ok(tx_hash)
    }

    /// Request on-chain verification of a submitted proof.
    pub async fn request_verification(
        &mut self,
        task_id: u64,
        salt: &[u8],
    ) -> Result<String, String> {
        info!("🧮 Requesting verification for task #{}...", task_id);

        let nonce = self.get_nonce().await?;
        let task_hex = Self::u64_to_hex(task_id);
        let salt_hex = hex::encode(salt);

        let data_field = format!("verifyProof@{}@{}", task_hex, salt_hex);

        let tx_hash = self
            .send_transaction(&self.zk_config.zk_verifier.clone(), &data_field, nonce, 20_000_000)
            .await?;

        info!("🧮 Verification requested: {}", tx_hash);
        Ok(tx_hash)
    }

    /// Query whether a proof has been verified on-chain.
    pub async fn is_proof_valid(&self, task_id: u64) -> bool {
        let task_hex = Self::u64_to_hex(task_id);
        let args = vec![task_hex];

        let url = format!("{}/vm-values/query", self.gateway_url);
        let body = serde_json::json!({
            "scAddress": self.zk_config.zk_verifier,
            "funcName": "isProofValid",
            "args": args,
        });

        match self.http_client.post(&url).json(&body).send().await {
            Ok(resp) => {
                if let Ok(data) = resp.json::<VmQueryResponse>().await {
                    if let Some(d) = data.data {
                        if let Some(d2) = d.data {
                            if let Some(return_data) = d2.return_data {
                                if let Some(first) = return_data.first() {
                                    if let Ok(bytes) = base64::Engine::decode(
                                        &base64::engine::general_purpose::STANDARD,
                                        first,
                                    ) {
                                        return bytes.first().copied() == Some(1);
                                    }
                                }
                            }
                        }
                    }
                }
                false
            }
            Err(_) => false,
        }
    }

    // ── Internal ──

    /// Compute commitment matching the on-chain verifyProof logic exactly:
    /// SHA-256(block_nonce_be_8 || value_len_be_4 || value_be || salt)
    fn compute_commitment(block_nonce: u64, value: u64, salt: &[u8]) -> Vec<u8> {
        let nonce_bytes = block_nonce.to_be_bytes(); // 8 bytes

        // BigUint big-endian encoding (matching MultiversX)
        let mut value_hex = format!("{:x}", value);
        if value_hex.len() % 2 != 0 {
            value_hex = format!("0{}", value_hex);
        }
        let value_bytes = hex::decode(&value_hex).unwrap_or_default();

        // Length prefix (4 bytes BE) — matches ManagedBuffer concat
        let value_len = (value_bytes.len() as u32).to_be_bytes();

        let mut hasher = Sha256::new();
        hasher.update(&nonce_bytes);
        hasher.update(&value_len);
        hasher.update(&value_bytes);
        hasher.update(salt);

        hasher.finalize().to_vec()
    }

    fn u64_to_hex(n: u64) -> String {
        let hex = format!("{:x}", n);
        if hex.len() % 2 != 0 {
            format!("0{}", hex)
        } else {
            hex
        }
    }

    async fn get_nonce(&self) -> Result<u64, String> {
        let url = format!(
            "{}/address/{}/nonce",
            self.gateway_url, self.keeper_address
        );
        let resp = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Nonce HTTP: {}", e))?;
        let data: serde_json::Value =
            resp.json().await.map_err(|e| format!("Nonce JSON: {}", e))?;
        data["data"]["nonce"]
            .as_u64()
            .ok_or_else(|| "Cannot parse nonce".into())
    }

    async fn send_transaction(
        &self,
        receiver: &str,
        data_field: &str,
        nonce: u64,
        gas_limit: u64,
    ) -> Result<String, String> {
        let data_b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            data_field.as_bytes(),
        );

        let sign_payload = format!(
            r#"{{"nonce":{},"value":"0","receiver":"{}","sender":"{}","gasPrice":1000000000,"gasLimit":{},"data":"{}","chainID":"{}","version":2}}"#,
            nonce, receiver, self.keeper_address, gas_limit, data_b64, self.chain_id,
        );

        let signature = self.sign(sign_payload.as_bytes())?;
        let sig_hex = hex::encode(&signature);

        let broadcast_json = serde_json::json!({
            "nonce": nonce,
            "value": "0",
            "receiver": receiver,
            "sender": self.keeper_address,
            "gasPrice": 1_000_000_000u64,
            "gasLimit": gas_limit,
            "data": data_b64,
            "chainID": self.chain_id,
            "version": 2,
            "signature": sig_hex,
        });

        let url = format!("{}/transaction/send", self.gateway_url);
        let resp = self
            .http_client
            .post(&url)
            .json(&broadcast_json)
            .send()
            .await
            .map_err(|e| format!("Broadcast: {}", e))?;

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Broadcast JSON: {}", e))?;

        data["data"]["txHash"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| {
                let err = data["error"]
                    .as_str()
                    .or(data["message"].as_str())
                    .unwrap_or("Unknown");
                format!("Broadcast failed: {}", err)
            })
    }

    fn sign(&self, message: &[u8]) -> Result<Vec<u8>, String> {
        use ed25519_dalek::{SigningKey, Signer};
        let secret: [u8; 32] = self
            .private_key
            .as_slice()
            .try_into()
            .map_err(|_| "Invalid key length")?;
        let signing_key = SigningKey::from_bytes(&secret);
        Ok(signing_key.sign(message).to_bytes().to_vec())
    }
}

use base64;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commitment_deterministic() {
        let salt = [0u8; 32];
        let c1 = ZkProver::compute_commitment(12345, 1_000_000, &salt);
        let c2 = ZkProver::compute_commitment(12345, 1_000_000, &salt);
        assert_eq!(c1, c2);
    }

    #[test]
    fn different_inputs_different_commitments() {
        let salt = [0u8; 32];
        let c1 = ZkProver::compute_commitment(12345, 1_000_000, &salt);
        let c2 = ZkProver::compute_commitment(12345, 2_000_000, &salt);
        assert_ne!(c1, c2);
    }

    #[test]
    fn different_salt_different_commitments() {
        let salt1 = [0u8; 32];
        let salt2 = [1u8; 32];
        let c1 = ZkProver::compute_commitment(12345, 1_000_000, &salt1);
        let c2 = ZkProver::compute_commitment(12345, 1_000_000, &salt2);
        assert_ne!(c1, c2);
    }
}
