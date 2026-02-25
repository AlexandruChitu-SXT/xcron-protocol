/**
 * xcron-sdk
 *
 * SDK for integrating with XCron Protocol — Decentralized Task Automation on MultiversX.
 *
 * @example
 * ```typescript
 * import { XCronClient } from "xcron-sdk";
 *
 * const xcron = new XCronClient("testnet");
 *
 * // Schedule auto-compound weekly for 1 year
 * const tx = xcron.scheduleRecurring({
 *     targetContract: "erd1qqq...hatom...",
 *     targetEndpoint: "claimAndReinvest",
 *     intervalSeconds: 604800,
 *     executions: 52,
 *     depositEgld: "2600000000000000000",
 * });
 * ```
 */

export { XCronClient } from "./client";
export { getAddresses } from "./addresses";
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
