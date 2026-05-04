use serde::Deserialize;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use reqwest::Client;
use std::collections::HashSet;

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MempoolTransaction {
    pub hash: String,
    pub sender: String,
    pub receiver: String,
    #[serde(default)]
    pub data: String, // base64 encoded
    #[serde(alias = "gasprice")]
    pub gas_price: u64,
}

#[derive(Debug, Deserialize)]
struct TxPoolData {
    #[serde(rename = "regularTransactions")]
    pub regular_transactions: Option<Vec<MempoolTxWrapper>>,
}

#[derive(Debug, Deserialize)]
struct MempoolTxWrapper {
    #[serde(rename = "txFields")]
    pub tx_fields: Option<MempoolTransaction>,
}

#[derive(Debug, Deserialize)]
struct PoolResponseData {
    #[serde(rename = "txPool")]
    pub tx_pool: Option<TxPoolData>,
}

#[derive(Debug, Deserialize)]
struct ObserverPoolResponse {
    pub data: Option<PoolResponseData>,
    pub code: String,
}

#[derive(Clone)]
pub struct VictimDetected {
    pub victim_hash: String,
    pub gas_price: u64,
    pub pair_address: String,
}

pub async fn start_mempool_sniper(observer_url: String, target_dex: String, tx: mpsc::Sender<VictimDetected>) {
    let client = Client::builder().user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .timeout(Duration::from_millis(500))
        .build()
        .expect("Failed to build reqwest client");

    let url = format!("{}/transaction/pool?fields=hash,sender,receiver,data,gasprice", observer_url);
    // 🛡️ SECURITY PATCH: 3-Phase Rolling Buffer (Zero Gap Memory)
    let mut hash_set_0: HashSet<String> = HashSet::with_capacity(15_000);
    let mut hash_set_1: HashSet<String> = HashSet::with_capacity(15_000);
    let mut hash_set_2: HashSet<String> = HashSet::with_capacity(15_000);

    println!("📡 [Mempool Sniper] ACTIVATED on {}", observer_url);

    loop {
        match client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(pool_response) = response.json::<ObserverPoolResponse>().await {
                        if let Some(data) = pool_response.data {
                            if let Some(pool) = data.tx_pool {
                                if let Some(txs) = pool.regular_transactions {
                                    for wrapper in txs {
                                        let raw_tx = wrapper.tx_fields.unwrap_or_else(|| {
                                            MempoolTransaction {
                                                hash: "".to_string(),
                                                sender: "".to_string(),
                                                receiver: "".to_string(),
                                                data: "".to_string(),
                                                gas_price: 0,
                                            }
                                        });

                                        if raw_tx.hash.is_empty() {
                                            continue;
                                        }

                                        if !hash_set_0.contains(&raw_tx.hash) && !hash_set_1.contains(&raw_tx.hash) && !hash_set_2.contains(&raw_tx.hash) {
                                            hash_set_0.insert(raw_tx.hash.clone());

                                            // Evitar memory leak (Rotación segura en 3 fases sin GAP de memoria)
                                            if hash_set_0.len() > 10_000 {
                                                hash_set_2 = std::mem::take(&mut hash_set_1);
                                                hash_set_1 = std::mem::take(&mut hash_set_0);
                                            }

                                            analyze_target(&raw_tx, &target_dex, &tx).await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else if response.status().as_u16() == 429 {
                    println!("⚠️ [RATE LIMIT] Cloudflare bloqueó el poll: 429 Too Many Requests");
                    sleep(Duration::from_secs(5)).await; // 🛡️ SECURITY PATCH: Exponential Backoff para no ser baneado
                } else {
                    println!("⚠️ [HTTP ERROR] {}", response.status());
                }
            }
            Err(e) => {
                println!("⚠️ [REQ ERROR] {}", e);
            }
        }
        sleep(Duration::from_millis(400)).await; // 400ms poll to survive Public API Rate Limits
    }
}

async fn analyze_target(tx_data: &MempoolTransaction, target_dex: &str, tx: &mpsc::Sender<VictimDetected>) {
    // Filtro 1: Destino es xExchange
    if tx_data.receiver != target_dex {
        return;
    }

    // Filtro 2: Decodificar base64
    if tx_data.data.is_empty() {
        return;
    }

    if let Ok(decoded_bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &tx_data.data) {
        if let Ok(decoded_str) = String::from_utf8(decoded_bytes) {
            // Filtro 3: Validar ESDTTransfer y el hex de swapTokensFixedInput (73776170546f6b656e734669786564496e707574)
            if decoded_str.starts_with("ESDTTransfer@") && decoded_str.contains("73776170546f6b656e734669786564496e707574") {
                // Filtro 4: Extraer la cantidad transferida para asegurar que sea >= 5 Tokens Reales (EGLD o USDC)
                // Usualmente el payload es: ESDTTransfer@[TokenID_Hex]@[Amount_Hex]@swapTokens...
                let parts: Vec<&str> = decoded_str.split('@').collect();
                if parts.len() >= 3 {
                    let amount_hex = parts[2];
                    if let Some(amount_wei) = num_bigint::BigUint::parse_bytes(amount_hex.as_bytes(), 16) {
                        let threshold = num_bigint::BigUint::parse_bytes(b"4563918244F40000", 16).unwrap_or_default(); // 5 * 10^18 en Hex 

                        if amount_wei >= threshold {
                            println!("🐋 [GRAN COMPRA DETECTADA] Hash: {} | GasPrice: {} | Cantidad: Hex({})", tx_data.hash, tx_data.gas_price, amount_hex);
                            
                            let detection = VictimDetected {
                                victim_hash: tx_data.hash.clone(),
                                gas_price: tx_data.gas_price,
                                pair_address: target_dex.to_string(),
                            };

                            let _ = tx.send(detection).await;
                        } else {
                            println!("🐟 [Pesca Pequeña Ignorada] Hash: {} | Cantidad Hex: {}", tx_data.hash, amount_hex);
                        }
                    }
                }
            }
        }
    }
}
