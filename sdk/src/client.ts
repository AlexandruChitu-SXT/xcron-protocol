/**
 * XCron Protocol SDK — Client
 *
 * Main entry point for interacting with XCron smart contracts.
 * Provides methods to schedule tasks, cancel tasks, and query protocol state.
 *
 * @example
 * ```typescript
 * import { XCronClient } from "@xcron-protocol/sdk";
 * import { Address } from "@multiversx/sdk-core";
 *
 * const xcron = new XCronClient("testnet");
 *
 * // Schedule a one-time task
 * const tx = xcron.scheduleTask({
 *     targetContract: "erd1qqq...",
 *     targetEndpoint: "claimRewards",
 *     trigger: { type: "TimeOnce", targetTime: Math.floor(Date.now() / 1000) + 3600 },
 *     depositEgld: "50000000000000000", // 0.05 EGLD
 * });
 *
 * // Sign and send with your wallet
 * ```
 */

import {
    Address,
    SmartContract,
    Interaction,
    TokenTransfer,
    BigUIntValue,
    U64Value,
    U8Value,
    BytesValue,
    AddressValue,
    StringValue,
    ContractFunction,
    ResultsParser,
    Transaction,
    TypedValue,
    List,
    ListType,
    BytesType,
} from "@multiversx/sdk-core";

import { ScheduleTaskParams, Network, XCronAddresses, Trigger } from "./types";
import { getAddresses } from "./addresses";

const DEFAULT_GAS_LIMIT = 30_000_000;
const DEFAULT_MAX_GAS = 5_000_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TTL_SECONDS = 86400; // 24 hours

export class XCronClient {
    private addresses: XCronAddresses;
    private scheduler: SmartContract;
    private registry: SmartContract;
    public network: Network;

    constructor(network: Network, customAddresses?: XCronAddresses) {
        this.network = network;
        this.addresses = customAddresses || getAddresses(network);
        this.scheduler = new SmartContract({
            address: new Address(this.addresses.scheduler),
        });
        this.registry = new SmartContract({
            address: new Address(this.addresses.keeperRegistry),
        });
    }

    /**
     * Build a transaction to schedule a new task.
     *
     * @example
     * ```typescript
     * const tx = xcron.scheduleTask({
     *     targetContract: "erd1qqq...hatom...",
     *     targetEndpoint: "claimRewards",
     *     trigger: { type: "TimeOnce", targetTime: 1700000000 },
     *     depositEgld: "50000000000000000", // 0.05 EGLD
     * });
     * ```
     */
    scheduleTask(params: ScheduleTaskParams): Transaction {
        const args = this.buildScheduleArgs(params);

        const tx = this.scheduler.call({
            func: new ContractFunction("scheduleTask"),
            args,
            gasLimit: DEFAULT_GAS_LIMIT,
            value: TokenTransfer.egldFromBigInteger(params.depositEgld),
            caller: Address.Zero(), // Set by signer
            chainID: this.getChainId(),
        });

        return tx;
    }

    /**
     * Build a transaction to schedule a recurring task.
     *
     * @example
     * ```typescript
     * // Auto-compound weekly for 52 weeks
     * const tx = xcron.scheduleRecurring({
     *     targetContract: "erd1qqq...hatom...",
     *     targetEndpoint: "claimAndReinvest",
     *     intervalSeconds: 604800, // 1 week
     *     executions: 52,
     *     depositEgld: "2600000000000000000", // 2.6 EGLD (0.05 × 52)
     * });
     * ```
     */
    scheduleRecurring(params: {
        targetContract: string;
        targetEndpoint: string;
        targetArgs?: string[];
        intervalSeconds: number;
        executions: number;
        maxGas?: number;
        maxRetries?: number;
        ttlSeconds?: number;
        depositEgld: string;
    }): Transaction {
        const startTime = Math.floor(Date.now() / 1000) + params.intervalSeconds;
        return this.scheduleTask({
            ...params,
            trigger: {
                type: "TimeRecurring",
                startTime,
                interval: params.intervalSeconds,
                remainingExecs: params.executions,
            },
        });
    }

    /**
     * Build a transaction to cancel a pending task and get a refund.
     */
    cancelTask(taskId: number): Transaction {
        return this.scheduler.call({
            func: new ContractFunction("cancelTask"),
            args: [new U64Value(taskId)],
            gasLimit: 15_000_000,
            caller: Address.Zero(),
            chainID: this.getChainId(),
        });
    }

    /**
     * Get the contract addresses for this client.
     */
    getAddresses(): XCronAddresses {
        return this.addresses;
    }

    /**
     * Get the scheduler contract address as a bech32 string.
     */
    getSchedulerAddress(): string {
        return this.addresses.scheduler;
    }

    // ── Internal helpers ──

    private buildScheduleArgs(params: ScheduleTaskParams): TypedValue[] {
        const targetContract = new AddressValue(new Address(params.targetContract));
        const targetEndpoint = BytesValue.fromUTF8(params.targetEndpoint);

        // Target args as List<bytes>
        const targetArgs = params.targetArgs?.length
            ? new List(
                new ListType(new BytesType()),
                (params.targetArgs || []).map((a) => BytesValue.fromHex(a))
            )
            : new List(new ListType(new BytesType()), []);

        const trigger = this.encodeTrigger(params.trigger);
        const maxGas = new U64Value(params.maxGas || DEFAULT_MAX_GAS);
        const maxRetries = new U8Value(params.maxRetries || DEFAULT_MAX_RETRIES);
        const ttl = new U64Value(params.ttlSeconds || DEFAULT_TTL_SECONDS);

        return [targetContract, targetEndpoint, targetArgs, trigger, maxGas, maxRetries, ttl];
    }

    private encodeTrigger(trigger: Trigger): BytesValue {
        // Encode trigger as nested bytes matching the Rust enum encoding
        const buf: number[] = [];

        switch (trigger.type) {
            case "TimeOnce":
                buf.push(0x00); // variant index
                this.pushU64(buf, trigger.targetTime);
                break;

            case "TimeRecurring":
                buf.push(0x01); // variant index
                this.pushU64(buf, trigger.startTime);
                this.pushU64(buf, trigger.interval);
                this.pushU64(buf, trigger.remainingExecs);
                break;

            case "ConditionOnChain":
                buf.push(0x02); // variant index
                // Complex encoding — requires address + buffer + vec + comparator + bigint
                throw new Error("ConditionOnChain trigger encoding not yet implemented in SDK");
        }

        return BytesValue.fromHex(Buffer.from(buf).toString("hex"));
    }

    private pushU64(buf: number[], value: number): void {
        const bytes = new ArrayBuffer(8);
        const view = new DataView(bytes);
        view.setBigUint64(0, BigInt(value));
        buf.push(...new Uint8Array(bytes));
    }

    private getChainId(): string {
        switch (this.network) {
            case "mainnet": return "1";
            case "testnet": return "T";
            case "devnet": return "D";
        }
    }
}
