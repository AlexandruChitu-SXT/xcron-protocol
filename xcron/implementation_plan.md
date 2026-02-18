# Keeper Bot Backend — Fix & Run

Get the existing TypeScript keeper bot working end-to-end on devnet.

## Proposed Changes

### Pre-requisite: Whitelist Keeper

The scheduler contract requires keepers to be whitelisted via `addWhitelistedKeeper` (owner-only). We need to call this from the deployer wallet first.

#### Transaction to send
```
Receiver: erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh
Data: addWhitelistedKeeper@{deployer_hex}
```

---

### Task Monitor — Parse Task Data

#### [MODIFY] [monitor.ts](file:///Users/alejandrochitu/.gemini/antigravity/scratch/xcron-protocol/keeper/src/monitor.ts)

The `fetchTask()` method currently creates a placeholder task with all zeros. It needs to actually parse the binary data from `getTask()`, matching the Task struct layout we reverse-engineered:

```
id(u64) → owner(32b) → target(32b) → endpoint(nested) → args(nested)
→ trigger(enum) → max_gas(u64) → deposit(BigUint nested)
→ max_retries(u8) → retry_count(u8) → ttl_rounds(u64)
→ created_round(u64) → status(u8) → assigned_keeper(Option<32b>)
```

---

### Network Client — Fix Round Query

#### [MODIFY] [network.ts](file:///Users/alejandrochitu/.gemini/antigravity/scratch/xcron-protocol/keeper/src/network.ts)

`getCurrentRound()` uses `status.CurrentRound` which may not exist in the SDK's NetworkStatus type. Need to verify and fix the property name.

---

### Install Deps & Run

#### Install and compile
```bash
cd keeper && npm install && npx ts-node src/index.ts
```

## Verification Plan

### Automated Tests
1. Run the keeper bot against devnet
2. Verify it discovers the 3 existing tasks
3. Verify it identifies Task #3 as ripe (pending + round passed)
4. Verify it sends `executeTask` transaction and waits for result
