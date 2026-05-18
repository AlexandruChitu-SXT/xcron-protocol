use reqwest::{Client, StatusCode};
use serde::Deserialize;
use std::error::Error;
use std::sync::atomic::{AtomicUsize, Ordering};
use crate::transaction::Transaction;

#[derive(Deserialize, Debug)]
pub struct AccountResponse {
    pub data: Option<AccountData>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct AccountData {
    pub account: AccountDetails,
}

#[derive(Deserialize, Debug)]
pub struct AccountDetails {
    pub nonce: u64,
    pub balance: String,
}

#[derive(Deserialize, Debug)]
pub struct SendTxResponse {
    pub data: Option<SendTxData>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct SendTxData {
    pub txHash: String,
}

#[derive(Deserialize, Debug)]
pub struct SendTxMultipleResponse {
    pub data: Option<SendTxMultipleData>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct SendTxMultipleData {
    #[serde(rename = "txsHashes")]
    pub txs_hashes: std::collections::HashMap<String, String>,
}

pub struct MultiversXNetwork {
    pub client: Client,
    pub base_urls: Vec<String>,
    pub current_index: AtomicUsize,
}

impl MultiversXNetwork {
    pub fn new(primary_url: &str) -> Self {
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (Sauron-Bot/1.0; xcron-protocol) Rust/1.76")
            // 🛡️ XCRON-PROTECT: Ultra-Agressive Timeout (3s) for HFT. Zero tolerance for hanging RPC nodes.
            .timeout(std::time::Duration::from_secs(3))
            .pool_max_idle_per_host(1000)
            .build()
            .unwrap();

        // 🛡️ THE P2P PROXY (Anti-WAF Gateway)
        // Soporte multishard para balancear el ataque sobre todo el Sauron Swarm
        let base_urls: Vec<String> = primary_url
            .split(',')
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Self {
            client,
            base_urls,
            current_index: AtomicUsize::new(0),
        }
    }

    /// Fetches the next RPC URL using round-robin intelligently based on Shard
    fn get_url_for_shard(&self, shard: u8) -> &str {
        if self.base_urls.len() == 1 {
            return &self.base_urls[0];
        }
        
        // 🗡️ SAURON SWARM IP-TO-SHARD MAPPING
        let target_ip_snippet = match shard {
            0 => vec!["5.189", "178.156"], // CCX33 & VPS2
            1 => vec!["86.48"],            // VPS3
            2 => vec!["127.0"],            // Master Localhost (CX23)
            _ => vec!["127.0"],
        };

        let mut matching_urls = Vec::new();
        for url in &self.base_urls {
            for snippet in &target_ip_snippet {
                if url.contains(snippet) {
                    matching_urls.push(url);
                }
            }
        }
        
        let idx = self.current_index.fetch_add(1, Ordering::Relaxed);
        if matching_urls.is_empty() {
            &self.base_urls[idx % self.base_urls.len()]
        } else {
            matching_urls[idx % matching_urls.len()]
        }
    }

    /// Fetches the current exact Nonce of the wallet using RPC Triangulation (Eclipse Attack Defense)
    pub async fn fetch_nonce(&self, address: &str) -> Result<u64, Box<dyn Error>> {
        // 🛡️ XCRON-PROTECT: Vector 6 Fix - Eclipse Attack Defense
        // We ping up to 3 different nodes to prevent a malicious isolated RPC from serving a stale nonce
        let max_nodes_to_ping = std::cmp::min(self.base_urls.len(), 3);
        
        if max_nodes_to_ping <= 1 {
            // Fallback for local testing or single-node setups
            return self.fetch_nonce_single_node(address, &self.base_urls[0]).await;
        }

        let mut nonces_collected = Vec::new();
        
        for i in 0..max_nodes_to_ping {
            let base_url = &self.base_urls[(self.current_index.load(Ordering::Relaxed) + i) % self.base_urls.len()];
            if let Ok(nonce) = self.fetch_nonce_single_node(address, base_url).await {
                nonces_collected.push(nonce);
            }
        }
        
        // Consensus requirement: If we got at least 2 responses, do they agree?
        if nonces_collected.len() >= 2 {
            if nonces_collected[0] == nonces_collected[1] {
                return Ok(nonces_collected[0]);
            } else if nonces_collected.len() == 3 {
                // If 1 and 2 disagree, check if 3 agrees with either
                if nonces_collected[0] == nonces_collected[2] {
                    return Ok(nonces_collected[0]);
                } else if nonces_collected[1] == nonces_collected[2] {
                    return Ok(nonces_collected[1]);
                }
            }
            // If nodes wildly disagree (0 != 1 != 2), we are under an Eclipse/Desync Attack.
            eprintln!("🚨 [XCRON-PROTECT] Eclipse Attack Detected! RPC nodes are reporting conflicting nonces: {:?}", nonces_collected);
            return Err("Eclipse Attack or Severe Network Desync Detected. Nonce consensus failed.".into());
        } else if nonces_collected.len() == 1 {
            // Degraded state: only 1 node responded, we have to trust it.
            return Ok(nonces_collected[0]);
        }
        
        Err("All RPC nodes failed to provide a nonce.".into())
    }

    /// Internal helper to fetch nonce from a specific node
    async fn fetch_nonce_single_node(&self, address: &str, base_url: &str) -> Result<u64, Box<dyn Error>> {
        let url = format!("{}/address/{}", base_url, address);
        let resp = self.client.get(&url).send().await?;
        
        let status = resp.status();
        let body = resp.text().await?;
        
        if status != StatusCode::OK {
            return Err(format!("Failed to fetch nonce. Status: {}", status).into());
        }

        let account_resp: AccountResponse = serde_json::from_str(&body)?;
        
        if let Some(data) = account_resp.data {
            return Ok(data.account.nonce);
        } else {
            let err_msg = account_resp.error.unwrap_or_default();
            return Err(format!("API Error: {}", err_msg).into());
        }
    }

    /// 🛡️ XCRON-PROTECT: Vector 8 Fix - Supernova Finality Polling
    /// Fetches the current execution status of a transaction hash
    pub async fn fetch_tx_status(&self, tx_hash: &str) -> Result<String, Box<dyn Error>> {
        let base_url = {
            let idx = self.current_index.load(Ordering::Relaxed);
            &self.base_urls[idx % self.base_urls.len()]
        };
        
        let url = format!("{}/transaction/{}/status", base_url, tx_hash);
        let resp = self.client.get(&url).send().await?;
        
        if resp.status() != StatusCode::OK {
            return Err("Failed to fetch tx status".into());
        }
        
        #[derive(Deserialize)]
        struct StatusResponse {
            data: Option<StatusData>,
        }
        #[derive(Deserialize)]
        struct StatusData {
            status: String,
        }
        
        let body = resp.text().await?;
        let status_resp: StatusResponse = serde_json::from_str(&body)?;
        
        if let Some(data) = status_resp.data {
            Ok(data.status)
        } else {
            Err("Status not found in response".into())
        }
    }

    /// Broadcasts a signed transaction to the API via Hedged Broadcasting (Concurrent Routing)
    /// This fires the transaction to ALL available nodes simultaneously. The first one to return `200 OK` wins,
    /// guaranteeing absolute zero downtime and ultra-low latency, even if 80% of the network RPCs are offline.
    pub async fn broadcast_tx(&self, tx: &Transaction) -> Result<String, Box<dyn Error>> {
        let payload = serde_json::to_string(tx)?;
        let mut tasks = Vec::new();

        for base_url in &self.base_urls {
            let url = format!("{}/transaction/send", base_url);
            let client = self.client.clone();
            let payload_clone = payload.clone();

            let task = async move {
                let resp = client.post(&url)
                    .header("Content-Type", "application/json")
                    .body(payload_clone)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                    
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                
                if status == StatusCode::CREATED || status == StatusCode::OK {
                    let send_resp: Result<SendTxResponse, _> = serde_json::from_str(&body);
                    if let Ok(resp) = send_resp {
                        if resp.code == Some("successful".to_string()) {
                            if let Some(data) = resp.data {
                                return Ok::<String, String>(data.txHash);
                            }
                        }
                    }
                } else if body.contains("different shard ID") {
                    return Err::<String, String>("different shard ID".to_string());
                }
                
                Err::<String, String>(body)
            };
            
            tasks.push(Box::pin(task));
        }

        // 🛡️ XCRON-PROTECT: Hedged Racing - Take the first successful response and immediately cancel the others
        match futures::future::select_ok(tasks).await {
            Ok((hash, _remaining_futures)) => Ok(hash),
            Err(e) => Err(format!("Hedged Broadcast Failed on all nodes. Last Error: {}", e).into())
        }
    }

    /// Broadcasts a batch of transactions to the API via Hedged Concurrent Routing
    pub async fn broadcast_tx_batch(&self, txs: &[Transaction]) -> Result<usize, Box<dyn Error>> {
        if txs.is_empty() { return Ok(0); }
        let payload = serde_json::to_string(txs)?;
        let mut tasks = Vec::new();

        for base_url in &self.base_urls {
            let url = format!("{}/transaction/send-multiple", base_url);
            let client = self.client.clone();
            let payload_clone = payload.clone();
            
            let task = async move {
                let resp = client.post(&url)
                    .header("Content-Type", "application/json")
                    .body(payload_clone)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                    
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                
                if status == StatusCode::CREATED || status == StatusCode::OK {
                    let send_resp: Result<SendTxMultipleResponse, _> = serde_json::from_str(&body);
                    if let Ok(resp) = send_resp {
                        if resp.code == Some("successful".to_string()) {
                            if let Some(data) = resp.data {
                                return Ok::<usize, String>(data.txs_hashes.len());
                            }
                        }
                    }
                } else if body.contains("different shard ID") {
                    return Err::<usize, String>("different shard ID".to_string());
                }
                
                Err::<usize, String>(body)
            };
            
            tasks.push(Box::pin(task));
        }

        // 🛡️ Hedged Racing Batch
        match futures::future::select_ok(tasks).await {
            Ok((count, _)) => Ok(count),
            Err(e) => Err(format!("Hedged Batch Broadcast Failed. Last Error: {}", e).into())
        }
    }
}

