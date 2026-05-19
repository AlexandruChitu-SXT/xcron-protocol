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
    println!(" [NITRO] Initializing hardware entropy. Generating RSA-4096 Keypair in isolated CPU memory...");
    let mut rng = rand::thread_rng();
    // Generates the private key inside the enclave
    let private_key = RsaPrivateKey::new(&mut rng, 4096).expect("Failed to generate RSA key in Enclave");
    Self { private_key }
  }

  pub fn public_key(&self) -> rsa::RsaPublicKey {
    self.private_key.to_public_key()
  }

  pub fn public_key_hash(&self) -> String {
    use sha2::{Sha256, Digest};
    use rsa::traits::PublicKeyParts;
    let mut hasher = Sha256::new();
    // In real AWS Nitro, this is provided by the NSM attestation document
    // We simulate the NSM cryptographically by hashing the enclave's public key modulus
    let pub_key = self.private_key.to_public_key();
    hasher.update(pub_key.n().to_bytes_be());
    let result = hasher.finalize();
    hex::encode(result)
  }

  pub async fn decrypt_secrets(&self, secrets: &EncryptedSecrets) -> Result<DecryptedApiKeys, String> {
    let expected_hash = self.public_key_hash();
    if secrets.enclave_pubkey_hash.len() != expected_hash.len() {
      return Err("FATAL ERROR: Enclave Spoofing Detected. Hash length mismatch.".to_string());
    }
    
    // ️ XCRON-PROTECT: Timing Attack Fix. Constant-time byte comparison.
    let mut diff = 0u8;
    for (a, b) in secrets.enclave_pubkey_hash.bytes().zip(expected_hash.bytes()) {
      diff |= a ^ b;
    }
    if diff != 0 {
      return Err("FATAL ERROR: Enclave Spoofing Detected. Hashes do not match.".to_string());
    }

    // ️ XCRON-PROTECT: Vector 26 Fix - Cryptographic Padding Mismatch (Bleichenbacher's Oracle)
    // PKCS1v15 is vulnerable to padding oracle attacks. We upgraded the frontend to RSA-OAEP,
    // so the Hardware Enclave must use the exact same OAEP + SHA256 padding for decryption.
    let padding = rsa::Oaep::new::<sha2::Sha256>();
    let decrypted = self.private_key.decrypt(padding, &secrets.blob)
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

/// Structure representing a derived stealth keypair in isolated enclave RAM.
/// Implements ZeroizeOnDrop to ensure keys are zeroed immediately when going out of scope.
#[derive(Debug, Clone, Zeroize, ZeroizeOnDrop)]
pub struct EphemeralStealthKeypair {
  pub private_key: [u8; 32],
  pub public_key: [u8; 32],
  pub viewing_key: [u8; 32],
}

/// Derives a one-time ephemeral stealth keypair deterministic to (enclave_seed, user_pubkey, nonce)
/// to execute shielded transactions. Wipes sensitive registers to prevent side-channel memory leaks.
pub fn derive_ephemeral_stealth_key(
  enclave_seed: &[u8; 32],
  user_public_key_bytes: &[u8; 32],
  intent_nonce: u64,
) -> Result<EphemeralStealthKeypair, String> {
  use sha2::{Sha256, Digest};
  use ed25519_dalek::SigningKey;

  // 1. Compute deterministic scalar seed inside isolated Enclave RAM
  let mut hasher = Sha256::new();
  hasher.update(enclave_seed);
  hasher.update(user_public_key_bytes);
  hasher.update(&intent_nonce.to_le_bytes());
  
  let mut seed = [0u8; 32];
  seed.copy_from_slice(&hasher.finalize());

  // 2. Derive SigningKey and VerifyingKey (the Stealth Address)
  let signing_key = SigningKey::from_bytes(&seed);
  let public_key = signing_key.verifying_key();

  // 3. Compute Viewing Key = Hash(Public Key) for selective regulatory auditing
  let mut vk_hasher = Sha256::new();
  vk_hasher.update(public_key.as_bytes());
  let mut viewing_key = [0u8; 32];
  viewing_key.copy_from_slice(&vk_hasher.finalize());

  let private_bytes = signing_key.to_bytes();
  let public_bytes = public_key.to_bytes();

  // 4. Secure zeroization of the ephemeral intermediate seed in RAM
  seed.zeroize();

  Ok(EphemeralStealthKeypair {
    private_key: private_bytes,
    public_key: public_bytes,
    viewing_key,
  })
}

