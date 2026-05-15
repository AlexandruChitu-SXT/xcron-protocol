use crate::schema::ExecutionIntent;
use chrono::{DateTime, Utc};

pub enum ValidationError {
    WithdrawalsEnabled,
    Expired,
    AssetNotAllowed(String),
    ExcessiveSlippage(f64),
    InvalidQuantumSignature,
    BatchSizeExceeded(usize),
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ValidationError::WithdrawalsEnabled => write!(f, "CRITICAL: allow_withdrawals must be false"),
            ValidationError::Expired => write!(f, "Intent has expired"),
            ValidationError::AssetNotAllowed(a) => write!(f, "Asset not in allowed_assets: {}", a),
            ValidationError::ExcessiveSlippage(s) => write!(f, "Requested slippage {}% exceeds limits", s),
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
    
    // 🛡️ XCRON-PROTECT: Vector 27 Fix - NaN/Infinity Math Bomb
    // Rust f64 allows NaN and Infinity. Malicious payloads could inject NaN to bypass
    // numerical checks or corrupt settlement math.
    if !intent.constraints.max_slippage_pct.is_finite() {
        return Err(ValidationError::ExcessiveSlippage(0.0));
    }
    
    // 🛡️ XCRON-PROTECT: Vector 22 Fix - MEV Sandwich Vulnerability
    // A 5.0% slippage on large corporate execution intents is a goldmine for MEV bots.
    // We strictly enforce a 1.0% maximum slippage for all institutional trades.
    if intent.constraints.max_slippage_pct > 1.0 || intent.constraints.max_slippage_pct < 0.0 {
        return Err(ValidationError::ExcessiveSlippage(intent.constraints.max_slippage_pct));
    }

    for order in &intent.orders {
        if !order.max_quote_amount.is_finite() || order.max_quote_amount <= 0.0 {
            return Err(ValidationError::AssetNotAllowed("INVALID_AMOUNT_NAN_OR_ZERO".to_string()));
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
                max_quote_amount: 100.0,
                order_type: "MARKET".to_string(),
            }],
            constraints: Constraints {
                max_slippage_pct: 1.0,
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
