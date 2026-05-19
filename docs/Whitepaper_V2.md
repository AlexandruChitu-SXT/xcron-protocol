# XCron Protocol V2: The Agentic Coordination Layer
**Whitepaper v2.0** (Draft - April 2026)

## 1. Abstract
The MultiversX blockchain provides sub-second finality (Supernova) and high transaction throughput. However, smart contracts lack the native ability to initiate actions autonomously based on time or external conditions. As decentralized systems shift toward agentic setups—where autonomous agents interact with smart contracts—a trustless execution service is required.

XCron Protocol V2 is a decentralized execution layer that allows users and external applications to schedule on-chain operations (such as token swaps, reward harvesting, portfolio rebalancing, and recurring payments). By utilizing a decentralized network of incentivized executors (Keepers), XCron ensures transactions are executed when pre-defined criteria are met.

---

## 2. Problem Statement
Smart contract execution is reactive: execution must be initiated by an external account (EOA). For automated workflows (such as periodic compounding, price-dependent actions, or agent-triggered tasks), developers are forced to rely on centralized infrastructure (e.g., cron jobs running on private servers). This introduces single points of failure, custodial risks if private keys are stored on server instances, and exposure to front-running (MEV) if tasks are propagated insecurely.

A decentralized, trustless infrastructure is required to separate execution logic from execution triggers, ensuring that task instructions are immutable and incentives are aligned to guarantee timely execution.

---

## 3. Architecture and Components

The protocol is composed of three core smart contracts and an off-chain executor network.

### A. Smart Contracts
1. **Scheduler**: Serves as the entry point of the protocol. It escrows the execution deposits and stores the immutable task parameters (target contract, target endpoint, arguments, trigger conditions, gas limits, and expiration properties).
2. **KeeperRegistry**: Manages executor node registrations, tracks staking requirements, maintains reputation metrics, and executes slashing operations.
3. **Rewards Engine**: Handles execution fee distributions and manages protocol reserves.

### B. Trigger Mechanisms
* **TimeOnce**: Triggers execution at a specific Unix timestamp.
* **TimeRecurring**: Triggers execution repeatedly based on a defined time interval.
* **ConditionOnChain**: Triggers execution based on a query validation. The task remains locked until an on-chain view query matches target criteria (e.g., verifying a price ratio against an oracle).

### C. Off-Chain Integration (Model Context Protocol)
XCron V2 includes the `xcron-mcp-server`, which exposes blockchain scheduling endpoints to external agent frameworks. Through delegated execution contracts (Clone-Keys), external systems can authorize execution limits and deposit tasks without maintaining direct access to primary wallet keys.

---

## 4. Security Framework

The smart contracts follow the Checks-Effects-Interactions (CEI) pattern and implement specific security defenses:

* **State Clearing**: Executed, expired, or cancelled tasks are cleared from contract storage to minimize storage growth and limit state footprint on the blockchain database.
* **Creation Fee Requirement**: Task creation requires locking a transaction fee deposit, raising the cost of denial-of-service (DoS) attempts through spam tasks.
* **Atomic Callbacks**: Execution is conducted synchronously. If the target contract call fails or fails to meet slippage limits, the transaction reverts atomically, protecting keeper resources.
* **Executor Selection**: Keeper assignment uses block-header entropy to designate exclusive execution slots, reducing competitive gas bidding wars.

---

## 5. Protocol Economics

XCron operates as a self-sustaining coordination protocol:

1. **Protocol Fee**: A percentage (typically 30%) of the execution fee is retained by the protocol treasury, while the remaining portion (70%) is paid to the executing keeper.
2. **Gas Royalties**: Smart contract gas royalties supported by the MultiversX protocol are directed to the treasury.

### Keeper Slashing Rules
Keepers who register for tasks but fail to execute within their designated windows face progressive slashing penalties:
* **First Failure**: 5% of the staked bond is slashed.
* **Second Failure**: 15% of the staked bond is slashed.
* **Third Failure**: 20% of the staked bond is slashed, followed by automatic removal from the registry.

Slashed funds are permanently transferred to the protocol treasury.

---

## 6. Development Roadmap (Q2 2026)

* **Testnet Alignment**: Deploying V2 contracts to Testnet to validate state-clearing mechanics under simulated transaction volume.
* **Agent Integration**: Connecting the `xcron-mcp-server` to the MultiversX Agent Arena interface.
* **Mainnet Immutable Deployment**: Launching final verified smart contracts on Mainnet with upgrade permissions disabled.
