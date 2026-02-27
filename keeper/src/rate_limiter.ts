/**
 * RateLimiter — Token-bucket rate limiter for API calls.
 * 
 * Prevents the keeper bot from spamming the MultiversX API.
 * Default: 10 requests per second (configurable).
 */
export class RateLimiter {
    private tokens: number;
    private maxTokens: number;
    private refillRate: number; // tokens per ms
    private lastRefill: number;

    /**
     * @param maxPerSecond Maximum requests per second
     */
    constructor(maxPerSecond: number = 10) {
        this.maxTokens = maxPerSecond;
        this.tokens = maxPerSecond;
        this.refillRate = maxPerSecond / 1000;
        this.lastRefill = Date.now();
    }

    private refill(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;
    }

    /**
     * Wait until a token is available, then consume it.
     * Returns immediately if tokens are available.
     */
    async acquire(): Promise<void> {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }
        // Wait for next token
        const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
        await new Promise(r => setTimeout(r, waitMs));
        this.refill();
        this.tokens -= 1;
    }

    /**
     * Try to acquire a token without waiting.
     * @returns true if acquired, false if rate limited
     */
    tryAcquire(): boolean {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }
        return false;
    }

    /** Current available tokens */
    getAvailable(): number {
        this.refill();
        return Math.floor(this.tokens);
    }
}
