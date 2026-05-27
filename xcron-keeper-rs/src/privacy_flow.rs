use std::collections::HashMap;
use std::error::Error;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::session_db::{PrivacySessionManager, SessionStatus, PrivacySession};
use crate::drip_funder::DripFunder;
use crate::network::MultiversXNetwork;
use crate::wallet::KeeperWallet;
use crate::transaction::Transaction;

/// Integrated Privacy Flow
///
/// Encapsulates the entire production lifecycle of the XCron Native Privacy Flow:
/// 1. Session authorization (enforcing user and global limits via SessionDB)
/// 2. Durable state persistence (surviving restarts)
use std::sync::Mutex;

/// 3. Ephemeral account drip-funding
/// 4. Execution / Relayed V3 dispatching
/// 5. Relayed V3 sweep recovery
/// 6. Session completion and float decrement
pub struct IntegratedPrivacyFlow {
  pub session_manager: Arc<PrivacySessionManager>,
  pub drip_funder: Arc<DripFunder>,
  pub network: Arc<MultiversXNetwork>,
  pub db_path: String,
  pub persist_lock: Mutex<()>,
}

impl IntegratedPrivacyFlow {
  pub fn new(
    db_path: &str,
    global_float_limit: u128,
    max_active_drips: usize,
    drip_amount: &str,
    min_threshold_egld: f64,
    network: Arc<MultiversXNetwork>,
  ) -> Self {
    let session_manager = Arc::new(PrivacySessionManager::new(global_float_limit, max_active_drips));
    let drip_funder = Arc::new(DripFunder::new(drip_amount, min_threshold_egld));

    let flow = Self {
      session_manager,
      drip_funder,
      network,
      db_path: db_path.to_string(),
      persist_lock: Mutex::new(()),
    };

    // Load initial persisted state if file exists
    if let Err(e) = flow.load_persisted_sessions() {
      log::error!(" [INTEGRATED-FLOW] Error loading persisted sessions: {}", e);
    }

    flow
  }

  /// Loads persisted sessions from the local JSON store (resolves crash-survivability).
  pub fn load_persisted_sessions(&self) -> Result<(), Box<dyn Error>> {
    let path = Path::new(&self.db_path);
    if !path.exists() {
      log::info!(" [INTEGRATED-FLOW] No persisted sessions file found. Starting fresh.");
      return Ok(());
    }

    let mut file = File::open(path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;

    let persisted: HashMap<String, PrivacySession> = serde_json::from_str(&contents)?;
    let mut sessions_guard = self.session_manager.sessions.write()
      .map_err(|_| "Failed to lock sessions for writing")?;
    
    *sessions_guard = persisted;
    log::info!(" [INTEGRATED-FLOW] Successfully loaded {} persisted sessions.", sessions_guard.len());
    
    // Repopulate the retry queue for failed sweeps on restart
    let mut queue_guard = self.session_manager.retry_queue.lock()
      .map_err(|_| "Failed to lock retry queue")?;
    queue_guard.clear();
    for (addr, session) in sessions_guard.iter() {
      if session.status == SessionStatus::FailedSweep && session.retry_count <= self.session_manager.max_retry_limit {
        queue_guard.push(addr.clone());
      }
    }
    if !queue_guard.is_empty() {
      log::info!(" [INTEGRATED-FLOW] Queued {} failed sweeps for retry on startup.", queue_guard.len());
    }

    Ok(())
  }

  /// Persists current sessions to a local JSON file (resolves crash-survivability).
  pub fn persist_sessions(&self) -> Result<(), Box<dyn Error>> {
    let _lock = self.persist_lock.lock().map_err(|_| "Failed to lock persistence mutex")?;
    let sessions_guard = self.session_manager.sessions.read()
      .map_err(|_| "Failed to lock sessions for reading")?;
    
    let serialized = serde_json::to_string_pretty(&*sessions_guard)?;
    
    // Write atomically using a temporary file
    let tmp_path = format!("{}.tmp", self.db_path);
    {
      let mut file = File::create(&tmp_path)?;
      file.write_all(serialized.as_bytes())?;
    }
    std::fs::rename(tmp_path, &self.db_path)?;

    Ok(())
  }

  /// Executes the canonical production lifecycle trace requested by Drew:
  ///
  /// `Scheduler task / user request → authorize session → check outstanding float → drip → Relayed V3 execution → Relayed V3 sweep → complete session → decrement outstanding float → close accounting state`
  pub async fn execute_private_session_lifecycle(
    &self,
    user_address: &str,
    stealth_wallet: &KeeperWallet,
    drip_wallet: &KeeperWallet,
    drip_amount: u128,
    execution_payload: &[u8],
    target_contract: &str,
    gas_limit: u64,
    scheduler_address: &str,
    task_hash: Option<[u8; 32]>,
    nonce: Option<u64>,
  ) -> Result<String, Box<dyn Error>> {
    let stealth_bech32 = &stealth_wallet.bech32_address;

    log::info!("==================================================");
    log::info!(" [INTEGRATED-FLOW] Starting Native Privacy Flow...");
    log::info!(" User: {}, Stealth: {}", user_address, stealth_bech32);
    log::info!("==================================================");

    let task_hash_str = task_hash.map(|h| hex::encode(h));
    let target_contract_str = Some(target_contract.to_string());

    // 1. Authorize session & check outstanding float limits (admission control)
    log::info!(" [STEP 1/6] Authorizing session in SessionDB...");
    self.session_manager.authorize_session(
      user_address,
      stealth_bech32,
      drip_amount,
      task_hash_str,
      target_contract_str,
      nonce,
    )
    .map_err(|e| format!("Session Authorization Failed: {}", e))?;
    
    // Persist immediately to reflect the outstanding float registration
    self.persist_sessions()?;
    log::info!("   Admission Granted. Session persisted.");

    // 1.5 Verify Quantum Task on-chain before activating (drip funding)
    if let Some(hash) = task_hash {
      log::info!("   [Verification] Querying Scheduler for Quantum Task: {}", hex::encode(hash));
      let args = vec![hex::encode(hash)];
      let query_res = self.network.query_vm(scheduler_address, "getQuantumTask", args).await?;
      if query_res.is_empty() || query_res[0].is_empty() {
        // Clean up session in db on immediate failure
        let mut sessions_guard = self.session_manager.sessions.write().unwrap();
        sessions_guard.remove(stealth_bech32);
        drop(sessions_guard);
        let _ = self.persist_sessions();
        return Err("Quantum Task does not exist on-chain".into());
      }
      
      let decoded_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &query_res[0])?;
      if decoded_bytes.len() < 37 {
        // Clean up session in db on immediate failure
        let mut sessions_guard = self.session_manager.sessions.write().unwrap();
        sessions_guard.remove(stealth_bech32);
        drop(sessions_guard);
        let _ = self.persist_sessions();
        return Err("Invalid QuantumTaskState payload returned from Scheduler VM".into());
      }
      
      let deposit_len = u32::from_be_bytes(decoded_bytes[32..36].try_into()?) as usize;
      if decoded_bytes.len() < 37 + deposit_len {
        // Clean up session in db on immediate failure
        let mut sessions_guard = self.session_manager.sessions.write().unwrap();
        sessions_guard.remove(stealth_bech32);
        drop(sessions_guard);
        let _ = self.persist_sessions();
        return Err("Invalid QuantumTaskState payload: length mismatch".into());
      }
      
      let deposit_bytes = &decoded_bytes[36..(36 + deposit_len)];
      let is_prepaid = deposit_bytes.iter().any(|&b| b != 0);
      if !is_prepaid {
        // Clean up session in db on immediate failure
        let mut sessions_guard = self.session_manager.sessions.write().unwrap();
        sessions_guard.remove(stealth_bech32);
        drop(sessions_guard);
        let _ = self.persist_sessions();
        return Err("Quantum Task is not prepaid (deposit is zero)".into());
      }
      
      let status_byte = decoded_bytes[36 + deposit_len];
      if status_byte != 0 {
        // Clean up session in db on immediate failure
        let mut sessions_guard = self.session_manager.sessions.write().unwrap();
        sessions_guard.remove(stealth_bech32);
        drop(sessions_guard);
        let _ = self.persist_sessions();
        return Err(format!("Quantum Task status is not Pending. On-chain status discriminant: {}", status_byte).into());
      }
      log::info!("   [Verification] Task successfully validated: prepaid and pending.");
    }

    // 2. Drip activation float (if stealth account is fresh in State Trie)
    log::info!(" [STEP 2/6] Activating Ephemeral Stealth Address on L1...");
    let dripped = self.drip_funder.ensure_stealth_activated(&self.network, stealth_bech32, drip_wallet).await;
    
    if let Err(e) = dripped {
      log::error!("   Drip funding failed: {}", e);
      // Clean up session in db on immediate failure
      let mut sessions_guard = self.session_manager.sessions.write().unwrap();
      sessions_guard.remove(stealth_bech32);
      drop(sessions_guard);
      let _ = self.persist_sessions();
      return Err(e);
    }
    log::info!("   Account activated successfully.");

    // 3. Relayed V3 Execution (Sovereign Enclave dispatch)
    log::info!(" [STEP 3/6] Dispatching Relayed V3 execution task...");
    
    let stealth_nonce = self.network.fetch_nonce(stealth_bech32).await?;
    let mut inner_tx = Transaction::new(
      stealth_nonce,
      "0",
      target_contract,
      stealth_bech32,
      1_000_000_000, // GasPrice
      gas_limit,
      Some(execution_payload),
      "T", // Testnet
      2 // Relayed inner V2
    );

    // Sign inner transaction with the Ephemeral key
    inner_tx.sign(&stealth_wallet.signing_key)?;

    // Wrap in Relayed V3 where the Drip Wallet acts as relayer (sponsoring execution gas)
    inner_tx.relayer = Some(drip_wallet.bech32_address.clone());
    inner_tx.to_relayed_v3(&drip_wallet.bech32_address, &drip_wallet.signing_key)?;

    let exec_hash = self.network.broadcast_tx(&inner_tx).await?;
    log::info!("   Relayed V3 Execution Tx broadcasted: {}", exec_hash);
    
    log::info!("   Waiting for Supernova finality (Supernova polling)...");
    let mut status = "pending".to_string();
    for _attempt in 1..=25 {
      tokio::time::sleep(Duration::from_millis(200)).await;
      if let Ok(st) = self.network.fetch_tx_status(&exec_hash).await {
        status = st;
        if status == "success" || status == "invalid" || status == "dropped" || status == "fail" {
          break;
        }
      }
    }

    // Confirm finality
    let exec_success = status == "success";
    if !exec_success {
      log::warn!("   ⚠️ Execution transaction pending or failed: {}", status);
    } else {
      log::info!("   Execution Tx confirmed successfully.");
    }

    // Save execution result to DB
    if let Err(e) = self.session_manager.set_execution_result(stealth_bech32, exec_hash.clone(), exec_success) {
      log::error!("   Failed to set execution result: {}", e);
    }
    let _ = self.persist_sessions();

    // 4. Relayed V3 Sweep (reclaiming residual balance to Drip Wallet)
    log::info!(" [STEP 4/6] Initializing Relayed V3 sweep recovery...");
    let sweep_result = self.drip_funder.sweep_residual(&self.network, stealth_wallet, drip_wallet).await;

    match sweep_result {
      Ok(sweep_hash) => {
        log::info!("   Sweep successful. Hash: {}", sweep_hash);
        
        // Save sweep hash to DB
        if let Err(e) = self.session_manager.set_sweep_hash(stealth_bech32, sweep_hash.clone()) {
          log::error!("   Failed to set sweep hash: {}", e);
        }
        
        // 5. Complete session (decrement outstanding float)
        log::info!(" [STEP 5/6] Completing session and closing accounting...");
        self.session_manager.complete_session(stealth_bech32)?;
        
        // 6. Persist final resolved state
        log::info!(" [STEP 6/6] Persisting accounting state...");
        self.persist_sessions()?;
        
        log::info!("==================================================");
        log::info!(" NATIVE PRIVACY FLOW COMPLETED SUCCESSFULLY");
        log::info!("==================================================");
        
        Ok(sweep_hash)
      }
      Err(e) => {
        log::error!("   Sweep failed: {}. Queueing for off-chain retry.", e);
        
        // Register failure in database so it is retried asynchronously
        self.session_manager.register_failed_sweep(stealth_bech32)?;
        let _ = self.persist_sessions();
        
        log::warn!("==================================================");
        log::warn!(" FLOW CLOSED WITH UNRESOLVED DEBT (QUEUED)");
        log::warn!("==================================================");
        
        Err(e)
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_persist_and_load_flow() {
    let temp_db = "./temp_test_db.json";
    let network = Arc::new(MultiversXNetwork::new("http://127.0.0.1:8080"));
    let flow = IntegratedPrivacyFlow::new(temp_db, 10_000_000_000_000_000, 2, "5000000000000000", 0.001, network);

    let user = "erd1userAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth = "erd1stealth1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    // 1. Authorize session
    assert!(flow.session_manager.authorize_session(user, stealth, 5_000_000_000_000_000, None, None, None).is_ok());
    assert!(flow.persist_sessions().is_ok());

    // 2. Create another instance pointing to the same db to test load
    let network2 = Arc::new(MultiversXNetwork::new("http://127.0.0.1:8080"));
    let flow2 = IntegratedPrivacyFlow::new(temp_db, 10_000_000_000_000_000, 2, "5000000000000000", 0.001, network2);

    assert_eq!(flow2.session_manager.active_session_count(), 1);

    // Clean up
    let _ = std::fs::remove_file(temp_db);
  }
}

