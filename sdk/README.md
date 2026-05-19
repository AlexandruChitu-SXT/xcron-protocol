# xcron-sdk

SDK for integrating with **XCron Protocol** — Decentralized Task Automation on MultiversX.

[![npm version](https://img.shields.io/npm/v/xcron-sdk.svg)](https://www.npmjs.com/package/xcron-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install xcron-sdk
```

**Peer dependency:** requires `@multiversx/sdk-core >= 13.0.0`

```bash
npm install @multiversx/sdk-core
```

## Quick Start

```typescript
import { XCronClient } from "xcron-sdk";

// Initialize (auto-loads contract addresses for the network)
const xcron = new XCronClient("testnet");

// Schedule a one-time task in 1 hour
const tx = xcron.scheduleTask({
    targetContract: "erd1qqq...your_contract...",
    targetEndpoint: "claimRewards",
    trigger: {
        type: "TimeOnce",
        targetTime: Math.floor(Date.now() / 1000) + 3600,
    },
    depositEgld: "50000000000000000", // 0.05 EGLD
});

// Sign `tx` with your wallet and send it
```

## API Reference

### Constructor

```typescript
const xcron = new XCronClient(network: "devnet" | "testnet" | "mainnet");
```

Optionally pass custom contract addresses:
```typescript
const xcron = new XCronClient("devnet", {
    scheduler: "erd1qqq...",
    keeperRegistry: "erd1qqq...",
    rewards: "erd1qqq...",
});
```

---

### Transaction Builders

These methods return unsigned `Transaction` objects. Sign them with your wallet (xPortal, Web Wallet, Ledger, or PEM).

#### `scheduleTask(params): Transaction`

Schedule a one-time, recurring, or condition-based task.

```typescript
const tx = xcron.scheduleTask({
    targetContract: "erd1qqq...",      // Contract to call
    targetEndpoint: "claimRewards",     // Function to execute
    targetArgs: ["0a"],                 // Optional hex-encoded arguments
    trigger: {
        type: "TimeOnce",
        targetTime: 1700000000,         // Unix timestamp
    },
    maxGas: 5_000_000,                  // Optional (default: 5M)
    maxRetries: 3,                      // Optional (default: 3)
    ttlSeconds: 86400,                  // Optional (default: 24h)
    depositEgld: "50000000000000000",   // EGLD to deposit (0.05 EGLD)
});
```

#### `scheduleRecurring(params): Transaction`

Shorthand for recurring tasks:

```typescript
// Auto-compound weekly for 1 year
const tx = xcron.scheduleRecurring({
    targetContract: "erd1qqq...hatom...",
    targetEndpoint: "claimAndReinvest",
    intervalSeconds: 604800,    // 1 week
    executions: 52,             // 52 weeks
    depositEgld: "2600000000000000000", // 2.6 EGLD total
});
```

#### `cancelTask(taskId): Transaction`

Cancel a pending task and get your deposit refunded.

```typescript
const tx = xcron.cancelTask(42);
```

---

### Query Methods

These are `async` methods that read data directly from the MultiversX blockchain. No wallet needed.

#### `getTaskNonce(): Promise<number>`

Get the total number of tasks ever created.

```typescript
const total = await xcron.getTaskNonce();
// → 156
```

#### `getProtocolStats(): Promise<ProtocolStats>`

Get global protocol statistics.

```typescript
const stats = await xcron.getProtocolStats();
// → { totalTasks: 156, totalSuccessful: 142, totalFailed: 3 }
```

#### `isPaused(): Promise<boolean>`

Check if the protocol is paused (circuit breaker).

```typescript
const paused = await xcron.isPaused();
// → false
```

#### `getMinDeposit(): Promise<string>`

Get minimum EGLD deposit required (in atomic units).

```typescript
const min = await xcron.getMinDeposit();
// → "50000000000000000" (0.05 EGLD)
```

#### `getProtocolFeeBps(): Promise<number>`

Get the protocol fee in basis points.

```typescript
const fee = await xcron.getProtocolFeeBps();
// → 500 (= 5%)
```

#### `isWhitelistedKeeper(address): Promise<boolean>`

Check if an address is an authorized keeper.

```typescript
const ok = await xcron.isWhitelistedKeeper("erd1...");
// → true
```

#### `isBlacklisted(target): Promise<boolean>`

Check if a target contract is blacklisted.

```typescript
const blocked = await xcron.isBlacklisted("erd1qqq...");
// → false
```

---

### Utility Methods

#### `getAddresses(): XCronAddresses`

Get the contract addresses for the configured network.

#### `getSchedulerAddress(): string`

Get the scheduler contract address.

#### `getApiUrl(): string`

Get the MultiversX API URL for the configured network.

---

## Trigger Types

| Type | Description | Fields |
|------|-------------|--------|
| `TimeOnce` | Execute once at a specific time | `targetTime` |
| `TimeRecurring` | Execute repeatedly at intervals | `startTime`, `interval`, `remainingExecs` |
| `ConditionOnChain` | Execute when an oracle condition is met | `oracleContract`, `queryEndpoint`, `comparator`, `threshold` |

---

## Supported Networks

| Network | Contracts | Status |
|---------|-----------|--------|
| Devnet | Deployed | Active |
| Testnet | Deployed | Active |
| Mainnet | Pending | Post-audit |

---

## Links

- [xcron.io](https://xcron.io)
- [npm](https://www.npmjs.com/package/xcron-sdk)
- [GitHub](https://github.com/AlexandruChitu-SXT/xcron-protocol)
- [Whitepaper](https://github.com/AlexandruChitu-SXT/xcron-protocol/blob/main/docs/whitepaper.md)

## License

MIT
