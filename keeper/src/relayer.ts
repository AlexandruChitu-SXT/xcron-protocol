import {
    Transaction,
    TransactionComputer,
    Address,
} from "@multiversx/sdk-core";
import { UserSigner } from "@multiversx/sdk-wallet";
import { NetworkClient } from "./network";
import { Logger } from "./logger";

/**
 * RelayerService — Relayed V3 gasless execution for XCron.
 *
 * Allows users to create tasks without paying gas.
 * The keeper signs as relayer and pays the gas on their behalf.
 *
 * Flow:
 *   1. User builds a scheduleTask transaction and signs it
 *   2. User sends the signed transaction JSON to POST /relay
 *   3. Keeper adds relayer + relayerSignature fields
 *   4. Keeper broadcasts the relayed transaction
 *   5. Gas is charged to the keeper (relayer), not the user
 *
 * Security:
 *   - Only whitelisted functions are relayed (scheduleTask, cancelTask)
 *   - Gas limit is capped to prevent abuse
 *   - Rate limiting per sender address
 */

const RELAYABLE_FUNCTIONS = ["scheduleTask", "cancelTask"];
const MAX_GAS_LIMIT = BigInt(60_000_000);
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_RELAYS_PER_WINDOW = 5;

interface RelayRequest {
    /** The user-signed transaction as JSON */
    transaction: {
        sender: string;
        receiver: string;
        value: string;
        gasLimit: number;
        data: string; // base64 encoded
        nonce: number;
        chainID: string;
        version: number;
        signature: string;
    };
}

interface RelayResult {
    success: boolean;
    txHash?: string;
    error?: string;
}

export class RelayerService {
    private signer: UserSigner;
    private keeperAddress: Address;
    private networkClient: NetworkClient;
    private logger: Logger;
    private schedulerAddress: string;

    // Rate limiting: sender -> timestamps of recent relays
    private relayHistory: Map<string, number[]> = new Map();

    constructor(
        signer: UserSigner,
        keeperAddress: Address,
        networkClient: NetworkClient,
        logger: Logger,
        schedulerAddress: string
    ) {
        this.signer = signer;
        this.keeperAddress = keeperAddress;
        this.networkClient = networkClient;
        this.logger = logger;
        this.schedulerAddress = schedulerAddress;
    }

    /**
     * Relay a user-signed transaction as a Relayed V3 transaction.
     * The keeper pays the gas, the user pays 0 gas.
     */
    async relay(request: RelayRequest): Promise<RelayResult> {
        try {
            const userTx = request.transaction;

            // ── Validation ──

            // 1. Receiver must be the scheduler contract
            if (userTx.receiver !== this.schedulerAddress) {
                return { success: false, error: "Only scheduler contract transactions can be relayed" };
            }

            // 2. Decode data field and check function name
            const dataDecoded = Buffer.from(userTx.data, "base64").toString("utf-8");
            const functionName = dataDecoded.split("@")[0];
            if (!RELAYABLE_FUNCTIONS.includes(functionName)) {
                return { success: false, error: `Function '${functionName}' is not relayable. Allowed: ${RELAYABLE_FUNCTIONS.join(", ")}` };
            }

            // 3. Gas limit cap
            if (BigInt(userTx.gasLimit) > MAX_GAS_LIMIT) {
                return { success: false, error: `Gas limit ${userTx.gasLimit} exceeds max ${MAX_GAS_LIMIT}` };
            }

            // 4. Rate limiting per sender
            if (!this.checkRateLimit(userTx.sender)) {
                return { success: false, error: `Rate limit exceeded. Max ${MAX_RELAYS_PER_WINDOW} relays per minute` };
            }

            // 5. Chain ID must match
            if (userTx.chainID !== this.networkClient.getChainId()) {
                return { success: false, error: `Chain ID mismatch: expected ${this.networkClient.getChainId()}, got ${userTx.chainID}` };
            }

            // ── Build Relayed V3 Transaction ──

            // Extra base cost for relayed transactions (50,000 gas)
            const RELAYED_EXTRA_GAS = BigInt(50_000);
            const totalGas = BigInt(userTx.gasLimit) + RELAYED_EXTRA_GAS;

            const tx = new Transaction({
                sender: userTx.sender,
                receiver: userTx.receiver,
                data: Buffer.from(userTx.data, "base64"),
                gasLimit: totalGas,
                chainID: userTx.chainID,
                value: BigInt(userTx.value || "0"),
                version: 2,
                relayer: Address.newFromBech32(this.keeperAddress.bech32()),
            });

            tx.nonce = BigInt(userTx.nonce);

            // User's original signature
            tx.signature = Buffer.from(userTx.signature, "hex");

            // Keeper signs as relayer
            const txComputer = new TransactionComputer();
            const bytesForRelayer = txComputer.computeBytesForSigning(tx);
            const relayerSig = await this.signer.sign(bytesForRelayer);
            tx.relayerSignature = relayerSig;

            // Broadcast
            const provider = this.networkClient.getProvider();
            const txHash = await provider.sendTransaction(tx);

            this.logger.info("Relayer", `Relayed tx for ${userTx.sender.slice(0, 16)}... → ${txHash}`);

            // Track for rate limiting
            this.trackRelay(userTx.sender);

            return { success: true, txHash };
        } catch (err: any) {
            this.logger.warn("Relayer", `Error: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Check if a sender is within rate limits.
     */
    private checkRateLimit(sender: string): boolean {
        const now = Date.now();
        const history = this.relayHistory.get(sender) || [];
        const recent = history.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
        return recent.length < MAX_RELAYS_PER_WINDOW;
    }

    /**
     * Track a relay for rate limiting.
     */
    private trackRelay(sender: string): void {
        const now = Date.now();
        const history = this.relayHistory.get(sender) || [];
        // Clean old entries and add new
        const recent = history.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
        recent.push(now);
        this.relayHistory.set(sender, recent);
    }

    /**
     * Get relay stats for the dashboard.
     */
    getStats(): { totalSenders: number; activeWindow: number } {
        const now = Date.now();
        let activeWindow = 0;
        for (const [, history] of this.relayHistory) {
            activeWindow += history.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS).length;
        }
        return { totalSenders: this.relayHistory.size, activeWindow };
    }
}
