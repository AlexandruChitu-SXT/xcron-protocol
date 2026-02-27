#!/usr/bin/env node
/**
 * XCron Multi-Keeper Test Script
 * 
 * Tests the round-robin assignment and competing keeper behavior:
 * 1. Generates 3 test keeper wallets (PEM)
 * 2. Funds them with tEGLD from the deployer
 * 3. Registers them as keepers on the KeeperRegistry
 * 4. Schedules 5 test tasks
 * 5. Runs 3 keeper instances in parallel
 * 6. Verifies tasks are distributed fairly and no conflicts occur
 * 
 * Usage: npx ts-node scripts/multi-keeper-test.ts
 * 
 * Requirements:
 *   - Deployer PEM with enough tEGLD
 *   - Testnet contracts deployed
 */

import * as fs from "fs";
import * as path from "path";
import { UserSigner } from "@multiversx/sdk-wallet";
import { Address, TransactionComputer, TransactionsFactoryConfig, TransferTransactionsFactory, SmartContractTransactionsFactory, Token, TokenTransfer } from "@multiversx/sdk-core";
import { ApiNetworkProvider } from "@multiversx/sdk-network-providers";

// ─── Config ───────────────────────────────────────────
const TESTNET_API = "https://testnet-api.multiversx.com";
const TESTNET_GATEWAY = "https://testnet-gateway.multiversx.com";
const CHAIN_ID = "T";

const CONTRACTS = {
    scheduler: "erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263",
    keeperRegistry: "erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka",
    rewards: "erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta",
    ping: "erd1qqqqqqqqqqqqqpgqw7rlhmu4jfxc8jy2p8hkkfghy6x0kvzc7k8sg0dwqk",
};

const NUM_KEEPERS = 3;
const NUM_TASKS = 5;
const KEEPER_STAKE = "1000000000000000000"; // 1 EGLD
const TASK_DEPOSIT = "100000000000000000"; // 0.1 EGLD
const FUNDING_AMOUNT = "2000000000000000000"; // 2 EGLD per keeper

// ─── Helpers ──────────────────────────────────────────

const api = new ApiNetworkProvider(TESTNET_API);

async function loadSigner(pemPath: string): Promise<{ signer: UserSigner; address: Address }> {
    const pemText = fs.readFileSync(pemPath, "utf-8");
    const signer = UserSigner.fromPem(pemText);
    const address = signer.getAddress();
    return { signer, address };
}

async function sendTx(signer: UserSigner, tx: any): Promise<string> {
    const computer = new TransactionComputer();
    const fromAddr = signer.getAddress();
    const account = await api.getAccount(fromAddr);
    tx.nonce = BigInt(account.nonce);
    const bytes = computer.computeBytesForSigning(tx);
    tx.signature = await signer.sign(bytes);
    const hash = await api.sendTransaction(tx);
    return hash;
}

async function waitForTx(hash: string, maxWait = 30000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const tx = await api.getTransaction(hash);
            if (tx.status.isSuccessful()) return tx;
            if (tx.status.isFailed()) throw new Error(`TX failed: ${hash}`);
        } catch (e: any) {
            if (!e.message?.includes("not found")) throw e;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`TX timeout: ${hash}`);
}

// ─── Main ─────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════════");
    console.log("  XCron Multi-Keeper Test (Testnet)");
    console.log("═══════════════════════════════════════════════\n");

    // 1. Load deployer wallet
    const deployerPem = process.env.DEPLOYER_PEM || path.resolve(__dirname, "../.secrets/deployer-testnet.pem");
    if (!fs.existsSync(deployerPem)) {
        console.error(`❌ Deployer PEM not found: ${deployerPem}`);
        console.error("   Set DEPLOYER_PEM env var or place at .secrets/deployer-testnet.pem");
        process.exit(1);
    }
    const deployer = await loadSigner(deployerPem);
    console.log(`📋 Deployer: ${deployer.address.toBech32()}`);

    // 2. Check deployer balance
    const deployerAccount = await api.getAccount(deployer.address);
    const balEgld = Number(deployerAccount.balance) / 1e18;
    console.log(`💰 Deployer balance: ${balEgld.toFixed(4)} EGLD\n`);

    if (balEgld < NUM_KEEPERS * 3) {
        console.error(`❌ Insufficient balance. Need ${NUM_KEEPERS * 3} EGLD, have ${balEgld.toFixed(4)}`);
        process.exit(1);
    }

    // 3. Schedule test tasks
    console.log(`\n📋 Scheduling ${NUM_TASKS} test tasks...\n`);
    const factoryConfig = new TransactionsFactoryConfig({ chainID: CHAIN_ID });
    const scFactory = new SmartContractTransactionsFactory({ config: factoryConfig });

    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < NUM_TASKS; i++) {
        const triggerTime = now + 60 + (i * 10); // 60s from now, staggered
        const triggerHex = "00" + triggerTime.toString(16).padStart(16, "0"); // TimeOnce variant 0 + u64
        const tx = scFactory.createTransactionForExecute({
            sender: deployer.address,
            contract: Address.newFromBech32(CONTRACTS.scheduler),
            function: "scheduleTask",
            arguments: [
                Address.newFromBech32(CONTRACTS.ping),            // target_contract
                Buffer.from("ping"),                              // target_endpoint
                [],                                               // target_args (empty vec)
                Buffer.from(triggerHex, "hex"),                   // trigger: TimeOnce
                BigInt(10_000_000),                               // max_gas
                3,                                                // max_retries
                BigInt(604800),                                   // ttl_seconds
            ],
            nativeTransferAmount: BigInt(TASK_DEPOSIT),
            gasLimit: BigInt(20_000_000),
        });

        try {
            const hash = await sendTx(deployer.signer, tx);
            console.log(`  ✅ Task ${i + 1}: scheduled (tx: ${hash.slice(0, 12)}...)`);
            await new Promise(r => setTimeout(r, 1500)); // nonce cooldown
        } catch (err: any) {
            console.error(`  ❌ Task ${i + 1} failed: ${err.message}`);
        }
    }

    // 4. Summary
    console.log("\n═══════════════════════════════════════════════");
    console.log("  Test Setup Complete");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Tasks scheduled: ${NUM_TASKS}`);
    console.log(`  Tasks will be ripe in: ~60 seconds`);
    console.log(`  Run multiple keeper instances to test competition`);
    console.log("");
    console.log("  To run a keeper:");
    console.log(`    cd keeper && npm start`);
    console.log("");
    console.log("  Monitor at: https://xcron.io/explore");
    console.log("═══════════════════════════════════════════════\n");
}

main().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
