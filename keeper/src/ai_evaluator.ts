/**
 * AIEvaluator — Off-chain AI oracle for intelligent task execution.
 * 
 * Before executing a task, the keeper can optionally consult an AI model
 * to determine if NOW is the optimal moment. This enables:
 *   - Smart DCA: buy when momentum/sentiment is positive
 *   - Adaptive stop-loss: sell before crash patterns complete
 *   - Optimal compounding: compound when gas is cheap and APY justifies it
 *   - Whale-aware execution: detect unusual on-chain activity
 * 
 * The AI evaluator is "fail-open": if the AI is unavailable or errors,
 * the task executes normally (default: execute).
 */

import { Logger } from "./logger";

// ── Types ──

export type AIProvider = "openai" | "anthropic" | "local";

export interface AIConfig {
    enabled: boolean;
    provider: AIProvider;
    apiKey: string;
    model: string;
    maxCostPerDayUsd: number;    // Daily budget cap for AI calls
    timeoutMs: number;           // API call timeout
}

export interface AIDecision {
    execute: boolean;
    reason: string;
    confidence: number;    // 0-1
    skipUntil?: number;    // Unix timestamp — don't ask again until this time
}

export interface MarketContext {
    egldPrice: number;
    egldChange24h: number;
    btcPrice: number;
    btcChange24h: number;
    gasPrice?: number;         // Network gas price if available
    timestamp: number;
}

export interface TaskContext {
    taskId: number;
    templateType: string;      // "dca" | "compound" | "stoploss" | "claim" | "custom"
    targetEndpoint: string;
    targetContract: string;
    depositEgld: string;
    executionCount: number;    // How many times this task has been executed
}

// ── Template Prompts ──

const TEMPLATE_PROMPTS: Record<string, string> = {
    dca: `You are an AI advisor for automated DCA (Dollar Cost Average) token purchases on MultiversX blockchain.
Given the current market conditions, should this DCA purchase execute NOW or wait for a potentially better entry?
Consider: price momentum, recent volatility, support/resistance levels, overall market sentiment.
If the price has dropped significantly recently, it might be a GOOD time to buy (buy the dip).
If the price just pumped significantly, it might be better to WAIT.
Default bias: EXECUTE (DCA works best with consistent execution).`,

    compound: `You are an AI advisor for auto-compounding DeFi yield on MultiversX.
Should the user compound their rewards NOW or wait?
Consider: gas costs vs reward amount, current APY, whether waiting would accumulate more to compound.
If gas costs are high relative to rewards, SKIP to save money.
If rewards are significant and APY is good, EXECUTE.
Default bias: EXECUTE (compound frequently maximizes yield).`,

    stoploss: `You are an AI advisor for stop-loss protection on MultiversX.
The user has set a stop-loss. Given market conditions, should we execute the protective sell NOW?
Consider: is this a flash crash that might recover? Is volume confirming the drop? Are whales selling?
If the drop is likely temporary, SKIP (avoid selling the bottom).
If the drop shows strong selling pressure, EXECUTE to protect capital.
Default bias: EXECUTE (safety first — protect user funds).`,

    claim: `You are an AI advisor for automated reward claiming on MultiversX.
Should the user claim their staking/farming rewards NOW?
Consider: gas costs, reward amount, network congestion.
This is low-risk — default to EXECUTE unless gas is extremely expensive.
Default bias: EXECUTE (claim frequently to avoid reward caps).`,

    custom: `You are an AI advisor for a custom smart contract automation on MultiversX.
Given the current market and network conditions, should this automation execute NOW?
Consider: gas costs, network congestion, overall market stability.
Default bias: EXECUTE (respect user's scheduling intent).`,
};

// ── Rate Limiting ──

interface DailyUsage {
    date: string;       // YYYY-MM-DD
    callCount: number;
    estimatedCostUsd: number;
}

// ── Main Class ──

export class AIEvaluator {
    private config: AIConfig;
    private logger: Logger;
    private dailyUsage: DailyUsage = { date: "", callCount: 0, estimatedCostUsd: 0 };
    private skipCache: Map<number, number> = new Map(); // taskId → skipUntil timestamp

    // Cost estimates per call (USD) by model
    private static readonly COST_PER_CALL: Record<string, number> = {
        "gpt-4o-mini": 0.0003,
        "gpt-4o": 0.005,
        "gpt-3.5-turbo": 0.0002,
        "claude-3-haiku-20240307": 0.0003,
        "claude-3-5-sonnet-20241022": 0.003,
    };

    constructor(config: AIConfig, logger: Logger) {
        this.config = config;
        this.logger = logger;
        this.resetDailyUsage();
    }

    /**
     * Main entry point: should this task execute right now?
     * Returns { execute: true } if AI is disabled, budget exceeded, or AI says yes.
     */
    async shouldExecute(task: TaskContext, market: MarketContext): Promise<AIDecision> {
        // Fail-open: if AI is disabled, always execute
        if (!this.config.enabled) {
            return { execute: true, reason: "AI disabled — executing normally", confidence: 1 };
        }

        // Check skip cache (don't spam AI for same task)
        const skipUntil = this.skipCache.get(task.taskId);
        if (skipUntil && Date.now() < skipUntil * 1000) {
            return { execute: false, reason: "AI skip cache active", confidence: 0.8 };
        }

        // Check daily budget
        if (this.isDailyBudgetExceeded()) {
            this.log(`Daily AI budget exceeded ($${this.dailyUsage.estimatedCostUsd.toFixed(4)}/$${this.config.maxCostPerDayUsd})`);
            return { execute: true, reason: "AI budget exceeded — executing normally", confidence: 1 };
        }

        try {
            const decision = await this.queryAI(task, market);
            this.recordUsage();

            // Cache skip decisions
            if (!decision.execute && decision.skipUntil) {
                this.skipCache.set(task.taskId, decision.skipUntil);
            }

            this.log(`Task #${task.taskId} [${task.templateType}] → AI: ${decision.execute ? "✅ EXECUTE" : "⏳ SKIP"} (${(decision.confidence * 100).toFixed(0)}%) — ${decision.reason}`);
            return decision;
        } catch (err) {
            // Fail-open: if AI errors, execute normally
            this.log(`AI error for task #${task.taskId}, fail-open: executing. Error: ${err}`);
            return { execute: true, reason: "AI error — fail-open execution", confidence: 0.5 };
        }
    }

    /**
     * Query the AI provider.
     */
    private async queryAI(task: TaskContext, market: MarketContext): Promise<AIDecision> {
        const systemPrompt = TEMPLATE_PROMPTS[task.templateType] || TEMPLATE_PROMPTS.custom;

        const userMessage = `Current Market:
- EGLD: $${market.egldPrice.toFixed(2)} (${market.egldChange24h >= 0 ? "+" : ""}${market.egldChange24h.toFixed(2)}% 24h)
- BTC: $${market.btcPrice.toFixed(2)} (${market.btcChange24h >= 0 ? "+" : ""}${market.btcChange24h.toFixed(2)}% 24h)
- Timestamp: ${new Date(market.timestamp).toISOString()}

Task Details:
- Task ID: #${task.taskId}
- Template: ${task.templateType}
- Endpoint: ${task.targetEndpoint}
- Deposit: ${task.depositEgld} EGLD
- Times executed so far: ${task.executionCount}

Should this task execute NOW? Respond in this exact JSON format:
{"execute": true/false, "reason": "brief reason", "confidence": 0.0-1.0, "skipMinutes": 0}

Where "skipMinutes" is how many minutes to wait before asking again (0 means ask next cycle).`;

        if (this.config.provider === "openai") {
            return this.queryOpenAI(systemPrompt, userMessage);
        } else if (this.config.provider === "anthropic") {
            return this.queryAnthropic(systemPrompt, userMessage);
        } else {
            // Local/fallback: always execute
            return { execute: true, reason: "Local AI — default execute", confidence: 0.7 };
        }
    }

    private async queryOpenAI(system: string, user: string): Promise<AIDecision> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
            const resp = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: [
                        { role: "system", content: system },
                        { role: "user", content: user },
                    ],
                    temperature: 0.3,
                    max_tokens: 150,
                    response_format: { type: "json_object" },
                }),
                signal: controller.signal,
            });

            if (!resp.ok) {
                throw new Error(`OpenAI API error: ${resp.status}`);
            }

            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content || "{}";
            return this.parseAIResponse(content);
        } finally {
            clearTimeout(timeout);
        }
    }

    private async queryAnthropic(system: string, user: string): Promise<AIDecision> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
            const resp = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.config.apiKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model: this.config.model,
                    system: system,
                    messages: [{ role: "user", content: user }],
                    temperature: 0.3,
                    max_tokens: 150,
                }),
                signal: controller.signal,
            });

            if (!resp.ok) {
                throw new Error(`Anthropic API error: ${resp.status}`);
            }

            const data = await resp.json();
            const content = data.content?.[0]?.text || "{}";
            return this.parseAIResponse(content);
        } finally {
            clearTimeout(timeout);
        }
    }

    private parseAIResponse(raw: string): AIDecision {
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No JSON in response");

            const parsed = JSON.parse(jsonMatch[0]);
            const skipMinutes = parsed.skipMinutes || 0;

            return {
                execute: parsed.execute !== false, // default: execute
                reason: String(parsed.reason || "no reason given").slice(0, 200),
                confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
                skipUntil: skipMinutes > 0
                    ? Math.floor(Date.now() / 1000) + skipMinutes * 60
                    : undefined,
            };
        } catch {
            // If we can't parse, default to execute
            return { execute: true, reason: "AI response unparseable — default execute", confidence: 0.3 };
        }
    }

    // ── Budget Management ──

    private isDailyBudgetExceeded(): boolean {
        this.ensureDailyReset();
        return this.dailyUsage.estimatedCostUsd >= this.config.maxCostPerDayUsd;
    }

    private recordUsage(): void {
        this.ensureDailyReset();
        this.dailyUsage.callCount++;
        this.dailyUsage.estimatedCostUsd +=
            AIEvaluator.COST_PER_CALL[this.config.model] || 0.001;
    }

    private ensureDailyReset(): void {
        const today = new Date().toISOString().slice(0, 10);
        if (this.dailyUsage.date !== today) {
            this.resetDailyUsage();
        }
    }

    private resetDailyUsage(): void {
        this.dailyUsage = {
            date: new Date().toISOString().slice(0, 10),
            callCount: 0,
            estimatedCostUsd: 0,
        };
    }

    // ── Metrics ──

    getMetrics() {
        return {
            enabled: this.config.enabled,
            provider: this.config.provider,
            model: this.config.model,
            dailyCalls: this.dailyUsage.callCount,
            dailyCostUsd: this.dailyUsage.estimatedCostUsd.toFixed(4),
            budgetRemaining: (this.config.maxCostPerDayUsd - this.dailyUsage.estimatedCostUsd).toFixed(4),
            cachedSkips: this.skipCache.size,
        };
    }

    clearSkipCache(): void {
        this.skipCache.clear();
    }

    private log(msg: string): void {
        this.logger.info(`[AI] ${msg}`);
    }
}
