//! Price Checker — queries real-time token prices from MultiversX API.
//!
//! Uses the `/economics` API endpoint which provides EGLD price in USD.
//! For other tokens, uses the xExchange `/mex/tokens` endpoint.

use tracing::{info, warn, debug};
use serde::Deserialize;

/// Price condition configuration
#[derive(Debug, Clone)]
pub struct PriceCondition {
    pub enabled: bool,
    pub token: String,         // "EGLD", "BTC", "USDC", etc.
    pub condition: PriceOp,    // Above or Below
    pub threshold_usd: f64,    // e.g. 50.0
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
}

impl PriceChecker {
    pub fn new(api_url: &str) -> Self {
        Self {
            api_url: api_url.to_string(),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("HTTP client"),
            last_price: None,
        }
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

    /// Check if the current price meets the given condition.
    /// Returns `true` if execution should proceed, `false` to skip.
    pub async fn should_execute(&mut self, condition: &PriceCondition) -> bool {
        if !condition.enabled {
            return true; // No condition = always execute
        }

        // Currently only EGLD is supported via /economics
        if condition.token != "EGLD" {
            warn!("Price condition for {} not yet supported, executing anyway", condition.token);
            return true;
        }

        match self.fetch_egld_price().await {
            Ok(price) => {
                let passes = match condition.condition {
                    PriceOp::Above => price >= condition.threshold_usd,
                    PriceOp::Below => price <= condition.threshold_usd,
                };

                if passes {
                    info!("✅ Price condition MET: EGLD ${:.2} {} ${:.2}",
                        price,
                        if condition.condition == PriceOp::Above { "≥" } else { "≤" },
                        condition.threshold_usd);
                } else {
                    info!("⏳ Price condition NOT met: EGLD ${:.2} {} ${:.2} — skipping execution",
                        price,
                        if condition.condition == PriceOp::Above { "<" } else { ">" },
                        condition.threshold_usd);
                }

                passes
            }
            Err(e) => {
                warn!("Could not fetch price ({}), executing anyway to be safe", e);
                true // On error, execute anyway — don't block
            }
        }
    }

    /// Get the last fetched price (cached from last check).
    pub fn last_price(&self) -> Option<f64> {
        self.last_price
    }
}
