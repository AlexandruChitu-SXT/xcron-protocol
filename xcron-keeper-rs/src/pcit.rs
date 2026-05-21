use sha2::{Sha256, Digest};
use num_bigint::BigUint;

/// Represents a single conditional intent execution path.
#[derive(Debug, Clone)]
pub struct PcitLeaf {
  pub target_contract: [u8; 32],
  pub target_endpoint: String,
  pub target_args: Vec<Vec<u8>>,
  pub expected_token_out: String,
  pub min_return: BigUint,
}

impl PcitLeaf {
  /// Serializes the leaf into exactly the format produced by MultiversX's `top_encode()`
  pub fn top_encode(&self) -> Vec<u8> {
    let mut buf = Vec::new();
    
    // 1. Target Contract (32 bytes raw)
    buf.extend_from_slice(&self.target_contract);
    
    // 2. Target Endpoint (prefixed with 4-byte BE length)
    buf.extend_from_slice(&(self.target_endpoint.len() as u32).to_be_bytes());
    buf.extend_from_slice(self.target_endpoint.as_bytes());
    
    // 3. Target Args (each iterated and raw byte appended)
    for arg in &self.target_args {
      // ️ XCRON-PROTECT: Boundary Collision Fix. MultiversX top_encode uses u32 BE length prefixes.
      buf.extend_from_slice(&(arg.len() as u32).to_be_bytes());
      buf.extend_from_slice(arg);
    }
    
    // 4. Expected Token Out (prefixed with 4-byte BE length)
    buf.extend_from_slice(&(self.expected_token_out.len() as u32).to_be_bytes());
    buf.extend_from_slice(self.expected_token_out.as_bytes());
    
    // 5. Min Return (Big Endian bytes, omission if Zero)
    if self.min_return > BigUint::from(0u32) {
      buf.extend_from_slice(&self.min_return.to_bytes_be());
    }
    
    buf
  }

  /// Generates the SHA-256 hash of the MultiversX-encoded leaf
  pub fn to_hash(&self) -> [u8; 32] {
    let encoded = self.top_encode();
    let mut hasher = Sha256::new();
    hasher.update(&encoded);
    let result = hasher.finalize();
    
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
  }
}

/// Keeper's Off-Chain Merkle Hash Chain engine to replicate the SC `verify_merkle_proof`
pub struct PcitEngine;

impl PcitEngine {
  /// Computes the exact Hash Chain root as expected by `execute_pre_cognitive_leaf`.
  /// The smart contract sequentially hashes: current_hash = sha256(0x01 || current_hash || sibling).
  pub fn compute_chain_root(leaf_hash: &[u8; 32], siblings: &[[u8; 32]]) -> [u8; 32] {
    let mut current_hash = *leaf_hash;
    
    for sibling in siblings {
      let mut hasher = Sha256::new();
      hasher.update(&[0x01u8]); // Match smart contract domain separator
      
      // ️ SECURITY MATCH: Sort lexicographically to match Smart Contract forgery protection
      if current_hash <= *sibling {
        hasher.update(&current_hash);
        hasher.update(sibling);
      } else {
        hasher.update(sibling);
        hasher.update(&current_hash);
      }
      
      current_hash = {
        let mut out = [0; 32];
        out.copy_from_slice(&hasher.finalize());
        out
      };
    }
    
    current_hash
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use num_bigint::BigUint;

  #[test]
  fn test_pcit_leaf_hashing_and_engine() {
    let leaf = PcitLeaf {
      target_contract: [1u8; 32],
      target_endpoint: "swapTokens".to_string(),
      target_args: vec![vec![1, 2, 3], vec![4, 5]],
      expected_token_out: "USDC-c76a12".to_string(),
      min_return: BigUint::from(1000u32),
    };

    let leaf_hash = leaf.to_hash();
    assert_ne!(leaf_hash, [0u8; 32]);

    let sibling1 = [2u8; 32];
    let sibling2 = [3u8; 32];
    let siblings = vec![sibling1, sibling2];

    let root = PcitEngine::compute_chain_root(&leaf_hash, &siblings);
    assert_ne!(root, [0u8; 32]);
    assert_ne!(root, leaf_hash);
    
    // Manual verification of Merkle chain step calculations
    let mut hasher = sha2::Sha256::new();
    hasher.update(&[0x01u8]);
    let (left, right) = if leaf_hash <= sibling1 {
      (leaf_hash, sibling1)
    } else {
      (sibling1, leaf_hash)
    };
    hasher.update(&left);
    hasher.update(&right);
    let expected_step1: [u8; 32] = hasher.finalize().into();

    let mut hasher2 = sha2::Sha256::new();
    hasher2.update(&[0x01u8]);
    let (left2, right2) = if expected_step1 <= sibling2 {
      (expected_step1, sibling2)
    } else {
      (sibling2, expected_step1)
    };
    hasher2.update(&left2);
    hasher2.update(&right2);
    let expected_root: [u8; 32] = hasher2.finalize().into();

    assert_eq!(root, expected_root);
  }
}
