# @xcron-protocol/sdk

TypeScript SDK for integrating with **XCron Protocol** — Decentralized Task Automation on MultiversX.

## Install

```bash
npm install @xcron-protocol/sdk @multiversx/sdk-core
```

## Quick Start

```typescript
import { XCronClient } from "@xcron-protocol/sdk";

const xcron = new XCronClient("testnet");

// Schedule a one-time task (execute in 1 hour)
const tx = xcron.scheduleTask({
    targetContract: "erd1qqq...",
    targetEndpoint: "claimRewards",
    trigger: {
        type: "TimeOnce",
        targetTime: Math.floor(Date.now() / 1000) + 3600,
    },
    depositEgld: "50000000000000000", // 0.05 EGLD
});

// Sign and send with your wallet provider
```

## Schedule Recurring Tasks

```typescript
// Auto-compound weekly for 1 year
const tx = xcron.scheduleRecurring({
    targetContract: "erd1qqq...hatom...",
    targetEndpoint: "claimAndReinvest",
    intervalSeconds: 604800, // 1 week
    executions: 52,
    depositEgld: "2600000000000000000", // 0.05 EGLD × 52
});
```

## Cancel a Task

```typescript
const tx = xcron.cancelTask(42); // Get full refund
```

## Networks

```typescript
const xcron = new XCronClient("mainnet");  // Production
const xcron = new XCronClient("testnet");  // Testing
const xcron = new XCronClient("devnet");   // Development
```

## Custom Addresses

```typescript
const xcron = new XCronClient("mainnet", {
    scheduler: "erd1qqq...",
    keeperRegistry: "erd1qqq...",
    rewards: "erd1qqq...",
});
```

## License

MIT
