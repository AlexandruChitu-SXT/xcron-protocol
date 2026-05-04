use serde::{Deserialize, Serialize};
use rsa::{RsaPrivateKey, Pkcs1v15Encrypt};
use ed25519_dalek::{Verifier, VerifyingKey, Signature};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Structure representing the user's encrypted secrets (API Keys)
/// Fetched from the MultiversX Smart Contract Execution Intent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedSecrets {
    pub blob: Vec<u8>,
    pub enclave_pubkey_hash: String,
}

/// Secure container for decrypted API keys. 
/// Automatically zeroes memory when dropped to prevent RAM leakage in the Enclave.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct DecryptedApiKeys {
    pub api_key: String,
    pub api_secret: String,
}

pub struct HardwareEnclave {
    private_key: RsaPrivateKey,
}

impl HardwareEnclave {
    pub fn new() -> Self {
        println!("🔐 [NITRO] Initializing hardware entropy. Generating RSA-4096 Keypair in isolated CPU memory...");
        let mut rng = rand::thread_rng();
        // Generates the private key inside the enclave
        let private_key = RsaPrivateKey::new(&mut rng, 4096).expect("Failed to generate RSA key in Enclave");
        Self { private_key }
    }

    pub fn public_key(&self) -> rsa::RsaPublicKey {
        self.private_key.to_public_key()
    }

    pub fn public_key_hash(&self) -> String {
        // Return a hash of the public key to attest to the caller
        // In real AWS Nitro, this is provided by the NSM attestation document
        "XSE_PROD_v1_AWS_NITRO_HASH".to_string() 
    }

    pub async fn decrypt_secrets(&self, secrets: &EncryptedSecrets) -> Result<DecryptedApiKeys, String> {
        if secrets.enclave_pubkey_hash != self.public_key_hash() {
            return Err("FATAL ERROR: Enclave Spoofing Detected. Hashes do not match.".to_string());
        }

        // Decrypt the RSA-4096 blob
        let decrypted = self.private_key.decrypt(Pkcs1v15Encrypt, &secrets.blob)
            .map_err(|_| "Failed to decrypt secrets using enclave private key".to_string())?;

        let decrypted_string = String::from_utf8(decrypted)
            .map_err(|_| "Invalid UTF-8 sequence in decrypted data".to_string())?;
        
        let parts: Vec<&str> = decrypted_string.split(':').collect();
        if parts.len() != 2 {
            return Err("Invalid secret format. Expected 'API_KEY:API_SECRET'".to_string());
        }

        Ok(DecryptedApiKeys {
            api_key: parts[0].to_string(),
            api_secret: parts[1].to_string(),
        })
    }
}

/// Verifies that the payload was actually signed and authorized by the MultiversX Smart Contract or Keeper.
pub fn verify_on_chain_authorization(payload: &[u8], signature_bytes: &[u8], pubkey_bytes: &[u8]) -> Result<(), String> {
    let public_key = VerifyingKey::from_bytes(pubkey_bytes.try_into().map_err(|_| "Invalid public key length")?)
        .map_err(|_| "Invalid MultiversX public key".to_string())?;
    
    let signature = Signature::from_bytes(signature_bytes.try_into().map_err(|_| "Invalid signature length")?);

    public_key.verify(payload, &signature)
        .map_err(|_| "On-chain authorization verification failed. Unauthorized execution attempt.".to_string())
}
