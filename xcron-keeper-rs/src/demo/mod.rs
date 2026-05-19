use reqwest::Client;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::task;

// Configuración de la "Artillería"
const WALLET_COUNT: usize = 500;
const TXS_PER_WALLET: usize = 100; // El límite exacto de pending en la mempool
const SHARDS: [&str; 3] = [
  "https://testnet-api.multiversx.com", // Aquí meteríamos una lista de 50 RPCs distintos reales
  "https://testnet-api.multiversx.com",
  "https://testnet-api.multiversx.com",
];

// Estructura simulada de una Wallet
#[derive(Clone)]
struct DemoWallet {
  id: usize,
  address: String,
  current_nonce: u64,
}

pub async fn run_tps_demo() {
  println!(" Iniciando XCron Tokio TPS Demo ");
  println!("Preparando {} Wallets concurrentes...", WALLET_COUNT);

  let client = Arc::new(Client::new());
  let mut wallets = Vec::new();

  for i in 0..WALLET_COUNT {
    wallets.push(DemoWallet {
      id: i,
      address: format!("erd1demo_wallet_{:04}", i),
      current_nonce: 0,
    });
  }

  println!(" Lanzando Enjambre Asíncrono...");
  let start_time = Instant::now();
  let mut tasks = Vec::new();

  // El poder de Rust: Levantamos 500 Hilos Verdes (Tasks) simultáneos
  for mut wallet in wallets {
    let client_clone = Arc::clone(&client);
    
    let task = tokio::spawn(async move {
      let mut wallet_successes = 0;
      // Cada hilo dispara una metralleta de 100 Txs asíncronas
      for i in 0..TXS_PER_WALLET {
        // Aquí construiríamos y firmaríamos la transacción real
        // rx_hash = sign_tx(&wallet.private_key, nonce);
        
        // Rotador simple de Observers/RPC para saltar el Rate Limit
        let _rpc_url = SHARDS[wallet.id % SHARDS.len()];
        
        // Simulación asíncrona del envío HTTP sin bloqueo (Non-blocking I/O)
        // client_clone.post(rpc_url).json(&blob).send().await...
        
        // Simulación de latencia de red ultrarrápida (1-2 ms en AWS)
        tokio::time::sleep(Duration::from_millis(1)).await;
        
        wallet.current_nonce += 1;
        wallet_successes += 1;
      }
      wallet_successes
    });
    tasks.push(task);
  }

  // Esperar a que el Poliducto termine
  let mut total_txs = 0;
  for task in tasks {
    if let Ok(successes) = task.await {
      total_txs += successes;
    }
  }

  let elapsed = start_time.elapsed();
  let tps = (total_txs as f64) / elapsed.as_secs_f64();

  println!("======================================");
  println!(" DEMO COMPLETADA");
  println!("️ Tiempo Transcurrido: {:?}", elapsed);
  println!(" Transacciones Emitidas: {}", total_txs);
  println!(" Rendimiento Local: {:.2} TPS", tps);
  println!("======================================");
}
