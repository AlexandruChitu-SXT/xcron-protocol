# SDK Reference

Full API reference for `@xcron-protocol/sdk`.

## `XCronClient`

### Constructor

```typescript
new XCronClient(network: "mainnet" | "testnet" | "devnet", customAddresses?: XCronAddresses)
```

### Methods

#### `scheduleTask(params: ScheduleTaskParams): Transaction`

Build a transaction to schedule a one-time or recurring task.

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetContract` | `string` | ✅ | Bech32 address of the contract to call |
| `targetEndpoint` | `string` | ✅ | Function name on the target contract |
| `targetArgs` | `string[]` | ❌ | Hex-encoded arguments |
| `trigger` | `Trigger` | ✅ | When to execute (see Trigger Types) |
| `maxGas` | `number` | ❌ | Gas limit for target call (default: 5M) |
| `maxRetries` | `number` | ❌ | Retry attempts on failure (default: 3) |
| `ttlSeconds` | `number` | ❌ | Time-to-live before expiration (default: 24h) |
| `depositEgld` | `string` | ✅ | EGLD deposit in denomination units |

---

#### `scheduleRecurring(params): Transaction`

Convenience method for recurring tasks.

**Additional Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intervalSeconds` | `number` | ✅ | Seconds between executions |
| `executions` | `number` | ✅ | Number of times to execute |

---

#### `cancelTask(taskId: number): Transaction`

Build a transaction to cancel a pending task. The full deposit is refunded.

---

#### `getAddresses(): XCronAddresses`

Returns the contract addresses for this client instance.

---

## Trigger Types

### `TimeOnceTrigger`

```typescript
{
    type: "TimeOnce",
    targetTime: number  // Unix timestamp
}
```

### `TimeRecurringTrigger`

```typescript
{
    type: "TimeRecurring",
    startTime: number,       // Unix timestamp of first execution
    interval: number,        // Seconds between executions
    remainingExecs: number,  // How many more times to execute
}
```

### `ConditionTrigger`

```typescript
{
    type: "ConditionOnChain",
    oracleContract: string,
    queryEndpoint: string,
    queryArgs: string[],
    comparator: "Gt" | "Lt" | "Eq" | "Gte" | "Lte",
    threshold: string,
}
```

## Types

### `Task`

```typescript
interface Task {
    id: number;
    owner: string;
    targetContract: string;
    targetEndpoint: string;
    targetArgs: string[];
    trigger: Trigger;
    maxGas: number;
    deposit: string;
    maxRetries: number;
    retryCount: number;
    ttlSeconds: number;
    createdAt: number;
    status: TaskStatus;
    assignedKeeper?: string;
}
```

### `TaskStatus`

`"Pending" | "Committed" | "Executing" | "Completed" | "Failed" | "Cancelled" | "Expired"`

### `KeeperInfo`

```typescript
interface KeeperInfo {
    addr: string;
    stake: string;
    registeredAt: number;
    totalExecutions: number;
    successfulExecs: number;
    failedExecs: number;
    slashedAmount: string;
    active: boolean;
    consecutiveFailures: number;  // Resets on success. 3 strikes = expulsion.
}
```
