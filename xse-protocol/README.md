# 🛡️ XSE Protocol: Quantum-Sealed API Enclaves

> [!WARNING]
> **DEVELOPMENT STATUS: ARCHITECTURAL PROTOTYPE**
> This repository is currently a **simulated execution prototype**. It is **NOT yet secure for real funds**. 
> - **Implemented:** Strict JSON Schemas for Execution Intents & Receipts, MultiversX Relayer architecture.
> - **Simulated:** Execution Enclaves, Dry-Run order flow.
> - **Planned:** AWS Nitro Enclave integration, Binance Testnet support, MultiversX on-chain authorization rails.

**Zero-Knowledge API Routing for MultiversX**

The **XCron Sovereign Enclaves (XSE)** protocol represents the next generation of trustless, cross-chain execution. It enables automated operations on centralized platforms (like Binance) directly from the MultiversX blockchain, without ever requiring user API keys to be held in custody by a centralized server or "bot".

---

## 1. The Core Problem: Centralized Custody & Expensive Bridges

Currently, executing an automated Dollar-Cost Averaging (DCA) or any complex trading strategy from a blockchain to a Centralized Exchange (CEX) involves two fundamentally flawed paths:

1.  **DeFi Bridges (The Expensive Path):** Requires routing assets through vulnerable Smart Contracts, paying swap slippage and high cross-chain fees. (E.g., Moving $50,000 via traditional bridges can cost ~$230-$300 USD and introduces severe honeypot risks).
2.  **Centralized Bots (The Security Nightmare):** Requires users to hand over their unencrypted Exchange API Keys to a centralized VPS or server. If the server is breached, the user's entire exchange balance is compromised.

## 2. The XSE Innovation: Zero-Knowledge API Routing

**XSE Protocol** solves this by packaging military-grade **Trusted Execution Environment (TEE)** technology (such as AWS Nitro Enclaves) into an accessible relayer protocol. 

XSE acts as a **Trustless Execution Bridge**:
- We **never** store unencrypted API Keys.
- Users encrypt their API Keys on the client side using an RSA-4096 public key.
- The cipher text is only decrypted *inside* the hardware-isolated Enclave during the milliseconds of execution, and destroyed immediately afterward.

## 3. Economic Impact

By bypassing traditional DeFi bridges and executing natively via CEX APIs:
*   **Without XSE:** around $230-$300 USD in bridge fees, gas, and DEX slippage.
*   **With XSE:** Native EGLD transfer fee (around $0.01) + Enclave Execution fee (around $0.10). 
*   **Total Savings:** >99.9% reduction in cross-chain friction.

## 4. How to Use This Repository

This repository contains the architecture, security audit, and the core Rust enclave worker code required to deploy and verify an XSE instance.

- `ARCHITECTURE.md`: Detailed hybrid data flow.
- `SECURITY.md`: Our transparent, "zero-bullshit" security audit of the TEE vectors.
- `src/`: The Rust-based worker daemon designed for Enclave deployment.
