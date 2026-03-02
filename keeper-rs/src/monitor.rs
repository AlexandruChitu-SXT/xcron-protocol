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
            // ── Price Condition check (per-task → fallback to global) ──
            if !self.price_checker.should_execute_task(task_id, &self.price_condition).await {
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
                        // M-4: Reset nonce counter on failure to re-sync with chain
                        self.executor.reset_nonce();
                        // Mark as failed so we don't retry
                        self.failed_tasks.insert(task_id);
                        self.known_tasks.remove(&task_id);
                    }
                }
                Err(e) => {
                    error!("Task #{} execution error: {}", task_id, e);
                    // M-4: Reset nonce counter on error to re-sync with chain
                    self.executor.reset_nonce();
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

        // Check for VM-level errors first
        let inner = &data["data"]["data"];
        let return_code = inner["returnCode"].as_str().unwrap_or("");
        if return_code != "ok" && !return_code.is_empty() {
            let msg = inner["returnMessage"].as_str().unwrap_or("unknown");
            return Err(format!("VM query failed: {} — {}", return_code, msg));
        }

        // Parse response: {"data": {"data": {"returnData": ["base64..."], ...}}}
        let return_data = match inner["returnData"].as_array() {
            Some(arr) => arr,
            None => return Ok(0), // null returnData = no tasks yet
        };

        if return_data.is_empty() {
            return Ok(0);
        }

        let b64_val = return_data[0]
            .as_str()
            .ok_or("returnData[0] not string")?;

        // Decode base64 to bytes
        let bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            b64_val,
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

        // Check for VM-level errors (expired tasks, storage errors, etc.)
        let inner = &data["data"]["data"];
        let return_code = inner["returnCode"].as_str().unwrap_or("");
        if return_code != "ok" && !return_code.is_empty() {
            debug!("Task #{}: VM returned '{}' — treating as empty",
                task_id, return_code);
            return Ok(None);
        }

        let return_data = match inner["returnData"].as_array() {
            Some(arr) => arr,
            None => return Ok(None),
        };

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

    /// Parse task bytes from the ABI NestedEncode format.
    ///
    /// Task struct layout (MultiversX nested encoding):
    /// - id: u64 (8 bytes)
    /// - owner: 32 bytes (ManagedAddress)
    /// - target_contract: 32 bytes (ManagedAddress)
    /// - target_endpoint: 4 bytes len + data (ManagedBuffer)
    /// - target_args: 4 bytes count + each arg: 4 bytes len + data (ManagedVec<ManagedBuffer>)
    /// - trigger: 1 byte discriminant + fields (Trigger enum)
    ///   - 0 (TimeOnce):      target_time u64 (8 bytes)
    ///   - 1 (TimeRecurring): start_time u64 + interval u64 + remaining u64
    ///   - 2 (ConditionOnChain): complex, skip
    /// - max_gas: u64 (8 bytes)
    /// - deposit: 4 bytes len + data (BigUint)
    /// - max_retries: u8 (1 byte)
    /// - retry_count: u8 (1 byte)
    /// - ttl_seconds: u64 (8 bytes)
    /// - created_at: u64 (8 bytes)
    /// - status: 1 byte discriminant (TaskStatus enum: 0=Pending, 3=Completed, etc.)
    fn parse_task_bytes(&self, task_id: u64, bytes: &[u8]) -> Result<MonitoredTask, String> {
        let len = bytes.len();
        if len < 50 {
            return Err("Task bytes too short".into());
        }

        let mut pos: usize = 0;

        // Helper to read safely
        let read_u64 = |p: &mut usize| -> Result<u64, String> {
            if *p + 8 > len { return Err("truncated u64".into()); }
            let val = u64::from_be_bytes(bytes[*p..*p+8].try_into().unwrap());
            *p += 8;
            Ok(val)
        };
        let read_u32 = |p: &mut usize| -> Result<u32, String> {
            if *p + 4 > len { return Err("truncated u32".into()); }
            let val = u32::from_be_bytes(bytes[*p..*p+4].try_into().unwrap());
            *p += 4;
            Ok(val)
        };
        let read_u8 = |p: &mut usize| -> Result<u8, String> {
            if *p >= len { return Err("truncated u8".into()); }
            let val = bytes[*p];
            *p += 1;
            Ok(val)
        };

        // 1. id: u64
        let _id = read_u64(&mut pos)?;

        // 2. owner: 32 bytes
        if pos + 32 > len { return Err("truncated owner".into()); }
        pos += 32;

        // 3. target_contract: 32 bytes
        if pos + 32 > len { return Err("truncated target".into()); }
        pos += 32;

        // 4. target_endpoint: 4 bytes len + data
        let ep_len = read_u32(&mut pos)? as usize;
        if pos + ep_len > len { return Err("truncated endpoint".into()); }
        pos += ep_len;

        // 5. target_args: 4 bytes count + each: 4 bytes len + data
        let args_count = read_u32(&mut pos)? as usize;
        for _ in 0..args_count {
            let arg_len = read_u32(&mut pos)? as usize;
            if pos + arg_len > len { return Err("truncated arg".into()); }
            pos += arg_len;
        }

        // 6. trigger: 1 byte discriminant + fields
        let trigger_disc = read_u8(&mut pos)?;
        let trigger_time: u64;
        match trigger_disc {
            0 => {
                // TimeOnce { target_time: u64 }
                trigger_time = read_u64(&mut pos)?;
            }
            1 => {
                // TimeRecurring { start_time: u64, interval: u64, remaining_execs: u64 }
                trigger_time = read_u64(&mut pos)?; // start_time
                let _interval = read_u64(&mut pos)?;
                let _remaining = read_u64(&mut pos)?;
            }
            _ => {
                // ConditionOnChain or unknown — we can't parse precisely
                // Skip to status via scanning — we know status is near the end
                // For now, try best-effort
                debug!("Task #{}: unknown trigger type {}, skipping", task_id, trigger_disc);
                return Ok(MonitoredTask { id: task_id, trigger_time: 0, status: 255 });
            }
        }

        // 7. max_gas: u64
        let _max_gas = read_u64(&mut pos)?;

        // 8. deposit: BigUint = 4 bytes len + data
        let dep_len = read_u32(&mut pos)? as usize;
        if pos + dep_len > len { return Err("truncated deposit".into()); }
        pos += dep_len;

        // 9. max_retries: u8
        let _max_retries = read_u8(&mut pos)?;

        // 10. retry_count: u8
        let _retry_count = read_u8(&mut pos)?;

        // 11. ttl_seconds: u64
        let _ttl = read_u64(&mut pos)?;

        // 12. created_at: u64
        let _created_at = read_u64(&mut pos)?;

        // 13. status: 1 byte discriminant
        //     0=Pending, 1=Committed, 2=Executing, 3=Completed, 4=Failed, 5=Cancelled, 6=Expired
        let status = read_u8(&mut pos)?;

        debug!("Task #{}: trigger_time={}, status={} (pos={}/{})",
            task_id, trigger_time, status, pos, len);

        Ok(MonitoredTask {
            id: task_id,
            trigger_time,
            status,
        })
    }
}

use base64;
