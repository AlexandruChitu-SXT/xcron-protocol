# XCron Protocol

**Decentralized Task Automation on MultiversX**

XCron is a trustless cron-job scheduler that lets anyone automate on-chain actions — token swaps, DeFi harvests, governance votes, NFT mints — by posting tasks to a smart contract. A decentralized keeper network competes to execute those tasks on time, earning rewards for reliable service.

> **Status:** Live on MultiversX Devnet · Phase 1 Complete · Economics Under Design

---

## What It Does

You tell XCron _what_ to execute and _when_. The protocol handles the rest.

- **"Claim my staking rewards every day"** → XCron does it automatically
- **"Swap EGLD to USDC if price drops below $3.50"** → Hybrid price triggers
- **"Auto-compound my DeFi position weekly"** → Set and forget

No servers needed. No cron jobs. Fully on-chain, trustless, and decentralized.

---

## Current Status — Phase 1 Complete ✅

| Component | Status |
|-----------|--------|
| **Smart Contracts** | Scheduler, KeeperRegistry, Rewards — deployed on devnet |
| **Keeper Bot** | Intelligent executor with retry logic, error classification, exponential backoff |
| **Frontend** | Dashboard with real-time prices, task scheduling, wallet connection |
| **CI/CD** | GitHub Actions — TypeScript build, Rust build, security scanning |
| **E2E Flow** | `scheduleTask` → Keeper detects → `executeTask` → Rewards distributed ✅ |

**Phase 2 (in progress):** Testnet deployment, recurring tasks, multi-keeper competition, economic model finalization

---

## Architecture

```
┌──────────────┐     scheduleTask()     ┌──────────────────┐
│   Frontend   │ ────────────────────▶  │    Scheduler     │
│  (React/TS)  │                        │  Smart Contract  │
└──────────────┘                        └────────┬─────────┘
                                                 │
                    ┌────────────────────────────┤
                    │                            │
           executeTask()                   callback/fees
                    │                            │
          ┌─────────▼────────┐          ┌────────▼─────────┐
          │   Keeper Bot     │          │     Rewards      │
          │   (TypeScript)   │          │  Smart Contract  │
          └─────────┬────────┘          └──────────────────┘
                    │
           register/slash
                    │
          ┌─────────▼────────┐
          │  KeeperRegistry  │
          │  Smart Contract  │
          └──────────────────┘
```

## Smart Contracts

| Contract | Description | Key Endpoints |
|----------|-------------|---------------|
| **Scheduler** | Core task management | `scheduleTask`, `cancelTask`, `executeTask`, `expireStaleTasks` |
| **KeeperRegistry** | Keeper registration & bonds | `registerKeeper`, `requestUnstake`, `withdrawStake`, `slashKeeper` |
| **Rewards** | Fee distribution & claiming | `receiveExecutionFee`, `claimRewards` |

All contracts built with **MultiversX SC Framework v0.54.6** following the **Checks-Effects-Interactions (CEI)** pattern.

## Key Features

- **Time-based scheduling** — Execute at a specific round or recurring intervals
- **Hybrid price triggers** — Combine time schedules with real-time price conditions (Binance WebSocket)
- **Real-time price dashboard** — Live streaming prices for EGLD, BTC, ETH, BNB, SOL, XRP
- **Intelligent keeper bot** — Exponential backoff, error classification (PERMANENT vs TRANSIENT), SCResult parsing
- **Keeper bond system** — Deposit EGLD as security, earn rewards, get slashed for failures
- **Template library** — Auto-Compound, DCA, Stop-Loss, Claim Rewards, NFT Mint, Custom
- **Full lifecycle management** — Schedule, monitor, cancel, and track task history

## Protocol Economics

> ⚠️ **Under Design** — The economic model is being carefully designed to ensure long-term sustainability for all participants: users, keepers, and the protocol.

**What we know:**
- Fees denominated in USD, paid in EGLD (protects against price volatility)
- Keepers earn rewards for executing tasks + gas reimbursement
- No token at launch — fees in EGLD only
- Economic model details will be published once finalized

**Participants:**

| Role | What they do | How they benefit |
|------|-------------|-----------------|
| **Users** | Schedule automated tasks | Save time, never miss DeFi opportunities |
| **Keepers** | Execute tasks on-chain | Earn execution rewards + gas reimbursement |
| **Protocol** | Infrastructure & smart contracts | Percentage of execution fees |
| **Platforms (B2B)** | Integrate XCron for their users | Offer automation as a feature |

## Security Model

| Mechanism | Description |
|-----------|-------------|
| **Keeper Bond** | EGLD deposit required to become a keeper |
| **Slashing** | Bond penalty on failed/malicious executions |
| **Cooldown Period** | Configurable delay before bond withdrawal |
| **CEI Pattern** | All contracts follow Checks-Effects-Interactions |
| **Reentrancy Safe** | Rewards cleared before transfer |
| **Access Controls** | `only_owner`, `require_authorized_caller`, `require_scheduler_caller` |
| **CI Security Scan** | Automated secret scanning + sensitive data pattern checks on every push |

## Project Structure

```
xcron-protocol/
├── contracts/               # Smart contracts (Rust)
│   ├── common/              # Shared types, constants, errors
│   ├── scheduler/           # Task scheduling & execution
│   ├── keeper-registry/     # Keeper management & bonds
│   └── rewards/             # Reward distribution
├── frontend/                # Web interface (React + Vite)
│   └── src/
│       ├── pages/           # Dashboard, ScheduleTask, MyTasks, KeeperPanel
│       ├── hooks/           # useWallet, useContractQuery
│       └── components/      # PriceTicker, Header, ConnectModal, LiveActivityFeed
├── keeper/                  # Keeper bot (TypeScript)
│   └── src/                 # index, monitor, executor, network, config
├── interaction/             # Deploy & interaction scripts
└── xcron/                   # Documentation
    └── whitepaper.md        # Technical whitepaper
```

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`

### Smart Contracts

```bash
cd contracts
for contract in scheduler keeper-registry rewards; do
  cd $contract/wasm
  RUSTFLAGS="-C link-arg=-s -C link-arg=-zstack-size=131072" \
    cargo build --target=wasm32-unknown-unknown --release \
    --target-dir ../../target
  cd ../..
done
```

### Keeper Bot

```bash
cd keeper
npm install
npx ts-node src/index.ts
```

## Devnet Deployment

| Contract | Address |
|----------|---------|
| **Scheduler** | `erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh` |
| **KeeperRegistry** | `erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula` |
| **Rewards** | `erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt` |

## Documentation

- [Whitepaper](xcron/whitepaper.md) — Full technical specification

## License

MIT
