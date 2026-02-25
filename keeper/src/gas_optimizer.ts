import { Logger } from "./logger";
import { NetworkClient } from "./network";

export class GasOptimizer {
    private logger: Logger;
    private networkClient: NetworkClient;
    private maxGasPriceThreshold: number;

    constructor(networkClient: NetworkClient, logger: Logger, maxGasPriceThreshold: number = 1000000000) {
        this.logger = logger;
        this.networkClient = networkClient;
        this.maxGasPriceThreshold = maxGasPriceThreshold; // default 1 Gwei
    }

    /**
     * AI-like Watchdog to analyze mempool congestion.
     * Returns true if execution should be delayed due to high gas prices.
     */
    async shouldDelayExecution(): Promise<boolean> {
        try {
            // We fetch natively since the specific SDK version is missing economics bindings.
            const url = `${this.networkClient.getUrl()}/network/economics`;
            const response = await fetch(url);
            const data = await response.json() as any;
            const currentMinGasPrice = data?.data?.metrics?.erd_min_gas_price || 1000000000;

            this.logger.info("GasOptimizer", `Current MinGasPrice: ${currentMinGasPrice}`);

            if (currentMinGasPrice > this.maxGasPriceThreshold) {
                this.logger.warn("GasOptimizer", `⚠️ NETWORK CONGESTION DETECTED. Gas price (${currentMinGasPrice}) exceeds threshold (${this.maxGasPriceThreshold}). Delaying execution.`);
                return true;
            }

            return false;
        } catch (err: any) {
            this.logger.error("GasOptimizer", `Failed to fetch gas economics: ${err.message}. Defaulting to safe execution.`);
            return false; // Fallback so we don't break the bot
        }
    }
}
