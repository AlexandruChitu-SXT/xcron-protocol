/**
 * XCron Protocol — ElizaOS Plugin
 *
 * Allows AI agents (ChatGPT, Gemini, Claude via ElizaOS) to interact with
 * XCron Protocol through natural language in chat.
 *
 * An agent using this plugin can:
 * - Schedule tasks on MultiversX (auto-compound, claim rewards, DCA)
 * - Cancel pending tasks
 * - Query protocol stats and task status
 * - Get gas estimates for cross-shard vs intra-shard execution
 *
 * Architecture (ElizaOS):
 * - Actions: what the agent CAN DO (scheduleTask, cancelTask, queryStats)
 * - Providers: inject context (current protocol state, gas prices)
 * - Services: background state management
 */

import { XCronClient } from "./client";
import type { Network, ScheduleTaskParams, Trigger } from "./types";

// ─── ElizaOS Plugin Interface ────────────────────────────────────────

export interface ElizaAction {
    name: string;
    description: string;
    parameters: Record<string, { type: string; description: string; required?: boolean }>;
    handler: (params: Record<string, any>, context: ElizaContext) => Promise<ElizaResponse>;
}

export interface ElizaProvider {
    name: string;
    description: string;
    handler: (context: ElizaContext) => Promise<Record<string, any>>;
}

export interface ElizaContext {
    network: Network;
    userAddress?: string;
    walletPem?: string;
}

export interface ElizaResponse {
    success: boolean;
    message: string;
    data?: any;
}

export interface ElizaPlugin {
    name: string;
    description: string;
    actions: ElizaAction[];
    providers: ElizaProvider[];
}

// ─── Actions ─────────────────────────────────────────────────────────

const scheduleTaskAction: ElizaAction = {
    name: "schedule_task",
    description: "Schedule an automated task on MultiversX via XCron. Can schedule one-time or recurring tasks like auto-compound, claim rewards, or DCA buys.",
    parameters: {
        targetContract: { type: "string", description: "The bech32 address (erd1qqq...) of the contract to call", required: true },
        targetEndpoint: { type: "string", description: "The function name to call on the contract (e.g. 'claimRewards', 'compound')", required: true },
        depositEgld: { type: "string", description: "Amount of EGLD to deposit for gas (in atomic units, e.g. '50000000000000000' = 0.05 EGLD)", required: true },
        triggerType: { type: "string", description: "'once' for one-time or 'recurring' for repeated execution", required: true },
        triggerTime: { type: "number", description: "Unix timestamp for when to execute (one-time) or start time (recurring)" },
        intervalSeconds: { type: "number", description: "Interval in seconds between executions (recurring only)" },
        executions: { type: "number", description: "Number of times to execute (recurring only, default: 1)" },
    },
    handler: async (params, context) => {
        const xcron = new XCronClient(context.network);

        if (params.triggerType === "recurring" && params.intervalSeconds) {
            const tx = xcron.scheduleRecurring({
                targetContract: params.targetContract,
                targetEndpoint: params.targetEndpoint,
                intervalSeconds: params.intervalSeconds,
                executions: params.executions || 10,
                depositEgld: params.depositEgld,
            });
            return {
                success: true,
                message: `Recurring task prepared: call ${params.targetEndpoint} on ${params.targetContract.slice(0, 15)}... every ${params.intervalSeconds}s for ${params.executions || 10} executions. Transaction ready for signing.`,
                data: { transaction: tx.toPlainObject(), type: "recurring" },
            };
        }

        const trigger: Trigger = {
            type: "TimeOnce",
            targetTime: params.triggerTime || Math.floor(Date.now() / 1000) + 60,
        };

        const tx = xcron.scheduleTask({
            targetContract: params.targetContract,
            targetEndpoint: params.targetEndpoint,
            trigger,
            depositEgld: params.depositEgld,
        });

        return {
            success: true,
            message: `One-time task prepared: call ${params.targetEndpoint} at timestamp ${trigger.targetTime}. Transaction ready for signing.`,
            data: { transaction: tx.toPlainObject(), type: "once" },
        };
    },
};

const scheduleQuantumTaskAction: ElizaAction = {
    name: "schedule_quantum_task",
    description: "Schedule a Sovereign Quantum Task. This is a HIGH-SECURITY task executed inside a Sovereign Enclave (XSE) with Post-Quantum protection. Ideal for confidential transactions or high-value automation.",
    parameters: {
        targetContract: { type: "string", description: "The bech32 address (erd1qqq...) of the contract to call", required: true },
        targetEndpoint: { type: "string", description: "The function name to call on the contract", required: true },
        depositEgld: { type: "string", description: "Amount of EGLD to deposit for gas (e.g. '100000000000000000' = 0.1 EGLD)", required: true },
        quantumSecret: { type: "string", description: "Optional 32-byte hex secret for the Quantum Hash Seal. If not provided, a secure one will be generated." },
    },
    handler: async (params, context) => {
        const xcron = new XCronClient(context.network);
        const tx = xcron.scheduleQuantumTask({
            targetContract: params.targetContract,
            targetEndpoint: params.targetEndpoint,
            depositEgld: params.depositEgld,
            quantumSecret: params.quantumSecret,
            trigger: { type: "TimeOnce", targetTime: Math.floor(Date.now() / 1000) + 30 }, // Immediate quantum execution
        });

        return {
            success: true,
            message: `Sovereign Quantum Task prepared. This execution will be protected by the XSE Enclave and Post-Quantum signatures. Transaction ready for signing.`,
            data: { transaction: tx.toPlainObject(), type: "quantum" },
        };
    },
};

const cancelTaskAction: ElizaAction = {
    name: "cancel_task",
    description: "Cancel a pending XCron task and get the deposit refunded.",
    parameters: {
        taskId: { type: "number", description: "The ID of the task to cancel", required: true },
    },
    handler: async (params, context) => {
        const xcron = new XCronClient(context.network);
        const tx = xcron.cancelTask(params.taskId);
        return {
            success: true,
            message: `Cancel transaction prepared for task #${params.taskId}. Deposit will be refunded after execution.`,
            data: { transaction: tx.toPlainObject() },
        };
    },
};

const queryStatsAction: ElizaAction = {
    name: "query_protocol_stats",
    description: "Get XCron protocol statistics: total tasks, success/failure rates, fees, and whether the protocol is paused.",
    parameters: {},
    handler: async (_params, context) => {
        const xcron = new XCronClient(context.network);
        const [stats, isPaused, feeBps, minDeposit, totalTasks] = await Promise.all([
            xcron.getProtocolStats(),
            xcron.isPaused(),
            xcron.getProtocolFeeBps(),
            xcron.getMinDeposit(),
            xcron.getTaskNonce(),
        ]);
        return {
            success: true,
            message: `XCron Protocol (${context.network}):\n` +
                `• Total tasks created: ${totalTasks}\n` +
                `• Successful: ${stats.totalSuccessful} | Failed: ${stats.totalFailed}\n` +
                `• Protocol fee: ${feeBps / 100}%\n` +
                `• Min deposit: ${minDeposit} atomic EGLD\n` +
                `• Status: ${isPaused ? "⏸️ PAUSED" : "✅ Active"}`,
            data: { stats, isPaused, feeBps, minDeposit, totalTasks },
        };
    },
};

const getCrossShardStatsAction: ElizaAction = {
    name: "cross_shard_stats",
    description: "Get cross-shard vs intra-shard execution statistics. Shows how many executions happened within the same shard (0% gas overhead) vs across shards (30% overhead).",
    parameters: {},
    handler: async (_params, context) => {
        const xcron = new XCronClient(context.network);
        const results = await xcron.vmQuery("getCrossShardStats");
        const crossShard = results[0] ? parseInt(results[0], 16) : 0;
        const intraShard = results[1] ? parseInt(results[1], 16) : 0;
        const total = crossShard + intraShard;
        const pct = total > 0 ? Math.round((intraShard / total) * 100) : 0;
        return {
            success: true,
            message: `Cross-Shard Stats:\n` +
                `• Intra-shard (0% overhead): ${intraShard}\n` +
                `• Cross-shard (30% overhead): ${crossShard}\n` +
                `• Gas savings rate: ${pct}% of executions are intra-shard`,
            data: { crossShard, intraShard, savingsRate: pct },
        };
    },
};

// ─── Providers ───────────────────────────────────────────────────────

const protocolStateProvider: ElizaProvider = {
    name: "xcron_protocol_state",
    description: "Provides current XCron protocol state for agent context.",
    handler: async (context) => {
        const xcron = new XCronClient(context.network);
        const [totalTasks, isPaused] = await Promise.all([
            xcron.getTaskNonce(),
            xcron.isPaused(),
        ]);
        return {
            protocol: "XCron",
            network: context.network,
            totalTasks,
            isPaused,
            schedulerAddress: xcron.getSchedulerAddress(),
        };
    },
};

// ─── Plugin Export ───────────────────────────────────────────────────

export const xcronPlugin: ElizaPlugin = {
    name: "xcron-sdk",
    description: "XCron Protocol — Decentralized task automation on MultiversX. Schedule, cancel, and monitor automated smart contract calls via chat.",
    actions: [
        scheduleTaskAction,
        scheduleQuantumTaskAction,
        cancelTaskAction,
        queryStatsAction,
        getCrossShardStatsAction,
    ],
    providers: [
        protocolStateProvider,
    ],
};

export default xcronPlugin;
