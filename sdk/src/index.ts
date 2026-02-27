/**
 * xcron-protocol
 *
 * SDK for integrating with XCron Protocol — Decentralized Task Automation on MultiversX.
 * Works with AI agents (ElizaOS, ChatGPT, Gemini, Claude).
 *
 * @example
 * ```typescript
 * import { XCronClient, autoCompoundXExchange } from "xcron-protocol";
 *
 * const xcron = new XCronClient("testnet");
 *
 * // One-liner: auto-compound xExchange weekly for 1 year
 * const params = autoCompoundXExchange({
 *     farmContract: "erd1qqq...xexchange-farm...",
 *     depositEgld: "2600000000000000000",
 * });
 * const tx = xcron.scheduleRecurring(params);
 * ```
 *
 * @example ElizaOS AI Agent
 * ```typescript
 * import { xcronPlugin } from "xcron-protocol/eliza-plugin";
 * // Add to your ElizaOS agent character config
 * ```
 */

// Core client
export { XCronClient } from "./client";
export { getAddresses } from "./addresses";

// Templates — pre-built DeFi automations
export {
    autoCompoundXExchange,
    claimRewardsDaily,
    dcaBuy,
    executeAt,
    watchdog,
} from "./templates";

// ElizaOS AI Agent Plugin
export { xcronPlugin } from "./eliza-plugin";
export type { ElizaPlugin, ElizaAction, ElizaProvider, ElizaContext, ElizaResponse } from "./eliza-plugin";

// Types
export type {
    Task,
    TaskStatus,
    Trigger,
    TimeOnceTrigger,
    TimeRecurringTrigger,
    ConditionTrigger,
    KeeperInfo,
    ScheduleTaskParams,
    XCronAddresses,
    ProtocolStats,
    Network,
} from "./types";
