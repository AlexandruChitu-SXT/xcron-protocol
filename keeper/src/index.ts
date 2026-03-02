import * as fs from "fs";
import { Address } from "@multiversx/sdk-core";
import { UserSigner } from "@multiversx/sdk-wallet";
import { loadConfig } from "./config";
import { NetworkClient } from "./network";
import { TaskMonitor } from "./monitor";
import { Executor } from "./executor";
import { Logger, HealthTracker, withRetry } from "./logger";
import { XPortalClaimer } from "./xportal_claim";
import { AIEvaluator } from "./ai_evaluator";
import { CommitRevealManager } from "./commit_reveal";
import { KeeperDashboard } from "./dashboard";
import { RelayerService } from "./relayer";

/**
 * ═══════════════════════════════════════════════════════════
 *  XCron Keeper Bot — Phase 1 MVP (Hardened)
 * ═══════════════════════════════════════════════════════════
 *
 *  A robust keeper that:
 *    1. Polls the Scheduler contract for ripe tasks
 *    2. Calls executeTask for each ripe task
 *    3. Logs results to persistent JSON files
 *    4. Provides health metrics and uptime tracking
 *
 *  Usage:
 *    npx ts-node src/index.ts [config-path] [--daemon]
 *
 *  Flags:
 *    --daemon    Run indefinitely (default stops after 100 idle cycles)
 *
 * ═══════════════════════════════════════════════════════════
 */

async function main(): Promise<void> {
    // Parse CLI args
    const args = process.argv.slice(2);
    const daemonMode = args.includes("--daemon");
    const configPath = args.find((a) => !a.startsWith("--")) || "./keeper-config.json";

    // Initialize logger
    const logger = new Logger("./keeper-logs");
    const health = new HealthTracker();

    logger.info("Main", "═══════════════════════════════════════════════");
    logger.info("Main", "  XCron Keeper Bot v0.2.0 (Phase 1 — Hardened)");
    logger.info("Main", `  Mode: ${daemonMode ? "DAEMON (infinite)" : "STANDARD (max 100 idle cycles)"}`);
    logger.info("Main", "═══════════════════════════════════════════════");

    // 1. Load config
    logger.info("Main", `Loading config from: ${configPath}`);
    const config = loadConfig(configPath);

    // 2. Load wallet
    logger.info("Main", `Loading wallet from: ${config.keeper.walletPem}`);
    const pemContent = fs.readFileSync(config.keeper.walletPem, "utf-8");
    const signer = UserSigner.fromPem(pemContent);
    const keeperAddress = Address.fromBech32(signer.getAddress().bech32());
    logger.info("Main", `Keeper address: ${keeperAddress.bech32()}`);

    // 3. Initialize network client
    const networkClient = new NetworkClient(config.network);
    let balance = 0n;
    try {
        balance = await withRetry(
            () => networkClient.getAccountBalance(keeperAddress.bech32()),
            { maxRetries: 3, baseDelayMs: 2000, label: "getAccountBalance" }
        );
    } catch {
        logger.warn("Main", "Could not fetch balance (network timeout). Continuing anyway...");
    }
    const balanceEgld = Number(balance) / 1e18;
    logger.info("Main", `Wallet balance: ${balanceEgld.toFixed(4)} EGLD`);

    if (balance === 0n) {
        logger.warn("Main", "Wallet has zero balance! Please fund it first.");
        logger.warn("Main", "Devnet faucet: https://devnet-wallet.multiversx.com/faucet");
    }

    // 4. Initialize modules
    const monitor = new TaskMonitor(networkClient, config.contracts, config.keeper, logger);
    const executor = new Executor(
        networkClient,
        config.contracts,
        config.keeper,
        signer,
        keeperAddress,
        logger
    );

    logger.info("Main", `Poll interval: ${config.keeper.pollIntervalMs}ms`);

    // Start monitoring dashboard
    const dashboard = new KeeperDashboard(health, () => ({
        pending: monitor.getPendingCount(),
        tracked: monitor.getTrackedCount(),
    }));
    dashboard.start(3300);

    // 4b. Initialize Relayed V3 gasless service
    const relayer = new RelayerService(
        signer,
        keeperAddress,
        networkClient,
        logger,
        config.contracts.scheduler
    );
    dashboard.setRelayer(relayer);
    logger.info("Main", "🔄 Relayed V3: ENABLED (POST /relay on dashboard port)");

    // 5. Initialize xPortal XP Auto-Claimer (if enabled)
    let xportalClaimer: XPortalClaimer | null = null;
    let lastClaimEpoch = 0;

    if (config.xportalClaim?.enabled) {
        xportalClaimer = new XPortalClaimer(
            networkClient,
            config.xportalClaim,
            logger,
            config.network.chainId
        );
        logger.info("Main", "✨ xPortal XP Auto-Claim: ENABLED");
        logger.info("Main", `   Wallets dir: ${config.xportalClaim.walletsDir}`);
        logger.info("Main", `   Network: ${config.xportalClaim.network}`);
    }

    // 6. Initialize AI Evaluator (if enabled)
    if (config.ai?.enabled && config.ai.apiKey) {
        const aiEvaluator = new AIEvaluator(config.ai, logger);
        executor.setAIEvaluator(aiEvaluator);
        logger.info("Main", `🤖 AI Evaluator: ENABLED (${config.ai.provider}/${config.ai.model})`);
        logger.info("Main", `   Budget: $${config.ai.maxCostPerDayUsd}/day`);
    } else {
        logger.info("Main", "🤖 AI Evaluator: DISABLED (enable in config.ai)");
    }

    // 7. Initialize Commit-Reveal anti-MEV (if enabled)
    if (config.commitReveal?.enabled) {
        const crManager = new CommitRevealManager(
            networkClient,
            config.contracts,
            config.keeper,
            signer,
            keeperAddress,
            logger,
            config.commitReveal
        );
        executor.setCommitReveal(crManager);
        logger.info("Main", `🛡️ Commit-Reveal: ENABLED (reveal delay: ${config.commitReveal.revealDelayMs}ms)`);
    } else {
        logger.info("Main", "🛡️ Commit-Reveal: DISABLED (direct execution mode)");
    }

    logger.info("Main", "Starting keeper loop... (Ctrl+C to stop)");
    logger.info("Main", "─────────────────────────────────────────────");

    // 5. Main loop
    let consecutiveIdleCycles = 0;
    const MAX_IDLE_CYCLES = daemonMode ? Infinity : 100;
    const HEALTH_INTERVAL = 20; // Log health summary every N cycles
    const NONCE_RESYNC_INTERVAL = 10; // Re-sync nonce every N executions

    const shutdown = () => {
        const summary = health.getSummaryLine(monitor.getPendingCount(), monitor.getTrackedCount());
        logger.info("Main", "═══════════════════════════════════════════════");
        logger.info("Main", `  Keeper stopped. ${summary}`);
        logger.info("Main", "═══════════════════════════════════════════════");
        logger.close();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    while (true) {
        health.cycleCount++;

        try {
            // Scan for ripe tasks (with retry)
            const ripeTasks = await monitor.scanForRipeTasks();

            if (ripeTasks.length === 0) {
                consecutiveIdleCycles++;

                if (!daemonMode && consecutiveIdleCycles >= MAX_IDLE_CYCLES) {
                    logger.info("Main", `No tasks found for ${MAX_IDLE_CYCLES} consecutive cycles. Stopping.`);
                    shutdown();
                }
            } else {
                consecutiveIdleCycles = 0;
            }

            // Execute each ripe task
            for (const task of ripeTasks) {
                const result = await executor.executeTask(task);
                health.recordExecution(task.id, result.success);

                if (result.success) {
                    await monitor.markExecuted(task.id);
                    monitor.recordSuccess(task.id);
                    const recurTag = task.isRecurring ? ` [RECURRING: ${task.remainingExecs - 1} left]` : "";
                    logger.info("Main", `✅ Task #${task.id} executed${recurTag}`, { txHash: result.txHash });
                } else {
                    if (result.permanent) {
                        // Permanent error (wrong endpoint, contract issue) — blacklist immediately
                        monitor.recordPermanentFailure(task.id, result.error || "unknown error");
                    } else {
                        monitor.recordFailure(task.id, result.error || "unknown error");
                    }
                    logger.error("Main", `❌ Task #${task.id} failed`, { error: result.error, permanent: result.permanent });
                }

                // Re-sync nonce periodically
                if (health.totalExecutions % NONCE_RESYNC_INTERVAL === 0) {
                    await executor.resyncNonce();
                }

                // Small delay between executions to avoid nonce races
                await sleep(1000);
            }

            // Health summary log
            if (health.cycleCount % HEALTH_INTERVAL === 0) {
                const summary = health.getSummaryLine(monitor.getPendingCount(), monitor.getTrackedCount());
                logger.info("Health", summary);

                // xPortal claim check on health intervals
                if (xportalClaimer) {
                    try {
                        const currentEpoch = await xportalClaimer.getCurrentEpoch();
                        if (currentEpoch > lastClaimEpoch) {
                            logger.info("Main", `🔔 New epoch detected: ${currentEpoch}. Running xPortal XP claim cycle...`);
                            await xportalClaimer.runClaimCycle(currentEpoch);
                            lastClaimEpoch = currentEpoch;
                        }
                    } catch (err: any) {
                        logger.error("Main", `xPortal claim check error: ${err.message}`);
                    }
                }

                // M-3: Auto-flush protocol fees to Rewards contract
                try {
                    await executor.flushProtocolFees();
                } catch (err: any) {
                    logger.error("Main", `Fee flush error (non-critical): ${err.message}`);
                }
            }
        } catch (err: any) {
            logger.error("Main", `Error in cycle ${health.cycleCount}: ${err.message}`);
        }

        await sleep(config.keeper.pollIntervalMs);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Global handlers to prevent silent crashes
process.on("unhandledRejection", (reason: any) => {
    console.error(`[FATAL] Unhandled rejection:`, reason);
    // Don't exit — let the main loop recover
});

process.on("uncaughtException", (err: Error) => {
    console.error(`[FATAL] Uncaught exception:`, err);
    // Don't exit — let the main loop recover
});

// Keepalive: prevent Node from exiting when event loop appears empty
const keepalive = setInterval(() => { }, 60_000);
process.on("exit", (code) => {
    clearInterval(keepalive);
    console.error(`[DEBUG] Process exiting with code ${code}`);
    console.error(new Error("Exit stack trace").stack);
});

// Run
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
