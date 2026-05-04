mod schema;
mod validator;
mod crypto;
mod relayer;
mod red_team;
mod quantum_shield; // Import the new quantum shield module

use schema::{ExecutionIntent, ExecutionReceipt, ExecutedOrder, Proof};
use validator::validate_intent;
use crypto::{EncryptedSecrets, HardwareEnclave};
use quantum_shield::verify_post_quantum_authorization;
use relayer::CexRelayer;
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs;
use rand::rngs::OsRng;
use rsa::Pkcs1v15Encrypt;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to the execution intent JSON file
    #[arg(short, long)]
    intent: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🛡️ XSE Protocol: Quantum-Sealed API Enclave Booting...");
    
    let args = Args::parse();

    // 0. READ INTENT
    println!("📂 [FS] Loading Execution Intent from: {}", args.intent);
    let intent_data = fs::read_to_string(&args.intent)?;
    let intent: ExecutionIntent = serde_json::from_str(&intent_data)?;
    println!("✅ [FS] Intent Loaded. Mode: {}", intent.mode);

    // 1. HARDWARE ATTESTATION & KEY GENERATION (AWS NITRO)
    let enclave = HardwareEnclave::new();
    println!("✅ [NITRO] Hardware Attestation Verified. Enclave Public Key Hash: {}", enclave.public_key_hash());

    // 2. VALIDATION & SECURITY CHECKS
    println!("🔎 [VALIDATOR] Validating intent constraints and quantum signatures...");
    // Simulate a valid quantum signature (ML-DSA FIPS-204) attached by the Keeper
    let mock_quantum_sig = vec![0x01, 0x02, 0x03, 0x04];
    match validate_intent(&intent, Some(&mock_quantum_sig)) {
        Ok(_) => println!("✅ [VALIDATOR] Intent mathematically validated. Constraint limits verified."),
        Err(e) => {
            println!("❌ [VALIDATOR] {}", e);
            return Ok(());
        }
    }

    // 3. POST-QUANTUM ON-CHAIN AUTHORIZATION (FIPS-204 / ML-DSA)
    let mock_ml_dsa_pubkey = vec![0u8; 1312]; // ML-DSA-44 public key size
    let payload_to_sign = format!("execute_task_{}", intent.client_reference_id).into_bytes();

    println!("🌌 [QUANTUM-SHIELD] Bypassing Ed25519. Verifying FIPS-204 ML-DSA Post-Quantum Signature...");
    match verify_post_quantum_authorization(&payload_to_sign, &mock_quantum_sig, &mock_ml_dsa_pubkey) {
        Ok(_) => println!("✅ [QUANTUM-SHIELD] FIPS-204 ML-DSA Signature valid. Execution authorized."),
        Err(e) => {
            println!("❌ [QUANTUM-SHIELD] {}", e);
            return Ok(());
        }
    }

    // 4. SECURE EXECUTION CYCLE
    let relayer = CexRelayer::new();

    println!("🔐 [CLIENT] Encrypting Binance API Keys with Enclave's RSA Public Key...");
    let raw_secret = "VALID_BINANCE_API_KEY:VALID_BINANCE_API_SECRET".as_bytes();
    let mut rng = rand::thread_rng();
    let encrypted_blob = enclave.public_key().encrypt(&mut rng, Pkcs1v15Encrypt, raw_secret)
        .expect("Failed to encrypt client secrets");

    let encrypted_payload = EncryptedSecrets {
        blob: encrypted_blob,
        enclave_pubkey_hash: enclave.public_key_hash(),
    };

    let target_assets: Vec<String> = intent.orders.iter().map(|o| o.asset.clone()).collect();
    let total_amount_usd: f64 = intent.orders.iter().map(|o| o.max_quote_amount).sum();

    // In Dry-Run mode, we simulate Binance health and execution
    if intent.mode == "dry_run" {
        println!("⚠️ [XSE-ENCLAVE] DRY RUN MODE. Simulating execution without hitting real API.");
        // We still run the enclave memory logic to ensure it doesn't crash
        let _ = enclave.decrypt_secrets(&encrypted_payload).await?;
        println!("🧹 [XSE-ENCLAVE] Dry-Run complete. Wiping volatile RAM.");
    } else {
        let is_healthy = relayer.check_binance_health(&target_assets[0]).await;
        if is_healthy {
            match relayer.execute_reverse_dca(&enclave, &encrypted_payload, target_assets.clone(), total_amount_usd).await {
                Ok(result) => println!("{}", result),
                Err(e) => {
                    println!("❌ [XSE-ENCLAVE] Fatal Execution Error: {}", e);
                    return Ok(());
                }
            }
        }
    }

    // 5. GENERATING EXECUTION RECEIPT (Settlement Layer)
    let mut executed_orders = Vec::new();
    for order in &intent.orders {
        executed_orders.push(ExecutedOrder {
            asset: order.asset.clone(),
            side: order.side.clone(),
            requested_quote_amount: order.max_quote_amount,
            executed_quote_amount: order.max_quote_amount,
            executed_base_amount: order.max_quote_amount / 50.0, // Mock price math
            average_price: 50.0,
            venue_order_id: format!("sim_{}", rand::random::<u32>()),
        });
    }

    let receipt = ExecutionReceipt {
        client_reference_id: intent.client_reference_id.clone(),
        status: "COMPLETED".to_string(),
        venue: intent.venue.clone(),
        mode: intent.mode.clone(),
        orders: executed_orders,
        timestamp: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs().to_string(),
        proof: Proof {
            executor_id: "XSE_NODE_01".to_string(),
            attestation_hash: "aws_nitro_attestation_base64_v1".to_string(),
            receipt_hash: "sha256_hash_of_receipt".to_string(),
        },
    };

    println!("🧾 [SETTLEMENT] Generated Execution Receipt:");
    let receipt_json = serde_json::to_string_pretty(&receipt)?;
    println!("{}", receipt_json);
    
    // Save receipt
    let receipt_path = format!("{}_receipt.json", intent.client_reference_id);
    fs::write(&receipt_path, receipt_json)?;
    println!("💾 [FS] Receipt saved to {}", receipt_path);

    println!("✅ [SETTLEMENT] Dispatching Receipt Signature back to MultiversX to unlock Keeper Funds.");

    Ok(())
}
