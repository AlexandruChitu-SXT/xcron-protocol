# XCron Protocol

**Decentralized Task Automation on MultiversX**

XCron is a trustless cron-job scheduler that lets anyone automate on-chain actions (token swaps, DeFi harvests, governance votes, NFT mints) by posting tasks to a smart contract. A decentralized keeper network — incentivized with EGLD rewards and secured by slashable bonds — competes to execute those tasks on time.

> **Status:** Live on MultiversX Devnet · Phase 1 Complete · Protocol Fee: 15%

---

## Current Status — Phase 1 Complete ✅

| Milestone | Status |
|-----------|--------|
| **E2E Task Execution** | `scheduleTask` → Keeper detects → `executeTask` on-chain → Rewards distributed |
| **Reward Distribution** | 85% keeper / 15% protocol — verified on-chain |
| **Intelligent Keeper** | Exponential backoff, error classification (PERMANENT vs TRANSIENT), SCResult parsing |
| **Frontend** | Schedule tasks, My Tasks (status badges, cancel), Wallet connection (Web Wallet, Extension, xPortal) |
| **Code Quality** | 0 TypeScript errors, 0 console.logs, security scan clean |

**Phase 2 (in progress):** Testnet deployment, recurring tasks E2E, multi-keeper competition, dashboard stats

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

All contracts are built with **MultiversX SC Framework v0.54.6** and follow the **Checks-Effects-Interactions (CEI)** pattern.

## Protocol Economics

| Parameter | Value |
|-----------|-------|
| **Protocol Fee** | 15% (1,500 BPS) — configurable via `setProtocolFeeBps` |
| **Gas Royalties** | 30% of gas spent on XCron contracts |
| **Keeper Bond** | 1 EGLD minimum stake |
| **Slash Penalty** | 10% of bond on failed executions |
| **Min Task Deposit** | 0.1 EGLD |

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
│       └── components/      # Header, ConnectModal, XCronLogo
├── keeper/                  # Keeper bot (TypeScript)
│   └── src/                 # index, monitor, executor, network, config
├── interaction/             # Deploy & interaction scripts
│   └── snippets.sh          # mxpy deployment commands
└── xcron/                   # Documentation
    ├── whitepaper.md         # Full technical whitepaper
    ├── 01_architecture.md    # System architecture
    ├── 02_smart_contracts.md # Contract specifications
    ├── 03_keeper_specification.md # Keeper node docs
    ├── 04_tokenomics.md      # Revenue model & projections
    ├── 05_roadmap.md         # Development roadmap
    └── 06_risk_analysis.md   # Threat model & mitigations
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

**Build WASMs:**
```bash
cd contracts

# Build each contract
for contract in scheduler keeper-registry rewards; do
  cd $contract/wasm
  RUSTFLAGS="-C link-arg=-s -C link-arg=-zstack-size=131072" \
    cargo build --target=wasm32-unknown-unknown --release \
    --target-dir ../../target
  cd ../..
done
```

**Deploy to devnet:**
```bash
cd interaction
source snippets.sh
deploy_all
```

### Keeper Bot

```bash
cd keeper
npm install
npx ts-node src/index.ts
```

## Key Features

- **Time-based scheduling** — Execute at a specific round or recurring intervals
- **Intelligent keeper bot** — Exponential backoff, permanent error detection, SCResult event parsing
- **Keeper bond system** — Deposit EGLD as security, earn rewards, get slashed for failures
- **Commit-reveal anti-MEV** — Prevents front-running of keeper executions (Phase 2+)
- **Full lifecycle management** — Schedule, monitor, cancel, and track task history
- **Template library** — Auto-Compound, DCA, Stop-Loss, Claim Rewards, NFT Mint, Custom

## Security Model

| Mechanism | Description |
|-----------|-------------|
| **Keeper Bond** | 1 EGLD deposit required, slashed (10%) on failures |
| **Cooldown Period** | Configurable delay before bond withdrawal (prevents hit-and-run) |
| **CEI Pattern** | All contracts follow Checks-Effects-Interactions |
| **Reentrancy Safe** | Rewards cleared before transfer in `claimRewards` |
| **Access Controls** | `only_owner`, `require_authorized_caller`, `require_scheduler_caller` |

## Devnet Deployment

| Contract | Address |
|----------|---------|
| **Scheduler** | `erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh` |
| **KeeperRegistry** | `erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula` |
| **Rewards** | `erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt` |

## Documentation

- [Whitepaper](xcron/whitepaper.md) — Full technical specification
- [Architecture](xcron/01_architecture.md) — System design & data flow
- [Smart Contracts](xcron/02_smart_contracts.md) — Contract APIs & storage layout
- [Keeper Specification](xcron/03_keeper_specification.md) — Keeper node implementation
- [Tokenomics](xcron/04_tokenomics.md) — Revenue model & financial projections
- [Roadmap](xcron/05_roadmap.md) — Development phases & milestones
- [Risk Analysis](xcron/06_risk_analysis.md) — Threat model & mitigations

## License

MIT
