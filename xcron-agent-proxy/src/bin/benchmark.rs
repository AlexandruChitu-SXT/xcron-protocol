use serde_json::json;
use tiktoken_rs::cl100k_base;

#[path = "../semantic_hasher.rs"]
mod semantic_hasher;

fn main() {
    let bpe = cl100k_base().unwrap();
    let hasher = semantic_hasher::SemanticHasher::new();

    let agent_payload = json!({
        "system_routine": "tools/invoke",
        "target_orchestrator": "erd1qqqqqqqqqqqqqpgqtzylnzxc20xmd5a9krt8t9l8kndr90rtv7ls639v39",
        "task": {
            "action": "analyze mempool",
            "condition": "if volatile",
            "execution": "execute arbitrage"
        }
    });

    let original_text = serde_json::to_string(&agent_payload).unwrap();
    let original_tokens = bpe.encode_with_special_tokens(&original_text).len();

    println!("\n[+] ORIGINAL AGENT A2A PAYLOAD (JSON):");
    println!("{}", original_text);
    println!("-> OPENAI (GPT-4) TOKENS BURNED: {}", original_tokens);

    let compressed_ast = hasher.hash(agent_payload);
    let compressed_text = serde_json::to_string(&compressed_ast).unwrap();
    let compressed_tokens = bpe.encode_with_special_tokens(&compressed_text).len();

    println!("\n[+] RUST V2 COMPRESSED PAYLOAD (AST ARRAY):");
    println!("{}", compressed_text);
    println!("-> OPENAI (GPT-4) TOKENS BURNED: {}", compressed_tokens);

    let reduction = (1.0 - (compressed_tokens as f64 / original_tokens as f64)) * 100.0;

    println!("\n=> EMPIRICAL RESULT IN RUST (STRICT AST SAFETY):");
    println!("=> SAVED {:.1}% on OpenAI GPT-4 Costs", reduction);
    println!("=============================================\n");
}
