//! Configuration — loads keeper PEM wallet and contract addresses.

use std::fs;
use tracing::info;

/// Keeper configuration loaded from file + PEM wallet.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct KeeperConfig {
    pub keeper_address: String,
    pub scheduler_address: String,
    pub keeper_registry_address: String,
    pub rewards_address: String,
    pub api_url: String,
    pub gateway_url: String,
    pub explorer_url: String,
    pub private_key: Vec<u8>,   // 64-byte Ed25519 secret key
    pub public_key: Vec<u8>,    // 32-byte Ed25519 public key
}

/// Network configuration.
struct NetworkUrls {
    api: &'static str,
    gateway: &'static str,
    explorer: &'static str,
}

fn network_urls(network: &str) -> NetworkUrls {
    match network {
        "mainnet" => NetworkUrls {
            api: "https://api.multiversx.com",
            gateway: "https://gateway.multiversx.com",
            explorer: "https://explorer.multiversx.com",
        },
        "testnet" => NetworkUrls {
            api: "https://testnet-api.multiversx.com",
            gateway: "https://testnet-gateway.multiversx.com",
            explorer: "https://testnet-explorer.multiversx.com",
        },
        _ => NetworkUrls {
            api: "https://devnet-api.multiversx.com",
            gateway: "https://devnet-gateway.multiversx.com",
            explorer: "https://devnet-explorer.multiversx.com",
        },
    }
}

impl KeeperConfig {
    pub fn load(config_path: &str, pem_path: &str, network: &str) -> Result<Self, String> {
        // Load PEM wallet
        let pem_content = fs::read_to_string(pem_path)
            .map_err(|e| format!("Cannot read PEM file '{}': {}", pem_path, e))?;

        let (private_key, public_key, address) = parse_pem(&pem_content)?;
        info!("Loaded keeper wallet: {}", address);

        // Load config JSON (contract addresses)
        let config_json = fs::read_to_string(config_path)
            .map_err(|e| format!("Cannot read config '{}': {}", config_path, e))?;

        let config: serde_json::Value = serde_json::from_str(&config_json)
            .map_err(|e| format!("Invalid config JSON: {}", e))?;

        let scheduler = config["scheduler"]
            .as_str()
            .ok_or("Missing 'scheduler' in config")?
            .to_string();

        let keeper_registry = config["keeperRegistry"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let rewards = config["rewards"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let urls = network_urls(network);

        Ok(KeeperConfig {
            keeper_address: address,
            scheduler_address: scheduler,
            keeper_registry_address: keeper_registry,
            rewards_address: rewards,
            api_url: urls.api.to_string(),
            gateway_url: urls.gateway.to_string(),
            explorer_url: urls.explorer.to_string(),
            private_key,
            public_key,
        })
    }
}

/// Parse a MultiversX PEM file and extract keys + bech32 address.
///
/// MultiversX PEM format: base64( hex_string( seed || pubkey ) )
/// So we need: base64_decode → interpret as ASCII hex → hex_decode → 64 raw bytes.
fn parse_pem(pem_content: &str) -> Result<(Vec<u8>, Vec<u8>, String), String> {
    // Extract base64 content between BEGIN/END markers
    let lines: Vec<&str> = pem_content.lines().collect();
    let mut b64 = String::new();
    let mut inside = false;

    for line in &lines {
        if line.contains("BEGIN") {
            inside = true;
            continue;
        }
        if line.contains("END") {
            break;
        }
        if inside {
            b64.push_str(line.trim());
        }
    }

    let decoded_ascii = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &b64,
    ).map_err(|e| format!("Invalid PEM base64: {}", e))?;

    // The decoded bytes are actually an ASCII hex string (128 chars → 64 bytes)
    let hex_string = String::from_utf8(decoded_ascii)
        .map_err(|e| format!("PEM decoded to non-UTF8: {}", e))?;

    let key_bytes = hex::decode(&hex_string)
        .map_err(|e| format!("Invalid hex in PEM: {}", e))?;

    if key_bytes.len() < 64 {
        return Err(format!("PEM key bytes {} < 64", key_bytes.len()));
    }

    let private_key = key_bytes[..32].to_vec();   // seed (secret key)
    let public_key = key_bytes[32..64].to_vec();   // public key

    // Convert public key to bech32 address
    let address = pubkey_to_bech32(&public_key)?;

    Ok((private_key, public_key, address))
}

/// Convert a 32-byte public key to a bech32 MultiversX address.
fn pubkey_to_bech32(pubkey: &[u8]) -> Result<String, String> {
    use bech32::{Bech32, Hrp};
    let hrp = Hrp::parse("erd").map_err(|e| format!("bech32 hrp: {}", e))?;
    let addr = bech32::encode::<Bech32>(hrp, pubkey)
        .map_err(|e| format!("bech32 encode: {}", e))?;
    Ok(addr)
}

use base64;
