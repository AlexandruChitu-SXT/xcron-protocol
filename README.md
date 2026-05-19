# XCron Protocol: Decentralized Automation and Intent Execution Layer

XCron Protocol is a decentralized task automation and intent execution layer built on the MultiversX blockchain. It allows users and autonomous agents to schedule and automate smart contract calls (such as recurring swaps, yield harvesting, and conditional payments) securely and trustlessly.

---

## Protocol Overview

The core architecture consists of three smart contracts and an off-chain executor network (Keepers):

1. **Scheduler**: Manages task scheduling, handles EGLD/token deposits, and coordinates execution callbacks.
2. **KeeperRegistry**: Manages keeper registrations, stake requirements, slashing logic, and reputation tracking.
3. **Rewards**: Coordinates execution fee distribution and protocol revenue collection.

### Execution Workflow

```
┌──────────────┐      1. Submit Task/Intent      ┌──────────────────┐       async call      ┌──────────────┐
│   Frontend   │ ──────────────────────────────► │    Scheduler     │ ────────────────────► │   Target     │
│  (React/TS)  │      Deposit Gas/Fees           │  Smart Contract  │    Callback Verify   │   Contract   │
└──────────────┘                                 └────────┬─────────┘                       └──────────────┘
                                                          │
                                         ┌────────────────┤
                                         │                │
                                 2. executeTask()    Fees/Rewards
                                         │                │
                                ┌────────▼────────┐ ┌─────▼────────────┐
                                │  Keeper Network │ │     Rewards      │
                                │ (Rust Executor) │ │  Smart Contract  │
                                └────────┬────────┘ └──────────────────┘
                                         │
                                3. Verify Execution
                                         │
                                ┌────────▼────────┐
                                │  KeeperRegistry │
                                │  Smart Contract  │
                                └──────────────────┘
```

---

## Core Features

* **Asynchronous Callbacks**: Keepers are rewarded only when the target smart contract execution returns a successful callback.
* **On-Chain Conditions**: Conditional tasks verify state parameters (e.g., token prices on xExchange) directly on-chain via view calls.
* **Commit-Reveal MEV Protection**: Prevents execution front-running using a hash-commit and bond verification flow.
* **Round-Robin Task Distribution**: Distributes tasks among registered keepers based on block-hash entropy, enforcing a 30-second exclusive window before open execution.
* **Progressive Slashing**: Imposes escalating penalties for consecutive keeper execution failures (Strike 1: 5%, Strike 2: 15%, Strike 3: 20% and registry expulsion).
* **Early Exit Penalty**: Imposes a 5% penalty if a keeper unstakes before a 30-day lockup period.
* **Recurring Tasks**: Auto-reschedules tasks using remaining balances.
* **Stuck Task Recovery**: Allows the task owner or protocol governance to recover tasks stuck in executing status after 24 hours.

---

## Trigger Types

| Trigger | Description | Use Case |
|---------|-------------|----------|
| `TimeOnce` | Executes once at a specific timestamp | Scheduled token transfers, planned contract calls |
| `TimeRecurring` | Executes repeatedly at fixed intervals | Auto-compounding, periodic payrolls |
| `ConditionOnChain` | Executes when an on-chain view query matches | Price-triggered swaps, state-dependent liquidations |

---

## Protocol Economics

| Parameter | Value |
|-----------|-------|
| Keeper Reward | 70% of task fee |
| Protocol Fee | 30% of task fee |
| Maximum Reward per Execution | 0.05 EGLD |
| Minimum Keeper Stake | Configurable |
| Unstake Cooldown | 12 hours |

---

## Repository Structure

```
xcron-protocol/
├── .github/                 # CI/CD and GitHub Action workflows
├── contracts/               # MultiversX Smart Contracts (Rust)
│   ├── common/              # Shared types, constants, and error definitions
│   ├── keeper-registry/     # Keeper staking and reputation registry
│   ├── ping/                # Test target contract
│   ├── rewards/             # Fee distribution and claiming
│   ├── scheduler/           # Main scheduling and orchestration logic
│   ├── xcron-agent-shield/  # Identity and validation registries for agents
│   ├── xcron-hft-vault/     # High-frequency trading vault prototypes
│   ├── xsc-core/            # Compressed state and Merkle proof processing
│   ├── xwap/                # AshSwap and xExchange routing integration
│   └── zk-verifier/         # Zero-Knowledge validation contracts
├── docs/                    # Architecture guides and reference manuals
├── frontend-next/           # Protocol dashboard (Next.js 14)
├── scripts/                 # Staging, testing, and deployment scripts
├── sdk/                     # TypeScript SDK client
├── xcron-keeper-rs/         # Off-chain keeper executor engine (Rust)
├── xsc-offchain/            # Node.js off-chain proof generation tools
└── xse-protocol/            # Sovereign Intent Enclave specifications (Rust)
```

---

## Getting Started

### Prerequisites

* Rust 1.78+ with target `wasm32-unknown-unknown`
* Node.js 20+
* `multiversx-sc-meta` toolchain (for building smart contracts)

### Building Contracts

Navigate to any contract directory and build:

```bash
cd contracts/scheduler
cargo check
sc-meta all build
```

To run all scenario tests:

```bash
cd contracts/scheduler
cargo test
```

### Running the Frontend

Navigate to `frontend-next/`, configure your environment, and launch the dev server:

```bash
cd frontend-next
npm install --legacy-peer-deps
npm run dev
```

The interface will be available at `http://localhost:3000`.

### Integrating the SDK

Install the SDK peer dependencies and the package:

```bash
npm install xcron-sdk @multiversx/sdk-core
```

Initialize the client and build a scheduling transaction:

```typescript
import { XCronClient } from "xcron-sdk";

const client = new XCronClient("testnet");

const transaction = client.scheduleTask({
    targetContract: "erd1...",
    targetEndpoint: "executeCall",
    trigger: {
        type: "TimeOnce",
        targetTime: Math.floor(Date.now() / 1000) + 3600,
    },
    depositEgld: "50000000000000000",
});
```

---

## Deployed Addresses

### Testnet

| Contract | Address |
|----------|---------|
| Scheduler | `erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263` |
| KeeperRegistry | `erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka` |
| Rewards | `erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta` |

---

## License

This project is licensed under the MIT License.
