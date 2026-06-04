use std::collections::HashMap;
use std::sync::{RwLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::network::MultiversXNetwork;
use crate::drip_funder::DripFunder;
use crate::wallet::KeeperWallet;

use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionStatus {
  Dripped,
  Swept,
  FailedSweep,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacySession {
  pub stealth_address: String,
  pub user_address: String,
  pub amount_dripped: u128,
  pub status: SessionStatus,
  pub retry_count: u32,
  pub created_at: u64,
  pub task_hash: Option<String>,
  pub target_contract: Option<String>,
  pub execution_tx_hash: Option<String>,
  pub sweep_tx_hash: Option<String>,
  pub execution_success: Option<bool>,
  pub nonce: Option<u64>,
}

pub struct PrivacySessionManager {
  pub sessions: RwLock<HashMap<String, PrivacySession>>,
  pub global_float_limit: u128,       // e.g. 5.0 EGLD (5_000_000_000_000_000_000)
  pub max_active_drips_per_user: usize, // e.g. 3 active sessions concurrently
  pub retry_queue: Mutex<Vec<String>>,  // List of stealth addresses to retry sweep
  pub max_retry_limit: u32,             // e.g. 5 attempts
  pub global_outstanding_float: Mutex<u128>, // Track outstanding float in O(1)
}

impl PrivacySessionManager {
  pub fn new(global_float_limit: u128, max_active_drips_per_user: usize) -> Self {
    Self {
      sessions: RwLock::new(HashMap::new()),
      global_float_limit,
      max_active_drips_per_user,
      retry_queue: Mutex::new(Vec::new()),
      max_retry_limit: 5,
      global_outstanding_float: Mutex::new(0),
    }
  }

  /// Verifies safety limits (global & per-user) before authorizing a new privacy session.
  pub fn authorize_session(
    &self,
    user_address: &str,
    stealth_address: &str,
    drip_amount: u128,
    task_hash: Option<String>,
    target_contract: Option<String>,
    nonce: Option<u64>,
  ) -> Result<(), String> {
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map_err(|e| format!("SystemTime error: {}", e))?
      .as_secs();

    // 1. Enforce global outstanding float cap in O(1) atomically (prevents TOCTOU)
    {
      let mut float_guard = self.global_outstanding_float.lock().map_err(|_| "Failed to lock float".to_string())?;
      if *float_guard + drip_amount > self.global_float_limit {
        return Err(format!(
          "Admission Denied: Global outstanding float limit reached. Limit: {} wei, Current: {} wei, Requested: {} wei",
          self.global_float_limit, *float_guard, drip_amount
        ));
      }
      *float_guard += drip_amount;
    }

    let mut sessions_guard = match self.sessions.write() {
      Ok(guard) => guard,
      Err(_) => {
        // Revert float allocation on lock failure
        if let Ok(mut float_guard) = self.global_outstanding_float.lock() {
          *float_guard = float_guard.saturating_sub(drip_amount);
        }
        return Err("Failed to lock sessions".to_string());
      }
    };

    // 2. Enforce per-user active session limits (anti-sybil control)
    let active_user_sessions = sessions_guard
      .values()
      .filter(|s| {
        s.user_address == user_address
          && (s.status == SessionStatus::Dripped || s.status == SessionStatus::FailedSweep)
      })
      .count();

    if active_user_sessions >= self.max_active_drips_per_user {
      // Revert outstanding float increment
      if let Ok(mut float_guard) = self.global_outstanding_float.lock() {
        *float_guard = float_guard.saturating_sub(drip_amount);
      }
      return Err(format!(
        "Admission Denied: Per-user active session limit reached ({} active sessions)",
        active_user_sessions
      ));
    }

    // 3. Register the authorized session
    let new_session = PrivacySession {
      stealth_address: stealth_address.to_string(),
      user_address: user_address.to_string(),
      amount_dripped: drip_amount,
      status: SessionStatus::Dripped,
      retry_count: 0,
      created_at: now,
      task_hash,
      target_contract,
      execution_tx_hash: None,
      sweep_tx_hash: None,
      execution_success: None,
      nonce,
    };

    sessions_guard.insert(stealth_address.to_string(), new_session);
    Ok(())
  }

  /// Sets the execution transaction hash and success status for a session.
  pub fn set_execution_result(&self, stealth_address: &str, tx_hash: String, success: bool) -> Result<(), String> {
    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
    if let Some(session) = sessions_guard.get_mut(stealth_address) {
      session.execution_tx_hash = Some(tx_hash);
      session.execution_success = Some(success);
      Ok(())
    } else {
      Err(format!("Session for stealth address {} not found", stealth_address))
    }
  }

  /// Sets the sweep transaction hash for a session.
  pub fn set_sweep_hash(&self, stealth_address: &str, tx_hash: String) -> Result<(), String> {
    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
    if let Some(session) = sessions_guard.get_mut(stealth_address) {
      session.sweep_tx_hash = Some(tx_hash);
      Ok(())
    } else {
      Err(format!("Session for stealth address {} not found", stealth_address))
    }
  }

  /// Marks a session as successfully swept and resolved.
  pub fn complete_session(&self, stealth_address: &str) -> Result<(), String> {
    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
    if let Some(session) = sessions_guard.get_mut(stealth_address) {
      if session.status == SessionStatus::Dripped || session.status == SessionStatus::FailedSweep {
        let mut float_guard = self.global_outstanding_float.lock().map_err(|_| "Failed to lock float".to_string())?;
        *float_guard = float_guard.saturating_sub(session.amount_dripped);
      }
      session.status = SessionStatus::Swept;
      Ok(())
    } else {
      Err(format!("Session for stealth address {} not found", stealth_address))
    }
  }

  /// Aborts a session, removes it from memory, and decrements outstanding float if active.
  pub fn abort_session(&self, stealth_address: &str) -> Result<(), String> {
    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
    if let Some(session) = sessions_guard.remove(stealth_address) {
      if session.status == SessionStatus::Dripped || session.status == SessionStatus::FailedSweep {
        let mut float_guard = self.global_outstanding_float.lock().map_err(|_| "Failed to lock float".to_string())?;
        *float_guard = float_guard.saturating_sub(session.amount_dripped);
      }
    }
    Ok(())
  }

  /// Recalculates the global outstanding float from scratch.
  pub fn recalculate_outstanding_float(&self) -> Result<(), String> {
    let sessions_guard = self.sessions.read().map_err(|_| "Failed to lock sessions".to_string())?;
    let current_outstanding: u128 = sessions_guard
      .values()
      .filter(|s| s.status == SessionStatus::Dripped || s.status == SessionStatus::FailedSweep)
      .map(|s| s.amount_dripped)
      .sum();
    let mut float_guard = self.global_outstanding_float.lock().map_err(|_| "Failed to lock float".to_string())?;
    *float_guard = current_outstanding;
    Ok(())
  }

  /// Registers a failed sweep, updates state, and queue for retry.
  pub fn register_failed_sweep(&self, stealth_address: &str) -> Result<(), String> {
    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
    if let Some(session) = sessions_guard.get_mut(stealth_address) {
      session.status = SessionStatus::FailedSweep;
      session.retry_count += 1;
      
      if session.retry_count <= self.max_retry_limit {
        let mut queue = self.retry_queue.lock().map_err(|_| "Failed to lock retry queue")?;
        if !queue.contains(&stealth_address.to_string()) {
          queue.push(stealth_address.to_string());
        }
        log::warn!(" [SESSION-DB] Sweep failed. Queued for retry ({}/{}): {}", session.retry_count, self.max_retry_limit, stealth_address);
      } else {
        log::error!(" [SESSION-DB] Sweep permanently failed. Maximum retry limit reached: {}", stealth_address);
      }
      Ok(())
    } else {
      Err(format!("Session for stealth address {} not found", stealth_address))
    }
  }

  /// Iterates and retries sweeping all pending failed sweeps.
  pub async fn process_retry_queue(
    &self,
    network: &MultiversXNetwork,
    drip_funder: &DripFunder,
    drip_wallet: &KeeperWallet,
    stealth_wallets: &HashMap<String, KeeperWallet>,
    enclave_seed: Option<&[u8; 32]>,
  ) -> Result<(), String> {
    let pending_retries: Vec<String> = {
      let queue = self.retry_queue.lock().map_err(|_| "Failed to lock retry queue")?;
      queue.clone()
    };
    if pending_retries.is_empty() {
      return Ok(());
    }

    let mut successfully_swept = Vec::new();

    for stealth_addr in pending_retries.iter() {
      let mut stealth_wallet_opt = stealth_wallets.get(stealth_addr).cloned();
      
      if stealth_wallet_opt.is_none() {
        if let Some(seed) = enclave_seed {
          // Reconstruct key deterministically from enclave seed
          if let Some(session) = self.sessions.read().ok().and_then(|g| g.get(stealth_addr).cloned()) {
            if let Some(nonce) = session.nonce {
              let user_hex = KeeperWallet::bech32_to_hex(&session.user_address);
              if let Ok(user_bytes) = hex::decode(&user_hex) {
                if user_bytes.len() == 32 {
                  let mut user_pubkey = [0u8; 32];
                  user_pubkey.copy_from_slice(&user_bytes);
                  if let Ok(keypair) = xse_protocol::crypto::derive_ephemeral_stealth_key(seed, &user_pubkey, nonce) {
                    let signing_key = ed25519_dalek::SigningKey::from_bytes(&keypair.private_key);
                    stealth_wallet_opt = Some(KeeperWallet {
                      signing_key,
                      bech32_address: stealth_addr.clone(),
                    });
                    log::info!(" [SESSION-DB] Deterministically reconstructed ephemeral stealth key from enclave seed for {}", stealth_addr);
                  }
                }
              }
            }
          }
        }
      }

      if let Some(stealth_wallet) = stealth_wallet_opt {
        log::info!(" [SESSION-DB] Retrying sweep for stealth address {}...", stealth_addr);
        match drip_funder.sweep_residual(network, &stealth_wallet, drip_wallet).await {
          Ok(tx_hash) => {
            log::info!(" [SESSION-DB] Retry sweep success! Hash: {}", tx_hash);
            let _ = self.set_sweep_hash(stealth_addr, tx_hash);
            successfully_swept.push(stealth_addr.clone());
          }
          Err(e) => {
            log::error!(" [SESSION-DB] Retry sweep failed for {}: {}", stealth_addr, e);
            // Increment the retry count
            let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
            if let Some(session) = sessions_guard.get_mut(stealth_addr) {
              session.retry_count += 1;
              if session.retry_count > self.max_retry_limit {
                log::error!(" [SESSION-DB] Session {} exceeded maximum retries. Discarding from queue.", stealth_addr);
                successfully_swept.push(stealth_addr.clone());
              }
            }
          }
        }
      } else {
        log::error!(" [SESSION-DB] Private key for stealth wallet {} not found in local memory and cannot be reconstructed", stealth_addr);
        successfully_swept.push(stealth_addr.clone()); // Discard from queue if we don't have the keys
      }
    }

    // Remove successful or exhausted items
    {
      let mut queue = self.retry_queue.lock().map_err(|_| "Failed to lock retry queue")?;
      queue.retain(|addr| !successfully_swept.contains(addr));
    }

    for addr in successfully_swept {
      let sessions_read = self.sessions.read().map_err(|_| "Failed to lock sessions")?;
      if let Some(s) = sessions_read.get(&addr) {
        if s.retry_count <= self.max_retry_limit {
          drop(sessions_read);
          let _ = self.complete_session(&addr);
        }
      }
    }

    Ok(())
  }

  /// Prunes resolved (Swept) or permanently failed sessions that are older than expiration_seconds.
  /// Returns the number of pruned sessions.
  pub fn prune_expired_sessions(&self, expiration_seconds: u64) -> Result<usize, String> {
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map_err(|e| format!("SystemTime error: {}", e))?
      .as_secs();

    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
    
    let mut to_remove = Vec::new();
    for (stealth_addr, session) in sessions_guard.iter() {
      let is_expired = now.saturating_sub(session.created_at) >= expiration_seconds;
      let can_prune = session.status == SessionStatus::Swept
        || (session.status == SessionStatus::FailedSweep && session.retry_count > self.max_retry_limit);
      
      if is_expired && can_prune {
        to_remove.push(stealth_addr.clone());
      }
    }

    let pruned_count = to_remove.len();
    for addr in to_remove {
      sessions_guard.remove(&addr);
    }

    Ok(pruned_count)
  }

  /// Helper to get current session count (mostly for unit testing)
  pub fn active_session_count(&self) -> usize {
    if let Ok(guard) = self.sessions.read() {
      guard.values().filter(|s| s.status == SessionStatus::Dripped || s.status == SessionStatus::FailedSweep).count()
    } else {
      0
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_authorize_session_limits() {
    // Global limit: 0.015 EGLD (15_000_000_000_000_000 wei)
    // Max active: 2 sessions per user
    let manager = PrivacySessionManager::new(15_000_000_000_000_000, 2);

    let user_a = "erd1userAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let user_b = "erd1userBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_1 = "erd1stealth1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_2 = "erd1stealth2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_3 = "erd1stealth3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_4 = "erd1stealth4xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    // 1. Authorize session 1 for user A (5_000_000_000_000_000 wei)
    assert!(manager.authorize_session(user_a, stealth_1, 5_000_000_000_000_000, None, None, None).is_ok());
    assert_eq!(manager.active_session_count(), 1);

    // 2. Authorize session 2 for user A (5_000_000_000_000_000 wei) - OK
    assert!(manager.authorize_session(user_a, stealth_2, 5_000_000_000_000_000, None, None, None).is_ok());
    assert_eq!(manager.active_session_count(), 2);

    // 3. Authorize session 3 for user A - should fail (per-user limit = 2)
    let res_user_limit = manager.authorize_session(user_a, stealth_3, 5_000_000_000_000_000, None, None, None);
    assert!(res_user_limit.is_err());
    assert!(res_user_limit.unwrap_err().contains("Per-user active session limit reached"));

    // 4. Authorize session for user B (6_000_000_000_000_000 wei) - should fail (global limit = 15_000_000_000_000_000, requested would put total at 16_000_000_000_000_000)
    let res_global_limit = manager.authorize_session(user_b, stealth_4, 6_000_000_000_000_000, None, None, None);
    assert!(res_global_limit.is_err());
    assert!(res_global_limit.unwrap_err().contains("Global outstanding float limit reached"));

    // 5. Complete session 1
    assert!(manager.complete_session(stealth_1).is_ok());
    assert_eq!(manager.active_session_count(), 1);

    // 6. Now session for user B should succeed since outstanding is 5_000_000_000_000_000 and total with new will be 10_000_000_000_000_000 <= 15_000_000_000_000_000
    assert!(manager.authorize_session(user_b, stealth_4, 5_000_000_000_000_000, None, None, None).is_ok());
    assert_eq!(manager.active_session_count(), 2);
  }

  #[test]
  fn test_failed_sweep_queueing() {
    let manager = PrivacySessionManager::new(10_000_000_000_000_000, 2);
    let user = "erd1userAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth = "erd1stealth1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    assert!(manager.authorize_session(user, stealth, 5_000_000_000_000_000, None, None, None).is_ok());

    // Register failure
    assert!(manager.register_failed_sweep(stealth).is_ok());
    
    // Check that it's in the queue
    {
      let queue = manager.retry_queue.lock().unwrap();
      assert_eq!(queue.len(), 1);
      assert_eq!(queue[0], stealth.to_string());
    }

    // Check status
    {
      let sessions = manager.sessions.read().unwrap();
      let session = sessions.get(stealth).unwrap();
      assert_eq!(session.status, SessionStatus::FailedSweep);
      assert_eq!(session.retry_count, 1);
    }
  }

  #[tokio::test]
  async fn test_process_retry_queue_failures() {
    let manager = PrivacySessionManager::new(10_000_000_000_000_000, 2);
    let user = "erd1userAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth = "erd1stealth1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    assert!(manager.authorize_session(user, stealth, 5_000_000_000_000_000, None, None, None).is_ok());
    assert!(manager.register_failed_sweep(stealth).is_ok());

    // Setup dummy network pointing to a dummy local address to trigger failure fast
    let network = MultiversXNetwork::new("http://127.0.0.1:9999");
    let drip_funder = DripFunder::new("5000000000000000", 0.001);
    
    // Create random keeper wallets
    let drip_wallet = KeeperWallet::generate_throwaway();
    let stealth_wallet = KeeperWallet::generate_throwaway();
    let mut stealth_wallets = HashMap::new();
    // We register under the address key
    stealth_wallets.insert(stealth.to_string(), stealth_wallet);

    // Run process_retry_queue. It will fail to sweep because there is no endpoint, so it should increment retry count
    let res = manager.process_retry_queue(&network, &drip_funder, &drip_wallet, &stealth_wallets, None).await;
    // It returns Ok(()) because it logs errors and continues
    assert!(res.is_ok());

    // Check that retry count has increased to 2
    {
      let sessions = manager.sessions.read().unwrap();
      let session = sessions.get(stealth).unwrap();
      assert_eq!(session.retry_count, 2);
    }

    // Now let's set retry count to max_retry_limit (5) and verify it gets discarded on next failure
    {
      let mut sessions = manager.sessions.write().unwrap();
      let session = sessions.get_mut(stealth).unwrap();
      session.retry_count = manager.max_retry_limit; // 5
    }

    let res = manager.process_retry_queue(&network, &drip_funder, &drip_wallet, &stealth_wallets, None).await;
    assert!(res.is_ok());

    // It should have been discarded from the queue
    {
      let queue = manager.retry_queue.lock().unwrap();
      assert!(queue.is_empty());
    }
  }

  #[test]
  fn test_session_pruning() {
    // Set up a session manager
    let manager = PrivacySessionManager::new(20_000_000_000_000_000, 5);
    let user = "erd1userAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_swept = "erd1stealthsweptxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_active = "erd1stealthactivexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_exhausted = "erd1stealthexhaustedxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth_failed_active = "erd1stealthfailedactivexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    // 1. Authorize sessions
    assert!(manager.authorize_session(user, stealth_swept, 5_000_000_000_000_000, None, None, None).is_ok());
    assert!(manager.authorize_session(user, stealth_active, 5_000_000_000_000_000, None, None, None).is_ok());
    assert!(manager.authorize_session(user, stealth_exhausted, 5_000_000_000_000_000, None, None, None).is_ok());

    // Complete the first session (state becomes Swept)
    assert!(manager.complete_session(stealth_swept).is_ok());

    // Make the third session fail and exceed limit (state becomes FailedSweep, retry_count > max_retry_limit)
    for _ in 0..=manager.max_retry_limit {
      assert!(manager.register_failed_sweep(stealth_exhausted).is_ok());
    }

    // Set up a fourth session that fails but has NOT exhausted retries
    assert!(manager.authorize_session(user, stealth_failed_active, 5_000_000_000_000_000, None, None, None).is_ok());
    assert!(manager.register_failed_sweep(stealth_failed_active).is_ok());

    // Backdate the created_at timestamp for stealth_swept and stealth_exhausted to 2 hours ago (7200 seconds)
    {
      let mut sessions = manager.sessions.write().unwrap();
      sessions.get_mut(stealth_swept).unwrap().created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() - 7200;
      sessions.get_mut(stealth_exhausted).unwrap().created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() - 7200;
      sessions.get_mut(stealth_failed_active).unwrap().created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() - 7200;
    }

    // Prune sessions older than 3600 seconds (1 hour)
    let prune_res = manager.prune_expired_sessions(3600);
    assert!(prune_res.is_ok());
    // Should prune exactly 2 sessions: stealth_swept and stealth_exhausted
    // (stealth_active is active/Dripped, and stealth_failed_active has not exhausted retries, so they are not pruned)
    assert_eq!(prune_res.unwrap(), 2);

    // Verify sessions in DB
    {
      let sessions = manager.sessions.read().unwrap();
      assert!(!sessions.contains_key(stealth_swept));
      assert!(!sessions.contains_key(stealth_exhausted));
      assert!(sessions.contains_key(stealth_active));
      assert!(sessions.contains_key(stealth_failed_active));
    }
  }

  #[tokio::test]
  async fn test_concurrent_session_db_stress() {
    use std::sync::Arc;
    let manager = Arc::new(PrivacySessionManager::new(100_000_000_000_000_000_000, 50));
    let mut handles = Vec::new();

    for i in 0..50 {
      let m = manager.clone();
      let h = tokio::spawn(async move {
        let user = format!("erd1user{:056x}", i);
        let stealth = format!("erd1stealth{:053x}", i);
        
        let res = m.authorize_session(&user, &stealth, 1_000_000_000_000_000, None, None, None);
        assert!(res.is_ok());

        let res_comp = m.complete_session(&stealth);
        assert!(res_comp.is_ok());

        let res_prune = m.prune_expired_sessions(0);
        assert!(res_prune.is_ok());
      });
      handles.push(h);
    }

    for h in handles {
      h.await.unwrap();
    }

    assert_eq!(manager.active_session_count(), 0);
  }
}

