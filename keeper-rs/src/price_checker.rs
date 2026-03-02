//! Price Checker — queries real-time token prices from MultiversX API.
//!
//! Supports both global conditions (env vars) and per-task conditions
//! loaded from `price_conditions.json`.

use std::collections::HashMap;
use tracing::{info, warn, debug};
use serde::Deserialize;

/// Price condition configuration (global, from env vars)
#[derive(Debug, Clone)]
pub struct PriceCondition {
    pub enabled: bool,
    pub token: String,
    pub condition: PriceOp,
    pub threshold_usd: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PriceOp {
    Above,
    Below,
}

impl Default for PriceCondition {
    fn default() -> Self {
        Self {
            enabled: false,
            token: "EGLD".to_string(),
            condition: PriceOp::Above,
            threshold_usd: 0.0,
        }
    }
}

/// Per-task price condition (from price_conditions.json)
#[derive(Debug, Clone, Deserialize)]
pub struct PerTaskCondition {
    pub token: String,
    pub op: String,      // "above" or "below"
    pub usd: f64,
}

/// Response from MultiversX /economics endpoint
#[derive(Debug, Deserialize)]
struct EconomicsResponse {
    price: f64,
    #[serde(rename = "marketCap")]
    _market_cap: Option<f64>,
}

/// Checker that queries real-time prices
pub struct PriceChecker {
    api_url: String,
    http_client: reqwest::Client,
    last_price: Option<f64>,
    per_task: HashMap<u64, PerTaskCondition>,
}

impl PriceChecker {
    pub fn new(api_url: &str) -> Self {
        let per_task = Self::load_per_task_conditions();
        if !per_task.is_empty() {
            info!("📋 Loaded {} per-task price conditions", per_task.len());
            for (id, c) in &per_task {
                info!("   Task #{}: {} {} ${:.2}", id, c.token, c.op, c.usd);
            }
        }

        Self {
            api_url: api_url.to_string(),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("HTTP client"),
            last_price: None,
            per_task,
        }
    }

    /// Load per-task price conditions from `price_conditions.json`.
    fn load_per_task_conditions() -> HashMap<u64, PerTaskCondition> {
        let path = "price_conditions.json";
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return HashMap::new(), // File doesn't exist = no conditions
        };

        // Parse as generic JSON to skip _comment and _example fields
        let raw: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(e) => {
                warn!("Failed to parse {}: {}", path, e);
                return HashMap::new();
            }
        };

        let mut conditions = HashMap::new();
        if let Some(obj) = raw.as_object() {
            for (key, val) in obj {
                // Skip non-numeric keys like "_comment", "_example"
                if let Ok(task_id) = key.parse::<u64>() {
                    if let Ok(cond) = serde_json::from_value::<PerTaskCondition>(val.clone()) {
                        conditions.insert(task_id, cond);
                    }
                }
            }
        }

        conditions
    }

    /// Reload per-task conditions (call periodically to pick up changes).
    pub fn reload_conditions(&mut self) {
        self.per_task = Self::load_per_task_conditions();
    }

    /// Fetch current EGLD price in USD from MultiversX API.
    pub async fn fetch_egld_price(&mut self) -> Result<f64, String> {
        let url = format!("{}/economics", self.api_url);
        debug!("Fetching EGLD price from {}", url);

        let resp = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Price API request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Price API returned status {}", resp.status()));
        }

        let data: EconomicsResponse = resp
            .json()
            .await
            .map_err(|e| format!("Price API parse error: {}", e))?;

        self.last_price = Some(data.price);
        debug!("EGLD price: ${:.2}", data.price);
        Ok(data.price)
    }

    /// Check global condition (fallback).
    pub async fn should_execute(&mut self, condition: &PriceCondition) -> bool {
        if !condition.enabled {
            return true;
        }
        self.check_price(&condition.token, &condition.condition, condition.threshold_usd).await
    }

    /// Check per-task condition for a specific task ID.
    /// If the task has a specific condition → use it.
    /// If not → fall back to global condition.
    pub async fn should_execute_task(&mut self, task_id: u64, global: &PriceCondition) -> bool {
        // Check per-task condition first
        if let Some(cond) = self.per_task.get(&task_id).cloned() {
            let op = if cond.op == "below" { PriceOp::Below } else { PriceOp::Above };
            info!("🧬 Task #{}: per-task price condition — {} {} ${:.2}",
                task_id, cond.token, cond.op, cond.usd);
            return self.check_price(&cond.token, &op, cond.usd).await;
        }

        // Fall back to global
        self.should_execute(global).await
    }

    /// Internal price check logic.
    async fn check_price(&mut self, token: &str, op: &PriceOp, threshold: f64) -> bool {
        if token != "EGLD" {
            warn!("Price condition for {} not yet supported, executing anyway", token);
            return true;
        }

        match self.fetch_egld_price().await {
            Ok(price) => {
                let passes = match op {
                    PriceOp::Above => price >= threshold,
                    PriceOp::Below => price <= threshold,
                };

                if passes {
                    info!("✅ Price condition MET: EGLD ${:.2} {} ${:.2}",
                        price,
                        if *op == PriceOp::Above { "≥" } else { "≤" },
                        threshold);
                } else {
                    info!("⏳ Price condition NOT met: EGLD ${:.2} {} ${:.2} — skipping",
                        price,
                        if *op == PriceOp::Above { "<" } else { ">" },
                        threshold);
                }

                passes
            }
            Err(e) => {
                warn!("Could not fetch price ({}), executing anyway to be safe", e);
                true
            }
        }
    }

    /// Get the last fetched price.
    pub fn last_price(&self) -> Option<f64> {
        self.last_price
    }
}

