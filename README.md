# 🛡️ XCron Protocol: The Agentic Execution Layer

[![CI](https://github.com/AlexandruChitu-SXT/xcron-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexandruChitu-SXT/xcron-protocol/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Testnet](https://img.shields.io/badge/MultiversX-Testnet-00e5ff)](https://testnet-explorer.multiversx.com)

<p align="center">
  <img src="quantum_seal.png" width="300" alt="XCron Quantum Seal" />
</p>

# 🧠 Brain-to-Muscle Orchestration on MultiversX

**Institutional-Grade Infrastructure for Autonomous Agents**

XCron Protocol has evolved beyond basic task automation. It is now the foundational **Sovereign Execution Layer** that bridges the gap between Artificial Intelligence (The Brain) and high-frequency blockchain settlement (The Muscle). 

We provide the secure, trustless substrate allowing Corporate AI Agents to execute complex financial intents on MultiversX with sub-300ms finality, entirely protected by Post-Quantum Cryptography and strict anti-hallucination firewalls.

> **Status:** Mainnet Integration Phase · Supernova-Ready · Agentic Escrow Live
>
> 🌐 **Portal:** [xcron.io](https://xcron.io) · **Terminal:** [mvxcron.com](https://mvxcron.com)

---

## ⚡ The Agentic Engine

You provide the *Intent*. The XSE (XCron Sovereign Enclaves) Rust Engine handles the rest.

- **Dual-LLM Frontend:** Users express natural language intents (e.g., *"Maximize my EGLD yield this week"*).
- **Anti-Hallucination Proxy:** The `xcron-agent-proxy` cryptographically validates the AI intent, stripping invalid contracts and enforcing hard withdrawal limits.
- **Sovereign Execution:** The local Rust engine acts autonomously, evaluating market conditions and settling transactions securely on-chain.

## 🌟 Vanguard V2: XCron Intents (Pillar A) - LIVE

XCron has evolved beyond basic imperative tasks (cron jobs) into a **Declarative Intent Protocol**. Instead of defining *how* to execute a transaction, users simply declare their desired outcome (e.g., "Swap 100 USDC for WEGLD with a strict minimum return of 2.5 WEGLD").

Our specialized **Rust-based Solver Network** (built on Tokio) competes to find the most optimal routing across xExchange, AshSwap, and OneDex. If solvers fail to secure the *Strict Minimum Return* (Slippage Protection), the transaction mathematically reverts securely.

![XCron UI: Declarative Smart Intents](https://xcron.io/assets/intent-panel-demo.png)

---

## Architecture

```text
┌──────────────┐    1. Submit Intent    ┌──────────────────┐     async call     ┌──────────────┐
│   Frontend   │ ────────────────────►  │    Scheduler     │ ─────────────────► │   Target     │
│  (React/TS)  │   deposit EGLD         │  Smart Contract  │   callback verify  │   Contract   │
└──────────────┘                        └────────┬─────────┘                    └──────────────┘
                                                 │
                              ┌──────────────────┤
                              │                  │
                     2. executeIntent()     fees/rewards
                              │                  │
                    ┌─────────▼────────┐  ┌──────▼───────────┐
                    │ XSE Protocol TEE │  │     Rewards      │
                    │  (Rust / Tokio)  │  │  Smart Contract  │
                    └─────────┬────────┘  └──────────────────┘
                              │
                     3. FIPS-204 Auth
                              │
                    ┌─────────▼────────┐
                    │  KeeperRegistry  │
                    │  Smart Contract  │
                    └──────────────────┘
```

## Smart Contracts

| Contract | Description | Key Endpoints |
|----------|-------------|---------------|
| **Scheduler** | Task management, async execution with callbacks | `scheduleTask`, `cancelTask`, `executeTask`, `expireStaleTasks`, `recoverStuckTask` |
| **KeeperRegistry** | Keeper registration, progressive slashing, reputation | `registerKeeper`, `requestUnstake`, `withdrawStake`, `recordExecution` |
| **Rewards** | Fee distribution & claiming | `receiveExecutionFee`, `claimRewards` |

Built with **MultiversX SC Framework v0.63.0** (Supernova-ready) following the **Checks-Effects-Interactions (CEI)** pattern.

## Key Features

- **Async callbacks** — Keepers only get paid when the target contract execution succeeds
- **On-chain oracle** — Price conditions verified directly on-chain via xExchange (no trust needed)
- **Commit-reveal anti-MEV** — Prevents frontrunning of profitable tasks with hash-commit + bond
- **Fair task distribution** — Round-robin assignment with 30s grace period
- **Progressive slashing** — Strike 1: 5%, Strike 2: 15%, Strike 3: 20% + auto-expulsion
- **Early exit penalty** — 5% if a keeper unstakes before 30 days
- **Recurring tasks** — Auto-rescheduled with remaining deposit
- **TTL expiration** — Stale tasks auto-expire with deposit refund
- **Stuck task recovery** — Owner can recover tasks stuck in Executing state after 24h
- **Deposit caps** — Configurable max deposit per task to limit exposure
- **Circuit breaker** — Pause/unpause for emergency situations

## Trigger Types

| Trigger | Description | Use Case |
|---------|-------------|----------|
| `TimeOnce` | Execute at a specific timestamp | Scheduled transfers, one-time claims |
| `TimeRecurring` | Execute at fixed intervals | Auto-compound, recurring payments |
| `ConditionOnChain` | Execute when an on-chain condition is met | Price triggers via xExchange oracle |

## Protocol Economics

| Parameter | Value |
|-----------|-------|
| Keeper reward | 70% of task deposit |
| Protocol fee | 30% of task deposit |
| Max reward per exec | 0.05 EGLD |
| Min keeper stake | Configurable |
| Early exit penalty | 5% (if unstake < 30 days) |
| Slash Strike 1 | 5% of stake |
| Slash Strike 2 | 15% of stake |
| Slash Strike 3 | 20% + auto-expulsion |
| Unstake cooldown | 12 hours |

## Security

| Mechanism | Description |
|-----------|-------------|
| **Async Callbacks** | Keeper only paid on confirmed target success |
| **Commit-Reveal Anti-MEV** | Hash-commit + bond prevents frontrunning |
| **On-Chain Oracle** | Price verified on-chain, keepers can't fake conditions |
| **Progressive Slashing** | Escalating penalties for consecutive failures |
| **Reentrancy Guard** | Prevents recursive execution |
| **CEI Pattern** | All contracts follow Checks-Effects-Interactions |
| **Call Injection Protection** | Cannot target protocol contracts or dangerous endpoints |
| **Target Auto-Blacklist** | Contracts failing ≥10 times are auto-blocked |
| **Deposit Cap** | Configurable max EGLD per task |
| **TTL Expiration** | Stale tasks expire with automatic refund |
| **Circuit Breaker** | Emergency pause capability |
| **Pre-commit Scanning** | Automated secret detection |

## Testing

**23 scenario tests** covering deployment, scheduling, execution, access control, security rules, circuit breaker, TTL expiration, commit-reveal, deposit caps, and input validation.

```bash
cd contracts/scheduler && cargo test
```

## Project Structure

```
xcron-protocol/
├── contracts/               # Smart contracts (Rust)
│   ├── common/              # Shared types, constants, errors
│   ├── scheduler/           # Task scheduling & execution
│   ├── keeper-registry/     # Keeper management & bonds
│   ├── rewards/             # Reward distribution
│   └── ping/                # Test target contract
├── frontend/                # Web interface (React + Vite)
│   └── src/
│       ├── pages/           # Dashboard, ScheduleTask, MyTasks, KeeperPanel, ExploreTasks, ProtocolStats
│       ├── hooks/           # useWallet, useContractQuery, useExecutionNotifier
│       └── components/      # PriceTicker, Header, ConnectModal, ProtocolRadar
├── sdk/                     # TypeScript SDK
│   └── src/                 # XCronClient, types, addresses
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
└── .github/                 # CI/CD & security hooks
```

## Quick Start

### Frontend

```bash
cd frontend && npm install && npm run dev
```

Opens at `http://localhost:5173`

### Keeper Bot

```bash
cd keeper && npm install && npm run build
cp keeper-config.example.json keeper-config.testnet.json
# Edit keeper-config.testnet.json with your PEM path and contract addresses
npm start
```

The keeper bot monitors pending tasks and executes them automatically. Requires a funded wallet (PEM) on the target network.

### Smart Contracts

```bash
cd contracts/scheduler && cargo check
cd ../keeper-registry && cargo check
cd ../rewards && cargo check
```

## Deployments

### Devnet

| Contract | Address |
|----------|---------|
| Scheduler | `erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh` |
| KeeperRegistry | `erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula` |
| Rewards | `erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt` |

### Testnet

| Contract | Address |
|----------|---------|
| Scheduler | `erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263` |
| KeeperRegistry | `erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka` |
| Rewards | `erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta` |

## Documentation

- [Architecture](docs/architecture.md)
- [Getting Started](docs/getting-started.md)
- [Keeper Guide](docs/keeper-guide.md)
- [SDK Reference](docs/sdk-reference.md)

## License

MIT
