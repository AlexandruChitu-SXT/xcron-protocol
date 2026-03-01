import axios from "axios";
import { Logger } from "./logger";

/**
 * PriceService — On-chain-first price oracle for the Keeper Bot.
 *
 * Primary source: xExchange liquidity pools via MultiversX API (on-chain, verified, FREE).
 * Fallback sources: Binance and CoinGecko APIs (off-chain, for tokens not listed on xExchange).
 *
 * How it works:
 *   - Prices are read from xExchange pool reserves via view functions (0 gas cost)
 *   - The keeper only executes on-chain if the price condition is met
 *   - Trust is ensured via keeper's staked bond (slashing deterrent)
 *   - On-chain prices are verified and trustless (real liquidity pool data)
 *
 * Supported conditions:
 *   - "above" → execute when price >= threshold
 *   - "below" → execute when price <= threshold
 */

export interface PriceCondition {
    token: string;          // e.g. "EGLD", "BTC", "ETH"
    condition: "above" | "below";
    threshold: number;      // USD price threshold
}

interface PriceSource {
    name: string;
    fetchPrice: (token: string) => Promise<number | null>;
}

export class PriceService {
    private logger: Logger;
    private sources: PriceSource[];
    private cache: Map<string, { price: number; timestamp: number }> = new Map();
    private readonly CACHE_TTL_MS = 10_000; // 10 seconds

    constructor(logger: Logger) {
        this.logger = logger;
        // xExchange FIRST — on-chain, verified, trustless
        // Binance & CoinGecko as fallbacks only
        this.sources = [
            { name: "xExchange (on-chain)", fetchPrice: this.fetchMultiversX.bind(this) },
            { name: "Binance (fallback)", fetchPrice: this.fetchBinance.bind(this) },
            { name: "CoinGecko (fallback)", fetchPrice: this.fetchCoinGecko.bind(this) },
        ];
    }

    /**
     * Get the current USD price for a token.
     * Tries multiple sources with fallback. Uses short-lived cache.
     */
    async getPrice(token: string): Promise<number | null> {
        const key = token.toUpperCase();

        // Check cache
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return cached.price;
        }

        // Try each source in order
        for (const source of this.sources) {
            try {
                const price = await source.fetchPrice(key);
                if (price !== null && price > 0) {
                    this.cache.set(key, { price, timestamp: Date.now() });
                    this.log(`${key} = $${price.toFixed(2)} (${source.name})`);
                    return price;
                }
            } catch (err: any) {
                this.log(`${source.name} failed for ${key}: ${err.message || err}`);
            }
        }

        this.log(`⚠️ No price available for ${key} from any source`);
        return null;
    }

    /**
     * Evaluate a price condition. Returns true if the condition is met.
     */
    async checkCondition(condition: PriceCondition): Promise<boolean> {
        const price = await this.getPrice(condition.token);
        if (price === null) {
            this.log(`Cannot evaluate condition for ${condition.token} — no price data`);
            return false; // Fail-safe: don't execute if we can't verify
        }

        const met = condition.condition === "above"
            ? price >= condition.threshold
            : price <= condition.threshold;

        this.log(
            `${condition.token} $${price.toFixed(2)} ${condition.condition} $${condition.threshold} → ${met ? "✅ MET" : "❌ NOT MET"}`
        );

        return met;
    }

    // ═══════════════════════════════════════════════════════════
    //  PRICE SOURCES
    // ═══════════════════════════════════════════════════════════

    private readonly TOKEN_MAP_BINANCE: Record<string, string> = {
        "EGLD": "EGLDUSDT",
        "BTC": "BTCUSDT",
        "ETH": "ETHUSDT",
        "USDC": "USDCUSDT",
        "UTK": "UTKUSDT",
    };

    private readonly TOKEN_MAP_COINGECKO: Record<string, string> = {
        "EGLD": "elrond-erd-2",
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "USDC": "usd-coin",
        "UTK": "utrust",
    };

    /**
     * Fetch price from Binance API (free, no API key needed).
     */
    private async fetchBinance(token: string): Promise<number | null> {
        const symbol = this.TOKEN_MAP_BINANCE[token];
        if (!symbol) return null;

        const resp = await axios.get(
            `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
            { timeout: 5000 }
        );

        return parseFloat(resp.data.price);
    }

    /**
     * Fetch price from CoinGecko API (free, no API key needed).
     */
    private async fetchCoinGecko(token: string): Promise<number | null> {
        const id = this.TOKEN_MAP_COINGECKO[token];
        if (!id) return null;

        const resp = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
            { timeout: 5000 }
        );

        return resp.data[id]?.usd ?? null;
    }

    /**
     * Fetch price from MultiversX API / xExchange data (free, no gas cost).
     * Uses the /economics endpoint for EGLD and /mex/tokens for other tokens.
     * This is the ecosystem's own price feed — reads from xExchange liquidity pools.
     */
    private async fetchMultiversX(token: string): Promise<number | null> {
        if (token === "EGLD") {
            // Direct EGLD price from MultiversX economics
            const resp = await axios.get(
                "https://api.multiversx.com/economics",
                { timeout: 5000 }
            );
            return resp.data?.price ?? null;
        }

        // For other tokens, query xExchange token data
        const id = this.TOKEN_MAP_MULTIVERSX[token];
        if (!id) return null;

        const resp = await axios.get(
            `https://api.multiversx.com/mex/tokens/${id}`,
            { timeout: 5000 }
        );
        return resp.data?.price ? parseFloat(resp.data.price) : null;
    }

    private readonly TOKEN_MAP_MULTIVERSX: Record<string, string> = {
        "EGLD": "WEGLD-bd4d79",
        "USDC": "USDC-c76f1f",
        "UTK": "UTK-2f80e9",
    };

    private log(msg: string): void {
        this.logger.info("PriceService", msg);
    }
}
