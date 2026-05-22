use aho_corasick::AhoCorasick;
use serde_json::{Map, Value};

/// Traverses a JSON Abstract Syntax Tree (AST) recursively
/// safely applying the semantic compression dictionary without breaking schema structures.
pub struct SemanticHasher {
    ac: AhoCorasick,
    replacements: Vec<&'static str>,
}

impl SemanticHasher {
    pub fn new() -> Self {
        let patterns = &[
            "tools/invoke",
            "sessions_send",
            "execute arbitrage",
            "analyze mempool",
            "erd1qqqqqqqqqqqqqpgqtzylnzxc20xmd5a9krt8t9l8kndr90rtv7ls639v39",
            "multiversx",
        ];

        let replacements = vec!["Z1", "Z2", "Z3", "Z4", "W1", "MX"];

        // AhoCorasick builds an automaton for O(N) multi-pattern matching
        let ac = AhoCorasick::new(patterns).expect("Failed to build AhoCorasick automaton");

        Self { ac, replacements }
    }

    pub fn hash(&self, mut value: Value) -> Value {
        self.traverse(&mut value, 0);
        value
    }

    fn traverse(&self, value: &mut Value, depth: u8) {
        // 🛡️ XCRON-PROTECT: Vector 54 Fix - Recursion Depth Limit (Stack Overflow Protection)
        // Maliciously nested JSON (e.g. 10,000 arrays) could crash the proxy.
        if depth > 32 {
            *value = Value::String(
                "ERROR: Max recursion depth exceeded. Potential JSON Bomb detected.".to_string(),
            );
            return;
        }

        match value {
            Value::String(s) => {
                // O(N) replacement without loops
                let updated = self.ac.replace_all(s, &self.replacements);
                if updated != *s {
                    *value = Value::String(updated);
                }
            }
            Value::Array(arr) => {
                for v in arr.iter_mut() {
                    self.traverse(v, depth + 1);
                }
            }
            Value::Object(obj) => {
                let mut new_map = Map::new();
                let old_map = std::mem::take(obj);
                for (k, mut v) in old_map {
                    self.traverse(&mut v, depth + 1);

                    let compressed_key = self.ac.replace_all(&k, &self.replacements);

                    // 🛡️ XCRON-PROTECT: Vector 21 Fix - Semantic AST Collision Overwrite
                    // An attacker could send `{"Z1": "malicious", "tools/invoke": "safe"}`.
                    // The compression turns `tools/invoke` into `Z1`, overwriting the first key
                    // and hijacking the prompt structure. We append a conflict suffix to block this.
                    if new_map.contains_key(&compressed_key) {
                        new_map.insert(format!("{}_conflict_blocked", compressed_key), v);
                    } else {
                        new_map.insert(compressed_key, v);
                    }
                }
                *value = Value::Object(new_map);
            }
            _ => {}
        }
    }
}
