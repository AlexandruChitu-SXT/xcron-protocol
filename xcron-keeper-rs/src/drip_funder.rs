use std::error::Error;
use std::time::Duration;
use crate::network::MultiversXNetwork;
use crate::transaction::Transaction;
use crate::wallet::KeeperWallet;

/// XCron Automated Drip Funder Service
///
/// Automates the registration of ephemeral Stealth Addresses in the MultiversX State Trie.
/// Prevents transaction failure by pre-funding fresh addresses using the Protocol Drip Wallet.
/// Includes risk mitigation: it only funds up to a strict cap to prevent drain attacks.
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// XCron Automated Drip Funder Service
///
/// Automates the registration of ephemeral Stealth Addresses in the MultiversX State Trie.
/// Prevents transaction failure by pre-funding fresh addresses using the Protocol Drip Wallet.
/// Includes risk mitigation: it only funds up to a strict cap to prevent drain attacks.
pub struct DripFunder {
  pub activation_amount: String, // e.g. "5000000000000000" (0.005 EGLD)
  pub min_threshold: u128,    // e.g. 1000000000000000 (0.001 EGLD)
  pub max_daily_drip_cap: u128, // Safety cap to prevent sybil/drain attacks
  pub daily_accumulator: Mutex<u128>,
  pub last_reset_timestamp: Mutex<u64>,
}

impl DripFunder {
  pub fn new(activation_amount: &str, min_threshold_egld: f64) -> Self {
    let min_threshold = (min_threshold_egld * 1e18) as u128;
    Self {
      activation_amount: activation_amount.to_string(),
      min_threshold,
      max_daily_drip_cap: 10_000_000_000_000_000_000, // 10 EGLD limit per day for safety
      daily_accumulator: Mutex::new(0),
      last_reset_timestamp: Mutex::new(0),
    }
  }

  /// Verifies if the proposed drip fits within the daily limit.
  /// If 24 hours have passed since last_reset_timestamp, the accumulator is reset.
  pub fn check_and_increment_drip(&self, amount: u128) -> Result<(), Box<dyn Error>> {
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map_err(|e| format!("SystemTime before UNIX EPOCH: {}", e))?
      .as_secs();

    let mut last_reset = self.last_reset_timestamp.lock().unwrap();
    let mut current_accum = self.daily_accumulator.lock().unwrap();

    // Reset if 24 hours (86400 seconds) have elapsed or if it's the first time running
    if *last_reset == 0 || now >= *last_reset + 86400 {
      *current_accum = 0;
      *last_reset = now;
      log::info!(" [DRIP-FUNDER] 24h window elapsed. Daily drip accumulator reset.");
    }

    if *current_accum + amount > self.max_daily_drip_cap {
      return Err(format!(
        "Drip rejected: daily limit exceeded. Limit: {} wei, Current: {} wei, Requested: {} wei",
        self.max_daily_drip_cap, *current_accum, amount
      ).into());
    }

    *current_accum += amount;
    log::info!(" [DRIP-FUNDER] Drip approved. New daily total: {}/{} wei", *current_accum, self.max_daily_drip_cap);
    Ok(())
  }

  /// Checks if a Stealth Address is active on-chain, and drips EGLD from the Protocol Wallet if needed.
  /// This resolves the MultiversX State Trie Account Activation requirement (Vector 10 Fix).
  pub async fn ensure_stealth_activated(
    &self,
    network: &MultiversXNetwork,
    stealth_bech32: &str,
    drip_wallet: &KeeperWallet,
  ) -> Result<bool, Box<dyn Error>> {
    log::info!(" [DRIP-FUNDER] Auditing stealth address state: {}...", stealth_bech32);

    let mut is_fresh = false;
    let mut balance: u128 = 0;

    // Query the public API/Gateway
    let client = reqwest::Client::new();
    let api_url = format!("https://testnet-api.multiversx.com/accounts/{}", stealth_bech32);

    #[derive(serde::Deserialize)]
    struct AccountData {
      balance: String,
      nonce: u64,
    }

    match client.get(&api_url).send().await {
      Ok(resp) => {
        if resp.status() == reqwest::StatusCode::OK {
          if let Ok(acc) = resp.json::<AccountData>().await {
            balance = acc.balance.parse::<u128>().unwrap_or(0);
            if balance < self.min_threshold && acc.nonce == 0 {
              log::warn!("  ️ Stealth Address exists in Trie but has low balance ({} wei) and 0 nonce.", balance);
              is_fresh = true;
            }
          }
        } else if resp.status() == reqwest::StatusCode::NOT_FOUND {
          log::info!("  Stealth Address is fresh (Not found in L1 Trie). Funder trigger activated.");
          is_fresh = true;
        }
      }
      Err(e) => {
        log::error!("  Failed to contact L1 API: {}. Falling back to active funding.", e);
        is_fresh = true;
      }
    }

    if !is_fresh {
      log::info!("  Stealth Address is already active. Balance: {} wei. Skipping drip.", balance);
      return Ok(false);
    }

    let drip_amt = self.activation_amount.parse::<u128>().unwrap_or(0);
    self.check_and_increment_drip(drip_amt)?;

    // ️ XCRON-PROTECT: Execute the Drip Transfer from the Protocol Wallet
    log::info!(" [DRIP-FUNDER] Executing trie activation transfer of {} EGLD...", 
         (drip_amt as f64) / 1e18);

    let relayer_nonce = network.fetch_nonce(&drip_wallet.bech32_address).await?;

    let mut funding_tx = Transaction::new(
      relayer_nonce,
      &self.activation_amount,
      stealth_bech32,
      &drip_wallet.bech32_address,
      1_000_000_000, // GasPrice
      50_000,    // Standard EGLD transfer gas limit
      None,     // Simple value transfer
      "T",      // Testnet ChainID
      1       // Version 1
    );

    funding_tx.sign(&drip_wallet.signing_key)?;

    match network.broadcast_tx(&funding_tx).await {
      Ok(tx_hash) => {
        log::info!("  Trie registration transaction broadcasted: {}", tx_hash);
        log::info!("  Waiting for block finalization (Supernova polling)...");
        let mut status = "pending".to_string();
        for _attempt in 1..=25 {
          tokio::time::sleep(Duration::from_millis(200)).await;
          if let Ok(st) = network.fetch_tx_status(&tx_hash).await {
            status = st;
            if status == "success" || status == "invalid" || status == "dropped" || status == "fail" {
              break;
            }
          }
        }
        
        // Confirm registration
        if status == "success" {
          log::info!("  Stealth address registered in MultiversX Trie successfully.");
          Ok(true)
        } else {
          log::warn!("  ⚠️ Trie registration transaction pending or failed on-chain. Status: {}", status);
          Ok(true) // Return true to allow attempt, but log warning
        }
      }
      Err(e) => {
        // Revert daily accumulator on broadcast failure
        if let Ok(mut accum) = self.daily_accumulator.lock() {
          if *accum >= drip_amt {
            *accum -= drip_amt;
          }
        }
        log::error!("  Failed to broadcast Drip activation transaction: {}", e);
        Err(e)
      }
    }
  }

  /// SWEEPER: Reclaims residual balances from one-time Stealth Addresses back to the Drip Wallet
  /// Uses Relayed V3 to sponsor the transaction gas, guaranteeing 100% recovery of the drip principal.
  pub async fn sweep_residual(
    &self,
    network: &MultiversXNetwork,
    stealth_wallet: &KeeperWallet,
    drip_wallet: &KeeperWallet,
  ) -> Result<String, Box<dyn Error>> {
    let stealth_balance = {
      let client = reqwest::Client::new();
      let url = format!("https://testnet-api.multiversx.com/accounts/{}", stealth_wallet.bech32_address);
      #[derive(serde::Deserialize)]
      struct Acc { balance: String }
      let resp = client.get(&url).send().await?.json::<Acc>().await?;
      resp.balance.parse::<u128>().unwrap_or(0)
    };

    if stealth_balance == 0 {
      return Err("Stealth Address has 0 balance, nothing to sweep.".into());
    }

    let stealth_nonce = network.fetch_nonce(&stealth_wallet.bech32_address).await?;

    log::info!(" [SWEEPER] Sweeping full residual {} wei back to drip wallet using Relayed V3...", stealth_balance);

    let mut sweep_tx = Transaction::new(
      stealth_nonce,
      &stealth_balance.to_string(),
      &drip_wallet.bech32_address,
      &stealth_wallet.bech32_address,
      1_000_000_000,
      1_000_000, // Sufficient limit for Relayed V3 transfer
      None,
      "T",
      2 // Version 2 required for Relayed V3
    );

    sweep_tx.relayer = Some(drip_wallet.bech32_address.clone());
    sweep_tx.sign(&stealth_wallet.signing_key)?;
    sweep_tx.to_relayed_v3(&drip_wallet.bech32_address, &drip_wallet.signing_key)?;

    let tx_hash = network.broadcast_tx(&sweep_tx).await?;
    log::info!("  Residual sweep transaction broadcasted: {}", tx_hash);
    log::info!("  Waiting for block finalization (Supernova polling)...");
    let mut status = "pending".to_string();
    for _attempt in 1..=25 {
      tokio::time::sleep(Duration::from_millis(200)).await;
      if let Ok(st) = network.fetch_tx_status(&tx_hash).await {
        status = st;
        if status == "success" || status == "invalid" || status == "dropped" || status == "fail" {
          break;
        }
      }
    }

    if status == "success" {
      log::info!("  Residual swept successfully via Relayed V3. Tx: {}", tx_hash);
      Ok(tx_hash)
    } else {
      Err(format!("Sweep transaction execution failed with status: {}", status).into())
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_drip_funder_daily_cap() {
    let funder = DripFunder::new("5000000000000000", 0.001);
    // Configurar un límite diario pequeño para el test, ej. 0.015 EGLD (15_000_000_000_000_000 wei)
    let mut funder = funder;
    funder.max_daily_drip_cap = 15_000_000_000_000_000;

    // Primer drip de 5_000_000_000_000_000 wei
    assert!(funder.check_and_increment_drip(5_000_000_000_000_000).is_ok());
    assert_eq!(*funder.daily_accumulator.lock().unwrap(), 5_000_000_000_000_000);

    // Segundo drip de 5_000_000_000_000_000 wei
    assert!(funder.check_and_increment_drip(5_000_000_000_000_000).is_ok());
    assert_eq!(*funder.daily_accumulator.lock().unwrap(), 10_000_000_000_000_000);

    // Tercer drip de 5_000_000_000_000_000 wei
    assert!(funder.check_and_increment_drip(5_000_000_000_000_000).is_ok());
    assert_eq!(*funder.daily_accumulator.lock().unwrap(), 15_000_000_000_000_000);

    // Cuarto drip de 5_000_000_000_000_000 wei -> Debe fallar ya que excede el límite de 15_000_000_000_000_000 wei
    let res = funder.check_and_increment_drip(5_000_000_000_000_000);
    assert!(res.is_err());
    assert!(res.unwrap_err().to_string().contains("daily limit exceeded"));
  }

  #[test]
  fn test_drip_funder_time_window_reset() {
    let funder = DripFunder::new("5000000000000000", 0.001);
    let mut funder = funder;
    funder.max_daily_drip_cap = 10_000_000_000_000_000;

    // Primer drip de 5_000_000_000_000_000 wei - OK
    assert!(funder.check_and_increment_drip(5_000_000_000_000_000).is_ok());

    // Modificamos el timestamp de reseteo para simular que ocurrió hace 25 horas (90000 segundos en el pasado)
    {
      let mut last_reset = funder.last_reset_timestamp.lock().unwrap();
      *last_reset = *last_reset - 90000;
    }

    // Al hacer un nuevo drip, debería detectar la ventana de 24 horas y resetear el acumulador daily
    assert!(funder.check_and_increment_drip(5_000_000_000_000_000).is_ok());
    // El acumulador ahora solo debe valer 5_000_000_000_000_000 wei en lugar de 10_000_000_000_000_000 wei, porque fue reseteado a 0 antes de incrementarse
    assert_eq!(*funder.daily_accumulator.lock().unwrap(), 5_000_000_000_000_000);
  }
}

