//! XCron Keeper — Shard-native task automation for MultiversX
//!
//! Built in Rust/Tokio to leverage MultiversX's WebSocket API v1.17+
//! for real-time block monitoring and sub-second task execution.

mod config;
mod monitor;
mod executor;
mod types;
mod price_checker;
mod gas_optimizer;
mod solver;
mod tee_enclave;
mod zk_prover;

use config::KeeperConfig;
use monitor::TaskMonitor;
use executor::TaskExecutor;
use price_checker::{PriceChecker, PriceCondition, PriceOp};
use gas_optimizer::{GasOptimizer, AiOptimizedConfig};

use clap::Parser;
use tracing::{info, error};

#[derive(Parser)]
#[command(name = "xcron-keeper", about = "XCron Protocol — Rust/Tokio Keeper")]
struct Cli {
    /// Path to keeper config file (JSON)
    #[arg(short, long, default_value = "keeper-config.json")]
    config: String,

    /// Path to keeper PEM wallet file
    #[arg(short, long)]
    pem: String,

    /// Network: testnet, devnet, or mainnet
    #[arg(short, long, default_value = "testnet")]
    network: String,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "xcron_keeper=info".into()),
        )
        .init();

    let cli = Cli::parse();

    info!("═══════════════════════════════════════════════");
    info!("  XCron Keeper — Rust/Tokio v0.1.0");
    info!("  Network: {}", cli.network);
    info!("═══════════════════════════════════════════════");

    // Load config
    let config = match KeeperConfig::load(&cli.config, &cli.pem, &cli.network) {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to load config: {}", e);
            std::process::exit(1);
        }
    };

    info!("Keeper address: {}", config.keeper_address);
    info!("Scheduler: {}", config.scheduler_address);
    info!("API: {}", config.api_url);
    info!("Gateway: {}", config.gateway_url);

    // Create executor (signs + sends transactions)
    let executor = TaskExecutor::new(
        config.gateway_url.clone(),
        config.api_url.clone(),
        config.scheduler_address.clone(),
        config.keeper_address.clone(),
        config.private_key.clone(),
        config.public_key.clone(),
    );

    // Create price checker with condition from config (or env vars)
    let price_condition = PriceCondition {
        enabled: std::env::var("XCRON_PRICE_ENABLED").unwrap_or_default() == "true",
        token: std::env::var("XCRON_PRICE_TOKEN").unwrap_or_else(|_| "EGLD".to_string()),
        condition: if std::env::var("XCRON_PRICE_CONDITION").unwrap_or_default() == "below" {
            PriceOp::Below
        } else {
            PriceOp::Above
        },
        threshold_usd: std::env::var("XCRON_PRICE_THRESHOLD")
            .unwrap_or_default()
            .parse()
            .unwrap_or(0.0),
    };
    let price_checker = PriceChecker::new(&config.api_url);

    // Create gas optimizer
    let ai_config = AiOptimizedConfig {
        enabled: std::env::var("XCRON_AI_OPTIMIZED").unwrap_or_default() == "true",
        max_gas_factor: std::env::var("XCRON_MAX_GAS_FACTOR")
            .unwrap_or_default()
            .parse()
            .unwrap_or(1.5),
        prefer_off_peak: true,
    };
    let gas_optimizer = GasOptimizer::new(&config.gateway_url);

    if price_condition.enabled {
        info!("💰 Price Condition: {} {} ${}",
            price_condition.token,
            if price_condition.condition == PriceOp::Above { "≥" } else { "≤" },
            price_condition.threshold_usd);
    }
    if ai_config.enabled {
        info!("🤖 AI-Optimized: enabled (max gas factor: {:.1}x)", ai_config.max_gas_factor);
    }

    // Create monitor (WebSocket or polling fallback)
    let monitor = TaskMonitor::new(
        config.api_url.clone(),
        config.gateway_url.clone(),
        config.scheduler_address.clone(),
        executor,
        price_checker,
        price_condition,
        gas_optimizer,
        ai_config,
    );

    // Run the main loop
    info!("Starting task monitor...");
    if let Err(e) = monitor.run().await {
        error!("Keeper stopped with error: {}", e);
        std::process::exit(1);
    }
}
