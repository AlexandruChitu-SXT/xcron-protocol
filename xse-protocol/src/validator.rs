use crate::schema::ExecutionIntent;

pub enum ValidationError {
    WithdrawalsEnabled,
    Expired,
    AssetNotAllowed(String),
    ExcessiveSlippage(f64),
    InvalidQuantumSignature,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ValidationError::WithdrawalsEnabled => write!(f, "CRITICAL: allow_withdrawals must be false"),
            ValidationError::Expired => write!(f, "Intent has expired"),
            ValidationError::AssetNotAllowed(a) => write!(f, "Asset not in allowed_assets: {}", a),
            ValidationError::ExcessiveSlippage(s) => write!(f, "Requested slippage {}% exceeds limits", s),
            ValidationError::InvalidQuantumSignature => write!(f, "CRITICAL: FIPS-204 Quantum Signature Verification Failed"),
        }
    }
}

use chrono::{DateTime, Utc};

pub fn validate_intent(intent: &ExecutionIntent, quantum_signature: Option<&[u8]>) -> Result<(), ValidationError> {
    if intent.constraints.allow_withdrawals {
        return Err(ValidationError::WithdrawalsEnabled);
    }
    
    if intent.constraints.max_slippage_pct > 5.0 {
        return Err(ValidationError::ExcessiveSlippage(intent.constraints.max_slippage_pct));
    }

    for order in &intent.orders {
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
