# Getting Started

Integrate XCron Protocol into your dApp in under 5 minutes.

## 1. Install the SDK

```bash
npm install @xcron-protocol/sdk @multiversx/sdk-core
```

## 2. Initialize the Client

```typescript
import { XCronClient } from "@xcron-protocol/sdk";

const xcron = new XCronClient("testnet"); // or "mainnet"
```

## 3. Schedule a Task

### One-Time Execution

Execute a smart contract function at a specific time:

```typescript
const tx = xcron.scheduleTask({
    targetContract: "erd1qqq...",       // Contract to call
    targetEndpoint: "claimRewards",      // Function to execute
    trigger: {
        type: "TimeOnce",
        targetTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    },
    depositEgld: "50000000000000000",    // 0.05 EGLD (~$0.20)
});

// Sign and send with your wallet
await sendTransaction(tx);
```

### Recurring Execution

Auto-compound your DeFi yields every week:

```typescript
const tx = xcron.scheduleRecurring({
    targetContract: "erd1qqq...hatom...",
    targetEndpoint: "claimAndReinvest",
    intervalSeconds: 604800,    // Weekly
    executions: 52,             // For 1 year
    depositEgld: "2600000000000000000", // 0.05 × 52 = 2.6 EGLD
});
```

### With Arguments

Pass arguments to your target contract:

```typescript
const tx = xcron.scheduleTask({
    targetContract: "erd1qqq...",
    targetEndpoint: "swap",
    targetArgs: [
        "45474c44",           // Token ID in hex (EGLD)
        "01",                 // Amount (hex)
    ],
    trigger: {
        type: "TimeOnce",
        targetTime: 1700000000,
    },
    depositEgld: "50000000000000000",
});
```

## 4. Cancel a Task

Cancel a pending task and receive a full refund:

```typescript
const tx = xcron.cancelTask(42);
await sendTransaction(tx);
```

## Pricing

| Task Type | Cost | What Happens |
|-----------|------|-------------|
| Simple (one-time) | ~0.05 EGLD | One execution at the specified time |
| Recurring (N times) | ~0.05 × N EGLD | Repeated execution at fixed intervals |

The deposit covers the execution fee. Unused deposits are refunded on cancellation or expiration.

## Next Steps

- [SDK Reference](./sdk-reference.md) — Full API docs
- [Architecture](./architecture.md) — How XCron works under the hood
- [Contract ABIs](./contract-abis.md) — Direct contract interaction
