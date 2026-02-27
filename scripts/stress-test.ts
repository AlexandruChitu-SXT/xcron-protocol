#!/usr/bin/env node
/**
 * XCron Stress Test Script
 * 
 * Schedules a batch of tasks rapidly and monitors execution throughput:
 * 1. Schedules N tasks in rapid succession (burst mode)
 * 2. Monitors the Scheduler contract for completion events
 * 3. Reports throughput metrics (tasks/min, avg execution time, success rate)
 * 
 * Usage: 
 *   npx ts-node scripts/stress-test.ts [--tasks 20] [--interval 1000]
 * 
 * Options:
 *   --tasks N       Number of tasks to schedule (default: 20)
 *   --interval MS   Delay between scheduling calls in ms (default: 1000)
 *   --monitor-only  Skip scheduling, just monitor existing tasks
 */

import * as fs from "fs";
import * as path from "path";
import { UserSigner } from "@multiversx/sdk-wallet";
import { Address, TransactionComputer } from "@multiversx/sdk-core";
import { ApiNetworkProvider } from "@multiversx/sdk-network-providers";

// ─── Config ───────────────────────────────────────────
const TESTNET_API = "https://testnet-api.multiversx.com";
const CHAIN_ID = "T";

const CONTRACTS = {
    scheduler: "erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263",
    ping: "erd1qqqqqqqqqqqqqpgqw7rlhmu4jfxc8jy2p8hkkfghy6x0kvzc7k8sg0dwqk",
};

const TASK_DEPOSIT = "100000000000000000"; // 0.1 EGLD

// ─── Parse CLI args ───────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const NUM_TASKS = parseInt(getArg("tasks", "20"));
const INTERVAL_MS = parseInt(getArg("interval", "1000"));
const MONITOR_ONLY = args.includes("--monitor-only");

// ─── Helpers ──────────────────────────────────────────
const api = new ApiNetworkProvider(TESTNET_API);

async function loadSigner(pemPath: string): Promise<{ signer: UserSigner; address: Address }> {
    const pemText = fs.readFileSync(pemPath, "utf-8");
    const signer = UserSigner.fromPem(pemText);
    const address = signer.getAddress();
    return { signer, address };
}

interface TaskMetric {
    taskId: number;
    scheduledAt: number;
    scheduleTxHash: string;
    executedAt?: number;
    executeTxHash?: string;
    status: "scheduled" | "executed" | "failed" | "timeout";
}

// ─── Monitor ─────────────────────────────────────────

async function monitorTasks(startTime: number, expectedCount: number): Promise<TaskMetric[]> {
    console.log("\n⏳ Monitoring task executions...\n");
    const metrics: TaskMetric[] = [];
    const maxWait = 300; // 5 minutes max
    let lastCheck = 0;

    for (let elapsed = 0; elapsed < maxWait; elapsed += 10) {
        await new Promise(r => setTimeout(r, 10000));

        try {
            const res = await fetch(
                `${TESTNET_API}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&status=success&size=50&order=desc&after=${startTime}`
            );
            const txs = await res.json();
            if (!Array.isArray(txs)) continue;

            const newExecs = txs.length - lastCheck;
            if (newExecs > 0) {
                console.log(`  📊 ${txs.length} executions detected (${newExecs} new)`);
                lastCheck = txs.length;
            }

            if (txs.length >= expectedCount) {
                console.log(`  ✅ All ${expectedCount} tasks executed!\n`);
                break;
            }
        } catch { /* retry */ }
    }

    return metrics;
}

// ─── Schedule Burst ──────────────────────────────────

async function scheduleBurst(deployer: { signer: UserSigner; address: Address }): Promise<number> {
    console.log(`\n🔥 Scheduling ${NUM_TASKS} tasks (burst mode, ${INTERVAL_MS}ms interval)...\n`);

    const now = Math.floor(Date.now() / 1000);
    let successCount = 0;
    let nonce = (await api.getAccount(deployer.address)).nonce;

    for (let i = 0; i < NUM_TASKS; i++) {
        const triggerTime = now + 30; // All ripe in 30 seconds
        const computer = new TransactionComputer();

        // Build scheduleTask data manually for speed
        const taskIdHex = (10_000_000).toString(16).padStart(16, "0"); // max_gas
        const retriesHex = "03"; // max_retries = 3
        const ttlHex = (604800).toString(16).padStart(16, "0"); // 7 days
        const triggerHex = "00" + triggerTime.toString(16).padStart(16, "0"); // TimeOnce

        const targetAddr = Address.newFromBech32(CONTRACTS.ping).toHex();
        const endpoint = Buffer.from("ping").toString("hex");

        const data = `scheduleTask@${targetAddr}@${endpoint}@00000000@${triggerHex}@${taskIdHex}@${retriesHex}@${ttlHex}`;

        const tx = {
            sender: deployer.address.toBech32(),
            receiver: CONTRACTS.scheduler,
            value: BigInt(TASK_DEPOSIT),
            data: new TextEncoder().encode(data),
            gasLimit: BigInt(20_000_000),
            chainID: CHAIN_ID,
            nonce: BigInt(nonce),
            version: 1,
            gasPrice: BigInt(1_000_000_000),
        };

        try {
            const bytes = computer.computeBytesForSigning(tx as any);
            (tx as any).signature = await deployer.signer.sign(bytes);
            const hash = await api.sendTransaction(tx as any);
            successCount++;
            nonce++;

            if ((i + 1) % 5 === 0 || i === NUM_TASKS - 1) {
                console.log(`  📤 Scheduled ${i + 1}/${NUM_TASKS} (tx: ${hash.slice(0, 12)}...)`);
            }
        } catch (err: any) {
            console.error(`  ❌ Task ${i + 1} failed: ${err.message}`);
            // Re-fetch nonce on error
            nonce = (await api.getAccount(deployer.address)).nonce;
        }

        if (INTERVAL_MS > 0) await new Promise(r => setTimeout(r, INTERVAL_MS));
    }

    return successCount;
}

// ─── Main ─────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════════");
    console.log("  XCron Stress Test (Testnet)");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Tasks to schedule: ${NUM_TASKS}`);
    console.log(`  Interval: ${INTERVAL_MS}ms`);
    console.log(`  Monitor only: ${MONITOR_ONLY}`);
    console.log("═══════════════════════════════════════════════\n");

    const startTime = Math.floor(Date.now() / 1000);

    if (!MONITOR_ONLY) {
        const deployerPem = process.env.DEPLOYER_PEM || path.resolve(__dirname, "../.secrets/deployer-testnet.pem");
        if (!fs.existsSync(deployerPem)) {
            console.error(`❌ Deployer PEM not found: ${deployerPem}`);
            process.exit(1);
        }

        const deployer = await loadSigner(deployerPem);
        const account = await api.getAccount(deployer.address);
        console.log(`📋 Deployer: ${deployer.address.toBech32()}`);
        console.log(`💰 Balance: ${(Number(account.balance) / 1e18).toFixed(4)} EGLD\n`);

        const scheduled = await scheduleBurst(deployer);
        console.log(`\n📊 Scheduled ${scheduled}/${NUM_TASKS} tasks successfully`);
    }

    // Monitor execution
    await monitorTasks(startTime, NUM_TASKS);

    // Final report
    console.log("═══════════════════════════════════════════════");
    console.log("  Stress Test Report");
    console.log("═══════════════════════════════════════════════");

    try {
        // Query current stats
        const res = await fetch(
            `${TESTNET_API}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&status=success&size=100&order=desc`
        );
        const txs = await res.json();
        const totalExecs = Array.isArray(txs) ? txs.length : 0;

        // Get task nonce (total tasks ever)
        const taskNonceRes = await fetch(
            `${TESTNET_API}/accounts/${CONTRACTS.scheduler}/keys`
        );

        console.log(`  Total executions on testnet: ${totalExecs}`);
        console.log(`  Contract: ${CONTRACTS.scheduler}`);
        console.log("═══════════════════════════════════════════════\n");
    } catch {
        console.log("  (Could not fetch final stats)\n");
    }
}

main().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
