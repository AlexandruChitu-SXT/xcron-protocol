# Architecture

## How XCron Works

XCron is a three-contract system that automates smart contract calls on MultiversX.

```
┌─────────────┐     schedule      ┌─────────────┐     execute     ┌──────────────┐
│   User /    │ ──────────────►   │  Scheduler   │ ──────────────► │   Target     │
│   dApp      │   deposit EGLD    │  Contract    │   call endpoint │   Contract   │
└─────────────┘                   └──────┬───────┘                 └──────────────┘
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                     ┌────────▼────────┐  ┌─────────▼────────┐
                     │ Keeper Registry │  │  Rewards Engine   │
                     │ (stake/slash)   │  │  (fee collection) │
                     └─────────────────┘  └──────────────────┘
```

## Flow

1. **User schedules a task** — Deposits EGLD and specifies what contract/function to call and when.
2. **Keeper detects the task** — Off-chain bots monitor the Scheduler for ripe tasks.
3. **Keeper executes** — Calls `executeTask(taskId)` on the Scheduler.
4. **Scheduler processes** — Validates the task, pays the keeper 70%, sends 30% to protocol, calls the target contract.
5. **Recurring tasks** — Automatically rescheduled with the remaining deposit.

## Contracts

### Scheduler

The main contract. Handles:
- Task creation and storage
- Task execution and reward distribution
- Task cancellation and refunds
- Task expiration cleanup
- Recurring task rescheduling

### Keeper Registry

Manages keeper participation:
- Registration with EGLD bond
- Unstaking with cooldown period
- Slashing for missed executions
- Reputation tracking (success/fail counts)

### Rewards Engine

Collects and distributes protocol fees:
- Receives 30% of each execution fee
- Tracks earnings per keeper
- Handles treasury withdrawals

## Trigger Types

| Trigger | Description | Use Case |
|---------|-------------|----------|
| `TimeOnce` | Execute at a specific timestamp | Scheduled transfers, one-time claims |
| `TimeRecurring` | Execute at fixed intervals | Auto-compound, recurring payments |
| `ConditionOnChain` | Execute when a condition is met | Price triggers, threshold alerts (Phase 2) |

## Security

- **Reentrancy guard** — Tasks cannot trigger recursive execution
- **Keeper whitelist** — Only authorized keepers can execute (Phase 1)
- **Slashing** — Keepers lose 20% of bond per failure, 3 failures = 60% loss
- **Cooldown** — 12-hour unstaking period prevents quick exits
- **TTL expiration** — Tasks auto-expire with full refund if not executed
