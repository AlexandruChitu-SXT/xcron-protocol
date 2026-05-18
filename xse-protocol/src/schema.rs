use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchExecutionIntent {
    pub batch_id: String,
    pub nonce: u64,
    pub timestamp: i64,
    pub intents: Vec<ExecutionIntent>,
    pub atomic: bool,
}

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
    pub max_quote_amount_atomic: String, // BigUint compatible String
    pub order_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Constraints {
    pub max_slippage_bps: u32, // Basis points (100 = 1.00%)
    pub expires_at: String,
    pub allowed_assets: Vec<String>,
    pub allow_withdrawals: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionReceipt {
    pub batch_id: String,
    pub status: String, // "SUCCESS", "PARTIAL_FAILURE", "FAILED"
    pub failure_context: Option<FailureContext>,
    pub orders: Vec<ExecutedOrder>,
    pub total_executed_quote_atomic: String,
    pub timestamp: i64,
    pub proof: Proof,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FailureContext {
    pub failed_intent_index: usize,
    pub error_code: String,
    pub error_message: String,
    pub partial_execution: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutedOrder {
    pub intent_index: usize,
    pub asset: String,
    pub side: String,
    pub requested_quote_amount_atomic: String,
    pub executed_quote_amount_atomic: String,
    pub executed_base_amount_atomic: String,
    pub average_price_atomic: String, 
    pub venue_order_id: String,
    pub venue: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Proof {
    pub executor_id: String,
    pub attestation_hash: String,
    pub receipt_hash: String,
}
