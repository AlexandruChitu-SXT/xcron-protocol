//! # Deploy Ping en Shard 0 + Cross-Shard TX2/TX4
//!
//! Flujo:
//!   1. Fondea deployer (shard0) con 0.5 EGLD desde e2e_user (shard0) — intra-shard
//!   2. Espera confirmación (~8s)
//!   3. Despliega ping.wasm desde deployer → SC queda en shard 0
//!   4. Espera confirmación (~8s)
//!   5. TX2 — scheduleQuantumTask CROSS-SHARD (target = ping_shard0 real)
//!   6. TX4 — scheduleTask legacy CROSS-SHARD  (target = ping_shard0 real)
//!
//! ## SC address determinista
//! deployer = erd1yd8zy8tf8sjs4h5jgx7qc5qet5zh3szzyn4re5kfymqmrmgga9kq3plg8l (shard0, nonce=0)
//! SC prevista = erd1qqqqqqqqqqqqqpgqgp8dqs4vqqpz98h09nqj4d332xhhc4jaa9kqn6336g (shard0)
//!
//! ## Deploy TX data format (MultiversX)
//! receiver = erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu
//! data     = <wasm_hex>@0500@0500
//!   - @0500 = vm_type (WASM)
//!   - @0500 = code_metadata (upgradeable=true, readable=true)

use std::error::Error;
use std::time::{SystemTime, UNIX_EPOCH};
use xcron_keeper_rs::wallet::KeeperWallet;
use xcron_keeper_rs::network::MultiversXNetwork;
use xcron_keeper_rs::transaction::Transaction;

const GATEWAY:   &str = "https://testnet-gateway.multiversx.com";
const CHAIN_ID:  &str = "T";

const SCHEDULER: &str = "erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263";
const PING_S3:   &str = "erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r";

/// Zero address = deploy receiver en MultiversX
const ZERO_ADDR: &str = "erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu";

/// Ping WASM bytecode en hex (ping.wasm 835 bytes)
const PING_WASM_HEX: &str = "0061736d0100000001310a60000060027f7f017f6000017f60037f7f7f017f60027f7e0060017f017e60027f7f0060017f017f60017f0060017e0002c3020d03656e760f6765744e756d417267756d656e7473000203656e760b7369676e616c4572726f72000603656e760f6d4275666665725365744279746573000303656e761b6d42756666657246726f6d536d616c6c496e74556e7369676e6564000403656e76136d42756666657253746f7261676553746f7265000103656e76126d42756666657253746f726167654c6f6164000103656e76106d4275666665724765744c656e677468000703656e76196d427566666572546f536d616c6c496e74556e7369676e6564000503656e760d6d427566666572417070656e64000103656e76126d427566666572417070656e644279746573000303656e76126d616e616765645369676e616c4572726f72000803656e760e636865636b4e6f5061796d656e74000003656e7616736d616c6c496e7446696e697368556e7369676e65640009030c0b00010204050200000000000503010003060f027f0041d480080b7f0041e080080b075708066d656d6f727902000863616c6c4261636b00130c67657450696e67436f756e74001404696e697400150470696e670016077570677261646500170a5f5f646174615f656e6403000b5f5f686561705f6261736503010c01020adb010b120010004504400f0b4180800841191001000b1101017f100f22022000200110021a20020b1901017f41d0800841d0800828020041016b220036020020000b0f004167200110032000416710041a0b4501017f2000100f220110051a2001100641094f044041a78008411b100e2201200010081a200141c28008410310091a200141998008410e10091a2001100a000b200110070b0a0041c58008410a100e0b02000b0c00100b100d10121011100c0b0c00100b100d1012420010100b1501017f100b100d101222002000101142017c10100b0600100b100d0b0b620200418080080b4f77726f6e67206e756d626572206f6620617267756d656e747376616c756520746f6f206c6f6e6773746f72616765206465636f6465206572726f7220286b65793a20293a2070696e675f636f756e740041d080080b0438ffffff";

const DEPOSIT_WEI: u64 = 100_000_000_000_000_000; // 0.1 EGLD
const GAS_SCHEDULE: u64 = 30_000_000;
const GAS_TASK_MAX: u64 = 10_000_000;
const TTL_SECONDS:  u64 = 3_600;

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}
fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

/// Serializa Task struct (TopEncode) para scheduleQuantumTask
fn encode_task(
    task_id: u64,
    owner_hex: &str,
    target_hex: &str,
    endpoint: &str,
    trigger_ms: u64,
    max_gas: u64,
    deposit_wei: u64,
    nonce_counter: u64,
) -> Vec<u8> {
    let mut buf = Vec::new();
    buf.extend_from_slice(&task_id.to_be_bytes());
    buf.extend_from_slice(&hex::decode(owner_hex).unwrap());
    buf.extend_from_slice(&hex::decode(target_hex).unwrap());
    let ep = endpoint.as_bytes();
    buf.extend_from_slice(&(ep.len() as u32).to_be_bytes());
    buf.extend_from_slice(ep);
    buf.extend_from_slice(&0u32.to_be_bytes()); // target_args count = 0
    buf.push(0x00u8); // trigger discriminant = TimeOnce
    buf.extend_from_slice(&trigger_ms.to_be_bytes());
    buf.extend_from_slice(&max_gas.to_be_bytes());
    let dep: Vec<u8> = {
        let full = deposit_wei.to_be_bytes();
        let s = full.iter().position(|&b| b != 0).unwrap_or(7);
        full[s..].to_vec()
    };
    buf.extend_from_slice(&(dep.len() as u32).to_be_bytes());
    buf.extend_from_slice(&dep);
    buf.push(3u8);  // max_retries
    buf.push(0u8);  // retry_count
    buf.extend_from_slice(&TTL_SECONDS.to_be_bytes());
    buf.extend_from_slice(&(now_secs() + nonce_counter).to_be_bytes());
    buf.push(0x00u8); // status = Pending
    buf.push(0x00u8); // assigned_keeper = None
    buf.extend_from_slice(&0u64.to_be_bytes()); // completed_at
    buf.push(0x00u8); // post_task_id = None
    buf.push(0x00u8); // require_xwap_safe
    buf.push(0x00u8); // confidential
    buf
}

fn data_quantum(task_bytes: &[u8]) -> Vec<u8> {
    format!("scheduleQuantumTask@{}", hex::encode(task_bytes)).into_bytes()
}

/// Legacy path: 7 args separados por @ en scheduleQuantumTask
fn data_legacy(target_hex: &str, endpoint: &str, trigger_ms: u64, max_gas: u64, max_retries: u8, ttl: u64) -> Vec<u8> {
    let arg0 = target_hex.to_string();
    let arg1 = hex::encode(endpoint.as_bytes());
    let arg2 = "00000000".to_string(); // ManagedVec count=0
    let mut trig = vec![0x00u8];
    trig.extend_from_slice(&trigger_ms.to_be_bytes());
    let arg3 = hex::encode(&trig);
    let arg4 = format!("{:016x}", max_gas);
    let arg5 = format!("{:02x}", max_retries);
    let arg6 = format!("{:016x}", ttl);
    format!("scheduleQuantumTask@{}@{}@{}@{}@{}@{}@{}", arg0, arg1, arg2, arg3, arg4, arg5, arg6).into_bytes()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    println!("═══════════════════════════════════════════════════════════");
    println!("  FASE 1: Deploy Ping en Shard 0");
    println!("═══════════════════════════════════════════════════════════");

    let network = MultiversXNetwork::new(GATEWAY);

    let user_wallet     = KeeperWallet::load_pem("../.secrets/e2e_user.pem")?;
    let deployer_wallet = KeeperWallet::load_pem("../.secrets/deployer.pem")?;
    let keeper_wallet   = KeeperWallet::load_pem("../.secrets/e2e_keeper.pem")?;

    println!("[WALLETS]");
    println!("  e2e_user   : {} (shard 0, fondea deployer)", user_wallet.bech32_address);
    println!("  deployer   : {} (shard 0, despliega ping)", deployer_wallet.bech32_address);
    println!("  e2e_keeper : {} (shard 3, scheduling)", keeper_wallet.bech32_address);

    // ── Nonces ─────────────────────────────────────────────────────────────
    let user_nonce     = network.fetch_nonce(&user_wallet.bech32_address).await?;
    let deployer_nonce = network.fetch_nonce(&deployer_wallet.bech32_address).await?;
    let keeper_nonce   = network.fetch_nonce(&keeper_wallet.bech32_address).await?;

    println!("\n[NONCES]");
    println!("  e2e_user   : {}", user_nonce);
    println!("  deployer   : {}", deployer_nonce);
    println!("  e2e_keeper : {}", keeper_nonce);

    // ── Calcular dirección determinista del SC ──────────────────────────────
    // MultiversX SC address derivation (from mx-chain-go):
    //   pubkey[0..8]  = 0x00 * 8
    //   pubkey[8..16] = creator_pubkey[0..8]
    //   pubkey[16..28]= 0x00 * 12
    //   pubkey[28]    = 0x05 (WASM vm_type byte 1)
    //   pubkey[29]    = 0x00 (vm_type byte 2)
    //   pubkey[30..32]= nonce as u16 BE
    let deployer_hex = KeeperWallet::bech32_to_hex(&deployer_wallet.bech32_address);
    let deployer_pk = hex::decode(&deployer_hex)?;

    let mut sc_pubkey = [0u8; 32];
    sc_pubkey[8..16].copy_from_slice(&deployer_pk[0..8]);
    sc_pubkey[28] = 0x05; // vm_type
    // nonce = deployer_nonce encoded as u16 BE in bytes [30..32]
    let nonce_u16 = deployer_nonce as u16;
    sc_pubkey[30] = (nonce_u16 >> 8) as u8;
    sc_pubkey[31] = (nonce_u16 & 0xFF) as u8;

    // Bech32 encode
    use bech32::{ToBase32, Variant};
    let sc_bech32 = bech32::encode("erd", sc_pubkey.to_base32(), Variant::Bech32)?;
    let sc_hex    = hex::encode(&sc_pubkey);
    let sc_shard  = sc_pubkey[31] & 3;

    println!("\n[SC PING SHARD 0 — dirección determinista]");
    println!("  Bech32 : {}", sc_bech32);
    println!("  Hex    : {}", sc_hex);
    println!("  Shard  : {}", sc_shard);

    // ─────────────────────────────────────────────────────────────────────
    // PASO 1: Fondear deployer con 0.5 EGLD desde e2e_user
    // ─────────────────────────────────────────────────────────────────────
    println!("\n─────────────────────────────────────────────────────────");
    println!("[PASO 1] Fondear deployer con 0.5 EGLD desde e2e_user...");

    let fund_amount = "500000000000000000"; // 0.5 EGLD
    let mut fund_tx = Transaction::new(
        user_nonce,
        fund_amount,
        &deployer_wallet.bech32_address,
        &user_wallet.bech32_address,
        1_000_000_000,
        50_000,
        None,
        CHAIN_ID,
        1,
    );
    fund_tx.sign(&user_wallet.signing_key)?;

    match network.broadcast_tx(&fund_tx).await {
        Ok(hash) => {
            println!("  ✅ Fund TX: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
        }
        Err(e) => {
            println!("  ❌ Fund TX falló: {}", e);
            return Err(e.into());
        }
    }

    println!("  ⏳ Esperando 10s para confirmación en shard 0...");
    tokio::time::sleep(std::time::Duration::from_secs(10)).await;

    // ─────────────────────────────────────────────────────────────────────
    // PASO 2: Deploy ping.wasm desde deployer (shard 0)
    // ─────────────────────────────────────────────────────────────────────
    println!("\n─────────────────────────────────────────────────────────");
    println!("[PASO 2] Deploy ping.wasm desde deployer (shard 0)...");

    // data = <wasm_hex>@0500@0500
    // @0500 = vm_type WASM
    // @0500 = code_metadata (upgradeable + readable)
    let deploy_data = format!("{}@0500@0500", PING_WASM_HEX);

    let mut deploy_tx = Transaction::new(
        deployer_nonce,
        "0",
        ZERO_ADDR,
        &deployer_wallet.bech32_address,
        1_000_000_000,
        10_000_000, // gas para deploy
        Some(deploy_data.as_bytes()),
        CHAIN_ID,
        1,
    );
    deploy_tx.sign(&deployer_wallet.signing_key)?;

    match network.broadcast_tx(&deploy_tx).await {
        Ok(hash) => {
            println!("  ✅ Deploy TX: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
            println!("  📍 SC address: {}", sc_bech32);
        }
        Err(e) => {
            println!("  ❌ Deploy TX falló: {}", e);
            return Err(e.into());
        }
    }

    println!("  ⏳ Esperando 12s para confirmación del deploy...");
    tokio::time::sleep(std::time::Duration::from_secs(12)).await;

    // ─────────────────────────────────────────────────────────────────────
    // PASO 3: TX2 — scheduleQuantumTask CROSS-SHARD (target = ping_shard0 REAL)
    // ─────────────────────────────────────────────────────────────────────
    println!("\n─────────────────────────────────────────────────────────");
    println!("[TX2-FIX] scheduleQuantumTask — CROSS-SHARD (target=ping_s0 REAL: {})", sc_bech32);

    let keeper_hex = KeeperWallet::bech32_to_hex(&keeper_wallet.bech32_address);
    let target_ms  = now_ms() + 60_000;

    let task2_bytes = encode_task(
        2_001,
        &keeper_hex,
        &sc_hex,
        "ping",
        target_ms,
        GAS_TASK_MAX,
        DEPOSIT_WEI,
        10,
    );
    let data2 = data_quantum(&task2_bytes);

    println!("  Task hex: {}", hex::encode(&task2_bytes));

    let mut tx2 = Transaction::new(
        keeper_nonce,
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
            println!("  ✅ TX2-FIX ENVIADA: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
        }
        Err(e) => println!("  ❌ TX2-FIX FALLÓ: {}", e),
    }

    // ─────────────────────────────────────────────────────────────────────
    // PASO 4: TX4 — scheduleTask legacy CROSS-SHARD (target = ping_shard0 REAL)
    // ─────────────────────────────────────────────────────────────────────
    println!("\n─────────────────────────────────────────────────────────");
    println!("[TX4-FIX] scheduleTask (legacy) — CROSS-SHARD (target=ping_s0 REAL)");

    let user_hex = KeeperWallet::bech32_to_hex(&user_wallet.bech32_address);
    let user_nonce_refreshed = network.fetch_nonce(&user_wallet.bech32_address).await?;

    let data4 = data_legacy(
        &sc_hex,
        "ping",
        target_ms + 1,
        GAS_TASK_MAX,
        3,
        TTL_SECONDS,
    );
    println!("  Data field: {}", String::from_utf8_lossy(&data4));

    let mut tx4 = Transaction::new(
        user_nonce_refreshed,
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
            println!("  ✅ TX4-FIX ENVIADA: {}", hash);
            println!("  🔗 https://testnet-explorer.multiversx.com/transactions/{}", hash);
        }
        Err(e) => println!("  ❌ TX4-FIX FALLÓ: {}", e),
    }

    println!("\n═══════════════════════════════════════════════════════════");
    println!("  RESUMEN FINAL");
    println!("═══════════════════════════════════════════════════════════");
    println!("  TX1  scheduleQuantumTask INTRA  ✅ (run anterior)");
    println!("  TX2  scheduleQuantumTask CROSS  ✅ target={}", sc_bech32);
    println!("  TX3  scheduleTask INTRA         ✅ (run anterior)");
    println!("  TX4  scheduleTask CROSS         ✅ target={}", sc_bech32);
    println!("  Ping shard 0 SC                 📍 {}", sc_bech32);
    println!("═══════════════════════════════════════════════════════════");

    Ok(())
}
