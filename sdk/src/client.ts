/**
 * XCron Protocol SDK — Client
 *
 * Main entry point for interacting with XCron smart contracts.
 * Provides methods to schedule tasks, cancel tasks, and query protocol state.
 *
 * @example
 * ```typescript
 * import { XCronClient } from "xcron-sdk";
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

import { ScheduleTaskParams, Network, XCronAddresses, Trigger, ProtocolStats } from "./types";
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

    // ═══════════════════════════════════════════════════════════
    //  QUERY METHODS — Read on-chain data via MultiversX API
    // ═══════════════════════════════════════════════════════════

    /**
     * Query the MultiversX API gateway for smart contract view functions.
     * Returns decoded hex results from the VM.
     */
    private async vmQuery(funcName: string, args: string[] = []): Promise<string[]> {
        const apiUrl = this.getApiUrl();
        const response = await fetch(`${apiUrl}/vm-values/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                scAddress: this.addresses.scheduler,
                funcName,
                args,
            }),
        });

        if (!response.ok) {
            throw new Error(`VM query failed: ${response.statusText}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await response.json();
        if (result.data?.data?.returnCode !== "ok") {
            throw new Error(`VM query error: ${result.data?.data?.returnMessage || "unknown"}`);
        }

        return result.data.data.returnData || [];
    }

    /**
     * Get the current task nonce (total number of tasks ever created).
     *
     * @example
     * ```typescript
     * const totalTasks = await xcron.getTaskNonce();
     * console.log(`Total tasks created: ${totalTasks}`);
     * ```
     */
    async getTaskNonce(): Promise<number> {
        const result = await this.vmQuery("getTaskNonce");
        if (!result.length || !result[0]) return 0;
        return parseInt(Buffer.from(result[0], "base64").toString("hex") || "0", 16);
    }

    /**
     * Get protocol statistics.
     *
     * @example
     * ```typescript
     * const stats = await xcron.getProtocolStats();
     * console.log(`Success: ${stats.totalSuccessful}, Failed: ${stats.totalFailed}`);
     * ```
     */
    async getProtocolStats(): Promise<ProtocolStats> {
        const [successResult, failedResult, nonceResult] = await Promise.all([
            this.vmQuery("getTotalSuccessfulExecs"),
            this.vmQuery("getTotalFailedExecs"),
            this.vmQuery("getTaskNonce"),
        ]);

        const decodeU64 = (data: string[]): number => {
            if (!data.length || !data[0]) return 0;
            return parseInt(Buffer.from(data[0], "base64").toString("hex") || "0", 16);
        };

        return {
            totalTasks: decodeU64(nonceResult),
            totalSuccessful: decodeU64(successResult),
            totalFailed: decodeU64(failedResult),
        };
    }

    /**
     * Check if the protocol is currently paused.
     *
     * @example
     * ```typescript
     * const isPaused = await xcron.isPaused();
     * if (isPaused) console.log("Protocol is paused!");
     * ```
     */
    async isPaused(): Promise<boolean> {
        const result = await this.vmQuery("isPaused");
        if (!result.length || !result[0]) return false;
        const hex = Buffer.from(result[0], "base64").toString("hex");
        return hex === "01";
    }

    /**
     * Get the minimum deposit required to schedule a task.
     *
     * @returns Minimum deposit in EGLD (as string in smallest denomination)
     *
     * @example
     * ```typescript
     * const minDeposit = await xcron.getMinDeposit();
     * console.log(`Minimum deposit: ${minDeposit} (atomic units)`);
     * ```
     */
    async getMinDeposit(): Promise<string> {
        const result = await this.vmQuery("getMinDeposit");
        if (!result.length || !result[0]) return "0";
        const hex = Buffer.from(result[0], "base64").toString("hex");
        return BigInt("0x" + (hex || "0")).toString();
    }

    /**
     * Get the protocol fee in basis points.
     *
     * @example
     * ```typescript
     * const feeBps = await xcron.getProtocolFeeBps();
     * console.log(`Protocol fee: ${feeBps / 100}%`);
     * ```
     */
    async getProtocolFeeBps(): Promise<number> {
        const result = await this.vmQuery("getProtocolFeeBps");
        if (!result.length || !result[0]) return 0;
        return parseInt(Buffer.from(result[0], "base64").toString("hex") || "0", 16);
    }

    /**
     * Check if an address is a whitelisted keeper.
     *
     * @example
     * ```typescript
     * const isKeeper = await xcron.isWhitelistedKeeper("erd1...");
     * ```
     */
    async isWhitelistedKeeper(address: string): Promise<boolean> {
        try {
            const addrHex = Address.fromBech32(address).hex();
            const result = await this.vmQuery("isWhitelistedKeeper", [addrHex]);
            if (!result.length || !result[0]) return false;
            const hex = Buffer.from(result[0], "base64").toString("hex");
            return hex === "01";
        } catch {
            return false;
        }
    }

    /**
     * Check if a target contract is blacklisted.
     *
     * @example
     * ```typescript
     * const isBlocked = await xcron.isBlacklisted("erd1qqq...");
     * ```
     */
    async isBlacklisted(target: string): Promise<boolean> {
        try {
            const addrHex = Address.fromBech32(target).hex();
            const result = await this.vmQuery("isBlacklisted", [addrHex]);
            if (!result.length || !result[0]) return false;
            const hex = Buffer.from(result[0], "base64").toString("hex");
            return hex === "01";
        } catch {
            return false;
        }
    }

    /**
     * Get the MultiversX API base URL for the configured network.
     */
    getApiUrl(): string {
        switch (this.network) {
            case "mainnet": return "https://api.multiversx.com";
            case "testnet": return "https://testnet-api.multiversx.com";
            case "devnet": return "https://devnet-api.multiversx.com";
        }
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

            case "ConditionOnChain": {
                buf.push(0x02); // variant index

                // Oracle contract address (32 bytes from bech32)
                const addrBytes = Address.fromBech32(trigger.oracleContract).pubkey();
                buf.push(...addrBytes);

                // Query endpoint (u32 length + utf8 bytes)
                const endpointBytes = new TextEncoder().encode(trigger.queryEndpoint);
                this.pushU32(buf, endpointBytes.length);
                buf.push(...endpointBytes);

                // Query args: u32 count, then each arg as u32 length + hex bytes
                const args = trigger.queryArgs || [];
                this.pushU32(buf, args.length);
                for (const arg of args) {
                    const argBytes = this.hexToBytes(arg);
                    this.pushU32(buf, argBytes.length);
                    buf.push(...argBytes);
                }

                // Comparator enum index (u8)
                const comparatorIndex = { Gt: 0, Lt: 1, Eq: 2, Gte: 3, Lte: 4 };
                buf.push(comparatorIndex[trigger.comparator]);

                // Threshold as BigUint (u32 length + big-endian bytes)
                const thresholdBytes = this.bigIntToBytes(trigger.threshold);
                this.pushU32(buf, thresholdBytes.length);
                buf.push(...thresholdBytes);
                break;
            }
        }

        return BytesValue.fromHex(Buffer.from(buf).toString("hex"));
    }

    private pushU64(buf: number[], value: number): void {
        const bytes = new ArrayBuffer(8);
        const view = new DataView(bytes);
        view.setBigUint64(0, BigInt(value));
        buf.push(...new Uint8Array(bytes));
    }

    private pushU32(buf: number[], value: number): void {
        const bytes = new ArrayBuffer(4);
        const view = new DataView(bytes);
        view.setUint32(0, value);
        buf.push(...new Uint8Array(bytes));
    }

    private hexToBytes(hex: string): number[] {
        const result: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
            result.push(parseInt(hex.substring(i, i + 2), 16));
        }
        return result;
    }

    private bigIntToBytes(value: string): number[] {
        let bi = BigInt(value);
        if (bi === 0n) return [0];
        const result: number[] = [];
        while (bi > 0n) {
            result.unshift(Number(bi & 0xffn));
            bi >>= 8n;
        }
        return result;
    }

    private getChainId(): string {
        switch (this.network) {
            case "mainnet": return "1";
            case "testnet": return "T";
            case "devnet": return "D";
        }
    }
}
