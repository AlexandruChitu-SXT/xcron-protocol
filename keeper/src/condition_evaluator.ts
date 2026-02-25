/**
 * ConditionEvaluator — Off-chain condition evaluation engine for XCron keeper bot.
 *
 * Evaluates on-chain conditions (ConditionOnChain trigger) by querying oracle
 * contracts via vm-query. Implements 4 optimizations:
 *
 *   1. Result caching (TTL = 6s, 1 MultiversX block)
 *   2. Batch evaluation (group by oracle+endpoint → single query)
 *   3. Adaptive polling (faster near threshold ±10%)
 *   4. Rate limiting per oracle (max 10 queries/min)
 *
 * Used by: TaskMonitor.scanForRipeTasks() for ConditionOnChain tasks.
 */

import { NetworkClient } from "./network";
import { Logger } from "./logger";

// ── Types ──

/** Comparator enum matching the smart contract Comparator type */
export enum Comparator {
    Gt = 0,
    Lt = 1,
    Eq = 2,
    Gte = 3,
    Lte = 4,
}

/** Condition configuration parsed from a ConditionOnChain trigger */
export interface ConditionConfig {
    oracleContract: string;
    queryEndpoint: string;
    queryArgs: Buffer[];
    comparator: Comparator;
    threshold: bigint;
}

/** Result of evaluating a condition */
export interface ConditionResult {
    met: boolean;
    currentValue: bigint;
    threshold: bigint;
    nearThreshold: boolean; // Within ±10% → triggers adaptive polling
}

// ── Cache Types ──

interface CacheEntry {
    value: bigint;
    timestamp: number;
}

interface RateLimitEntry {
    count: number;
    windowStart: number;
}

// ── Main Class ──

export class ConditionEvaluator {
    private networkClient: NetworkClient;
    private logger: Logger;

    // OPT-1: Result cache (TTL = 6 seconds = 1 MultiversX block)
    private cache: Map<string, CacheEntry> = new Map();
    private static readonly CACHE_TTL_MS = 6000;

    // OPT-4: Rate limiting (max 10 queries per oracle per minute)
    private rateLimits: Map<string, RateLimitEntry> = new Map();
    private static readonly MAX_QUERIES_PER_MIN = 10;
    private static readonly RATE_WINDOW_MS = 60000;

    // Metrics
    private totalEvaluations = 0;
    private cacheHits = 0;
    private conditionsMet = 0;

    constructor(networkClient: NetworkClient, logger: Logger) {
        this.networkClient = networkClient;
        this.logger = logger;
    }

    /**
     * Evaluate a single condition.
     * Returns whether the condition is met + current oracle value.
     */
    async evaluate(config: ConditionConfig): Promise<ConditionResult> {
        this.totalEvaluations++;

        // OPT-1: Check cache first
        const cacheKey = this.getCacheKey(config);
        const cached = this.getFromCache(cacheKey);
        if (cached !== null) {
            this.cacheHits++;
            return this.compare(cached, config);
        }

        // OPT-4: Check rate limit
        if (this.isRateLimited(config.oracleContract)) {
            this.log(`Rate limited: ${config.oracleContract.substring(0, 12)}... — skipping`);
            return { met: false, currentValue: 0n, threshold: config.threshold, nearThreshold: false };
        }

        // Query oracle via vm-query
        try {
            const result = await this.networkClient.queryContract(
                config.oracleContract,
                config.queryEndpoint,
                config.queryArgs
            );

            let oracleValue = 0n;
            if (result.length > 0 && result[0].length > 0) {
                const hex = result[0].toString("hex");
                oracleValue = hex ? BigInt("0x" + hex) : 0n;
            }

            // Store in cache
            this.setCache(cacheKey, oracleValue);

            // Record rate limit hit
            this.recordRateLimit(config.oracleContract);

            const evalResult = this.compare(oracleValue, config);

            if (evalResult.met) {
                this.conditionsMet++;
                this.log(
                    `✅ Condition MET: ${config.queryEndpoint}() = ${oracleValue} ` +
                    `${this.comparatorSymbol(config.comparator)} ${config.threshold}`
                );
            }

            return evalResult;
        } catch (err: any) {
            this.log(`Oracle query failed: ${config.queryEndpoint}@${config.oracleContract.substring(0, 12)}... — ${err.message || err}`);
            return { met: false, currentValue: 0n, threshold: config.threshold, nearThreshold: false };
        }
    }

    /**
     * OPT-2: Batch evaluate multiple conditions that share the same oracle+endpoint.
     * Groups by oracle key → single query per group → distributes result.
     */
    async evaluateBatch(configs: ConditionConfig[]): Promise<Map<number, ConditionResult>> {
        const results = new Map<number, ConditionResult>();

        // Group by oracle + endpoint
        const groups = new Map<string, { indices: number[]; config: ConditionConfig }>();
        for (let i = 0; i < configs.length; i++) {
            const key = this.getCacheKey(configs[i]);
            const existing = groups.get(key);
            if (existing) {
                existing.indices.push(i);
            } else {
                groups.set(key, { indices: [i], config: configs[i] });
            }
        }

        // Evaluate each unique oracle query once
        for (const [, group] of groups) {
            const result = await this.evaluate(group.config);

            // Distribute result to all tasks watching this oracle
            for (const idx of group.indices) {
                results.set(idx, this.compare(result.currentValue, configs[idx]));
            }
        }

        return results;
    }

    /**
     * OPT-3: Determine optimal poll interval based on proximity to threshold.
     * Returns milliseconds until next poll should occur.
     */
    getAdaptivePollInterval(result: ConditionResult, basePollMs: number): number {
        if (result.nearThreshold) {
            // Value is within ±10% of threshold → poll 3x faster
            return Math.max(basePollMs / 3, 2000);
        }
        return basePollMs;
    }

    /**
     * Get evaluation metrics.
     */
    getMetrics(): { total: number; cacheHits: number; hitRate: string; conditionsMet: number } {
        const hitRate = this.totalEvaluations > 0
            ? ((this.cacheHits / this.totalEvaluations) * 100).toFixed(1) + "%"
            : "0%";
        return {
            total: this.totalEvaluations,
            cacheHits: this.cacheHits,
            hitRate,
            conditionsMet: this.conditionsMet,
        };
    }

    // ── Private Helpers ──

    private compare(value: bigint, config: ConditionConfig): ConditionResult {
        const met = this.evalComparator(value, config.comparator, config.threshold);
        const nearThreshold = this.isNearThreshold(value, config.threshold);
        return { met, currentValue: value, threshold: config.threshold, nearThreshold };
    }

    private evalComparator(value: bigint, comparator: Comparator, threshold: bigint): boolean {
        switch (comparator) {
            case Comparator.Gt: return value > threshold;
            case Comparator.Lt: return value < threshold;
            case Comparator.Eq: return value === threshold;
            case Comparator.Gte: return value >= threshold;
            case Comparator.Lte: return value <= threshold;
            default: return false;
        }
    }

    private isNearThreshold(value: bigint, threshold: bigint): boolean {
        if (threshold === 0n) return false;
        const diff = value > threshold ? value - threshold : threshold - value;
        // Within ±10%
        return diff * 10n <= threshold;
    }

    private comparatorSymbol(c: Comparator): string {
        switch (c) {
            case Comparator.Gt: return ">";
            case Comparator.Lt: return "<";
            case Comparator.Eq: return "==";
            case Comparator.Gte: return ">=";
            case Comparator.Lte: return "<=";
        }
    }

    // ── Cache ──

    private getCacheKey(config: ConditionConfig): string {
        const argsKey = config.queryArgs.map(a => a.toString("hex")).join(",");
        return `${config.oracleContract}:${config.queryEndpoint}:${argsKey}`;
    }

    private getFromCache(key: string): bigint | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > ConditionEvaluator.CACHE_TTL_MS) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }

    private setCache(key: string, value: bigint): void {
        this.cache.set(key, { value, timestamp: Date.now() });
    }

    // ── Rate Limiting ──

    private isRateLimited(oracle: string): boolean {
        const entry = this.rateLimits.get(oracle);
        if (!entry) return false;
        if (Date.now() - entry.windowStart > ConditionEvaluator.RATE_WINDOW_MS) {
            this.rateLimits.delete(oracle);
            return false;
        }
        return entry.count >= ConditionEvaluator.MAX_QUERIES_PER_MIN;
    }

    private recordRateLimit(oracle: string): void {
        const entry = this.rateLimits.get(oracle);
        if (!entry || Date.now() - entry.windowStart > ConditionEvaluator.RATE_WINDOW_MS) {
            this.rateLimits.set(oracle, { count: 1, windowStart: Date.now() });
        } else {
            entry.count++;
        }
    }

    private log(msg: string): void {
        this.logger.info("ConditionEval", msg);
    }
}
