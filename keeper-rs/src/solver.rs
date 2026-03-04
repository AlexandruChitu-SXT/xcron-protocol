use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, debug, warn};

/// Defines the minimum data needed from an on-chain Intent to solve it.
#[derive(Debug, Clone)]
pub struct PendingIntent {
    pub intent_id: u64,
    pub token_in: String,
    pub amount_in: u64,
    pub token_out: String,
    pub min_return: u64,
}

/// Represents the optimal routing path discovered by the Solver.
#[derive(Debug, Clone)]
pub struct SolverRoute {
    pub target_contract: String,
    pub target_endpoint: String,
    pub target_args: Vec<String>, // Hex encoded arguments
    pub estimated_return: u64,
}

/// The Solver Engine is responsible for ingesting Intents and finding the best
/// financial route across MultiversX DEXes (AshSwap, xExchange) concurrently.
pub struct SolverEngine {
    http_client: Arc<Client>,
    ashswap_api_url: String,
    xexchange_router: String,
}

impl SolverEngine {
    pub fn new() -> Self {
        Self {
            http_client: Arc::new(Client::new()),
            // Simulated AshSwap Aggregator Endpoint for the Vanguard V2 architecture
            ashswap_api_url: "https://api.ashswap.io/v2/aggregator/route".to_string(),
            // xExchange Router SC address
            xexchange_router: "erd1qqqqqqqqqqqqqpgqsnptkgcqmkck4pw6sckemg0axrd9t7d62jpsqqqw4d".to_string(),
        }
    }

    /// Asynchronously calculates the best path for an intent.
    /// This runs in a `tokio` thread and can race against other DEX queries.
    pub async fn solve_intent(&self, intent: &PendingIntent) -> Result<SolverRoute, String> {
        info!("🔍 Solver received Intent #{}: Swapping {} -> {}", intent.intent_id, intent.token_in, intent.token_out);
        
        // 1. In a production environment, we would execute `tokio::join!` or `tokio::select!` 
        // to query multiple DEXes simultaneously. For the V2 implementation plan, we simulate 
        // the XExchange API return logic structure.
        
        debug!("Querying cross-DEX liquidity for token {}...", intent.token_in);
        let simulated_market_price = self.simulate_market_price(&intent.token_in, &intent.token_out).await?;
        
        let estimated_return = (intent.amount_in as f64 * simulated_market_price) as u64;

        if estimated_return < intent.min_return {
            let msg = format!("❌ No profitable route found. Estimated: {}, Min Return: {}", estimated_return, intent.min_return);
            warn!("{}", msg);
            return Err(msg);
        }

        info!("✅ Profitable route found! Estimated: {} >= Min {}", estimated_return, intent.min_return);

        // 2. Construct the Payload for the `solveIntent` target arguments.
        // The router expects: swapTokensFixedInput, tokenOut, minReturn
        
        let endpoint_hex = hex::encode("swapTokensFixedInput");
        let token_out_hex = hex::encode(&intent.token_out);
        let min_return_hex = format!("{:016x}", intent.min_return); // Fixed width hex encoding
        
        let mut target_args = Vec::new();
        target_args.push(token_out_hex);
        target_args.push(min_return_hex);

        Ok(SolverRoute {
            target_contract: self.xexchange_router.clone(),
            target_endpoint: endpoint_hex,
            target_args,
            estimated_return,
        })
    }

    /// Simulates a highly concurrent HTTPS call to a DEX Aggregator.
    /// (Mocked for testnet demonstration).
    async fn simulate_market_price(&self, token_in: &str, token_out: &str) -> Result<f64, String> {
        // Yield execution to the tokio runtime to simulate network latency
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

        match (token_in, token_out) {
            ("USDC-c76f1f", "WEGLD-bd4d79") => Ok(0.025), // 1 USDC = 0.025 EGLD
            ("WEGLD-bd4d79", "USDC-c76f1f") => Ok(40.0),  // 1 EGLD = 40 USDC
            ("ASH-a642d1", "USDC-c76f1f") => Ok(0.12),
            _ => Ok(1.0), // 1:1 fallback
        }
    }
}
