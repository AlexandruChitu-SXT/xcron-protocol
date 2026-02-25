/**
 * XCron Protocol SDK — Types
 *
 * TypeScript types matching the on-chain data structures.
 */

/** Trigger for one-time execution at a specific timestamp */
export interface TimeOnceTrigger {
    type: "TimeOnce";
    targetTime: number;
}

/** Trigger for recurring execution at fixed intervals */
export interface TimeRecurringTrigger {
    type: "TimeRecurring";
    startTime: number;
    interval: number;
    remainingExecs: number;
}

/** Trigger based on an on-chain condition */
export interface ConditionTrigger {
    type: "ConditionOnChain";
    oracleContract: string;
    queryEndpoint: string;
    queryArgs: string[];
    comparator: "Gt" | "Lt" | "Eq" | "Gte" | "Lte";
    threshold: string;
}

export type Trigger = TimeOnceTrigger | TimeRecurringTrigger | ConditionTrigger;

export type TaskStatus =
    | "Pending"
    | "Committed"
    | "Executing"
    | "Completed"
    | "Failed"
    | "Cancelled"
    | "Expired";

export interface Task {
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

export interface KeeperInfo {
    addr: string;
    stake: string;
    registeredAt: number;
    totalExecutions: number;
    successfulExecs: number;
    failedExecs: number;
    slashedAmount: string;
    active: boolean;
    consecutiveFailures: number;
}

export interface ScheduleTaskParams {
    targetContract: string;
    targetEndpoint: string;
    targetArgs?: string[];
    trigger: Trigger;
    maxGas?: number;
    maxRetries?: number;
    ttlSeconds?: number;
    depositEgld: string;
}

export interface XCronAddresses {
    scheduler: string;
    keeperRegistry: string;
    rewards: string;
}

export interface ProtocolStats {
    totalTasks: number;
    totalSuccessful: number;
    totalFailed: number;
}

export type Network = "mainnet" | "testnet" | "devnet";
