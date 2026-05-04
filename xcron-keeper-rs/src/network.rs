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

pub struct MultiversXNetwork {
    pub client: Client,
    pub base_urls: Vec<String>,
    pub current_index: AtomicUsize,
}

impl MultiversXNetwork {
    pub fn new(primary_url: &str) -> Self {
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (Sauron-Bot/1.0; xcron-protocol) Rust/1.76")
            .timeout(std::time::Duration::from_secs(15))
            .pool_max_idle_per_host(500)
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

    /// Fetches the current exact Nonce of the wallet from the network
    pub async fn fetch_nonce(&self, address: &str) -> Result<u64, Box<dyn Error>> {
        // For nonce fetch, we can use any node since the network is basically synced
        let base_url = {
            let idx = self.current_index.fetch_add(1, Ordering::Relaxed);
            &self.base_urls[idx % self.base_urls.len()]
        };
        let url = format!("{}/address/{}", base_url, address);
        let resp = self.client.get(&url).send().await?;
        
        let status = resp.status();
        let body = resp.text().await?;
        
        if status != StatusCode::OK {
            let short_addr = if address.len() > 20 { &address[..20] } else { address };
            eprintln!("[NONCE] FAIL for {}: status={}", short_addr, status);
            return Err(format!("Failed to fetch nonce. Status: {}, Body: {}", status, body).into());
        }

        let account_resp: AccountResponse = serde_json::from_str(&body)?;
        
        if account_resp.data.is_none() {
            let err_msg = account_resp.error.unwrap_or_default();
            let short_addr = if address.len() > 20 { &address[..20] } else { address };
            eprintln!("[NONCE] No data for {}: error={}", short_addr, err_msg);
            return Err(format!("API Error: {}", err_msg).into());
        }

        let nonce = account_resp.data.unwrap().account.nonce;
        Ok(nonce)
    }

    /// Broadcasts a signed transaction to the API via Bruteforce Routing
    pub async fn broadcast_tx(&self, tx: &Transaction) -> Result<String, Box<dyn Error>> {
        let payload = serde_json::to_string(tx)?;
        let mut last_error = String::from("No nodes available");

        for base_url in &self.base_urls {
            let url = format!("{}/transaction/send", base_url);
            
            let resp = match self.client.post(&url)
                .header("Content-Type", "application/json")
                .body(payload.clone())
                .send()
                .await {
                    Ok(r) => r,
                    Err(e) => {
                        last_error = e.to_string();
                        continue; // Intentar el siguiente nodo si hay error de red
                    }
                };
                
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            
            if status == StatusCode::CREATED || status == StatusCode::OK {
                let send_resp: Result<SendTxResponse, _> = serde_json::from_str(&body);
                if let Ok(resp) = send_resp {
                    if resp.code == Some("successful".to_string()) && resp.data.is_some() {
                        let hash = resp.data.unwrap().txHash;
                        // println!("🚀 BOOM! Payload Aceptado. Hash: {}", hash);
                        return Ok(hash);
                    }
                }
            } else if body.contains("different shard ID") {
                // Nodo equivocado, intentar el siguiente en la lista silenciosamente
                last_error = "different shard ID".to_string();
                continue;
            } else {
                // Posible error de payload, nonce o fee. Registrarlo.
                last_error = body;
                // Si es un error real de ejecución, no tiene sentido enviarlo a otro shard (a menos que sea invalid nonce por desync)
                // Pero por robustez, intentemos todos.
            }
        }

        // Si todos fallaron, imprimimos el último error
        // println!("🔥 DEVNET REJECTION ALL SHARDS: {}", last_error);
        Err(format!("Broadcast Failed on all shards: {}", last_error).into())
    }

    /// Broadcasts a batch of transactions to the API via /transaction/send-multiple
    /// This resolves the Web2 Proxy Bottleneck by sending up to 100 txs per HTTP request.
    pub async fn broadcast_tx_batch(&self, txs: &[Transaction]) -> Result<usize, Box<dyn Error>> {
        if txs.is_empty() { return Ok(0); }
        let payload = serde_json::to_string(txs)?;
        let mut last_error = String::from("No nodes available");

        for base_url in &self.base_urls {
            let url = format!("{}/transaction/send-multiple", base_url);
            
            let resp = match self.client.post(&url)
                .header("Content-Type", "application/json")
                .body(payload.clone())
                .send()
                .await {
                    Ok(r) => r,
                    Err(e) => {
                        last_error = e.to_string();
                        continue;
                    }
                };
                
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            
            if status == StatusCode::CREATED || status == StatusCode::OK {
                // MultiversX returns {"data":{"numOfSentTxs": 100},"error":"","code":"successful"}
                if body.contains("\"successful\"") {
                    return Ok(txs.len());
                } else {
                    last_error = body;
                }
            } else if body.contains("different shard ID") {
                last_error = "different shard ID".to_string();
                continue;
            } else {
                last_error = body;
            }
        }

        Err(format!("Batch Broadcast Failed: {}", last_error).into())
    }
}

