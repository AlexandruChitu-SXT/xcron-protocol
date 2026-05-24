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
}

pub struct PrivacySessionManager {
  pub sessions: RwLock<HashMap<String, PrivacySession>>,
  pub global_float_limit: u128,       // e.g. 5.0 EGLD (5_000_000_000_000_000_000)
  pub max_active_drips_per_user: usize, // e.g. 3 active sessions concurrently
  pub retry_queue: Mutex<Vec<String>>,  // List of stealth addresses to retry sweep
  pub max_retry_limit: u32,             // e.g. 5 attempts
}

impl PrivacySessionManager {
  pub fn new(global_float_limit: u128, max_active_drips_per_user: usize) -> Self {
    Self {
      sessions: RwLock::new(HashMap::new()),
      global_float_limit,
      max_active_drips_per_user,
      retry_queue: Mutex::new(Vec::new()),
      max_retry_limit: 5,
    }
  }

  /// Verifies safety limits (global & per-user) before authorizing a new privacy session.
  pub fn authorize_session(
    &self,
    user_address: &str,
    stealth_address: &str,
    drip_amount: u128,
  ) -> Result<(), String> {
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map_err(|e| format!("SystemTime error: {}", e))?
      .as_secs();

    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;

    // 1. Enforce global outstanding float cap
    let current_outstanding: u128 = sessions_guard
      .values()
      .filter(|s| s.status == SessionStatus::Dripped || s.status == SessionStatus::FailedSweep)
      .map(|s| s.amount_dripped)
      .sum();

    if current_outstanding + drip_amount > self.global_float_limit {
      return Err(format!(
        "Admission Denied: Global outstanding float limit reached. Limit: {} wei, Current: {} wei, Requested: {} wei",
        self.global_float_limit, current_outstanding, drip_amount
      ));
    }

    // 2. Enforce per-user active session limits (anti-sybil control)
    let active_user_sessions = sessions_guard
      .values()
      .filter(|s| {
        s.user_address == user_address
          && (s.status == SessionStatus::Dripped || s.status == SessionStatus::FailedSweep)
      })
      .count();

    if active_user_sessions >= self.max_active_drips_per_user {
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
    };

    sessions_guard.insert(stealth_address.to_string(), new_session);
    Ok(())
  }

  /// Marks a session as successfully swept and resolved.
  pub fn complete_session(&self, stealth_address: &str) -> Result<(), String> {
    let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions".to_string())?;
    if let Some(session) = sessions_guard.get_mut(stealth_address) {
      session.status = SessionStatus::Swept;
      Ok(())
    } else {
      Err(format!("Session for stealth address {} not found", stealth_address))
    }
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
  ) -> Result<(), String> {
    let mut queue = self.retry_queue.lock().map_err(|_| "Failed to lock retry queue")?;
    if queue.is_empty() {
      return Ok(());
    }

    let mut successfully_swept = Vec::new();

    for stealth_addr in queue.iter() {
      if let Some(stealth_wallet) = stealth_wallets.get(stealth_addr) {
        log::info!(" [SESSION-DB] Retrying sweep for stealth address {}...", stealth_addr);
        match drip_funder.sweep_residual(network, stealth_wallet, drip_wallet).await {
          Ok(tx_hash) => {
            log::info!(" [SESSION-DB] Retry sweep success! Hash: {}", tx_hash);
            successfully_swept.push(stealth_addr.clone());
          }
          Err(e) => {
            log::error!(" [SESSION-DB] Retry sweep failed for {}: {}", stealth_addr, e);
            // Increment the retry count
            let mut sessions_guard = self.sessions.write().map_err(|_| "Failed to lock sessions")?;
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
        log::error!(" [SESSION-DB] Private key for stealth wallet {} not found in local memory", stealth_addr);
        successfully_swept.push(stealth_addr.clone()); // Discard from queue if we don't have the keys
      }
    }

    // Remove successful or exhausted items
    queue.retain(|addr| !successfully_swept.contains(addr));

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
    assert!(manager.authorize_session(user_a, stealth_1, 5_000_000_000_000_000).is_ok());
    assert_eq!(manager.active_session_count(), 1);

    // 2. Authorize session 2 for user A (5_000_000_000_000_000 wei) - OK
    assert!(manager.authorize_session(user_a, stealth_2, 5_000_000_000_000_000).is_ok());
    assert_eq!(manager.active_session_count(), 2);

    // 3. Authorize session 3 for user A - should fail (per-user limit = 2)
    let res_user_limit = manager.authorize_session(user_a, stealth_3, 5_000_000_000_000_000);
    assert!(res_user_limit.is_err());
    assert!(res_user_limit.unwrap_err().contains("Per-user active session limit reached"));

    // 4. Authorize session for user B (6_000_000_000_000_000 wei) - should fail (global limit = 15_000_000_000_000_000, requested would put total at 16_000_000_000_000_000)
    let res_global_limit = manager.authorize_session(user_b, stealth_4, 6_000_000_000_000_000);
    assert!(res_global_limit.is_err());
    assert!(res_global_limit.unwrap_err().contains("Global outstanding float limit reached"));

    // 5. Complete session 1
    assert!(manager.complete_session(stealth_1).is_ok());
    assert_eq!(manager.active_session_count(), 1);

    // 6. Now session for user B should succeed since outstanding is 5_000_000_000_000_000 and total with new will be 10_000_000_000_000_000 <= 15_000_000_000_000_000
    assert!(manager.authorize_session(user_b, stealth_4, 5_000_000_000_000_000).is_ok());
    assert_eq!(manager.active_session_count(), 2);
  }

  #[test]
  fn test_failed_sweep_queueing() {
    let manager = PrivacySessionManager::new(10_000_000_000_000_000, 2);
    let user = "erd1userAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let stealth = "erd1stealth1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    assert!(manager.authorize_session(user, stealth, 5_000_000_000_000_000).is_ok());

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

    assert!(manager.authorize_session(user, stealth, 5_000_000_000_000_000).is_ok());
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
    let res = manager.process_retry_queue(&network, &drip_funder, &drip_wallet, &stealth_wallets).await;
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

    let res = manager.process_retry_queue(&network, &drip_funder, &drip_wallet, &stealth_wallets).await;
    assert!(res.is_ok());

    // It should have been discarded from the queue
    {
      let queue = manager.retry_queue.lock().unwrap();
      assert!(queue.is_empty());
    }
  }
}

