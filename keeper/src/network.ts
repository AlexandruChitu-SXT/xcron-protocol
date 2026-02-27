import { ApiNetworkProvider } from "@multiversx/sdk-network-providers";
import { Address } from "@multiversx/sdk-core";
import { NetworkConfig } from "./config";
import { RateLimiter } from "./rate_limiter";

/**
 * NetworkClient — wraps MultiversX API for the keeper bot.
 * Handles network queries, VM queries, and transaction broadcasting.
 */
export class NetworkClient {
    private provider: ApiNetworkProvider;
    private chainId: string;
    private rateLimiter: RateLimiter;

    constructor(config: NetworkConfig) {
        this.provider = new ApiNetworkProvider(config.apiUrl, { timeout: 15000 });
        this.chainId = config.chainId;
        this.rateLimiter = new RateLimiter(10); // 10 req/sec
    }

    getProvider(): ApiNetworkProvider {
        return this.provider;
    }

    getUrl(): string {
        return (this.provider as any).url || "https://devnet-api.multiversx.com";
    }

    getChainId(): string {
        return this.chainId;
    }

    /**
     * Get the current network time (Unix timestamp in seconds).
     * Synchronized with system clock (NTP), standard for MultiversX block timestamps.
     */
    async getCurrentTime(): Promise<number> {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * Query a smart contract view function (read-only, no gas).
     * Uses the lower-level provider.queryContract API directly.
     */
    async queryContract(
        contractAddr: string,
        func: string,
        args: Buffer[] = [],
        caller?: string
    ): Promise<Buffer[]> {
        const query: any = {
            address: new Address(contractAddr),
            func: { toString: () => func },
            getEncodedArguments: () => args.map((a) => a.toString("hex")),
        };

        if (caller) {
            query.caller = new Address(caller);
        }

        await this.rateLimiter.acquire();
        const response = await this.provider.queryContract(query as any);
        return response.getReturnDataParts().map((part: Uint8Array) => Buffer.from(part));
    }

    /**
     * Get account nonce for transaction sequencing.
     */
    async getAccountNonce(address: string): Promise<number> {
        await this.rateLimiter.acquire();
        const account = await this.provider.getAccount(new Address(address));
        return account.nonce;
    }

    /**
     * Get account balance in smallest EGLD denomination.
     */
    async getAccountBalance(address: string): Promise<bigint> {
        await this.rateLimiter.acquire();
        const account = await this.provider.getAccount(new Address(address));
        return BigInt(account.balance.toString());
    }

    /**
     * S-SHARD: Get the shard ID of an address (0, 1, 2, or 4294967295 for metachain).
     * Uses the MultiversX API /accounts/{address} which includes shard info.
     */
    async getShardOfAddress(address: string): Promise<number> {
        try {
            await this.rateLimiter.acquire();
            const account = await this.provider.getAccount(new Address(address));
            return (account as any).shard ?? 0;
        } catch {
            return 0; // Default to shard 0 if query fails
        }
    }
}
