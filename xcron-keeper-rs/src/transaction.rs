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

    /// High-Speed transaction builder for PCIT Execution.
    /// Constructs the exact MultiVersX ABI payload (`executePreCognitiveLeaf@<intent>@...`)
    pub fn build_pcit_execution_tx(
        nonce: u64,
        sender: &str,
        scheduler_address: &str,
        intent_id: u64,
        proof_hashes: &[[u8; 32]],
        target_contract: &[u8; 32],
        target_endpoint: &str,
        target_args: &[Vec<u8>],
        expected_token_out: &str,
        min_return: &num_bigint::BigUint,
        chain_id: &str,
    ) -> Self {
        let mut data = String::from("executePreCognitiveLeaf");
        
        // 1. intent_id (u64 -> 8 bytes hex)
        data.push_str(&format!("@{:016x}", intent_id));
        
        // 2. merkle_proof (ManagedVec<[u8;32]>)
        // Format: u32 length + concatenated 32-byte hashes
        let mut proof_arg = format!("{:08x}", proof_hashes.len() as u32);
        for hash in proof_hashes {
            proof_arg.push_str(&hex::encode(hash));
        }
        data.push_str(&format!("@{}", proof_arg));
        
        // 3. target_contract (32 bytes)
        data.push_str(&format!("@{}", hex::encode(target_contract)));
        
        // 4. target_endpoint (string bytes)
        data.push_str(&format!("@{}", hex::encode(target_endpoint.as_bytes())));
        
        // 5. target_args (ManagedVec<ManagedBuffer>)
        // Format: u32 length + (u32 item_len + item_bytes)*
        let mut args_arg = format!("{:08x}", target_args.len() as u32);
        for arg in target_args {
            args_arg.push_str(&format!("{:08x}", arg.len() as u32));
            args_arg.push_str(&hex::encode(arg));
        }
        data.push_str(&format!("@{}", args_arg));
        
        // 6. expected_token_out
        data.push_str(&format!("@{}", hex::encode(expected_token_out.as_bytes())));
        
        // 7. min_return (BigUint)
        let min_ret_hex = if min_return > &num_bigint::BigUint::from(0u32) {
            hex::encode(min_return.to_bytes_be())
        } else {
            String::new()
        };
        data.push_str(&format!("@{}", min_ret_hex));

        Transaction::new(
            nonce,
            "0", // Execution costs 0 EGLD (Keeper only pays gas)
            scheduler_address,
            sender,
            500_000_000, 
            30_000_000, 
            Some(data.as_bytes()),
            chain_id,
            1
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::KeeperWallet;

    #[test]
    fn test_tx_serialization_and_signing() {
        let wallet = KeeperWallet::load_pem("../keeper/wallet.pem").unwrap();
        
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
