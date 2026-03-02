//! TaskMonitor — real-time task monitoring via WebSocket + polling fallback.
//!
//! Connects to MultiversX API WebSocket (v1.17+) for real-time block events.
//! Falls back to HTTP polling if WebSocket is unavailable.

use crate::executor::TaskExecutor;
use crate::price_checker::{PriceChecker, PriceCondition};
use crate::gas_optimizer::{GasOptimizer, AiOptimizedConfig};


use std::collections::{HashMap, HashSet};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::sleep;
use tracing::{info, warn, error, debug};

/// Task discovered by the monitor.
#[derive(Debug, Clone)]
struct MonitoredTask {
    id: u64,
    trigger_time: u64,
    status: u8,
}

pub struct TaskMonitor {
    api_url: String,
    gateway_url: String,
    scheduler_address: String,
    executor: TaskExecutor,
    known_tasks: HashMap<u64, MonitoredTask>,
    failed_tasks: HashSet<u64>,
    last_nonce: u64,
    executed_count: u64,
    http_client: reqwest::Client,
    // Advanced features
    price_checker: PriceChecker,
    price_condition: PriceCondition,
    gas_optimizer: GasOptimizer,
    ai_config: AiOptimizedConfig,
}

impl TaskMonitor {
    pub fn new(
        api_url: String,
        gateway_url: String,
        scheduler_address: String,
        executor: TaskExecutor,
        price_checker: PriceChecker,
        price_condition: PriceCondition,
        gas_optimizer: GasOptimizer,
        ai_config: AiOptimizedConfig,
    ) -> Self {
        Self {
            api_url,
            gateway_url,
            scheduler_address,
            executor,
            known_tasks: HashMap::new(),
            failed_tasks: HashSet::new(),
            last_nonce: 0,
            executed_count: 0,
            http_client: reqwest::Client::new(),
            price_checker,
            price_condition,
            gas_optimizer,
            ai_config,
        }
    }

    /// Main run loop — tries WebSocket first, falls back to polling.
    pub async fn run(mut self) -> Result<(), String> {
        info!("Attempting WebSocket connection to MultiversX API...");

        // Try WebSocket connection
        match self.run_websocket().await {
            Ok(()) => Ok(()),
            Err(ws_err) => {
                warn!("WebSocket unavailable ({}), falling back to HTTP polling", ws_err);
                self.run_polling().await
            }
        }
    }

    /// WebSocket-based monitoring (real-time, sub-second latency).
    async fn run_websocket(&mut self) -> Result<(), String> {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::{connect_async, tungstenite::Message};

        let ws_url = self.api_url.replace("https://", "wss://").replace("http://", "ws://");
        let ws_endpoint = format!("{}/hub/ws", ws_url);

        info!("Connecting to WebSocket: {}", ws_endpoint);

        let (ws_stream, _response) = connect_async(&ws_endpoint)
            .await
            .map_err(|e| format!("WS connect failed: {}", e))?;

        let (mut write, mut read) = ws_stream.split();

        // Subscribe to block events
        let subscribe_msg = serde_json::json!({
            "subscriptionEntries": [
                { "address": self.scheduler_address, "identifier": "scheduleTask" },
                { "address": self.scheduler_address, "identifier": "executeTask" },
            ]
        });

        write
            .send(Message::Text(subscribe_msg.to_string().into()))
            .await
            .map_err(|e| format!("WS subscribe failed: {}", e))?;

        info!("✅ WebSocket connected — listening for scheduler events");

        // Do initial scan
        self.scan_and_execute().await;

        // Process WebSocket messages
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    debug!("WS event: {}", &text[..text.len().min(200)]);
                    // On any scheduler event, rescan for ripe tasks
                    self.scan_and_execute().await;
                }
                Ok(Message::Ping(data)) => {
                    let _ = write.send(Message::Pong(data)).await;
                }
                Ok(Message::Close(_)) => {
                    warn!("WebSocket closed by server");
                    break;
                }
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        Err("WebSocket connection closed".into())
    }

    /// HTTP polling fallback (6-second intervals).
    async fn run_polling(&mut self) -> Result<(), String> {
        info!("Starting HTTP polling mode (6s intervals)...");

        loop {
            self.scan_and_execute().await;
            sleep(Duration::from_secs(6)).await;
        }
    }

    /// Scan for ripe tasks and execute them.
    async fn scan_and_execute(&mut self) {
        // 1. Get current task nonce
        let nonce = match self.query_task_nonce().await {
            Ok(n) => n,
            Err(e) => {
                warn!("Failed to query task nonce: {}", e);
                return;
            }
        };

        // 2. Discover new tasks
        if nonce > self.last_nonce {
            info!("New tasks detected: {} → {} ({} new)",
                self.last_nonce, nonce, nonce - self.last_nonce);

            for task_id in (self.last_nonce + 1)..=nonce {
                // Skip tasks we already tried and failed
                if self.failed_tasks.contains(&task_id) {
                    continue;
                }
                match self.fetch_task(task_id).await {
                    Ok(Some(task)) => {
                        debug!("Task #{}: trigger={}, status={:?}",
                            task.id, task.trigger_time, task.status);
                        self.known_tasks.insert(task_id, task);
                    }
                    Ok(None) => {
                        debug!("Task #{}: empty/expired", task_id);
                    }
                    Err(e) => {
                        warn!("Failed to fetch task #{}: {}", task_id, e);
                    }
                }
            }
            self.last_nonce = nonce;
        }

        // 3. Check for ripe tasks (skip already-failed ones)
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let ripe_ids: Vec<u64> = self.known_tasks
            .iter()
            .filter(|(id, task)| {
                task.status == 0
                    && task.trigger_time <= now
                    && !self.failed_tasks.contains(id)
            })
            .map(|(id, _)| *id)
            .collect();

        if !ripe_ids.is_empty() {
            info!("🔥 {} ripe tasks found: {:?}", ripe_ids.len(), ripe_ids);
        }

        // 4. Execute ONLY the first ripe task per cycle (avoids nonce conflicts)
        if let Some(&task_id) = ripe_ids.first() {
            // ── Price Condition check ──
            if !self.price_checker.should_execute(&self.price_condition).await {
                debug!("Task #{} skipped: price condition not met", task_id);
                return;
            }

            // ── AI-Optimized gas check ──
            if !self.gas_optimizer.should_execute(&self.ai_config).await {
                debug!("Task #{} delayed: AI-Optimized deferred execution", task_id);
                return;
            }

            info!("Executing task #{}...", task_id);
            match self.executor.execute_task(task_id).await {
                Ok(result) => {
                    if result.success {
                        info!("✅ Task #{} executed! TX: {}",
                            task_id,
                            result.tx_hash.as_deref().unwrap_or("?"));
                        self.known_tasks.remove(&task_id);
                        self.executed_count += 1;
                    } else {
                        warn!("❌ Task #{} failed: {}",
                            task_id,
                            result.error.as_deref().unwrap_or("unknown"));
                        // Mark as failed so we don't retry
                        self.failed_tasks.insert(task_id);
                        self.known_tasks.remove(&task_id);
                    }
                }
                Err(e) => {
                    error!("Task #{} execution error: {}", task_id, e);
                    self.failed_tasks.insert(task_id);
                    self.known_tasks.remove(&task_id);
                }
            }

            info!("📊 Stats: {} executed, {} failed, {} pending",
                self.executed_count,
                self.failed_tasks.len(),
                self.known_tasks.len());
        }
    }

    /// Query getTaskNonce() on the scheduler contract.
    async fn query_task_nonce(&self) -> Result<u64, String> {
        let url = format!(
            "{}/vm-values/query",
            self.gateway_url
        );

        let body = serde_json::json!({
            "scAddress": self.scheduler_address,
            "funcName": "getTaskNonce",
            "args": []
        });

        let resp = self.http_client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("JSON parse error: {}", e))?;

        // Parse response: {"data": {"data": {"returnData": ["1f"], ...}}}
        let return_data = data["data"]["data"]["returnData"]
            .as_array()
            .ok_or("No returnData")?;

        if return_data.is_empty() {
            return Ok(0);
        }

        let hex_val = return_data[0]
            .as_str()
            .ok_or("returnData[0] not string")?;

        // Decode base64 to hex
        let bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            hex_val,
        ).map_err(|e| format!("base64 decode: {}", e))?;

        let nonce = bytes.iter().fold(0u64, |acc, &b| (acc << 8) | b as u64);
        Ok(nonce)
    }

    /// Fetch a single task from the scheduler.
    async fn fetch_task(&self, task_id: u64) -> Result<Option<MonitoredTask>, String> {
        let url = format!("{}/vm-values/query", self.gateway_url);

        let id_hex = format!("{:x}", task_id);
        let id_hex = if id_hex.len() % 2 != 0 {
            format!("0{}", id_hex)
        } else {
            id_hex
        };

        let body = serde_json::json!({
            "scAddress": self.scheduler_address,
            "funcName": "getTask",
            "args": [id_hex]
        });

        let resp = self.http_client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("JSON parse error: {}", e))?;

        let return_data = data["data"]["data"]["returnData"]
            .as_array()
            .ok_or("No returnData")?;

        if return_data.is_empty() {
            return Ok(None);
        }

        let raw = return_data[0].as_str().unwrap_or("");
        if raw.is_empty() {
            return Ok(None);
        }

        // Decode the task struct from base64
        let bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            raw,
        ).map_err(|e| format!("base64: {}", e))?;

        // Parse the binary task struct.
        // The task struct is ABI-encoded — we extract trigger_time from known offsets.
        // For now, extract the minimum needed: trigger_time and status.
        let task = self.parse_task_bytes(task_id, &bytes)?;
        Ok(Some(task))
    }

    /// Parse task bytes from the ABI-encoded struct.
    /// This is a simplified parser that extracts trigger_time and status.
    fn parse_task_bytes(&self, task_id: u64, bytes: &[u8]) -> Result<MonitoredTask, String> {
        if bytes.len() < 50 {
            return Err("Task bytes too short".into());
        }

        // The task struct layout (simplified):
        // - owner: 32 bytes (address)
        // - target_contract: 32 bytes (address)
        // - endpoint_len: 4 bytes + endpoint bytes
        // - args: variable
        // - trigger (enum): variable — contains target_time (8 bytes)
        // - max_gas: 8 bytes
        // - deposit: variable (BigUint)
        // etc.
        //
        // For now, we search for the timestamp pattern in the bytes.
        // A proper implementation would use the full ABI decoder.

        // Quick approach: scan for a reasonable timestamp (2025-2027 range)
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let min_ts = now - 86400 * 365; // 1 year ago
        let max_ts = now + 86400 * 365; // 1 year from now

        let mut trigger_time: u64 = 0;

        // Search for 8-byte sequences that look like timestamps
        for i in 0..bytes.len().saturating_sub(7) {
            let candidate = u64::from_be_bytes([
                bytes[i], bytes[i+1], bytes[i+2], bytes[i+3],
                bytes[i+4], bytes[i+5], bytes[i+6], bytes[i+7],
            ]);
            if candidate >= min_ts && candidate <= max_ts {
                trigger_time = candidate;
                break;
            }
        }

        // Status is typically near the end of the struct
        // For now, assume Pending (0) unless we can find it
        let status = 0u8;

        Ok(MonitoredTask {
            id: task_id,
            trigger_time,
            status,
        })
    }
}

use base64;
