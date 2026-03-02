//! Gas Optimizer — AI-optimized execution timing based on network conditions.
//!
//! Monitors network metrics to determine the optimal execution window:
//! - Current round time (normal ~6s, congested >8s)
//! - Recent block gas usage
//! - Time-of-day patterns (lower gas at off-peak hours)

use tracing::{info, warn, debug};
use serde::Deserialize;

/// AI optimization configuration
#[derive(Debug, Clone)]
pub struct AiOptimizedConfig {
    pub enabled: bool,
    /// Max gas price multiplier tolerated (1.0 = normal, 2.0 = 2x more expensive)
    pub max_gas_factor: f64,
    /// Whether to prefer off-peak hours (UTC 02:00-06:00)
    pub prefer_off_peak: bool,
}

impl Default for AiOptimizedConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_gas_factor: 1.5,
            prefer_off_peak: true,
        }
    }
}

/// Network stats response from MultiversX API
#[derive(Debug, Deserialize)]
struct NetworkStatsResponse {
    #[serde(rename = "roundsPerEpoch")]
    _rounds_per_epoch: Option<u64>,
    #[serde(rename = "roundsPassed")]
    _rounds_passed: Option<u64>,
}

/// Network status from gateway
#[derive(Debug, Deserialize)]
struct GatewayStatusResponse {
    data: Option<GatewayStatusData>,
}

#[derive(Debug, Deserialize)]
struct GatewayStatusData {
    status: Option<NetworkStatus>,
}

#[derive(Debug, Deserialize)]
struct NetworkStatus {
    #[serde(rename = "erd_round_time")]
    round_time: Option<u64>,
    #[serde(rename = "erd_rounds_per_epoch")]
    _rounds_per_epoch: Option<u64>,
    #[serde(rename = "erd_current_round")]
    current_round: Option<u64>,
    #[serde(rename = "erd_epoch_number")]
    _epoch_number: Option<u64>,
}

/// Network condition assessment
#[derive(Debug)]
pub struct NetworkCondition {
    pub round_time_ms: u64,
    pub is_congested: bool,
    pub is_off_peak: bool,
    pub gas_factor: f64,
    pub recommendation: ExecutionAdvice,
}

#[derive(Debug, PartialEq)]
pub enum ExecutionAdvice {
    /// Execute now — good conditions
    ExecuteNow,
    /// Delay — network is congested or gas is high
    DelayExecution(String),
}

pub struct GasOptimizer {
    gateway_url: String,
    http_client: reqwest::Client,
    consecutive_delays: u32,
}

impl GasOptimizer {
    pub fn new(gateway_url: &str) -> Self {
        Self {
            gateway_url: gateway_url.to_string(),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("HTTP client"),
            consecutive_delays: 0,
        }
    }

    /// Analyze current network conditions and recommend execution timing.
    pub async fn analyze_network(&mut self) -> NetworkCondition {
        let round_time = self.fetch_round_time().await.unwrap_or(6000);
        let hour_utc = chrono_hour_utc();
        let is_off_peak = (2..=6).contains(&hour_utc);

        // Estimate gas factor based on round time
        // Normal round time: ~6000ms. Higher = more congestion
        let gas_factor = if round_time > 6000 {
            (round_time as f64) / 6000.0
        } else {
            1.0
        };

        let is_congested = gas_factor > 1.3;

        let recommendation = if is_congested {
            ExecutionAdvice::DelayExecution(
                format!("Network congested (round time {}ms, gas {:.1}x)", round_time, gas_factor)
            )
        } else {
            ExecutionAdvice::ExecuteNow
        };

        debug!("Network: round={}ms, gas={:.2}x, off_peak={}, congested={}",
            round_time, gas_factor, is_off_peak, is_congested);

        NetworkCondition {
            round_time_ms: round_time,
            is_congested,
            is_off_peak,
            gas_factor,
            recommendation,
        }
    }

    /// Check if we should execute now based on AI optimization config.
    /// Returns `true` to execute, `false` to delay.
    pub async fn should_execute(&mut self, config: &AiOptimizedConfig) -> bool {
        if !config.enabled {
            return true; // Disabled = always execute
        }

        // Safety: after 5 consecutive delays, force execution to prevent starvation
        if self.consecutive_delays >= 5 {
            info!("🔄 AI-Optimized: forced execution after {} delays (anti-starvation)",
                self.consecutive_delays);
            self.consecutive_delays = 0;
            return true;
        }

        let condition = self.analyze_network().await;

        match &condition.recommendation {
            ExecutionAdvice::ExecuteNow => {
                if config.prefer_off_peak && !condition.is_off_peak && condition.gas_factor > 1.1 {
                    info!("⏳ AI-Optimized: slightly high gas ({:.1}x) during peak hours — delaying",
                        condition.gas_factor);
                    self.consecutive_delays += 1;
                    false
                } else {
                    info!("✅ AI-Optimized: good conditions (gas {:.1}x, round {}ms) — executing",
                        condition.gas_factor, condition.round_time_ms);
                    self.consecutive_delays = 0;
                    true
                }
            }
            ExecutionAdvice::DelayExecution(reason) => {
                if condition.gas_factor > config.max_gas_factor {
                    info!("⏳ AI-Optimized: {} — delaying", reason);
                    self.consecutive_delays += 1;
                    false
                } else {
                    info!("✅ AI-Optimized: gas {:.1}x within tolerance ({:.1}x max) — executing",
                        condition.gas_factor, config.max_gas_factor);
                    self.consecutive_delays = 0;
                    true
                }
            }
        }
    }

    /// Fetch current round time from gateway /network/status.
    async fn fetch_round_time(&self) -> Result<u64, String> {
        let url = format!("{}/network/status/4294967295", self.gateway_url);
        debug!("Fetching network status from {}", url);

        let resp = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Gateway request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Gateway returned status {}", resp.status()));
        }

        let data: GatewayStatusResponse = resp
            .json()
            .await
            .map_err(|e| format!("Gateway parse error: {}", e))?;

        let round_time = data.data
            .and_then(|d| d.status)
            .and_then(|s| s.round_time)
            .unwrap_or(6);

        // API returns seconds, we want milliseconds
        Ok(round_time * 1000)
    }
}

/// Get current UTC hour (0-23) without pulling in chrono crate.
fn chrono_hour_utc() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    ((secs % 86400) / 3600) as u32
}
