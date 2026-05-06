# 🛡️ XCron Sovereign Enclaves (XSE): The Agentic Execution Layer

> [!NOTE]
> **DEVELOPMENT STATUS: ARCHITECTURAL EXPANSION (WEB3 + WEB2/IA)**
> The protocol has officially evolved from a blockchain-only task scheduler to a **Modular Sovereign Execution Layer**. The core Rust engine now serves both Web3 networks (MultiversX) and Private Corporate AI Agents with zero gas fees.

**Agnostic, High-Frequency Execution for the Agentic Economy**

The **XCron Sovereign Enclaves (XSE)** protocol represents the next generation of trustless, cross-boundary execution. It provides a mathematically secure, high-frequency backend engine capable of orchestrating complex tasks for two distinct worlds without compromising security or speed.

---

## 1. The Core Problem: The Agentic Security Wall

As Artificial Intelligence evolves into autonomous agents (AutoGPT, Devin, Corporate AI), a critical infrastructure gap has emerged for Enterprises: **Execution Security**.

1.  **Secret Management:** Where does an AI Agent store a company's API keys, bank credentials, or trading secrets? If the agent is compromised, the company is compromised.
2.  **Trustless Execution:** How do you allow an AI Agent to execute dynamic commands without opening a backdoor into your corporate server?
3.  **High-Frequency Orchestration:** How do you coordinate thousands of agents asynchronously with millisecond precision?

## 2. The Solution: Modular Dual-Dispatcher Architecture

XCron solves this by abstracting the high-frequency execution engine (The Core) from the delivery mechanism (The Dispatcher). The Rust engine processes tasks with extreme concurrency and routes them via the `SettlementDispatcher` trait:

### A. The Web3 Dispatcher (`MultiversXDispatcher`)
*   Designed for public blockchain protocols.
*   Handles Native Gas calculations, `nonce` sequencing, and Smart Contract ABI encoding.
*   Signs payloads with standard `ed25519` cryptography.
*   **Result:** The fastest execution relayer on the MultiversX network.

### B. The Corporate AI Dispatcher (`AIAgentDispatcher`)
*   Designed for B2B AI Agents and private Web2 infrastructure.
*   **Zero Gas:** Executes entirely off-chain via private HTTP endpoints. The enterprise client does not need to hold or buy cryptocurrency.
*   **Military-Grade Security:** Payloads are encrypted via authenticated `ChaCha20Poly1305` before leaving the enclave.
*   **Anti-Replay Protection:** Injects strict `UUID v4` Idempotency Keys to prevent hackers from replaying valid AI commands (e.g., executing a $50k purchase twice).
*   **Result:** Absolute privacy, high-speed execution, and zero-trust orchestration for Enterprise AI.

## 3. The XSE Innovation: Hardware-Isolated Enclaves

Whether executing a Smart Contract or an AI HTTP Request, XSE acts as a **Sovereign Execution Bridge**:
- We **never** store unencrypted API Keys or Corporate Secrets.
- Secrets are encrypted on the client side and only decrypted *inside* hardware-isolated TEEs (Trusted Execution Environments, like AWS Nitro) during the milliseconds of execution.
- The volatile RAM is cryptographically wiped immediately afterward.

## 4. How to Use This Repository

This repository contains the architecture, security audit, and the core Rust enclave worker code required to deploy and verify an XSE instance.

- `ARCHITECTURE.md`: Detailed hybrid data flow for Web3 and Web2 dispatchers.
- `THREAT_MODEL.md`: Our transparent, "zero-bullshit" security audit of the TEE vectors and AI Dispatcher mitigations.
- `src/`: The Rust-based worker daemon designed for multi-role deployment.
