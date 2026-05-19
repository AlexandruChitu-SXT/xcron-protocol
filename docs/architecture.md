# Architecture

## How XCron Works

XCron is a three-contract system that automates smart contract calls on MultiversX.

```
┌─────────────┐   schedule   ┌─────────────┐ async call  ┌──────────────┐
│  User /  │ ──────────────►  │ Scheduler  │ ───────────► │  Target   │
│  dApp   │  deposit EGLD  │ Contract  │ ◄─callback─ │  Contract  │
└─────────────┘          └──────┬───────┘       └──────────────┘
                     │
               ┌──────────┴──────────┐
               │           │
           ┌────────▼────────┐ ┌─────────▼────────┐
           │ Keeper Registry │ │ Rewards Engine  │
           │ (stake/slash)  │ │ (fee collection) │
           └─────────────────┘ └──────────────────┘
```

## Execution Flow

1. **User schedules a task** — Deposits EGLD and specifies target contract, endpoint, trigger.
2. **Keeper detects the task** — Off-chain bots monitor the Scheduler for ripe tasks.
3. **Round-robin assignment** — Each task is assigned to a keeper. The assigned keeper has a 30-second exclusive window.
4. **Keeper calls `executeTask`** — Triggers an async call to the target contract.
5. **Callback verifies result** — `execution_callback` handles the outcome:
  - **Success** → Keeper gets 70% reward, protocol gets 30% fee, remaining deposit refunded.
  - **Failure** → Entire deposit refunded to user. Keeper gets nothing.
6. **Recurring tasks** — Automatically rescheduled with remaining deposit if executions remain.

## Contracts

### Scheduler

The main contract. Handles:
- Task creation and storage
- Async execution with callback verification
- Round-robin keeper assignment with grace period
- Task cancellation and refunds
- Task expiration cleanup
- Stuck task recovery (tasks in Executing > 24h)
- Recurring task rescheduling
- On-chain oracle queries for ConditionOnChain triggers

### Keeper Registry

Manages keeper participation:
- Registration with EGLD bond
- Unstaking with cooldown period (12h)
- Early exit penalty (5% if unstake before 30 days)
- Progressive slashing: Strike 1 = 5%, Strike 2 = 15%, Strike 3 = 20% + auto-expulsion
- Reputation tracking (success/fail counts, consecutive failures)

### Rewards Engine

Collects and distributes protocol fees:
- Receives 30% of each execution fee
- Tracks earnings per keeper
- Handles treasury withdrawals

## Trigger Types

| Trigger | Description | Verification |
|---------|-------------|-------------|
| `TimeOnce` | Execute at a specific timestamp | Timestamp check on-chain |
| `TimeRecurring` | Execute at fixed intervals | Timestamp check + auto-reschedule |
| `ConditionOnChain` | Execute when a price/value condition is met | On-chain query to oracle (e.g. xExchange `getAmountOut`) |

## Security

| Mechanism | Protection |
|-----------|-----------|
| **Async callbacks** | Keepers can't profit from failed executions |
| **On-chain oracle** | Price conditions verified trustlessly, no manipulation |
| **Reentrancy guard** | Tasks cannot trigger recursive execution |
| **Round-robin** | Prevents keeper competition / gas wars |
| **Progressive slashing** | Escalating penalties deter repeated failures |
| **Call injection block** | Cannot target scheduler, registry, or rewards contracts |
| **Cooldown** | 12-hour unstaking period prevents quick exits |
| **TTL expiration** | Tasks auto-expire with full refund if not executed |
| **Circuit breaker** | Owner can pause/unpause all contracts |

## Commit-Reveal Anti-MEV Protocol

For high-value tasks, XCron uses a commit-reveal scheme to prevent frontrunning:

1. **Commit**: Keeper submits `hash(task_id, salt)` + bond
2. **Reveal**: Keeper reveals `salt` within the reveal window
3. **Execute**: If hash matches, task executes normally and bond is returned
4. **Slash**: If keeper doesn't reveal in time, bond is slashed

This prevents MEV bots from frontrunning profitable task executions.

## Hybrid Oracle (AI Evaluator)

Tasks can include metadata with price conditions:

```json
{"price": {"token": "EGLD", "condition": "above", "threshold": 50}}
```

The keeper bot's AI evaluator checks real-time prices from CoinGecko before executing. This enables hybrid triggers — time-based on-chain scheduling with off-chain condition evaluation.

## Deployed Contracts

### Testnet

| Contract | Address |
|:--|:--|
| Scheduler | `erd1qqqqqqqqqqqqqpgqkchuk2w2nsmsrdqkd4s2t7z4m7wq6st27k8sqwqdju` |
| KeeperRegistry | `erd1qqqqqqqqqqqqqpgqhxvdt2c5y0c4g4aj8fsaar4f9v2ejque7k8ss6c2xs` |
| Rewards | `erd1qqqqqqqqqqqqqpgq7ql3hm76nyun0mmfq0kw2gacspjm63q97k8s6w5xzs` |
| Ping (test) | `erd1qqqqqqqqqqqqqpgqw7rlhmu4jfxc8jy2p8hkkfghy6x0kvzc7k8sg0dwqk` |

### MX-8004 Trustless Agents (Testnet)

| Contract | Address |
|:--|:--|
| Identity Registry | `erd1qqqqqqqqqqqqqpgqstany2wfelfgd2wfn5nst5ulqdfy6fvs7k8sejh8ph` |
| Validation Registry | `erd1qqqqqqqqqqqqqpgqdeyw8mmzkza4tlndeztty0f6hgng5z4s7k8suagqha` |
| Reputation Registry | `erd1qqqqqqqqqqqqqpgq6czchparnywm9q40cdxksm85jc37vk4a7k8sefu0ar` |
| Agent NFT Token | `XCRAGENT` (XCronAgent — soulbound identity) |


