import {
    Transaction,
    Address,
    TransactionComputer,
} from "@multiversx/sdk-core";
import { UserSigner } from "@multiversx/sdk-wallet";
import { NetworkClient } from "./network";
import { MonitoredTask } from "./monitor";
import { ContractAddresses, KeeperSettings } from "./config";
import { Logger } from "./logger";
import { GasOptimizer } from "./gas_optimizer";
import { AIEvaluator, AIDecision, MarketContext, TaskContext } from "./ai_evaluator";

export interface ExecutionResult {
    taskId: number;
    success: boolean;
    txHash?: string;
    error?: string;
    delayedDueToGas?: boolean;
    skippedByAI?: boolean;
    permanent?: boolean; // True if error is unrecoverable (wrong endpoint, contract not found)
}

/**
 * Executor — signs and sends executeTask transactions on behalf of the keeper.
 *
 * Phase 1 flow (direct execution, no commit-reveal):
 *   1. Build transaction calling executeTask(task_id)
 *   2. Sign with keeper's PEM wallet
 *   3. Broadcast to network
 *   4. Track result
 */
export class Executor {
    private networkClient: NetworkClient;
    private contracts: ContractAddresses;
    private settings: KeeperSettings;
    private signer: UserSigner;
    private keeperAddress: Address;
    private logger: Logger;
    private gasOptimizer: GasOptimizer;

    // Permanent error patterns — these will NEVER succeed on retry
    private static readonly PERMANENT_ERRORS = [
        "invalid function",
        "not found",
        "wrong number of arguments",
        "cannot target self",
        "cannot target registry",
        "cannot target rewards",
        "Deposit below minimum",
        "max_gas too low",
        "TTL too short",
        "not a payable",
        // S-1: Security rules
        "S-1: Cannot target scheduler itself",
        "S-1: Cannot target KeeperRegistry",
        "S-1: Cannot target Rewards contract",
        "S-1: Target contract is blacklisted",
        "S-1: Dangerous endpoint blocked",
        // S-8: Deposit cap
        "S-8: Deposit exceeds maximum execution value",
        // S-9: Rate limiting
        "S-9: Too many active tasks",
    ];

    constructor(
        networkClient: NetworkClient,
        contracts: ContractAddresses,
        settings: KeeperSettings,
        signer: UserSigner,
        keeperAddress: Address,
        logger: Logger
    ) {
        this.networkClient = networkClient;
        this.contracts = contracts;
        this.settings = settings;
        this.signer = signer;
        this.keeperAddress = keeperAddress;
        this.logger = logger;
        this.gasOptimizer = new GasOptimizer(networkClient, logger);
    }

    // ── AI Evaluator (optional) ──
    private aiEvaluator?: AIEvaluator;
    private marketContext?: MarketContext;

    setAIEvaluator(evaluator: AIEvaluator): void {
        this.aiEvaluator = evaluator;
    }

    updateMarketContext(ctx: MarketContext): void {
        this.marketContext = ctx;
    }

    /**
     * Execute a ripe task by calling the Scheduler's executeTask endpoint.
     */
    async executeTask(task: MonitoredTask): Promise<ExecutionResult> {
        try {
            this.log(`Executing task #${task.id}...`);

            // S-DRY: Dry-run simulation — test execution via vm-query before spending gas
            const dryRunResult = await this.dryRunSimulation(task.id);
            if (!dryRunResult.ok) {
                this.log(`Task #${task.id} FAILED dry-run: ${dryRunResult.error}`);
                return {
                    taskId: task.id,
                    success: false,
                    error: `Dry-run failed: ${dryRunResult.error}`,
                    permanent: this.isPermanentError(dryRunResult.error || ""),
                };
            }
            this.log(`Task #${task.id} dry-run OK — proceeding with real execution`);

            // AI Gate: if AI evaluator is configured, ask it before executing
            if (this.aiEvaluator && task.aiEnabled && this.marketContext) {
                const taskCtx: TaskContext = {
                    taskId: task.id,
                    templateType: task.aiTemplateType || "custom",
                    targetEndpoint: task.targetEndpoint,
                    targetContract: task.targetContract,
                    depositEgld: (Number(task.depositEgld) / 1e18).toFixed(4),
                    executionCount: 0,
                };
                const aiDecision = await this.aiEvaluator.shouldExecute(taskCtx, this.marketContext);
                if (!aiDecision.execute) {
                    return {
                        taskId: task.id,
                        success: false,
                        skippedByAI: true,
                        error: `AI skip: ${aiDecision.reason} (${(aiDecision.confidence * 100).toFixed(0)}% confidence)`,
                    };
                }
            }

            // AI-Feature: Fee/Volatility Watchdog
            const isCongested = await this.gasOptimizer.shouldDelayExecution();
            if (isCongested) {
                return {
                    taskId: task.id,
                    success: false,
                    delayedDueToGas: true,
                    error: "Delayed due to AI Gas Optimization (Mempool Congestion)"
                };
            }

            // Always fetch fresh nonce from chain (no pre-increment fragility)
            const currentNonce = await this.networkClient.getAccountNonce(
                this.keeperAddress.bech32()
            );

            // Build the data field manually: executeTask@{taskId_hex}
            const taskIdHex = this.numberToHex(task.id);
            const dataField = `executeTask@${taskIdHex}`;

            const tx = new Transaction({
                sender: this.keeperAddress.bech32(),
                receiver: this.contracts.scheduler,
                data: new TextEncoder().encode(dataField),
                gasLimit: BigInt(this.settings.maxGasPerExecution),
                chainID: this.networkClient.getChainId(),
                value: BigInt(0),
            });

            tx.nonce = BigInt(currentNonce);

            // Sign
            const txComputer = new TransactionComputer();
            const serialized = txComputer.computeBytesForSigning(tx);
            const signature = await this.signer.sign(serialized);
            tx.signature = signature;

            // Broadcast
            const provider = this.networkClient.getProvider();
            const txHash = await provider.sendTransaction(tx);

            this.log(`Task #${task.id} broadcasted: ${txHash}`);

            // Wait for result (with timeout)
            const result = await this.waitForCompletion(txHash, 60_000);

            return {
                taskId: task.id,
                success: result.success,
                txHash: txHash,
                error: result.error,
                permanent: result.permanent,
            };
        } catch (err: any) {
            this.log(`Task #${task.id} execution error: ${err.message}`);

            return {
                taskId: task.id,
                success: false,
                error: err.message,
                permanent: false, // Network errors are transient
            };
        }
    }

    /**
     * Wait for a transaction to complete or timeout.
     */
    private async waitForCompletion(
        txHash: string,
        timeoutMs: number
    ): Promise<{ success: boolean; error?: string; permanent?: boolean }> {
        const provider = this.networkClient.getProvider();
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const txOnNetwork = await provider.getTransaction(txHash);
                const statusStr = txOnNetwork.status.toString();

                if (txOnNetwork.status.isFailed() || statusStr === "fail") {
                    // Extract error from SC events for classification
                    const scError = this.extractScError(txOnNetwork);
                    const isPermanent = this.isPermanentError(scError || "");
                    const errorMsg = scError || `Transaction failed on-chain (status=${statusStr})`;

                    this.log(`Task tx ${txHash.slice(0, 16)}... FAILED: ${errorMsg}${isPermanent ? " [PERMANENT]" : " [TRANSIENT]"}`);
                    return {
                        success: false,
                        error: errorMsg,
                        permanent: isPermanent,
                    };
                }
                if (txOnNetwork.status.isInvalid()) {
                    this.log(`Task tx ${txHash.slice(0, 16)}... INVALID (status=${statusStr})`);
                    return {
                        success: false,
                        error: `Transaction invalid (status=${statusStr})`,
                        permanent: false,
                    };
                }
                if (txOnNetwork.status.isSuccessful() || statusStr === "success") {
                    // Verify no signalError in SC results
                    const scError = this.extractScError(txOnNetwork);
                    if (scError) {
                        const isPermanent = this.isPermanentError(scError);
                        this.log(`Task tx ${txHash.slice(0, 16)}... TX SUCCESS but SC FAILED: ${scError}${isPermanent ? " [PERMANENT]" : ""}`);
                        return {
                            success: false,
                            error: `SC execution failed: ${scError}`,
                            permanent: isPermanent,
                        };
                    }

                    // Double-check: wait 3s and re-verify
                    await this.sleep(3000);
                    const recheck = await provider.getTransaction(txHash);
                    const recheckStatus = recheck.status.toString();
                    if (recheckStatus === "fail" || recheck.status.isFailed()) {
                        const recheckError = this.extractScError(recheck);
                        this.log(`Task tx ${txHash.slice(0, 16)}... REVERTED to FAIL after re-check`);
                        return {
                            success: false,
                            error: recheckError || `Transaction reverted to failed`,
                            permanent: this.isPermanentError(recheckError || ""),
                        };
                    }

                    this.log(`Task tx ${txHash.slice(0, 16)}... CONFIRMED SUCCESS (status=${recheckStatus})`);
                    return { success: true };
                }
            } catch {
                // Transaction might not be indexed yet — keep polling
            }

            await this.sleep(3000);
        }

        return { success: false, error: "Timeout waiting for transaction", permanent: false };
    }

    /**
     * Extract error message from smart contract events (signalError, internalVMErrors).
     */
    private extractScError(txOnNetwork: any): string | null {
        try {
            const logs = txOnNetwork.logs || txOnNetwork.contractResults?.items?.[0]?.logs;
            if (!logs?.events) return null;

            let vmError: string | null = null;

            for (const event of logs.events) {
                if (event.identifier === "signalError" && event.topics?.length >= 2) {
                    // Topic[1] is the error message (base64 encoded)
                    const errorB64 = event.topics[1];
                    const decoded = Buffer.from(errorB64, "base64").toString("utf-8");
                    // Validate: only use if it's readable text (not raw address bytes)
                    if (decoded.length > 0 && /^[\x20-\x7E]+$/.test(decoded)) {
                        return decoded;
                    }
                }
                if (event.identifier === "internalVMErrors" && event.data) {
                    const decoded = Buffer.from(event.data, "base64").toString("utf-8");
                    // Extract the last bracketed message (most specific error)
                    const matches = decoded.match(/\[([^\]]+)\]/g);
                    if (matches && matches.length > 0) {
                        const last = matches[matches.length - 1];
                        vmError = last.slice(1, -1); // Remove brackets
                    } else {
                        vmError = decoded.slice(0, 100);
                    }
                }
            }

            return vmError;
        } catch {
            // Parsing failed — not critical
        }
        return null;
    }

    /**
     * Classify an error as permanent (unrecoverable) or transient.
     * Permanent errors will trigger immediate blacklisting.
     */
    private isPermanentError(error: string): boolean {
        const lower = error.toLowerCase();
        return Executor.PERMANENT_ERRORS.some(pattern => lower.includes(pattern.toLowerCase()));
    }

    /**
     * Re-sync nonce from chain (no-op now — always fetches fresh nonce per tx).
     */
    async resyncNonce(): Promise<void> {
        const nonce = await this.networkClient.getAccountNonce(
            this.keeperAddress.bech32()
        );
        this.log(`Nonce verified: ${nonce}`);
    }

    private numberToHex(num: number): string {
        const hex = num.toString(16);
        return hex.length % 2 ? "0" + hex : hex;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * S-DRY: Dry-run simulation — test executeTask via vm-query (gas-free).
     * Returns { ok: true } if simulation passes, or { ok: false, error } if it would fail.
     * This saves gas by catching errors before broadcasting a real transaction.
     */
    private async dryRunSimulation(taskId: number): Promise<{ ok: boolean; error?: string }> {
        try {
            const taskIdHex = this.numberToHex(taskId);
            const args = [Buffer.from(taskIdHex, "hex")];

            await this.networkClient.queryContract(
                this.contracts.scheduler,
                "executeTask",
                args
            );
            return { ok: true };
        } catch (err: any) {
            const msg = err.message || String(err);
            // Extract the actual SC error from the vm-query error message
            const scErrorMatch = msg.match(/(?:execution failed|contract error|signalError)[:\s]*(.+)/i);
            return { ok: false, error: scErrorMatch ? scErrorMatch[1].trim() : msg };
        }
    }

    private log(msg: string): void {
        this.logger.info("Executor", msg);
    }
}
