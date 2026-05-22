# 🛡️ XCron Semantic Agent Proxy: The Brain-to-Muscle Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance, strictly audited middleware proxy built in Rust. It serves as the authoritative gateway between **Artificial Intelligence (The Brain)** and the **Sovereign Execution Enclaves (The Muscle)** on MultiversX.

## 🧠 The Dual Purpose

The `xcron-agent-proxy` solves the two most critical bottlenecks in the Agentic Economy: **Cost** and **Security**.

### 1. The Agent Shield (Anti-Hallucination Firewall)
When an autonomous AI Agent decides to execute a financial action, it emits an `Intent`. LLMs are prone to hallucinations (inventing invalid smart contract addresses, confusing amounts, or ignoring safety constraints). 
The Agent Proxy acts as a strict cryptographic firewall:
* **Target Auditing:** Strictly validates that all execution targets are valid MultiversX `erd1` addresses (exactly 62 characters). Malformed intents are instantly rejected.
* **Hard Limits:** Enforces mathematical boundaries (e.g., maximum 1000 EGLD limits) to prevent catastrophic financial loss due to AI logic loops.
* **Withdrawal Blacklisting:** Hardcodes strict execution constraints (`allow_withdrawals: false`). The AI is permitted to *execute* logic (Auto-compound, Swap), but is cryptographically blocked from withdrawing funds.

### 2. Semantic Hashing (77% Cost Reduction)
Autonomous Agents operating continuously burn massive amounts of LLM API tokens (OpenAI, Anthropic) transmitting repetitive JSON structures. 
The proxy intercepts these payloads and applies **Strict Semantic Hashing** natively via an Abstract Syntax Tree (AST) parser in Rust, ripping out redundant syntax formatting.
* **OpenAI (GPT-4)**: 77% Token Reduction
* **Anthropic (Claude 3)**: 77% Token Reduction

## 🏗 The Architecture: XSE Integration

Once an AI Intent passes the strict hallucination audits, the Proxy acts as the translator. It converts natural language / conversational JSON structures into the rigid, mathematical `ExecutionIntent` schema required by the **XCron Sovereign Enclaves (XSE)**. 

The proxy then routes the verified intent into the secure hardware enclave for post-quantum signature generation and sub-300ms network settlement.

## 🚀 Quickstart

**1. Clone the Repository**
```bash
git clone https://github.com/AlexandruChitu-SXT/xcron-agent-proxy.git
cd xcron-agent-proxy
```

**2. Compile the Proxy (Mainnet Ready)**
Built strictly on top of `axum` and `tokio` for true asynchronous throughput with microscopic memory overhead (~10MB RAM).
```bash
cargo build --release
```

**3. Run the Proxy Middleware**
```bash
# Define your secure Agent Token to prevent Web2 Relayer attacks
export AGENT_AUTH_TOKEN="your_secure_token"
cargo run --release
```
The high-performance server binds to `http://127.0.0.1:8089`. Point your Dual-LLM frontend or autonomous framework to the `/v1/agent/intent` endpoint.

## 📜 License
MIT License. Built by XCron Protocol for the builder ecosystem.
