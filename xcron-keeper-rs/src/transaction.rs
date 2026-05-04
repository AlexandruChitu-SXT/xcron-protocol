use serde::{Deserialize, Serialize};
use ed25519_dalek::{Signer, SigningKey};
use base64::{Engine as _, engine::general_purpose};
use hex;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub nonce: u64,
    pub value: String,
    pub receiver: String,
    pub sender: String,
    pub gas_price: u64,
    pub gas_limit: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(rename = "chainID")]
    pub chain_id: String,
    pub version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relayer: Option<String>,
    #[serde(rename = "relayerSignature", skip_serializing_if = "Option::is_none")]
    pub relayer_signature: Option<String>,
}

impl Transaction {
    pub fn new(
        nonce: u64,
        value: &str,
        receiver: &str,
        sender: &str,
        gas_price: u64,
        gas_limit: u64,
        data: Option<&[u8]>,
        chain_id: &str,
        version: u32,
    ) -> Self {
        let data_b64 = data.map(|d| general_purpose::STANDARD.encode(d));
        Self {
            nonce,
            value: value.to_string(),
            receiver: receiver.to_string(),
            sender: sender.to_string(),
            gas_price,
            gas_limit,
            data: data_b64,
            chain_id: chain_id.to_string(),
            version,
            options: None,
            signature: None,
            relayer: None,
            relayer_signature: None,
        }
    }

    /// Generates the payload string for signing
    pub fn serialize_for_signing(&self) -> Result<String, serde_json::Error> {
        let mut unsigned_tx = self.clone();
        unsigned_tx.signature = None;
        unsigned_tx.relayer_signature = None;
        let json_str = serde_json::to_string(&unsigned_tx)?;
        Ok(json_str)
    }

    /// Signs the transaction and attaches the signature encoded in Hex
    pub fn sign(&mut self, signing_key: &SigningKey) -> Result<(), Box<dyn std::error::Error>> {
        let payload = self.serialize_for_signing()?;
        let signature_bytes = signing_key.sign(payload.as_bytes());
        self.signature = Some(hex::encode(signature_bytes.to_bytes()));
        Ok(())
    }

    /// Supernova Vector 4: Signs the transaction but deliberately mutates the last byte 
    /// of the ED25519 signature to force asymmetric signature verification failure 
    /// on the Validator nodes (wasting CPU cycles).
    pub fn sign_and_corrupt(&mut self, signing_key: &SigningKey) -> Result<(), Box<dyn std::error::Error>> {
        let payload = self.serialize_for_signing()?;
        let signature_bytes = signing_key.sign(payload.as_bytes());
        
        // Convert to mutable array
        let mut corrupted_bytes = signature_bytes.to_bytes();
        
        // Mutate the very last byte (XOR with 1) to break the mathematical validity 
        // without changing the 64-byte length.
        corrupted_bytes[63] ^= 1;
        
        self.signature = Some(hex::encode(corrupted_bytes));
        Ok(())
    }

    /// Converts a signed inner TX into RelayedV1 data payload: `relayedTx@<hex_of_json>`
    pub fn to_relayed_data(&self) -> Result<String, Box<dyn std::error::Error>> {
        let json_str = serde_json::to_string(self)?;
        let hex_encoded = hex::encode(json_str.as_bytes());
        Ok(format!("relayedTx@{}", hex_encoded))
    }

    /// Converts the transaction to RelayedV3 by assigning the Relayer address and its signature.
    pub fn to_relayed_v3(&mut self, relayer_address: &str, relayer_signing_key: &SigningKey) -> Result<(), Box<dyn std::error::Error>> {
        self.relayer = Some(relayer_address.to_string());
        
        let payload = self.serialize_for_signing()?;
        let signature_bytes = relayer_signing_key.sign(payload.as_bytes());
        self.relayer_signature = Some(hex::encode(signature_bytes.to_bytes()));
        Ok(())
    }

    /// High-Speed transaction builder for Quantum Task Execution.
    /// Constructs the exact MultiVersX ABI payload (`executeQuantumTask@<serialized_task>@[quantum_secret]`)
    pub fn build_quantum_execution_tx(
        nonce: u64,
        sender: &str,
        scheduler_address: &str,
        serialized_task_hex: &str,
        quantum_secret_hex: Option<&str>,
        chain_id: &str,
    ) -> Self {
        let mut data = format!("executeQuantumTask@{}", serialized_task_hex);
        
        if let Some(secret) = quantum_secret_hex {
            data.push_str(&format!("@01{}", secret)); // 01 = Option::Some
        } else {
            data.push_str("@00"); // 00 = Option::None
        }

        Transaction::new(
            nonce,
            "0", // Execution costs 0 EGLD
            scheduler_address,
            sender,
            1_000_000_000, 
            30_000_000, 
            Some(data.as_bytes()),
            chain_id,
            1
        )
    }

    /// Serializes a Task payload manually according to MultiversX TopEncode Nested ABI.
    pub fn serialize_quantum_task_hex(
        task_id: u64,
        owner_hex: &str, // 32 bytes hex
        target_contract_hex: &str, // 32 bytes hex
        endpoint_hex: &str, // variable bytes hex
        args_hex: &[String], // array of hex strings
        trigger_type: u8, // 0 = TimeOnce, etc
        trigger_data_hex: &str,
        max_gas: u64,
    ) -> String {
        let mut hex = String::new();
        // 1. id (8 bytes)
        hex.push_str(&format!("{:016x}", task_id));
        // 2. owner (32 bytes)
        hex.push_str(owner_hex);
        // 3. target_contract (32 bytes)
        hex.push_str(target_contract_hex);
        // 4. target_endpoint (4 bytes len + data)
        let endpoint_bytes_len = endpoint_hex.len() / 2;
        hex.push_str(&format!("{:08x}{}", endpoint_bytes_len, endpoint_hex));
        // 5. target_args (4 bytes len + array)
        hex.push_str(&format!("{:08x}", args_hex.len()));
        for arg in args_hex {
            hex.push_str(&format!("{:08x}{}", arg.len() / 2, arg));
        }
        // 6. trigger (1 byte type + data)
        hex.push_str(&format!("{:02x}{}", trigger_type, trigger_data_hex));
        // 7. max_gas (8 bytes)
        hex.push_str(&format!("{:016x}", max_gas));
        // 8. deposit (BigUint -> 4 bytes len + data, here we assume 0 deposit for test)
        hex.push_str("00000000"); 
        // 9. max_retries (1 byte)
        hex.push_str("00");
        // 10. retry_count (1 byte)
        hex.push_str("00");
        // 11. ttl_seconds (8 bytes)
        hex.push_str("0000000000000000");
        // 12. created_at (8 bytes)
        hex.push_str("0000000000000000");
        // 13. status (1 byte enum, Pending = 00)
        hex.push_str("00");
        // 14. assigned_keeper (Option<Address>, 00 = None)
        hex.push_str("00");
        // 15. completed_at (8 bytes)
        hex.push_str("0000000000000000");
        // 16. post_task_id (Option<u64>, 00 = None)
        hex.push_str("00");
        // 17. require_xwap_safe (bool)
        hex.push_str("00");
        // 18. confidential (bool)
        hex.push_str("00");

        hex
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::KeeperWallet;

    #[test]
    fn test_tx_serialization_and_signing() {
        let wallet = KeeperWallet::generate_throwaway();
        
        let mut tx = Transaction::new(
            42,
            "1000000000000000000",
            "erd1qqqqqqqqqqqqqpgqfw5d43e5j29x6yflusqntg64u5yegc4vj9sqn7l4xy",
            &wallet.bech32_address,
            1000000000,
            50000,
            Some(b"ping"),
            "D",
            1
        );

        let payload = tx.serialize_for_signing().unwrap();
        println!("Signing Payload: {}", payload);
        
        tx.sign(&wallet.signing_key).unwrap();
        println!("Signature: {:?}", tx.signature);
        assert!(tx.signature.is_some());
    }
}
