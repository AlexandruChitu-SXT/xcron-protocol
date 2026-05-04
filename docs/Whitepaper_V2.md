# XCron Protocol V2 — The Agentic Coordination Layer
**Whitepaper v2.0** (Draft - April 2026)

## 1. Abstract
The MultiversX blockchain provides sub-second finality (Supernova) and unparalleled throughput. However, smart contracts inherently lack the ability to initiate actions autonomously based on time or external conditions. As the ecosystem shifts toward **Agentic Commerce**—where AI agents negotiate, trade, and manage assets—a fundamental missing piece is the "Time and Execution Lobe".

**XCron Protocol V2** bridges this gap. It is a decentralized, trustless execution layer that allows users and Artificial Intelligences to flexibly schedule on-chain operations (Swaps, Harvests, Rebalances, Payments). By utilizing a decentralized network of incentivized *Keepers*, XCron guarantees executing transactions exactly when criteria are met, transforming MultiversX into an autonomous, event-driven network.

## 2. The Agentic Problem
Modern Web3 architectures are moving past manual clicking. The introduction of the Model Context Protocol (MCP) and AP2 standards on MultiversX allows AI agents (like Claude or custom LLMs) to understand blockchain state. But AI agents do not have private keys stored locally securely, nor can they be trusted to "wake up" exactly at 3:00 AM to perform an atomic swap safely without MEV exposure.
We need an infrastructure where the AI is the "Brain" (making decisions) and a decentralized smart contract system is the "Muscle" (executing with absolute cryptographic security).

## 3. XCron Solution & Architecture
XCron acts as the definitive bridge between Intent and Execution. The protocol consists of three immutable Smart Contracts and an off-chain MCP Gateway.

### A. Core Smart Contracts
1. **The Scheduler:** The heart of the protocol. It safely escrows EGLD/Tokens and stores the immutable intent parameters (Target Contract, Endpoint, Arguments, Trigger Time, Gas Limits). 
2. **Keeper Registry:** The decentralization layer. Anyone can become an executing Keeper by bonding a minimum EGLD stake.
3. **Rewards Engine:** Distributes fees (Protocol Treasury vs Keeper Rewards) and integrates tightly with MultiversX's Gas Royalties.

### B. Trigger Mechanisms
*   `TimeOnce`: Execute block-perfectly at a Unix Timestamp.
*   `TimeRecurring`: Perpetual execution (e.g., compounding rewards).
*   `ConditionOnChain`: Hybrid Oracles. Execution is blocked until an on-chain condition (like xExchange slippage ratio) is validated.

### C. The MCP Server (AI Integration)
XCron V2 ships with `xcron-mcp-server`, a globally accessible plugin that exposes blockchain scheduling directly to AI Agents. Through Clone-Keys (Burner Wallets with hard spending limits), AIs can autonomously fund and schedule on-chain actions safely.

## 4. Military-Grade Security
Built by veterans of the MultiversX *Battle of Nodes*, XCron's security architecture is mathematically impenetrable against the most aggressive state attacks:

*   **State Pruning & Zero-Bloat:** Completed or failed tasks are physically `cleared` from the blockchain state database. An attacker attempting a "Storage Bomb" will find the contract storage remains at ~0 KB indefinitely.
*   **Anti-Spam Flat Fees:** Every intent creation locks a strict, non-refundable creation fee. Rate-limiting attacks (scheduling millions of fake tasks and cancelling them) will instantly bankrupt the attacker.
*   **Atomic Settlement & MEV Protection:** Task execution is synchronous. If a Keeper attempts front-running or fails to achieve the strict Slippage targets, the transaction reverts atomically via CEI (Checks-Effects-Interactions) patterns.
*   **Crypto-Round-Robin:** Keeper assignment employs block-header entropy (SHA256) to assign tasks, neutralizing Keeper-vs-Keeper gas wars.

## 5. Protocol Economics (The 10-Year Model)
XCron is designed to be a self-sustaining financial engine. The Protocol Treasury accumulates value passively through two vectors:

1. **The 15% Protocol Fee:** Users pay a small premium on the gas budget. 70% goes to the Keeper executing the task, and 15% to the Protocol Treasury.
2. **30% Gas Royalties:** MultiversX natively refunds 30% of gas spent on our Smart Contracts directly to our Treasury.

**Keeper Penalties (Slashing):** Keepers who miss execution windows suffer progressive slashing:
- Strike 1: 5% of Stake slashed.
- Strike 2: 15% of Stake slashed.
- Strike 3: 20% slashed and auto-expulsion from the registry.

Slashed funds are permanently redirected to the Treasury, creating an ultra-deflationary pressure on Keeper inefficiency.

## 6. Strategic Roadmap (Q2 2026)
*   **Testnet Supernova Alignment:** Deploying V2 contracts to Testnet to validate the State Pruning under real high-throughput load.
*   **AI Arena Integration:** Connecting the `xcron-mcp-server` to Sasu Robert's Agent Arena.
*   **Mainnet Immutable Deploy:** Launching the Protocol natively on Mainnet with zero upgrade-keys as a public good for the MultiversX ecosystem.
