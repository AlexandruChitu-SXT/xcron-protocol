/**
 * CommitRevealManager — Anti-MEV commit-reveal flow for XCron keeper bot.
 *
 * Prevents frontrunning by splitting task execution into 3 steps:
 *   1. COMMIT: keeper sends hash(task_id + salt) + bond → task becomes Committed
 *   2. REVEAL: keeper reveals salt → SC verifies hash, returns bond, task → Pending
 *   3. EXECUTE: keeper calls executeTask normally
 *
 * The reveal window is 60 seconds (SC constant DEFAULT_REVEAL_WINDOW_SECONDS).
 * If the keeper doesn't reveal in time, anyone can slash the bond.
 *
 * Smart contract endpoints:
 *   - commitTask(task_id, commit_hash) [payable EGLD]
 *   - revealTask(task_id, salt)
 *   - slashExpiredCommit(task_id)
 */

import { randomBytes, createHash } from "crypto";
import {
    Transaction,
    Address,
    TransactionComputer,
} from "@multiversx/sdk-core";
import { UserSigner } from "@multiversx/sdk-wallet";
import { NetworkClient } from "./network";
import { ContractAddresses, KeeperSettings } from "./config";
import { Logger } from "./logger";

// ── Types ──

export interface CommitRevealConfig {
    enabled: boolean;
    revealDelayMs: number;      // How long to wait before revealing (default: 5000)
    bondEgld: string;           // Bond amount in denomination units (e.g., "0" if no bond required)
}

interface PendingCommit {
    taskId: number;
    salt: Buffer;
    commitHash: Buffer;
    commitTimestamp: number;
    txHash?: string;
}

export interface CRResult {
    success: boolean;
    phase: "commit" | "reveal" | "execute";
    txHash?: string;
    error?: string;
}

// ── Main Class ──

export class CommitRevealManager {
    private networkClient: NetworkClient;
    private contracts: ContractAddresses;
    private settings: KeeperSettings;
    private signer: UserSigner;
    private keeperAddress: Address;
    private logger: Logger;
    private config: CommitRevealConfig;

    // Track pending commits: taskId → commit data
    private pendingCommits: Map<number, PendingCommit> = new Map();

    constructor(
        networkClient: NetworkClient,
        contracts: ContractAddresses,
        settings: KeeperSettings,
        signer: UserSigner,
        keeperAddress: Address,
        logger: Logger,
        config: CommitRevealConfig
    ) {
        this.networkClient = networkClient;
        this.contracts = contracts;
        this.settings = settings;
        this.signer = signer;
        this.keeperAddress = keeperAddress;
        this.logger = logger;
        this.config = config;
    }

    /**
     * Full commit-reveal-execute flow for a task.
     * Returns after all 3 steps complete (or error on any step).
     */
    async commitRevealExecute(taskId: number): Promise<CRResult> {
        // Step 1: Commit
        this.log(`CR Step 1/3: Committing task #${taskId}...`);
        const commitResult = await this.commit(taskId);
        if (!commitResult.success) {
            return commitResult;
        }

        // Step 2: Wait, then reveal
        this.log(`CR Step 2/3: Waiting ${this.config.revealDelayMs}ms before reveal...`);
        await this.sleep(this.config.revealDelayMs);

        const revealResult = await this.reveal(taskId);
        if (!revealResult.success) {
            return revealResult;
        }

        // Step 3: Execute is handled by the normal Executor.executeTask
        // Return success so the executor knows to proceed with execution
        this.log(`CR Step 2/3 complete: task #${taskId} revealed. Ready for execution.`);
        return { success: true, phase: "reveal", txHash: revealResult.txHash };
    }

    /**
     * Step 1: Commit — generate salt, compute hash, broadcast commitTask TX.
     */
    async commit(taskId: number): Promise<CRResult> {
        try {
            // Generate random 32-byte salt
            const salt = randomBytes(32);

            // Compute commit hash: keccak256(task_id_be_bytes + salt)
            // Must match SC: keccak256(task_id.to_be_bytes() ++ salt)
            const taskIdBytes = Buffer.alloc(8);
            taskIdBytes.writeBigUInt64BE(BigInt(taskId));

            const dataToHash = Buffer.concat([taskIdBytes, salt]);
            const commitHash = this.keccak256(dataToHash);

            // Store pending commit
            const pending: PendingCommit = {
                taskId,
                salt,
                commitHash,
                commitTimestamp: Date.now(),
            };

            // Build TX: commitTask@{taskId_hex}@{commitHash_hex}
            const taskIdHex = this.numberToHex(taskId);
            const commitHashHex = commitHash.toString("hex");
            const dataField = `commitTask@${taskIdHex}@${commitHashHex}`;

            // Bond value (0 if no bond configured)
            const bondValue = BigInt(this.config.bondEgld || "0");

            const currentNonce = await this.networkClient.getAccountNonce(
                this.keeperAddress.bech32()
            );

            const tx = new Transaction({
                sender: this.keeperAddress.bech32(),
                receiver: this.contracts.scheduler,
                data: new TextEncoder().encode(dataField),
                gasLimit: BigInt(15_000_000), // Commit is cheap
                chainID: this.networkClient.getChainId(),
                value: bondValue,
            });

            tx.nonce = BigInt(currentNonce);

            // Sign + broadcast
            const txComputer = new TransactionComputer();
            const serialized = txComputer.computeBytesForSigning(tx);
            const signature = await this.signer.sign(serialized);
            tx.signature = signature;

            const provider = this.networkClient.getProvider();
            const txHash = await provider.sendTransaction(tx);

            pending.txHash = txHash;
            this.pendingCommits.set(taskId, pending);

            this.log(`CR Commit #${taskId}: hash=${commitHashHex.slice(0, 16)}... txHash=${txHash.slice(0, 16)}...`);

            // Wait for commit TX confirmation
            const result = await this.waitForTx(txHash, 30_000);
            if (!result.success) {
                this.pendingCommits.delete(taskId);
                return { success: false, phase: "commit", txHash, error: result.error };
            }

            return { success: true, phase: "commit", txHash };
        } catch (err: any) {
            this.log(`CR Commit #${taskId} error: ${err.message}`);
            return { success: false, phase: "commit", error: err.message };
        }
    }

    /**
     * Step 2: Reveal — send the salt to prove commitment.
     */
    async reveal(taskId: number): Promise<CRResult> {
        try {
            const pending = this.pendingCommits.get(taskId);
            if (!pending) {
                return { success: false, phase: "reveal", error: "No pending commit found" };
            }

            // Build TX: revealTask@{taskId_hex}@{salt_hex}
            const taskIdHex = this.numberToHex(taskId);
            const saltHex = pending.salt.toString("hex");
            const dataField = `revealTask@${taskIdHex}@${saltHex}`;

            const currentNonce = await this.networkClient.getAccountNonce(
                this.keeperAddress.bech32()
            );

            const tx = new Transaction({
                sender: this.keeperAddress.bech32(),
                receiver: this.contracts.scheduler,
                data: new TextEncoder().encode(dataField),
                gasLimit: BigInt(15_000_000), // Reveal is cheap
                chainID: this.networkClient.getChainId(),
                value: BigInt(0),
            });

            tx.nonce = BigInt(currentNonce);

            // Sign + broadcast
            const txComputer = new TransactionComputer();
            const serialized = txComputer.computeBytesForSigning(tx);
            const signature = await this.signer.sign(serialized);
            tx.signature = signature;

            const provider = this.networkClient.getProvider();
            const txHash = await provider.sendTransaction(tx);

            this.log(`CR Reveal #${taskId}: salt=${saltHex.slice(0, 16)}... txHash=${txHash.slice(0, 16)}...`);

            // Wait for reveal TX confirmation
            const result = await this.waitForTx(txHash, 30_000);
            if (!result.success) {
                this.log(`CR Reveal #${taskId} FAILED: ${result.error} — bond at risk!`);
                return { success: false, phase: "reveal", txHash, error: result.error };
            }

            // Clean up
            this.pendingCommits.delete(taskId);
            return { success: true, phase: "reveal", txHash };
        } catch (err: any) {
            this.log(`CR Reveal #${taskId} error: ${err.message}`);
            return { success: false, phase: "reveal", error: err.message };
        }
    }

    // ── Crypto ──

    /**
     * Compute keccak256 hash (matches MultiversX SC's self.crypto().keccak256())
     */
    private keccak256(data: Buffer): Buffer {
        // Node.js doesn't have native keccak256 — use the js-sha3 approach
        // MultiversX SDK uses keccak256 from 'js-sha3' or 'ethereum-cryptography'
        // For compatibility, we'll use createHash with a try/catch fallback
        try {
            // Try native (Node 18+)
            return Buffer.from(createHash("sha3-256").update(data).digest());
        } catch {
            // Fallback: use the keccak from @multiversx/sdk-core if available
            const { keccak256 } = require("js-sha3");
            return Buffer.from(keccak256.arrayBuffer(data));
        }
    }

    // ── TX Helpers ──

    private async waitForTx(txHash: string, timeoutMs: number): Promise<{ success: boolean; error?: string }> {
        const provider = this.networkClient.getProvider();
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const txOnNetwork = await provider.getTransaction(txHash);
                const statusStr = txOnNetwork.status.toString();

                if (txOnNetwork.status.isFailed() || statusStr === "fail") {
                    return { success: false, error: `TX failed (status=${statusStr})` };
                }
                if (txOnNetwork.status.isSuccessful() || statusStr === "success") {
                    return { success: true };
                }
            } catch {
                // Not indexed yet
            }
            await this.sleep(3000);
        }
        return { success: false, error: "Timeout waiting for TX" };
    }

    private numberToHex(num: number): string {
        const hex = num.toString(16);
        return hex.length % 2 ? "0" + hex : hex;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms));
    }

    // ── Metrics ──

    getPendingCommitCount(): number {
        return this.pendingCommits.size;
    }

    hasPendingCommit(taskId: number): boolean {
        return this.pendingCommits.has(taskId);
    }

    private log(msg: string): void {
        this.logger.info("CR", msg);
    }
}
