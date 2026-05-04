use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionIntent {
    pub intent_type: String,
    pub venue: String,
    pub mode: String,
    pub source_asset: String,
    pub orders: Vec<OrderIntent>,
    pub constraints: Constraints,
    pub client_reference_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrderIntent {
    pub side: String,
    pub asset: String,
    pub max_quote_amount: f64,
    pub order_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Constraints {
    pub max_slippage_pct: f64,
    pub expires_at: String,
    pub allowed_assets: Vec<String>,
    pub allow_withdrawals: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionReceipt {
    pub client_reference_id: String,
    pub status: String,
    pub venue: String,
    pub mode: String,
    pub orders: Vec<ExecutedOrder>,
    pub timestamp: String,
    pub proof: Proof,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutedOrder {
    pub asset: String,
    pub side: String,
    pub requested_quote_amount: f64,
    pub executed_quote_amount: f64,
    pub executed_base_amount: f64,
    pub average_price: f64,
    pub venue_order_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof {
    pub executor_id: String,
    pub attestation_hash: String,
    pub receipt_hash: String,
}
