use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tokio::time::{sleep, Duration};
use serde_json::Value;

#[derive(Clone, Debug)]
pub struct ArbitrageOpportunity {
    pub victim_hash: String,
    pub gas_price: u64,
    pub target_dex: String,
    pub amount_in_hex: String,
}

pub async fn start_websocket_sniper(
    _http_url: String, 
    _target_dexes: HashSet<String>, 
    tx_sender: mpsc::Sender<ArbitrageOpportunity>
) {
    // Enchufe Vena Yugular: Conexión P2P Distribuida a los 4 Nodos Observadores del Enjambre (Zero Ping)
    let nodes = vec![
        ("P2P BEAST [Metachain]", "http://127.0.0.1:8080/transaction/pool"),     // Nodo Master Local
        ("P2P BEAST [Shard-0]", "http://46.225.131.70:8080/transaction/pool"),   // Servidor Contabo 2
        ("P2P BEAST [Shard-1]", "http://86.48.1.161:8080/transaction/pool"),     // Servidor Contabo 3
        ("P2P BEAST [Shard-2]", "http://45.94.58.152:8080/transaction/pool")     // Servidor Contabo 4
    ];

    println!("⚡ [HFT Global Poller] Quad-Core Engine Activated!");
    
    // Shared state to avoid duplicate triggers across shards (current, mid, old)
    // 🛡️ SECURITY PATCH: 3-Phase Buffer (Zero Gap Memory)
    let global_seen_hashes = Arc::new(Mutex::new((
        HashSet::with_capacity(25_000), 
        HashSet::with_capacity(25_000), 
        HashSet::with_capacity(25_000)
    )));

    for (node_name, pool_url) in nodes {
        let sender_clone = tx_sender.clone();
        let name_clone = node_name.to_string();
        let url_clone = pool_url.to_string();
        let hashes_clone = global_seen_hashes.clone();

        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .pool_idle_timeout(Duration::from_secs(120))
                .pool_max_idle_per_host(100)
                .build()
                .expect("Error creando cliente HTTP Quad-Core");

            let mut poll_count: u64 = 0;
            let mut total_swaps_found: u64 = 0;

            loop {
                poll_count += 1;

                match client.get(&url_clone).send().await {
                    Ok(response) => {
                        if let Ok(json) = response.text().await {
                            if let Ok(parsed) = serde_json::from_str::<Value>(&json) {
                                // Soporte para P2P Observers (Estructura anidada) o Fallback API (Array Plano)
                                let txs_array = if let Some(arr) = parsed.as_array() {
                                    Some(arr)
                                } else if let Some(pool) = parsed.get("data").and_then(|d| d.get("txPool")).and_then(|p| p.get("regularTransactions")) {
                                    pool.as_array()
                                } else {
                                    None
                                };

                                if let Some(txs_array) = txs_array {
                                    for tx in txs_array {
                                        let hash = tx.get("hash").or_else(|| tx.get("txHash")).and_then(|v| v.as_str()).unwrap_or("");
                                            if hash.is_empty() { continue; }

                                            // Filtro de duplicados (Lock ultra rápido para coordinar Shards)
                                            {
                                                let mut lock = hashes_clone.lock().await;
                                                if lock.0.contains(hash) || lock.1.contains(hash) || lock.2.contains(hash) {
                                                    continue;
                                                }
                                                lock.0.insert(hash.to_string());
                                                if lock.0.len() > 20_000 {
                                                    // 🛡️ SECURITY PATCH: Rotación en 3 fases sin re-disparo (Zero GAP)
                                                    lock.2 = std::mem::take(&mut lock.1);
                                                    lock.1 = std::mem::take(&mut lock.0);
                                                }
                                            }

                                            let receiver = tx.get("receiver").and_then(|v| v.as_str()).unwrap_or("");
                                            let raw_data = tx.get("data").and_then(|v| v.as_str()).unwrap_or("");
                                            let gas_price = tx.get("gasPrice").and_then(|v| v.as_u64()).unwrap_or(0);

                                            if raw_data.is_empty() { continue; }

                                            // Los Observer Nodes ya devuelven la data decodificada en UTF-8 si es legible,
                                            // pero en Base64 si tiene bytes raros. MultiversX envía en base64 cuando hay caracteres nulos.
                                            let decoded = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, raw_data) {
                                                Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
                                                Err(_) => raw_data.to_string(), // Si no es base64, usar en raw
                                            };

                                            let is_swap = decoded.contains("73776170546f6b656e734669786564496e707574") // swapTokensFixedInput
                                                || decoded.contains("73776170546f6b656e7346697865644f7574707574") // swapTokensFixedOutput
                                                || decoded.contains("swapTokensFixedInput");

                                            let is_xcron_intent = decoded.contains("6372656174654d756c7469496e707574") // createMultiIntent
                                                || decoded.contains("createMultiIntent")
                                                || decoded.contains("createIntent");

                                            if is_swap || is_xcron_intent {
                                                // 🛡️ XCRON-PROTECT: Anti-Spam Filter
                                                // Ignorar transacciones con GasPrice ridículo (posible DoS)
                                                if gas_price < 1_000_000_000 {
                                                    continue;
                                                }

                                                total_swaps_found += 1;

                                                let mut amount_info = if is_xcron_intent { "XCRON_INTENT".to_string() } else { "omni_swap".to_string() };
                                                let parts: Vec<&str> = decoded.split('@').collect();
                                                if parts.len() >= 3 {
                                                    amount_info = format!("payload_raw={}", decoded);
                                                }

                                                // Radar Global: No discriminamos, enviamos el objetivo al Cerebro.
                                                println!("🌐 [{}] {} Detectada | Hash: {}...{} | Target: {}...",
                                                    if is_xcron_intent { "INTENT" } else { "SWAP" },
                                                    name_clone,
                                                    &hash[..8.min(hash.len())], 
                                                    &hash[hash.len().saturating_sub(4)..],
                                                    &receiver[..16.min(receiver.len())]
                                                );

                                                let opp = ArbitrageOpportunity {
                                                    victim_hash: hash.to_string(),
                                                    gas_price,
                                                    target_dex: receiver.to_string(),
                                                    amount_in_hex: amount_info,
                                                };

                                                // 🛡️ XCRON-PROTECT: Atomic Handoff
                                                // Si el canal está lleno, no bloqueamos el hilo de escaneo P2P.
                                                // Los ataques de "Channel Clogging" se mitigan con try_send.
                                                let _ = sender_clone.try_send(opp);
                                            }
                                    }
                                }
                             }
                         }
                    }
                    Err(_) => {
                        // 🛡️ XCRON-PROTECT: Stealth Reconnect
                        // Si un nodo falla, esperamos un tiempo aleatorio para evitar "Thundering Herd"
                        sleep(Duration::from_millis(500)).await;
                    }
                }
                
                // Tiroteo de alta frecuencia pura: 10 milisegundos de delay
                sleep(Duration::from_millis(10)).await;
                
                if poll_count % 100 == 0 {
                    println!("📡 [{}] Mempool Scanned | Swaps/Intents en Radar: {}", name_clone, total_swaps_found);
                }
            }
        });
    }

    // Keep the main thread alive since we spawned tokio tasks
    loop {
        sleep(Duration::from_secs(60)).await;
    }
}
