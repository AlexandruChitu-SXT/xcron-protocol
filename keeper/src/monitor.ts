import { NetworkClient } from "./network";
import { ContractAddresses, KeeperSettings } from "./config";
import { Logger, withRetry } from "./logger";
import { PriceService, PriceCondition } from "./price_service";
import { ConditionEvaluator, ConditionConfig, Comparator } from "./condition_evaluator";

/**
 * Represents a task fetched from the Scheduler contract.
 * Supports both TimeOnce and TimeRecurring triggers.
 */
export interface MonitoredTask {
    id: number;
    targetContract: string;
    targetEndpoint: string;
    triggerTime: number;
    isRecurring: boolean;
    interval: number;          // 0 for TimeOnce
    remainingExecs: number;    // 0 for TimeOnce
    depositEgld: bigint;
    status: number; // 0=Pending, 1=Committed, 2=Executing, 3=Completed, etc.
    priceCondition?: PriceCondition; // Optional: hybrid off-chain price check
    conditionConfig?: ConditionConfig; // Optional: on-chain condition trigger
    isPriority?: boolean; // Emergency recovery tasks get priority
    aiEnabled?: boolean;       // AI trigger: keeper consults AI before executing
    aiTemplateType?: string;   // AI trigger: template type for prompt selection
}

/**
 * TaskMonitor — polls the Scheduler contract for ripe time-based tasks.
 *
 * Phase 1 flow:
 *   1. Query getTaskNonce() to know the upper bound of task IDs
 *   2. For each task ID, query getTask() to get task data
 *   3. Check if task.trigger_time <= current time (task is ripe)
 *   4. Emit ripe task IDs for the Executor to process
 */
export class TaskMonitor {
    private networkClient: NetworkClient;
    private contracts: ContractAddresses;
    private settings: KeeperSettings;
    private logger: Logger;
    private priceService: PriceService;
    private knownTasks: Map<number, MonitoredTask> = new Map();
    private lastScannedNonce: number = 0;

    // Intelligent retry: track failures per task with exponential backoff
    private failedAttempts: Map<number, number> = new Map();
    private lastAttemptTime: Map<number, number> = new Map();
    private blacklistedTasks: Set<number> = new Set();
    private static readonly MAX_FAILURES = 5;
    private static readonly BASE_COOLDOWN_MS = 6000;  // 6s base cooldown
    private static readonly MAX_COOLDOWN_MS = 300000; // 5min max cooldown

    constructor(
        networkClient: NetworkClient,
        contracts: ContractAddresses,
        settings: KeeperSettings,
        logger: Logger,
        priceService?: PriceService
    ) {
        this.networkClient = networkClient;
        this.contracts = contracts;
        this.settings = settings;
        this.logger = logger;
        this.priceService = priceService || new PriceService(logger);
        this.conditionEvaluator = new ConditionEvaluator(networkClient, logger);
        this.initShardCache();
    }

    /** S-SHARD: Cached shard ID of the keeper and scheduler contract */
    private keeperShard: number = -1;
    /** Condition evaluator for ConditionOnChain tasks */
    private conditionEvaluator: ConditionEvaluator;

    private async initShardCache(): Promise<void> {
        try {
            this.keeperShard = await this.networkClient.getShardOfAddress(this.contracts.scheduler);
            this.log(`S-SHARD: Scheduler shard detected: ${this.keeperShard}`);
        } catch {
            this.keeperShard = 0;
        }
    }

    /**
     * Scan for new tasks and check which pending ones are ripe.
     * Returns list of task IDs ready for execution.
     */
    async scanForRipeTasks(): Promise<MonitoredTask[]> {
        const currentTime = await this.networkClient.getCurrentTime();
        const ripeTasks: MonitoredTask[] = [];

        // 1. Check for new tasks
        await this.discoverNewTasks();

        // 2. Check each pending task for ripeness
        for (const [taskId, task] of this.knownTasks) {
            // Skip non-pending tasks
            if (task.status !== 0) {
                continue;
            }

            // Skip blacklisted tasks (too many failures)
            if (this.blacklistedTasks.has(taskId)) {
                continue;
            }

            // Skip tasks in cooldown (exponential backoff)
            const failures = this.failedAttempts.get(taskId) || 0;
            if (failures > 0) {
                const lastAttempt = this.lastAttemptTime.get(taskId) || 0;
                const cooldown = Math.min(
                    TaskMonitor.BASE_COOLDOWN_MS * Math.pow(2, failures - 1),
                    TaskMonitor.MAX_COOLDOWN_MS
                );
                const elapsed = Date.now() - lastAttempt;
                if (elapsed < cooldown) {
                    continue; // Still in cooldown
                }
            }

            // Time-based: is the trigger time reached?
            if (task.triggerTime <= currentTime) {
                // Hybrid price check: if task has a price condition, verify it
                if (task.priceCondition) {
                    const priceMet = await this.priceService.checkCondition(task.priceCondition);
                    if (!priceMet) {
                        continue; // Price condition not met — skip this cycle
                    }
                }

                ripeTasks.push(task);
                const recurInfo = task.isRecurring
                    ? ` [RECURRING: interval=${task.interval}, remaining=${task.remainingExecs}]`
                    : " [ONCE]";
                const retryInfo = failures > 0 ? ` [retry #${failures + 1}]` : "";
                const priceInfo = task.priceCondition ? " [PRICE ✅]" : "";
                this.log(`Task #${taskId} is RIPE (trigger time ${task.triggerTime} <= current ${currentTime})${recurInfo}${retryInfo}${priceInfo}`);
            }
        }

        // ── ConditionOnChain evaluation ──
        // Collect all pending condition tasks and evaluate in batch
        const conditionTasks: MonitoredTask[] = [];
        for (const [taskId, task] of this.knownTasks) {
            if (task.status !== 0 || !task.conditionConfig) continue;
            if (this.blacklistedTasks.has(taskId)) continue;

            // Check cooldown
            const failures = this.failedAttempts.get(taskId) || 0;
            if (failures > 0) {
                const lastAttempt = this.lastAttemptTime.get(taskId) || 0;
                const cooldown = Math.min(
                    TaskMonitor.BASE_COOLDOWN_MS * Math.pow(2, failures - 1),
                    TaskMonitor.MAX_COOLDOWN_MS
                );
                if (Date.now() - lastAttempt < cooldown) continue;
            }

            conditionTasks.push(task);
        }

        if (conditionTasks.length > 0) {
            const configs = conditionTasks.map(t => t.conditionConfig!);
            const results = await this.conditionEvaluator.evaluateBatch(configs);

            for (const [idx, result] of results) {
                if (result.met) {
                    const task = conditionTasks[idx];
                    ripeTasks.push(task);
                    this.log(`Task #${task.id} CONDITION MET: ${result.currentValue} → threshold ${result.threshold}`);
                }
            }

            // Log metrics periodically
            const metrics = this.conditionEvaluator.getMetrics();
            if (metrics.total % 50 === 0 && metrics.total > 0) {
                this.log(`ConditionEval metrics: ${metrics.total} evals, ${metrics.hitRate} cache hit, ${metrics.conditionsMet} conditions met`);
            }
        }

        // S-SHARD: Sort ripe tasks — same-shard targets first (lower gas, faster execution)
        if (this.keeperShard >= 0 && ripeTasks.length > 1) {
            // Cache target shard per task for sorting
            const shardCache = new Map<number, number>();
            for (const task of ripeTasks) {
                try {
                    const shard = await this.networkClient.getShardOfAddress(task.targetContract);
                    shardCache.set(task.id, shard);
                } catch {
                    shardCache.set(task.id, -1); // Unknown shard
                }
            }

            ripeTasks.sort((a, b) => {
                const aShard = shardCache.get(a.id) ?? -1;
                const bShard = shardCache.get(b.id) ?? -1;
                const aIsSameShard = aShard === this.keeperShard ? 1 : 0;
                const bIsSameShard = bShard === this.keeperShard ? 1 : 0;
                if (aIsSameShard !== bIsSameShard) return bIsSameShard - aIsSameShard;
                // Secondary sort: higher deposit = more keeper reward
                return Number(b.depositEgld - a.depositEgld);
            });

            const sameShard = ripeTasks.filter(t => shardCache.get(t.id) === this.keeperShard).length;
            if (sameShard > 0) {
                this.log(`S-SHARD: ${sameShard}/${ripeTasks.length} ripe tasks in keeper's shard (priority)`);
            }
        }

        this.log(`Scan complete: ${this.knownTasks.size} tracked, ${ripeTasks.length} ripe`);
        return ripeTasks;
    }

    /**
     * Discover new tasks by checking the task nonce counter.
     */
    private async discoverNewTasks(): Promise<void> {
        try {
            const nonceResult = await withRetry(
                () => this.networkClient.queryContract(this.contracts.scheduler, "getTaskNonce"),
                { maxRetries: 3, baseDelayMs: 500, label: "getTaskNonce" }
            );

            if (nonceResult.length === 0) return;

            const currentNonce = this.bufferToNumber(nonceResult[0]);

            // Fetch any new tasks we haven't seen yet
            for (let i = this.lastScannedNonce + 1; i <= currentNonce; i++) {
                try {
                    await this.fetchTask(i);
                } catch (fetchErr: any) {
                    this.log(`Task #${i}: skipped (${fetchErr.message || fetchErr})`);
                }
                // Small delay between API calls to avoid rate limiting
                await new Promise(r => setTimeout(r, 200));
            }

            this.lastScannedNonce = currentNonce;
        } catch (err) {
            this.log(`Error discovering tasks: ${err}`);
        }
    }

    /**
     * Fetch a single task by ID from the Scheduler and parse its data.
     * Also fetches task metadata for hybrid price conditions.
     */
    private async fetchTask(taskId: number): Promise<void> {
        try {
            const taskResult = await withRetry(
                () => this.networkClient.queryContract(
                    this.contracts.scheduler,
                    "getTask",
                    [this.numberToBuffer(taskId)]
                ),
                { maxRetries: 3, baseDelayMs: 1000, label: `getTask#${taskId}` }
            );

            if (taskResult.length === 0 || taskResult[0].length === 0) {
                this.log(`Task #${taskId}: not found or empty`);
                return;
            }

            const data = taskResult[0];
            const task = this.parseTaskStruct(taskId, data);
            if (task) {
                // Fetch hybrid metadata (price conditions etc.)
                try {
                    const metaResult = await this.networkClient.queryContract(
                        this.contracts.scheduler,
                        "getTaskMetadata",
                        [this.numberToBuffer(taskId)]
                    );
                    if (metaResult.length > 0 && metaResult[0].length > 0) {
                        const metaJson = metaResult[0].toString("utf8");
                        const meta = JSON.parse(metaJson);
                        if (meta.price) {
                            task.priceCondition = {
                                token: meta.price.token,
                                condition: meta.price.condition,
                                threshold: meta.price.threshold,
                            };
                            this.log(`Task #${taskId}: price condition → ${meta.price.token} ${meta.price.condition} $${meta.price.threshold}`);
                        }
                    }
                } catch (metaErr: any) {
                    // Metadata is optional — silently ignore parse errors
                }

                this.knownTasks.set(taskId, task);
                this.log(
                    `Task #${taskId}: ${task.targetEndpoint}() → status=${task.status}, ` +
                    `triggerTime=${task.triggerTime}, deposit=${Number(task.depositEgld) / 1e18} EGLD`
                );
            }
        } catch (err) {
            this.log(`Error fetching task #${taskId}: ${err}`);
        }
    }

    /**
     * Parse the binary Task struct returned by the smart contract.
     *
     * Layout (nested-encoded):
     *   id(u64) → owner(32b) → target_contract(32b) → endpoint(4bLen+bytes)
     *   → args(4bCount + items) → trigger(1bDisc + variant)
     *   → max_gas(u64) → deposit(4bLen+BigUint) → max_retries(u8)
     *   → retry_count(u8) → ttl_seconds(u64) → created_at(u64)
     *   → status(u8) → assigned_keeper(1bFlag + optional 32b)
     *   → completed_at(u64)   [NEW: security metrics field]
     */
    private parseTaskStruct(taskId: number, data: Buffer): MonitoredTask | null {
        try {
            let offset = 0;

            // 1. id: u64 (skip — we already have it)
            offset += 8;

            // 2. owner: ManagedAddress (32 bytes)
            const ownerHex = data.subarray(offset, offset + 32).toString("hex");
            offset += 32;

            // 3. target_contract: ManagedAddress (32 bytes)
            const targetHex = data.subarray(offset, offset + 32).toString("hex");
            offset += 32;

            // 4. target_endpoint: ManagedBuffer (4-byte len + bytes)
            const epLen = data.readUInt32BE(offset); offset += 4;
            const targetEndpoint = data.subarray(offset, offset + epLen).toString("utf-8");
            offset += epLen;

            // 5. target_args: ManagedVec<ManagedBuffer> (4-byte count + nested items)
            const argsCount = data.readUInt32BE(offset); offset += 4;
            for (let j = 0; j < argsCount; j++) {
                const argLen = data.readUInt32BE(offset); offset += 4;
                offset += argLen;
            }

            // 6. trigger: Trigger enum (1-byte discriminant + variant fields)
            const triggerDisc = data[offset]; offset += 1;
            let triggerTime = 0;
            let isRecurring = false;
            let interval = 0;
            let remainingExecs = 0;
            let conditionConfig: ConditionConfig | undefined = undefined;

            if (triggerDisc === 0) {
                // TimeOnce { target_time: u64 }
                triggerTime = Number(data.readBigUInt64BE(offset)); offset += 8;
            } else if (triggerDisc === 1) {
                // TimeRecurring { start_time: u64, interval: u64, remaining_execs: u64 }
                isRecurring = true;
                triggerTime = Number(data.readBigUInt64BE(offset)); offset += 8;  // start_time
                interval = Number(data.readBigUInt64BE(offset)); offset += 8;
                remainingExecs = Number(data.readBigUInt64BE(offset)); offset += 8;
            } else if (triggerDisc === 2) {
                // ConditionOnChain { oracle_contract, query_endpoint, query_args, comparator, threshold }

                // oracle_contract: ManagedAddress (32 bytes)
                const oracleHex = data.subarray(offset, offset + 32).toString("hex");
                offset += 32;
                let oracleContract = oracleHex;
                try {
                    const { Address } = require("@multiversx/sdk-core");
                    oracleContract = Address.newFromHex(oracleHex).toBech32();
                } catch { /* keep hex */ }

                // query_endpoint: ManagedBuffer (4b len + bytes)
                const qepLen = data.readUInt32BE(offset); offset += 4;
                const queryEndpoint = data.subarray(offset, offset + qepLen).toString("utf-8");
                offset += qepLen;

                // query_args: ManagedVec<ManagedBuffer> (4b count + nested items)
                const qaCount = data.readUInt32BE(offset); offset += 4;
                const queryArgs: Buffer[] = [];
                for (let q = 0; q < qaCount; q++) {
                    const qaLen = data.readUInt32BE(offset); offset += 4;
                    queryArgs.push(Buffer.from(data.subarray(offset, offset + qaLen)));
                    offset += qaLen;
                }

                // comparator: Comparator (1 byte enum: 0=Gt, 1=Lt, 2=Eq, 3=Gte, 4=Lte)
                const comparator: Comparator = data[offset] as Comparator;
                offset += 1;

                // threshold: BigUint (nested: 4b len + value bytes)
                const thLen = data.readUInt32BE(offset); offset += 4;
                let threshold = 0n;
                if (thLen > 0) {
                    const thHex = data.subarray(offset, offset + thLen).toString("hex");
                    threshold = BigInt("0x" + thHex);
                }
                offset += thLen;

                conditionConfig = { oracleContract, queryEndpoint, queryArgs, comparator, threshold };
            }

            // 7. max_gas: u64
            offset += 8;

            // 8. deposit: BigUint (nested: 4-byte len + value bytes)
            const depLen = data.readUInt32BE(offset); offset += 4;
            let depositEgld = 0n;
            if (depLen > 0) {
                const depHex = data.subarray(offset, offset + depLen).toString("hex");
                depositEgld = BigInt("0x" + depHex);
            }
            offset += depLen;

            // 9. max_retries: u8
            offset += 1;
            // 10. retry_count: u8
            offset += 1;
            // 11. ttl_seconds: u64
            offset += 8;
            // 12. created_at: u64
            offset += 8;

            // 13. status: TaskStatus (1-byte enum: 0=Pending .. 6=Expired)
            const status = data[offset]; offset += 1;

            // 14. assigned_keeper: Option<ManagedAddress> (1b flag + optional 32b)
            if (offset < data.length) {
                const hasKeeper = data[offset]; offset += 1;
                if (hasKeeper === 1) {
                    offset += 32; // Skip assigned keeper address
                }
            }

            // 15. completed_at: u64 (new security field)
            if (offset + 8 <= data.length) {
                offset += 8; // Skip completed_at — not needed for scheduling
            }

            // 16. post_task_id: Option<u64> (1b flag + optional 8b)
            if (offset < data.length) {
                const hasPostTask = data[offset]; offset += 1;
                if (hasPostTask === 1 && offset + 8 <= data.length) {
                    offset += 8; // Skip post_task_id — chaining is handled on-chain
                }
            }

            // Convert hex to bech32 for target contract
            let targetContract = targetHex;
            try {
                const { Address } = require("@multiversx/sdk-core");
                targetContract = Address.newFromHex(targetHex).toBech32();
            } catch { /* keep hex */ }

            return {
                id: taskId,
                targetContract,
                targetEndpoint,
                triggerTime,
                isRecurring,
                interval,
                remainingExecs,
                depositEgld,
                status,
                conditionConfig,
                // Emergency recovery tasks get priority execution
                isPriority: targetEndpoint === "withdraw" || targetEndpoint === "emergencyWithdraw",
            };
        } catch (err) {
            this.log(`Task #${taskId}: parse error — ${err}`);
            return null;
        }
    }

    /**
     * Mark a task as executed.
     * For recurring tasks: re-fetch from chain to get updated trigger time.
     * For one-time tasks: mark as completed.
     */
    async markExecuted(taskId: number): Promise<void> {
        const task = this.knownTasks.get(taskId);
        if (!task) return;

        if (task.isRecurring && task.remainingExecs > 1) {
            // Recurring task — the SC updated the trigger. Re-fetch to get new state.
            this.log(`Task #${taskId} is recurring (${task.remainingExecs - 1} execs left). Re-fetching...`);
            await this.fetchTask(taskId);
        } else {
            // One-time or last recurrence — mark as completed
            task.status = 3; // Completed
            this.log(`Task #${taskId} marked completed.`);
        }
    }

    /**
     * Record a permanent failure — blacklist immediately, no retries.
     * Used for errors that will NEVER succeed (wrong endpoint, contract issues).
     */
    recordPermanentFailure(taskId: number, error: string): void {
        this.blacklistedTasks.add(taskId);
        this.failedAttempts.delete(taskId);
        this.lastAttemptTime.delete(taskId);
        this.logger.warn("Monitor",
            `⛔ Task #${taskId} PERMANENT FAILURE — blacklisted on first attempt. ` +
            `Reason: ${error}. Will not be retried.`
        );
    }

    /**
     * Record a failed execution attempt. Applies exponential backoff.
     * After MAX_FAILURES, the task is blacklisted to stop wasting gas.
     */
    recordFailure(taskId: number, error: string): void {
        const attempts = (this.failedAttempts.get(taskId) || 0) + 1;
        this.failedAttempts.set(taskId, attempts);
        this.lastAttemptTime.set(taskId, Date.now());

        if (attempts >= TaskMonitor.MAX_FAILURES) {
            this.blacklistedTasks.add(taskId);
            const cooldownTotal = TaskMonitor.BASE_COOLDOWN_MS * (Math.pow(2, TaskMonitor.MAX_FAILURES) - 1);
            this.logger.warn("Monitor",
                `⛔ Task #${taskId} BLACKLISTED after ${attempts} consecutive failures. ` +
                `Last error: ${error}. Task will not be retried until keeper restart.`
            );
        } else {
            const nextCooldown = Math.min(
                TaskMonitor.BASE_COOLDOWN_MS * Math.pow(2, attempts - 1),
                TaskMonitor.MAX_COOLDOWN_MS
            );
            this.logger.warn("Monitor",
                `Task #${taskId} failed (attempt ${attempts}/${TaskMonitor.MAX_FAILURES}). ` +
                `Next retry in ${(nextCooldown / 1000).toFixed(0)}s`
            );
        }
    }

    /**
     * Record a successful execution. Clears failure tracking.
     */
    recordSuccess(taskId: number): void {
        this.failedAttempts.delete(taskId);
        this.lastAttemptTime.delete(taskId);
    }

    /**
     * Legacy method — marks as completed directly (for cancellations etc.)
     */
    markCompleted(taskId: number): void {
        const task = this.knownTasks.get(taskId);
        if (task) {
            task.status = 3;
        }
        // Clean up failure tracking
        this.failedAttempts.delete(taskId);
        this.lastAttemptTime.delete(taskId);
        this.blacklistedTasks.delete(taskId);
    }

    /**
     * Refresh the status of all known pending tasks.
     */
    async refreshPendingTasks(): Promise<void> {
        for (const [taskId, task] of this.knownTasks) {
            if (task.status === 0) {
                // Re-fetch to check if someone else executed it
                await this.fetchTask(taskId);
            }
        }
    }

    getTrackedCount(): number {
        return this.knownTasks.size;
    }

    getPendingCount(): number {
        let count = 0;
        for (const task of this.knownTasks.values()) {
            if (task.status === 0) count++;
        }
        return count;
    }

    private bufferToNumber(buf: Buffer): number {
        if (buf.length === 0) return 0;
        return parseInt(buf.toString("hex"), 16);
    }

    private numberToBuffer(num: number): Buffer {
        const hex = num.toString(16).padStart(2, "0");
        return Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
    }

    private log(msg: string): void {
        this.logger.info("Monitor", msg);
    }
}
