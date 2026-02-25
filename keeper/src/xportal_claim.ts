import * as fs from "fs";
import * as path from "path";
import {
    Transaction,
    Address,
    TransactionComputer,
} from "@multiversx/sdk-core";
import { UserSigner } from "@multiversx/sdk-wallet";
import { NetworkClient } from "./network";
import { Logger } from "./logger";

// ═══════════════════════════════════════════════════════════
//  xPortal Social Module — Mainnet Contract Addresses
// ═══════════════════════════════════════════════════════════
// Source: MultiversX API — verified on-chain
// Description: "On-chain XP system for xPortal users to earn
//              benefits as they achieve higher streaks"

const SOCIAL_MODULE_MAINNET: Record<number, string> = {
    0: "erd1qqqqqqqqqqqqqpgq8pdxqhhnp38qkezf7lcx5qww85zmph708juq48geul",  // Shard 0
    1: "erd1qqqqqqqqqqqqqpgqr7een4m5z44frr3k35yjdjcrfe6703cwdl3s3wkddz",  // Shard 1
    2: "erd1qqqqqqqqqqqqqpgqycdpxfmvxqm3cxylsyff3tkw6yhc6gwga6mqhhv6wn",  // Shard 2
};

const CLAIM_GAS_LIMIT = 5_000_000n;
const CLAIM_ENDPOINT = "claim";
const STATE_FILE = "xportal-claim-state.json";

// ═══════════════════════════════════════════════════════════

export interface XPortalClaimConfig {
    enabled: boolean;
    walletsDir: string;        // Directory containing user PEM files
    network: "mainnet" | "devnet";
}

interface ClaimState {
    [walletAddress: string]: {
        lastClaimedEpoch: number;
        lastClaimTxHash: string;
        totalClaims: number;
    };
}

/**
 * XPortal XP Auto-Claimer
 *
 * Automatically sends `claim` transactions to the xPortal Social Module
 * contracts on behalf of registered users, once per epoch.
 *
 * How it works:
 *   1. Loads all .pem files from the configured wallets directory
 *   2. For each wallet, determines the correct shard → correct Social Module contract
 *   3. Checks if the wallet has already claimed this epoch
 *   4. If not, builds a `claim` transaction, signs with the user's PEM, and broadcasts
 *   5. Tracks claim state in a JSON file to avoid double-claiming
 */
export class XPortalClaimer {
    private networkClient: NetworkClient;
    private logger: Logger;
    private config: XPortalClaimConfig;
    private state: ClaimState;
    private statePath: string;
    private chainId: string;

    constructor(
        networkClient: NetworkClient,
        config: XPortalClaimConfig,
        logger: Logger,
        chainId: string
    ) {
        this.networkClient = networkClient;
        this.config = config;
        this.logger = logger;
        this.chainId = chainId;
        this.statePath = path.join(
            path.dirname(config.walletsDir),
            STATE_FILE
        );
        this.state = this.loadState();
    }

    /**
     * Get the shard number for a given address (0, 1, or 2).
     * MultiversX uses the last byte of the address to determine the shard.
     */
    private getShardForAddress(bech32Address: string): number {
        const addr = Address.fromBech32(bech32Address);
        const pubKey = addr.getPublicKey();
        const lastByte = pubKey[pubKey.length - 1];
        // Shard = lastByte % numShards (3 for mainnet)
        return lastByte % 3;
    }

    /**
     * Get the correct Social Module contract address for a given user shard.
     */
    private getSocialModuleAddress(shard: number): string {
        const addr = SOCIAL_MODULE_MAINNET[shard];
        if (!addr) {
            throw new Error(`No Social Module contract for shard ${shard}`);
        }
        return addr;
    }

    /**
     * Load all .pem wallet files from the wallets directory.
     */
    private loadWalletPems(): { address: string; signer: UserSigner; pemFile: string }[] {
        const wallets: { address: string; signer: UserSigner; pemFile: string }[] = [];

        if (!fs.existsSync(this.config.walletsDir)) {
            this.log(`Wallets directory not found: ${this.config.walletsDir}`);
            this.log(`Create it and add .pem files to enable auto-claiming.`);
            return wallets;
        }

        const files = fs.readdirSync(this.config.walletsDir)
            .filter(f => f.endsWith(".pem"));

        for (const file of files) {
            try {
                const pemPath = path.join(this.config.walletsDir, file);
                const pemContent = fs.readFileSync(pemPath, "utf-8");
                const signer = UserSigner.fromPem(pemContent);
                const address = signer.getAddress().bech32();

                wallets.push({ address, signer, pemFile: file });
                this.log(`Loaded wallet: ${address} (${file})`);
            } catch (err: any) {
                this.log(`Failed to load PEM ${file}: ${err.message}`);
            }
        }

        return wallets;
    }

    /**
     * Send a claim transaction for a single wallet.
     */
    private async claimForWallet(
        address: string,
        signer: UserSigner
    ): Promise<{ success: boolean; txHash?: string; error?: string }> {
        try {
            const shard = this.getShardForAddress(address);
            const socialModule = this.getSocialModuleAddress(shard);

            // Get current nonce
            const nonce = await this.networkClient.getAccountNonce(address);

            // Build the claim transaction
            const tx = new Transaction({
                sender: address,
                receiver: socialModule,
                data: new TextEncoder().encode(CLAIM_ENDPOINT),
                gasLimit: CLAIM_GAS_LIMIT,
                chainID: this.chainId,
                value: 0n,
            });

            tx.nonce = BigInt(nonce);

            // Sign with user's PEM
            const txComputer = new TransactionComputer();
            const serialized = txComputer.computeBytesForSigning(tx);
            const signature = await signer.sign(serialized);
            tx.signature = signature;

            // Broadcast
            const provider = this.networkClient.getProvider();
            const txHash = await provider.sendTransaction(tx);

            this.log(`✅ Claim sent for ${address.slice(0, 16)}... → tx: ${txHash}`);

            return { success: true, txHash };
        } catch (err: any) {
            this.log(`❌ Claim failed for ${address.slice(0, 16)}...: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Run a full claim cycle for all registered wallets.
     * Only claims if the wallet hasn't claimed in the current epoch.
     */
    async runClaimCycle(currentEpoch: number): Promise<{
        attempted: number;
        succeeded: number;
        skipped: number;
        failed: number;
    }> {
        const stats = { attempted: 0, succeeded: 0, skipped: 0, failed: 0 };

        if (!this.config.enabled) {
            return stats;
        }

        const wallets = this.loadWalletPems();
        if (wallets.length === 0) {
            return stats;
        }

        this.log(`═══ xPortal XP Claim Cycle — Epoch ${currentEpoch} ═══`);
        this.log(`Wallets registered: ${wallets.length}`);

        for (const wallet of wallets) {
            const walletState = this.state[wallet.address];

            // Skip if already claimed this epoch
            if (walletState && walletState.lastClaimedEpoch >= currentEpoch) {
                this.log(`⏭️  ${wallet.pemFile} — already claimed epoch ${currentEpoch}`);
                stats.skipped++;
                continue;
            }

            stats.attempted++;
            const result = await this.claimForWallet(wallet.address, wallet.signer);

            if (result.success) {
                // Update state
                this.state[wallet.address] = {
                    lastClaimedEpoch: currentEpoch,
                    lastClaimTxHash: result.txHash || "",
                    totalClaims: (walletState?.totalClaims || 0) + 1,
                };
                this.saveState();
                stats.succeeded++;
            } else {
                stats.failed++;
            }

            // Small delay between wallets to avoid rate limiting
            await new Promise(r => setTimeout(r, 1500));
        }

        this.log(`═══ Claim Results: ${stats.succeeded}/${stats.attempted} OK, ${stats.skipped} skipped, ${stats.failed} failed ═══`);
        return stats;
    }

    /**
     * Get the current epoch from the network.
     */
    async getCurrentEpoch(): Promise<number> {
        const provider = this.networkClient.getProvider();
        const status = await provider.getNetworkStatus();
        return status.EpochNumber;
    }

    /**
     * Check if a new epoch has started since last claim cycle.
     */
    hasNewEpoch(currentEpoch: number): boolean {
        // Check if any wallet hasn't been claimed for this epoch
        const walletAddresses = Object.keys(this.state);
        if (walletAddresses.length === 0) return true; // First run

        return walletAddresses.some(
            addr => (this.state[addr]?.lastClaimedEpoch || 0) < currentEpoch
        );
    }

    // ── State persistence ─────────────────────────────────

    private loadState(): ClaimState {
        try {
            if (fs.existsSync(this.statePath)) {
                return JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
            }
        } catch {
            this.log("Could not load claim state, starting fresh.");
        }
        return {};
    }

    private saveState(): void {
        try {
            fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
        } catch (err: any) {
            this.log(`Failed to save claim state: ${err.message}`);
        }
    }

    /**
     * Get a summary of all tracked wallets and their claim status.
     */
    getSummary(): string {
        const entries = Object.entries(this.state);
        if (entries.length === 0) return "No wallets tracked";

        return entries.map(([addr, s]) =>
            `${addr.slice(0, 16)}... epoch:${s.lastClaimedEpoch} total:${s.totalClaims}`
        ).join(" | ");
    }

    private log(msg: string): void {
        this.logger.info("XPortalClaim", msg);
    }
}
