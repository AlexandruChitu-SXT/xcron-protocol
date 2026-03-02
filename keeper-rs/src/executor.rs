//! TaskExecutor — signs and broadcasts executeTask transactions.
//!
//! Uses Ed25519 signing directly (no MultiversX SDK dependency for off-chain signing).

use crate::types::ExecutionResult;

use tracing::{info, debug};
use std::time::Duration;
use tokio::time::sleep;

pub struct TaskExecutor {
    gateway_url: String,
    api_url: String,
    scheduler_address: String,
    keeper_address: String,
    private_key: Vec<u8>,
    #[allow(dead_code)]
    public_key: Vec<u8>,
    http_client: reqwest::Client,
    chain_id: String,
    /// M-4: Local nonce counter to avoid race conditions on rapid execution
    last_used_nonce: Option<u64>,
}

impl TaskExecutor {
    pub fn new(
        gateway_url: String,
        api_url: String,
        scheduler_address: String,
        keeper_address: String,
        private_key: Vec<u8>,
        public_key: Vec<u8>,
    ) -> Self {
        // Detect chain ID from gateway URL
        let chain_id = if gateway_url.contains("testnet") {
            "T".to_string()
        } else if gateway_url.contains("devnet") {
            "D".to_string()
        } else {
            "1".to_string()
        };

        Self {
            gateway_url,
            api_url,
            scheduler_address,
            keeper_address,
            private_key,
            public_key,
            http_client: reqwest::Client::new(),
            chain_id,
            last_used_nonce: None,
        }
    }

    /// Execute a task by sending an executeTask transaction.
    pub async fn execute_task(&mut self, task_id: u64) -> Result<ExecutionResult, String> {
        // M-5: Check balance before attempting execution
        self.check_balance().await?;

        // M-4: Use local nonce counter to avoid race conditions
        let nonce = self.get_next_nonce().await?;
        debug!("Keeper nonce: {}", nonce);

        // 2. Build the transaction data field
        let task_id_hex = format!("{:x}", task_id);
        let task_id_hex = if task_id_hex.len() % 2 != 0 {
            format!("0{}", task_id_hex)
        } else {
            task_id_hex
        };
        let data_field = format!("executeTask@{}", task_id_hex);
        let gas_limit: u64 = 300_000_000;

        // 3. Encode data field to base64
        let data_b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            data_field.as_bytes(),
        );

        // 4. Build the JSON string for signing in EXACT MultiversX field order:
        //    nonce → value → receiver → sender → gasPrice → gasLimit → data → chainID → version
        //    NO indentation, NO spaces, NO signature field.
        let sign_payload = format!(
            r#"{{"nonce":{},"value":"0","receiver":"{}","sender":"{}","gasPrice":1000000000,"gasLimit":{},"data":"{}","chainID":"{}","version":2}}"#,
            nonce,
            self.scheduler_address,
            self.keeper_address,
            gas_limit,
            data_b64,
            self.chain_id,
        );
        debug!("Sign payload: {}", sign_payload);

        // 5. Sign with Ed25519
        let signature = self.sign(sign_payload.as_bytes())?;
        let sig_hex = hex::encode(&signature);

        // 6. Build final tx JSON for broadcast (with signature)
        let broadcast_json = serde_json::json!({
            "nonce": nonce,
            "value": "0",
            "receiver": self.scheduler_address,
            "sender": self.keeper_address,
            "gasPrice": 1_000_000_000u64,
            "gasLimit": gas_limit,
            "data": data_b64,
            "chainID": self.chain_id,
            "version": 2,
            "signature": sig_hex,
        });

        // 7. Broadcast
        let tx_hash = self.broadcast_transaction(&broadcast_json).await?;
        info!("📡 TX broadcast: {}", tx_hash);

        // 8. Wait for confirmation
        let result = self.wait_for_completion(&tx_hash, 60).await;

        Ok(ExecutionResult {
            task_id,
            success: result.0,
            tx_hash: Some(tx_hash),
            error: result.1,
        })
    }

    /// M-4: Get next nonce using local counter to prevent race conditions.
    /// Fetches from chain on first call, then increments locally.
    async fn get_next_nonce(&mut self) -> Result<u64, String> {
        let nonce = match self.last_used_nonce {
            Some(last) => last + 1,
            None => self.get_account_nonce().await?,
        };
        self.last_used_nonce = Some(nonce);
        Ok(nonce)
    }

    /// Reset nonce counter (call after a confirmed TX failure to re-sync).
    pub fn reset_nonce(&mut self) {
        self.last_used_nonce = None;
    }

    /// Get the current nonce of the keeper account from the network.
    async fn get_account_nonce(&self) -> Result<u64, String> {
        let url = format!(
            "{}/address/{}/nonce",
            self.gateway_url, self.keeper_address
        );

        let resp = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("JSON error: {}", e))?;

        data["data"]["nonce"]
            .as_u64()
            .ok_or_else(|| "Cannot parse nonce".to_string())
    }

    /// M-5: Verify keeper has sufficient EGLD balance before attempting execution.
    /// Minimum required: 0.01 EGLD (10^16 atomic units) to cover gas fees.
    async fn check_balance(&self) -> Result<(), String> {
        let url = format!(
            "{}/address/{}/balance",
            self.gateway_url, self.keeper_address
        );

        let resp = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Balance check HTTP error: {}", e))?;

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Balance check JSON error: {}", e))?;

        let balance_str = data["data"]["balance"]
            .as_str()
            .unwrap_or("0");

        let balance: u128 = balance_str.parse().unwrap_or(0);
        // Minimum 0.01 EGLD = 10^16 atomic units
        const MIN_BALANCE: u128 = 10_000_000_000_000_000;

        if balance < MIN_BALANCE {
            return Err(format!(
                "Insufficient keeper balance: {} (minimum 0.01 EGLD required)",
                balance_str
            ));
        }

        Ok(())
    }
    /// Sign a message with Ed25519.
    fn sign(&self, message: &[u8]) -> Result<Vec<u8>, String> {
        use ed25519_dalek::{SigningKey, Signer};

        let secret_bytes: [u8; 32] = self.private_key
            .as_slice()
            .try_into()
            .map_err(|_| "Invalid private key length")?;

        let signing_key = SigningKey::from_bytes(&secret_bytes);
        let signature = signing_key.sign(message);

        Ok(signature.to_bytes().to_vec())
    }

    /// Broadcast a signed transaction to the network.
    async fn broadcast_transaction(
        &self,
        tx: &serde_json::Value,
    ) -> Result<String, String> {
        let url = format!("{}/transaction/send", self.gateway_url);

        let resp = self.http_client
            .post(&url)
            .json(tx)
            .send()
            .await
            .map_err(|e| format!("Broadcast error: {}", e))?;

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("JSON error: {}", e))?;

        if let Some(hash) = data["data"]["txHash"].as_str() {
            Ok(hash.to_string())
        } else {
            let err_msg = data["error"]
                .as_str()
                .or(data["message"].as_str())
                .unwrap_or("Unknown broadcast error");
            Err(format!("Broadcast failed: {}", err_msg))
        }
    }

    /// Wait for transaction completion (polling).
    async fn wait_for_completion(
        &self,
        tx_hash: &str,
        timeout_secs: u64,
    ) -> (bool, Option<String>) {
        let url = format!("{}/transactions/{}", self.api_url, tx_hash);
        let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);

        loop {
            if std::time::Instant::now() > deadline {
                return (false, Some("Timeout waiting for confirmation".into()));
            }

            sleep(Duration::from_secs(6)).await;

            let resp = match self.http_client.get(&url).send().await {
                Ok(r) => r,
                Err(_) => continue,
            };

            let data: serde_json::Value = match resp.json().await {
                Ok(d) => d,
                Err(_) => continue,
            };

            let status = data["status"].as_str().unwrap_or("pending");

            match status {
                "success" => {
                    // Check if there were internal VM errors
                    let has_errors = data["logs"]["events"]
                        .as_array()
                        .map(|events| {
                            events.iter().any(|e| {
                                e["identifier"].as_str() == Some("internalVMErrors")
                            })
                        })
                        .unwrap_or(false);

                    if has_errors {
                        return (false, Some("Transaction success but callback failed (internalVMErrors)".into()));
                    }
                    return (true, None);
                }
                "fail" | "invalid" => {
                    let msg = data["logs"]["events"]
                        .as_array()
                        .and_then(|events| {
                            events.iter().find_map(|e| {
                                if e["identifier"].as_str() == Some("signalError") {
                                    e["topics"].as_array().and_then(|topics| {
                                        topics.get(1).and_then(|t| t.as_str()).map(|s| {
                                            String::from_utf8(
                                                base64::Engine::decode(
                                                    &base64::engine::general_purpose::STANDARD,
                                                    s,
                                                ).unwrap_or_default()
                                            ).unwrap_or_default()
                                        })
                                    })
                                } else {
                                    None
                                }
                            })
                        })
                        .unwrap_or_else(|| "Transaction failed".into());

                    return (false, Some(msg));
                }
                _ => {
                    // Still pending, continue polling
                    debug!("TX {} status: {}", tx_hash, status);
                }
            }
        }
    }
}

use base64;
