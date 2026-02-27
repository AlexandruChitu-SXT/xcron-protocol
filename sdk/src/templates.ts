/**
 * XCron Protocol — Pre-built Templates
 *
 * Ready-to-use task configurations for common DeFi automations.
 * Each template returns a ScheduleTaskParams object that can be
 * passed directly to XCronClient.scheduleTask() or scheduleRecurring().
 *
 * These templates are designed to work with AI agents — an agent can
 * say "auto-compound my xExchange LP every week" and the template
 * generates the exact transaction parameters.
 */

import type { ScheduleTaskParams } from "./types";

// ─── Template Helpers ────────────────────────────────────────────────

const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;

/**
 * Auto-compound xExchange LP rewards.
 *
 * Calls `claimAndReinvest` on the xExchange farm contract at regular intervals.
 *
 * @example
 * ```typescript
 * const params = autoCompoundXExchange({
 *     farmContract: "erd1qqq...xexchange-farm...",
 *     intervalHours: 168, // weekly
 *     weeks: 52,          // for 1 year
 *     depositEgld: "2600000000000000000", // 2.6 EGLD total budget
 * });
 * const tx = xcron.scheduleRecurring(params);
 * ```
 */
export function autoCompoundXExchange(config: {
    farmContract: string;
    intervalHours?: number;
    weeks?: number;
    depositEgld: string;
}): {
    targetContract: string;
    targetEndpoint: string;
    intervalSeconds: number;
    executions: number;
    depositEgld: string;
} {
    return {
        targetContract: config.farmContract,
        targetEndpoint: "claimAndReinvest",
        intervalSeconds: (config.intervalHours || 168) * HOUR,
        executions: config.weeks || 52,
        depositEgld: config.depositEgld,
    };
}

/**
 * Auto-claim staking rewards (Hatom, liquid staking, etc).
 *
 * @example
 * ```typescript
 * const params = claimRewardsDaily({
 *     stakingContract: "erd1qqq...hatom...",
 *     days: 365,
 *     depositEgld: "1800000000000000000", // 1.8 EGLD for 1 year
 * });
 * ```
 */
export function claimRewardsDaily(config: {
    stakingContract: string;
    endpoint?: string;
    days?: number;
    depositEgld: string;
}): {
    targetContract: string;
    targetEndpoint: string;
    intervalSeconds: number;
    executions: number;
    depositEgld: string;
} {
    return {
        targetContract: config.stakingContract,
        targetEndpoint: config.endpoint || "claimRewards",
        intervalSeconds: DAY,
        executions: config.days || 365,
        depositEgld: config.depositEgld,
    };
}

/**
 * Dollar-Cost Average (DCA) — buy EGLD at regular intervals.
 *
 * Calls a swap function on a DEX at fixed intervals.
 *
 * @example
 * ```typescript
 * const params = dcaBuy({
 *     dexPairContract: "erd1qqq...ashswap-pair...",
 *     intervalHours: 24,
 *     executions: 30, // 30 days of DCA
 *     depositEgld: "1500000000000000000",
 * });
 * ```
 */
export function dcaBuy(config: {
    dexPairContract: string;
    swapEndpoint?: string;
    intervalHours?: number;
    executions?: number;
    depositEgld: string;
}): {
    targetContract: string;
    targetEndpoint: string;
    intervalSeconds: number;
    executions: number;
    depositEgld: string;
} {
    return {
        targetContract: config.dexPairContract,
        targetEndpoint: config.swapEndpoint || "swapTokensFixedInput",
        intervalSeconds: (config.intervalHours || 24) * HOUR,
        executions: config.executions || 30,
        depositEgld: config.depositEgld,
    };
}

/**
 * One-time delayed execution — execute a contract call at a specific time.
 *
 * @example
 * ```typescript
 * const params = executeAt({
 *     targetContract: "erd1qqq...",
 *     targetEndpoint: "finalizeSale",
 *     executeAtTimestamp: 1709251200, // March 1, 2025
 *     depositEgld: "50000000000000000",
 * });
 * ```
 */
export function executeAt(config: {
    targetContract: string;
    targetEndpoint: string;
    targetArgs?: string[];
    executeAtTimestamp: number;
    depositEgld: string;
}): ScheduleTaskParams {
    return {
        targetContract: config.targetContract,
        targetEndpoint: config.targetEndpoint,
        targetArgs: config.targetArgs,
        trigger: { type: "TimeOnce", targetTime: config.executeAtTimestamp },
        depositEgld: config.depositEgld,
    };
}

/**
 * Watchdog — execute when an on-chain value crosses a threshold.
 *
 * @example
 * ```typescript
 * const params = watchdog({
 *     oracleContract: "erd1qqq...xexchange-pair...",
 *     queryEndpoint: "getEquivalent",
 *     threshold: "50000000000000000000", // 50 EGLD
 *     comparator: "Gt",
 *     actionContract: "erd1qqq...",
 *     actionEndpoint: "rebalance",
 *     depositEgld: "100000000000000000",
 * });
 * ```
 */
export function watchdog(config: {
    oracleContract: string;
    queryEndpoint: string;
    queryArgs?: string[];
    threshold: string;
    comparator: "Gt" | "Lt" | "Eq" | "Gte" | "Lte";
    actionContract: string;
    actionEndpoint: string;
    actionArgs?: string[];
    depositEgld: string;
}): ScheduleTaskParams {
    return {
        targetContract: config.actionContract,
        targetEndpoint: config.actionEndpoint,
        targetArgs: config.actionArgs,
        trigger: {
            type: "ConditionOnChain",
            oracleContract: config.oracleContract,
            queryEndpoint: config.queryEndpoint,
            queryArgs: config.queryArgs || [],
            comparator: config.comparator,
            threshold: config.threshold,
        },
        depositEgld: config.depositEgld,
    };
}
