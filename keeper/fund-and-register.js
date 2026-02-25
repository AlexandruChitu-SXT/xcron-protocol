#!/usr/bin/env node
/**
 * XCron — Fund and Register 50 Keepers from Deployer Wallet
 * Runs from keeper/ directory (has SDK deps)
 */
const { UserSecretKey, UserSigner } = require('@multiversx/sdk-wallet');
const { Address, Transaction, TransactionPayload } = require('@multiversx/sdk-core');
const { ProxyNetworkProvider, ApiNetworkProvider } = require('@multiversx/sdk-network-providers');
const fs = require('fs');
const path = require('path');

const KEEPER_REGISTRY = 'erd1qqqqqqqqqqqqqpgqdeyw8mmzkza4tlndeztty0f6hgng5z4s7k8suagqha';
const KEEPER_DIR = path.join(__dirname, '..', '.secrets', 'keepers');
const DEPLOYER_PEM = path.join(__dirname, '..', '.secrets', 'deployer.pem');
const API_URL = 'https://devnet-api.multiversx.com';
const PROXY_URL = 'https://devnet-gateway.multiversx.com';
const CHAIN_ID = 'D';
const FUND_AMOUNT = 20000000000000000n;  // 0.02 EGLD per wallet
const STAKE_AMOUNT = 10000000000000000n; // 0.01 EGLD stake
const GAS_LIMIT = 15000000n;
const GAS_FUND = 500000n;

const proxy = new ProxyNetworkProvider(PROXY_URL);

function loadDeployer() {
    const pem = fs.readFileSync(DEPLOYER_PEM, 'utf8');
    const secretKey = UserSecretKey.fromPem(pem);
    return { secretKey, signer: new UserSigner(secretKey), address: secretKey.generatePublicKey().toAddress() };
}

function loadKeepers() {
    const csv = fs.readFileSync(path.join(KEEPER_DIR, 'addresses.csv'), 'utf8');
    return csv.trim().split('\n').slice(1).map(line => {
        const [index, address, pemPath] = line.split(',');
        const absolutePath = pemPath.startsWith('/') ? pemPath : path.join(__dirname, '..', pemPath);
        const secretKey = UserSecretKey.fromPem(fs.readFileSync(absolutePath, 'utf8'));
        return { index: parseInt(index), address, secretKey, signer: new UserSigner(secretKey) };
    });
}

async function getAccountInfo(address) {
    try {
        const res = await fetch(`${API_URL}/accounts/${address}`);
        if (!res.ok) return { nonce: 0, balance: 0n };
        const d = await res.json();
        return { nonce: d.nonce || 0, balance: BigInt(d.balance || '0') };
    } catch { return { nonce: 0, balance: 0n }; }
}

async function sendTx(signer, senderAddr, receiverAddr, value, gasLimit, data, nonce) {
    const tx = new Transaction({
        nonce, sender: new Address(senderAddr), receiver: new Address(receiverAddr),
        value, gasLimit, data: data ? new TransactionPayload(data) : undefined, chainID: CHAIN_ID,
    });
    const serialized = tx.serializeForSigning();
    const signature = await signer.sign(serialized);
    tx.applySignature(signature);
    return await proxy.sendTransaction(tx);
}

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  XCron — Fund & Register 50 Keepers');
    console.log('═══════════════════════════════════════════════\n');

    const deployer = loadDeployer();
    const keepers = loadKeepers();
    const deployerInfo = await getAccountInfo(deployer.address.bech32());
    let nonce = deployerInfo.nonce;

    console.log(`Deployer: ${deployer.address.bech32().slice(0, 20)}...`);
    console.log(`Balance: ${Number(deployerInfo.balance) / 1e18} EGLD`);
    console.log(`Keepers to process: ${keepers.length}\n`);

    // ── Phase 1: Fund all keepers from deployer ──
    console.log('💰 Phase 1: Funding wallets (0.02 EGLD each)...\n');
    let funded = 0, alreadyFunded = 0;

    for (const k of keepers) {
        const info = await getAccountInfo(k.address);
        if (info.balance >= FUND_AMOUNT) {
            process.stdout.write(`  ♻️  #${k.index} already has ${(Number(info.balance) / 1e18).toFixed(4)} EGLD\n`);
            alreadyFunded++;
            continue;
        }

        try {
            const hash = await sendTx(deployer.signer, deployer.address.bech32(), k.address, FUND_AMOUNT, GAS_FUND, null, nonce++);
            process.stdout.write(`  ✅ #${k.index} funded (tx: ${hash?.slice(0, 12)}...)\n`);
            funded++;
        } catch (err) {
            process.stdout.write(`  ❌ #${k.index} fund failed: ${err.message?.slice(0, 50)}\n`);
        }
        // Tiny delay to avoid nonce issues
        if (funded % 10 === 0) await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n📊 Funded: ${funded} new, ${alreadyFunded} existing\n`);

    // Wait for funding confirmations
    console.log('⏳ Waiting 15s for funding confirmations...\n');
    await new Promise(r => setTimeout(r, 15000));

    // ── Phase 2: Register each keeper ──
    console.log('📝 Phase 2: Registering keepers (0.01 EGLD stake)...\n');
    let registered = 0, regFailed = 0, skipped = 0;

    for (const k of keepers) {
        const info = await getAccountInfo(k.address);
        if (info.balance < STAKE_AMOUNT + 500000000000000n) { // stake + gas
            process.stdout.write(`  ⏭️  #${k.index} insufficient (${(Number(info.balance) / 1e18).toFixed(4)} EGLD)\n`);
            skipped++;
            continue;
        }

        try {
            const hash = await sendTx(k.signer, k.address, KEEPER_REGISTRY, STAKE_AMOUNT, GAS_LIMIT, 'registerKeeper', info.nonce);
            process.stdout.write(`  ✅ #${k.index} registered (tx: ${hash?.slice(0, 12)}...)\n`);
            registered++;
        } catch (err) {
            process.stdout.write(`  ❌ #${k.index} reg failed: ${err.message?.slice(0, 50)}\n`);
            regFailed++;
        }
        if (registered % 10 === 0) await new Promise(r => setTimeout(r, 200));
    }

    // ── Summary ──
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  💰 Funded: ${funded} (+${alreadyFunded} existing)`);
    console.log(`  📝 Registered: ${registered} (${regFailed} failed, ${skipped} skipped)`);
    console.log('═══════════════════════════════════════════════\n');

    // Check on-chain count
    try {
        const res = await fetch(`${API_URL}/query`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scAddress: KEEPER_REGISTRY, funcName: 'getActiveKeeperCount', args: [] })
        });
        const data = await res.json();
        if (data.returnData?.[0]) {
            const count = parseInt(Buffer.from(data.returnData[0], 'base64').toString('hex') || '0', 16);
            console.log(`🎯 Active Keepers on-chain: ${count}`);
        }
    } catch (e) { console.log('Could not query keeper count'); }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
