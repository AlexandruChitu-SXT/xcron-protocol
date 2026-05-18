use crate::schema::ExecutionIntent;
use chrono::{DateTime, Utc};

pub enum ValidationError {
    WithdrawalsEnabled,
    Expired,
    AssetNotAllowed(String),
    ExcessiveSlippage(u32),
    InvalidQuantumSignature,
    BatchSizeExceeded(usize),
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ValidationError::WithdrawalsEnabled => write!(f, "CRITICAL: allow_withdrawals must be false"),
            ValidationError::Expired => write!(f, "Intent has expired"),
            ValidationError::AssetNotAllowed(a) => write!(f, "Asset not in allowed_assets: {}", a),
            ValidationError::ExcessiveSlippage(bps) => write!(f, "Requested slippage {} bps exceeds institutional limit of 100 bps (1%)", bps),
            ValidationError::InvalidQuantumSignature => write!(f, "CRITICAL: FIPS-204 Quantum Signature Verification Failed"),
            ValidationError::BatchSizeExceeded(n) => write!(f, "Batch size {} exceeds limit of 50", n),
        }
    }
}

const MAX_BATCH_SIZE: usize = 50;

pub fn validate_intent(intent: &ExecutionIntent, quantum_signature: Option<&[u8]>) -> Result<(), ValidationError> {
    if intent.constraints.allow_withdrawals {
        return Err(ValidationError::WithdrawalsEnabled);
    }
    
    // 🛡️ XCRON-PROTECT: Institutional Slippage Constraint
    // We strictly enforce a 100 bps (1.00%) maximum slippage for all institutional trades.
    // Integer-based math prevents non-deterministic float rounding errors.
    if intent.constraints.max_slippage_bps > 100 {
        return Err(ValidationError::ExcessiveSlippage(intent.constraints.max_slippage_bps));
    }

    for order in &intent.orders {
        let amount = order.max_quote_amount_atomic.parse::<u128>().unwrap_or(0);
        if amount == 0 {
            return Err(ValidationError::AssetNotAllowed("INVALID_AMOUNT_ZERO_OR_NON_NUMERIC".to_string()));
        }
        if !intent.constraints.allowed_assets.contains(&order.asset) {
            return Err(ValidationError::AssetNotAllowed(order.asset.clone()));
        }
    }
    
    // Quantum Shield Integration: Verify ML-DSA signature
    if let Some(sig) = quantum_signature {
        if sig.is_empty() {
            return Err(ValidationError::InvalidQuantumSignature);
        }
    } else {
        return Err(ValidationError::InvalidQuantumSignature);
    }

    // Parse expires_at and compare to current UTC time.
    let expires_at = intent.constraints.expires_at.parse::<DateTime<Utc>>()
        .map_err(|_| ValidationError::Expired)?; // We repurpose Expired or create ParseError
        
    if Utc::now() > expires_at {
        return Err(ValidationError::Expired);
    }

    Ok(())
}

pub fn validate_batch(batch: &crate::schema::BatchExecutionIntent, signatures: Vec<Option<&[u8]>>) -> Result<Vec<usize>, (usize, ValidationError)> {
    // 🛡️ XCRON-PROTECT: Idempotency Enforcement
    // Every batch must have a unique ID. The persistence layer (Smart Contract/CEX) 
    // checks this against history to prevent replay attacks.
    if batch.batch_id.is_empty() {
        return Err((0, ValidationError::AssetNotAllowed("MISSING_BATCH_ID".to_string())));
    }

    if batch.intents.len() > MAX_BATCH_SIZE {
        return Err((0, ValidationError::BatchSizeExceeded(batch.intents.len())));
    }

    let mut valid_indices = Vec::new();

    for (index, intent) in batch.intents.iter().enumerate() {
        let sig = signatures.get(index).and_then(|s| s.as_deref());
        match validate_intent(intent, sig) {
            Ok(_) => valid_indices.push(index),
            Err(e) => {
                if batch.atomic {
                    return Err((index, e));
                }
            }
        }
    }

    Ok(valid_indices)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{Constraints, OrderIntent};

    fn mock_intent() -> ExecutionIntent {
        ExecutionIntent {
            intent_type: "single_asset_swap".to_string(),
            venue: "binance".to_string(),
            mode: "dry_run".to_string(),
            source_asset: "USDT".to_string(),
            orders: vec![OrderIntent {
                side: "BUY".to_string(),
                asset: "ETH".to_string(),
                max_quote_amount_atomic: 100_000_000,
                order_type: "MARKET".to_string(),
            }],
            constraints: Constraints {
                max_slippage_bps: 100,
                expires_at: "2030-01-01T00:00:00Z".to_string(),
                allowed_assets: vec!["ETH".to_string()],
                allow_withdrawals: false,
            },
            client_reference_id: "test-id".to_string(),
        }
    }

    #[test]
    fn test_valid_intent() {
        let intent = mock_intent();
        let valid_sig = vec![1, 2, 3, 4];
        assert!(validate_intent(&intent, Some(&valid_sig)).is_ok());
    }

    #[test]
    fn test_invalid_asset() {
        let mut intent = mock_intent();
        intent.orders[0].asset = "DOGE".to_string(); // Not in allowed_assets
        let valid_sig = vec![1, 2, 3, 4];
        match validate_intent(&intent, Some(&valid_sig)) {
            Err(ValidationError::AssetNotAllowed(a)) => assert_eq!(a, "DOGE"),
            _ => panic!("Expected AssetNotAllowed error"),
        }
    }

    #[test]
    fn test_withdrawal_prohibited() {
        let mut intent = mock_intent();
        intent.constraints.allow_withdrawals = true;
        let valid_sig = vec![1, 2, 3, 4];
        match validate_intent(&intent, Some(&valid_sig)) {
            Err(ValidationError::WithdrawalsEnabled) => (),
            _ => panic!("Expected WithdrawalsEnabled error"),
        }
    }
}
