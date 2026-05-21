//! # XCron Testnet E2E — 4 Scheduling Transactions
//!
//! Lanza exactamente 4 TXs sobre el testnet de MultiversX:
//!
//! 1. scheduleQuantumTask — INTRA-SHARD  (e2e_keeper shard3 → scheduler shard3, target ping shard3)
//! 2. scheduleQuantumTask — CROSS-SHARD  (e2e_keeper shard3 → scheduler shard3, target deployer-ping shard0)
//! 3. scheduleTask (legacy) — INTRA-SHARD  (e2e_user shard0 → scheduler shard3, target ping shard3)
//! 4. scheduleTask (legacy) — CROSS-SHARD  (e2e_user shard0 → scheduler shard3, target deployer-ping shard0)
//!
//! ## Codificación MultiversX ABI (TopEncode)
//!
//! `scheduleQuantumTask` toma un único argumento: Task serializado como TopEncode.
//! `scheduleTask` (legacy path) toma 7+ args sueltos vía MultiValueEncoded.
//!
//! Ambos endpoints son `#[payable("EGLD")]` y requieren un deposit ≥ min_deposit.
//!
//! ## Shard topology (testnet actual)
//! ```
//! Scheduler : erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263  shard 3
//! e2e_keeper: erd1ur2rauzj0lytvdmzgtaspz6m30sr2v2u3mr99er7wmwhnauadffscxgpfj  shard 3
//! e2e_user  : erd1sp9lge3qk80qmvf2qectnluugtzfrd46mmgpps20yqy0tdrk3e6q47qm7m  shard 0
//! deployer  : erd1yd8zy8tf8sjs4h5jgx7qc5qet5zh3szzyn4re5kfymqmrmgga9kq3plg8l  shard 0
//! ping_s3   : erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r  shard 3
//! ```
//!
//! ## Uso
//! ```
//! cargo run --bin testnet_schedule_e2e
//! ```

use std::error::Error;
use std::time::{SystemTime, UNIX_EPOCH};
use xcron_keeper_rs::wallet::KeeperWallet;
use xcron_keeper_rs::network::MultiversXNetwork;
use xcron_keeper_rs::transaction::Transaction;

// ── Constantes de red ──────────────────────────────────────────────────────
const GATEWAY: &str = "https://testnet-gateway.multiversx.com";
const CHAIN_ID: &str = "T";

// ── Contratos deployados en testnet ───────────────────────────────────────
/// Scheduler (shard 3) — dirección canónica del protocolo XCron
const SCHEDULER: &str = "erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263";

/// Ping contract en shard 3 — TARGET INTRA-SHARD respecto al Scheduler
const PING_SHARD3: &str = "erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r";

/// Ping contract en shard 0 — TARGET CROSS-SHARD respecto al Scheduler
/// NOTA: Si este contrato no existe aún en testnet, el test enviará la TX igualmente
/// (la TX se acepta on-chain; el keeper fallará al ejecutar si el SC no existe —
///  pero ese es el comportamiento esperado para un test de "scheduling cross-shard").
/// Para obtener esta dirección desplegamos ping desde deployer (shard0) con nonce=N.
/// Actualizarla si se redeploya. Calculada con: SC_ADDR = f(creator_pk, nonce).
const PING_SHARD0: &str = "erd1qqqqqqqqqqqqqpgqz38mvl2m3l3qst7qmkay9yp6k7y7y3hm7k8sgr8ruf";

// ── Depósito mínimo: 0.1 EGLD (valor por encima del min_deposit del contrato) ─
const DEPOSIT_WEI: u64 = 100_000_000_000_000_000; // 0.1 EGLD

// ── Gas limits ─────────────────────────────────────────────────────────────
const GAS_SCHEDULE: u64 = 30_000_000;
const GAS_TASK_MAX: u64 = 10_000_000; // max_gas dentro del Task (≥5M, ≤400M)
const TTL_SECONDS: u64 = 3_600; // 1 hora

/// Retorna timestamp actual en milisegundos (MultiversX usa ms para target_time)
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock error")
        .as_millis() as u64
}

/// Retorna timestamp actual en segundos (para created_at en Task struct)
fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock error")
        .as_secs()
}

// ─────────────────────────────────────────────────────────────────────────────
// SERIALIZACIÓN MANUAL DEL STRUCT Task (TopEncode MultiversX)
//
// Layout exacto basado en common/src/types.rs:
//   id: u64                     → 8 bytes BE
//   owner: ManagedAddress       → 32 bytes
//   target_contract: ManagedAddress → 32 bytes
//   target_endpoint: ManagedBuffer  → 4 bytes len (BE) + N bytes
//   target_args: ManagedVec<ManagedBuffer> → 4 bytes count (BE) + per element: 4 bytes len + bytes
//   trigger: Trigger            → 1 byte discriminant + payload
//   max_gas: u64                → 8 bytes BE
//   deposit: BigUint            → 4 bytes len (BE) + N bytes (minimal encoding)
//   max_retries: u8             → 1 byte
//   retry_count: u8             → 1 byte
//   ttl_seconds: u64            → 8 bytes BE
//   created_at: u64             → 8 bytes BE (seconds)
//   status: TaskStatus          → 1 byte (0=Pending)
//   assigned_keeper: Option<ManagedAddress> → 1 byte (0=None)
//   completed_at: u64           → 8 bytes BE
//   post_task_id: Option<u64>   → 1 byte (0=None)
//   require_xwap_safe: bool     → 1 byte
//   confidential: bool          → 1 byte
//
// Trigger::TimeOnce { target_time: u64 } → discriminant=0x00, 8 bytes BE target_time
// ─────────────────────────────────────────────────────────────────────────────
fn encode_task(
    task_id: u64,
    owner_hex: &str,
    target_hex: &str,
    endpoint: &str,
    args: &[&str],      // cada arg como hex string
    target_time_ms: u64,
    max_gas: u64,
    deposit_wei: u64,
    nonce_counter: u64, // solo para que el hash sea único si reutilizamos mismos params
) -> Vec<u8> {
    let mut buf = Vec::new();

    // 1. id (u64 BE)
    buf.extend_from_slice(&task_id.to_be_bytes());

    // 2. owner (32 bytes)
    let owner_bytes = hex::decode(owner_hex).expect("owner hex decode");
    assert_eq!(owner_bytes.len(), 32, "owner must be 32 bytes");
    buf.extend_from_slice(&owner_bytes);

    // 3. target_contract (32 bytes)
    let target_bytes = hex::decode(target_hex).expect("target hex decode");
    assert_eq!(target_bytes.len(), 32, "target must be 32 bytes");
    buf.extend_from_slice(&target_bytes);

    // 4. target_endpoint: 4 bytes len + bytes
    let ep_bytes = endpoint.as_bytes();
    buf.extend_from_slice(&(ep_bytes.len() as u32).to_be_bytes());
    buf.extend_from_slice(ep_bytes);

    // 5. target_args: 4 bytes count + each (4 bytes len + bytes)
    buf.extend_from_slice(&(args.len() as u32).to_be_bytes());
    for arg_hex in args {
        let arg_bytes = hex::decode(arg_hex).expect("arg hex decode");
        buf.extend_from_slice(&(arg_bytes.len() as u32).to_be_bytes());
        buf.extend_from_slice(&arg_bytes);
    }

    // 6. trigger = TimeOnce { target_time }
    //    discriminant = 0x00 (first variant)
    buf.push(0x00u8);
    buf.extend_from_slice(&target_time_ms.to_be_bytes());

    // 7. max_gas (u64 BE)
    buf.extend_from_slice(&max_gas.to_be_bytes());

    // 8. deposit (BigUint): minimal encoding — strip leading zeros
    let dep_bytes = {
        let full = deposit_wei.to_be_bytes(); // 8 bytes
        let start = full.iter().position(|&b| b != 0).unwrap_or(7);
        full[start..].to_vec()
    };
    buf.extend_from_slice(&(dep_bytes.len() as u32).to_be_bytes());
    buf.extend_from_slice(&dep_bytes);

    // 9. max_retries (u8)
    buf.push(3u8);

    // 10. retry_count (u8)
    buf.push(0u8);

    // 11. ttl_seconds (u64 BE)
    buf.extend_from_slice(&TTL_SECONDS.to_be_bytes());

    // 12. created_at (u64 BE) — seconds, + nonce para unicidad
    let created_at = now_secs().wrapping_add(nonce_counter);
    buf.extend_from_slice(&created_at.to_be_bytes());

    // 13. status = Pending (0x00)
    buf.push(0x00u8);

    // 14. assigned_keeper = None (0x00)
    buf.push(0x00u8);

    // 15. completed_at (u64 BE) = 0
    buf.extend_from_slice(&0u64.to_be_bytes());

    // 16. post_task_id = None (0x00)
    buf.push(0x00u8);

    // 17. require_xwap_safe (bool) = false
    buf.push(0x00u8);

    // 18. confidential (bool) = false
    buf.push(0x00u8);

    buf
}

/// Construye el data field para `scheduleQuantumTask@<task_hex>`
/// El endpoint recibe `MultiValueEncoded<ManagedBuffer>` con 1 elemento = task serializado
fn data_schedule_quantum(task_bytes: &[u8]) -> Vec<u8> {
    let task_hex = hex::encode(task_bytes);
    format!("scheduleQuantumTask@{}", task_hex).into_bytes()
}

/// Construye el data field para `scheduleTask` (legacy path, 7 args sueltos)
/// scheduleTask@target_hex@endpoint_hex@args_hex@trigger_hex@max_gas_hex@max_retries_hex@ttl_hex
///
/// NOTA: scheduleTask NO existe como endpoint directo — en el contrato el path legacy
/// se activa cuando `scheduleQuantumTask` recibe ≥7 args. Los args son MultiValueEncoded.
/// Así que también usamos `scheduleQuantumTask` pero con 7 args separados por @.
///
/// Args order (desde scheduling.rs legacy path, num_args >= 7):
///   [0] target_contract  (TopEncode ManagedAddress = 32 bytes)
///   [1] target_endpoint  (TopEncode ManagedBuffer = raw bytes)
///   [2] target_args      (TopEncode ManagedVec<ManagedBuffer> = 4 bytes count + elements)
///   [3] trigger          (TopEncode Trigger)
///   [4] max_gas          (TopEncode u64)
///   [5] max_retries      (TopEncode u8)
///   [6] ttl_seconds      (TopEncode u64)
fn data_schedule_legacy(
    target_hex: &str,     // 32 bytes hex
    endpoint: &str,       // raw string
    trigger_ms: u64,      // TimeOnce target_time in ms
    max_gas: u64,
    max_retries: u8,
    ttl: u64,
) -> Vec<u8> {
    // [0] target_contract: TopEncode(ManagedAddress) = 32 bytes
    let arg0 = target_hex.to_string();

    // [1] target_endpoint: TopEncode(ManagedBuffer) = raw bytes of the string
    let arg1 = hex::encode(endpoint.as_bytes());

    // [2] target_args: TopEncode(ManagedVec<ManagedBuffer>) = 4 bytes count (0) = no args to ping
    let arg2 = "00000000".to_string(); // count = 0

    // [3] trigger: TopEncode(Trigger::TimeOnce) = 0x00 + u64 BE
    let mut trigger_bytes = vec![0x00u8];
    trigger_bytes.extend_from_slice(&trigger_ms.to_be_bytes());
    let arg3 = hex::encode(&trigger_bytes);

    // [4] max_gas: TopEncode(u64) = 8 bytes BE (strip leading zeros for top encode)
    // TopEncode for u64: actually stored as is (8 bytes) in ManagedBuffer context
    let arg4 = format!("{:016x}", max_gas);

    // [5] max_retries: TopEncode(u8) = 1 byte
    let arg5 = format!("{:02x}", max_retries);

    // [6] ttl_seconds: TopEncode(u64) — must be >= 10
    let arg6 = format!("{:016x}", ttl);

    format!(
        "scheduleQuantumTask@{}@{}@{}@{}@{}@{}@{}",
        arg0, arg1, arg2, arg3, arg4, arg5, arg6
    )
    .into_bytes()
}

/// Convierte bech32 address a pubkey hex (32 bytes)
fn addr_to_hex(bech32: &str) -> String {
    KeeperWallet::bech32_to_hex(bech32)
}

// ─────────────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    println!("═══════════════════════════════════════════════════════════");
    println!("  XCron Testnet E2E — 4 Scheduling Transactions");
    println!("═══════════════════════════════════════════════════════════");
    println!("  Scheduler : {}", SCHEDULER);
    println!("  Ping S3   : {} [shard 3, INTRA]", PING_SHARD3);
    println!("  Ping S0   : {} [shard 0, CROSS]", PING_SHARD0);
    println!("  Deposit   : {} wei (0.1 EGLD per TX)", DEPOSIT_WEI);
    println!("───────────────────────────────────────────────────────────");

    let network = MultiversXNetwork::new(GATEWAY);

    // ── Cargar wallets ────────────────────────────────────────────────────
    let keeper_wallet = KeeperWallet::load_pem("../.secrets/e2e_keeper.pem").map_err(|e| {
        format!("ERR cargando e2e_keeper.pem: {}. Verifica que existe en .secrets/", e)
    })?;
    let user_wallet = KeeperWallet::load_pem("../.secrets/e2e_user.pem").map_err(|e| {
        format!("ERR cargando e2e_user.pem: {}. Verifica que existe en .secrets/", e)
    })?;

    println!("\n[WALLETS]");
    println!("  e2e_keeper : {} (shard 3)", keeper_wallet.bech32_address);
    println!("  e2e_user   : {} (shard 0)", user_wallet.bech32_address);

    // ── Obtener nonces on-chain ───────────────────────────────────────────
    println!("\n[NONCES] Consultando on-chain...");
    let keeper_nonce = network
        .fetch_nonce(&keeper_wallet.bech32_address)
        .await
        .map_err(|e| format!("fetch_nonce keeper: {}", e))?;
    let user_nonce = network
        .fetch_nonce(&user_wallet.bech32_address)
        .await
        .map_err(|e| format!("fetch_nonce user: {}", e))?;

    println!("  e2e_keeper nonce: {}", keeper_nonce);
    println!("  e2e_user   nonce: {}", user_nonce);

    // ── Precomputar hexes de addresses ────────────────────────────────────
    let keeper_hex = addr_to_hex(&keeper_wallet.bech32_address);
    let user_hex   = addr_to_hex(&user_wallet.bech32_address);
    let ping_s3_hex = addr_to_hex(PING_SHARD3);
    let ping_s0_hex = addr_to_hex(PING_SHARD0);
    let scheduler_hex = addr_to_hex(SCHEDULER);

    println!("\n[HEX ADDRESSES]");
    println!("  scheduler : {}", scheduler_hex);
    println!("  ping_s3   : {}", ping_s3_hex);
    println!("  ping_s0   : {}", ping_s0_hex);
    println!("  keeper    : {}", keeper_hex);
    println!("  user      : {}", user_hex);

    let target_ms = now_ms() + 60_000; // 1 minuto en el futuro

    // ═══════════════════════════════════════════════════════════════════════
    // TX 1 — scheduleQuantumTask INTRA-SHARD
    //   Sender: e2e_keeper (shard 3), Target SC: ping_shard3 (shard 3)
    //   → INTRA desde perspectiva del Scheduler (mismo shard que target)
    // ═══════════════════════════════════════════════════════════════════════
    println!("\n─────────────────────────────────────────────────────────");
    println!("[TX 1] scheduleQuantumTask — INTRA-SHARD (keeper→scheduler, target=ping_s3)");

    let task1_bytes = encode_task(
        1_001,              // task_id ficticio (unique)
        &keeper_hex,        // owner = keeper
        &ping_s3_hex,       // target_contract = ping shard3
        "ping",             // endpoint
        &[],                // args vacíos
        target_ms,
        GAS_TASK_MAX,
        DEPOSIT_WEI,
        0,                  // nonce_counter para unicidad
    );
    let data1 = data_schedule_quantum(&task1_bytes);

    println!("  Task bytes len : {} bytes", task1_bytes.len());
    println!("  Task hex       : {}", hex::encode(&task1_bytes));
    println!("  Data field     : {}", String::from_utf8_lossy(&data1));

    let mut tx1 = Transaction::new(
        keeper_nonce,
        &DEPOSIT_WEI.to_string(),
        SCHEDULER,
        &keeper_wallet.bech32_address,
        1_000_000_000,
        GAS_SCHEDULE,
        Some(&data1),
        CHAIN_ID,
        1,
    );
    tx1.sign(&keeper_wallet.signing_key)?;

    match network.broadcast_tx(&tx1).await {
        Ok(hash) => {
            println!("  ✅ TX1 ENVIADA: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
        }
        Err(e) => println!("  ❌ TX1 FALLÓ: {}", e),
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TX 2 — scheduleQuantumTask CROSS-SHARD
    //   Sender: e2e_keeper (shard 3), Target SC: ping_shard0 (shard 0)
    //   → CROSS desde perspectiva del Scheduler (distinto shard que target)
    // ═══════════════════════════════════════════════════════════════════════
    println!("\n─────────────────────────────────────────────────────────");
    println!("[TX 2] scheduleQuantumTask — CROSS-SHARD (keeper→scheduler, target=ping_s0)");

    let task2_bytes = encode_task(
        1_002,
        &keeper_hex,
        &ping_s0_hex,   // target en shard 0 — cross-shard para scheduler (shard 3)
        "ping",
        &[],
        target_ms + 1, // +1ms para hash diferente
        GAS_TASK_MAX,
        DEPOSIT_WEI,
        1,
    );
    let data2 = data_schedule_quantum(&task2_bytes);

    println!("  Task bytes len : {} bytes", task2_bytes.len());
    println!("  Task hex       : {}", hex::encode(&task2_bytes));

    let mut tx2 = Transaction::new(
        keeper_nonce + 1,   // nonce siguiente
        &DEPOSIT_WEI.to_string(),
        SCHEDULER,
        &keeper_wallet.bech32_address,
        1_000_000_000,
        GAS_SCHEDULE,
        Some(&data2),
        CHAIN_ID,
        1,
    );
    tx2.sign(&keeper_wallet.signing_key)?;

    match network.broadcast_tx(&tx2).await {
        Ok(hash) => {
            println!("  ✅ TX2 ENVIADA: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
        }
        Err(e) => println!("  ❌ TX2 FALLÓ: {}", e),
    }

    // Pausa breve entre wallets (no estrictamente necesario pero evita race conditions)
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // ═══════════════════════════════════════════════════════════════════════
    // TX 3 — scheduleTask (legacy) INTRA-SHARD
    //   Sender: e2e_user (shard 0), Target SC: ping_shard3 (shard 3)
    //   Nota: "intra" se refiere al target estando en mismo shard que el Scheduler
    // ═══════════════════════════════════════════════════════════════════════
    println!("\n─────────────────────────────────────────────────────────");
    println!("[TX 3] scheduleTask (legacy path) — INTRA-SHARD (user→scheduler, target=ping_s3)");

    let data3 = data_schedule_legacy(
        &ping_s3_hex,   // target = ping shard3 (intra respecto al scheduler shard3)
        "ping",
        target_ms + 2,
        GAS_TASK_MAX,
        3,             // max_retries
        TTL_SECONDS,
    );

    println!("  Data field: {}", String::from_utf8_lossy(&data3));

    let mut tx3 = Transaction::new(
        user_nonce,
        &DEPOSIT_WEI.to_string(),
        SCHEDULER,
        &user_wallet.bech32_address,
        1_000_000_000,
        GAS_SCHEDULE,
        Some(&data3),
        CHAIN_ID,
        1,
    );
    tx3.sign(&user_wallet.signing_key)?;

    match network.broadcast_tx(&tx3).await {
        Ok(hash) => {
            println!("  ✅ TX3 ENVIADA: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
        }
        Err(e) => println!("  ❌ TX3 FALLÓ: {}", e),
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TX 4 — scheduleTask (legacy) CROSS-SHARD
    //   Sender: e2e_user (shard 0), Target SC: ping_shard0 (shard 0)
    //   → CROSS desde perspectiva del Scheduler (shard3→shard0)
    // ═══════════════════════════════════════════════════════════════════════
    println!("\n─────────────────────────────────────────────────────────");
    println!("[TX 4] scheduleTask (legacy path) — CROSS-SHARD (user→scheduler, target=ping_s0)");

    let data4 = data_schedule_legacy(
        &ping_s0_hex,  // target en shard 0 — cross desde scheduler shard3
        "ping",
        target_ms + 3,
        GAS_TASK_MAX,
        3,
        TTL_SECONDS,
    );

    println!("  Data field: {}", String::from_utf8_lossy(&data4));

    let mut tx4 = Transaction::new(
        user_nonce + 1,
        &DEPOSIT_WEI.to_string(),
        SCHEDULER,
        &user_wallet.bech32_address,
        1_000_000_000,
        GAS_SCHEDULE,
        Some(&data4),
        CHAIN_ID,
        1,
    );
    tx4.sign(&user_wallet.signing_key)?;

    match network.broadcast_tx(&tx4).await {
        Ok(hash) => {
            println!("  ✅ TX4 ENVIADA: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
        }
        Err(e) => println!("  ❌ TX4 FALLÓ: {}", e),
    }

    println!("\n═══════════════════════════════════════════════════════════");
    println!("  DONE. Verifica en testnet-explorer.multiversx.com");
    println!("═══════════════════════════════════════════════════════════");

    Ok(())
}
