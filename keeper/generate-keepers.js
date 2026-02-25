#!/usr/bin/env node
/**
 * XCron Keeper Stress Test — Generate, Fund & Register 50 Keepers
 * 
 * Usage: node scripts/generate-keepers.js [count]
 *   count: number of keepers to generate (default: 50)
 * 
 * Steps:
 *   1. Generate PEM wallets
 *   2. Fund each via devnet faucet
 *   3. Register each in KeeperRegistry with 1 EGLD stake
 */

const { UserSecretKey, UserSigner } = require('@multiversx/sdk-wallet');
const { Address, Transaction, TransactionPayload, TokenTransfer } = require('@multiversx/sdk-core');
const { ProxyNetworkProvider, ApiNetworkProvider } = require('@multiversx/sdk-network-providers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Config ──
const KEEPER_REGISTRY = 'erd1qqqqqqqqqqqqqpgqdeyw8mmzkza4tlndeztty0f6hgng5z4s7k8suagqha';
const KEEPER_DIR = path.join(__dirname, '..', '.secrets', 'keepers');
const PROXY_URL = 'https://devnet-gateway.multiversx.com';
const API_URL = 'https://devnet-api.multiversx.com';
const FAUCET_URL = 'https://devnet-wallet.multiversx.com/dapp/faucet';
const MIN_STAKE = '1000000000000000000'; // 1 EGLD
const COUNT = parseInt(process.argv[2] || '50');
const CHAIN_ID = 'D';

const proxy = new ProxyNetworkProvider(PROXY_URL);
const api = new ApiNetworkProvider(API_URL);

// ── Step 1: Generate PEM wallets ──
function generateWallets(count) {
    console.log(`\n🔑 Generating ${count} keeper wallets...\n`);
    if (!fs.existsSync(KEEPER_DIR)) fs.mkdirSync(KEEPER_DIR, { recursive: true });

    const wallets = [];
    for (let i = 1; i <= count; i++) {
        const pemPath = path.join(KEEPER_DIR, `keeper-${String(i).padStart(3, '0')}.pem`);

        if (fs.existsSync(pemPath)) {
            // Load existing
            const pemContent = fs.readFileSync(pemPath, 'utf8');
            const secretKey = UserSecretKey.fromPem(pemContent);
            const address = secretKey.generatePublicKey().toAddress();
            wallets.push({ index: i, pemPath, address: address.bech32(), secretKey });
            process.stdout.write(`  ♻️  #${i} ${address.bech32().slice(0, 20)}... (existing)\n`);
        } else {
            // Generate new
            const secretKeyBytes = crypto.randomBytes(32);
            const secretKey = new UserSecretKey(secretKeyBytes);
            const address = secretKey.generatePublicKey().toAddress();

            // Write PEM
            const pubHex = secretKey.generatePublicKey().hex();
            const secretHex = secretKey.hex();
            const combined = secretHex + pubHex;
            const b64 = Buffer.from(combined, 'hex').toString('base64');
            const pemContent = `-----BEGIN PRIVATE KEY for ${address.bech32()}-----\n` +
                b64.match(/.{1,64}/g).join('\n') + '\n' +
                `-----END PRIVATE KEY for ${address.bech32()}-----`;
            fs.writeFileSync(pemPath, pemContent);

            wallets.push({ index: i, pemPath, address: address.bech32(), secretKey });
            process.stdout.write(`  ✅ #${i} ${address.bech32().slice(0, 20)}...\n`);
        }
    }

    // Save address list
    const addrList = wallets.map(w => `${w.index},${w.address},${w.pemPath}`).join('\n');
    fs.writeFileSync(path.join(KEEPER_DIR, 'addresses.csv'), `index,address,pem\n${addrList}`);
    console.log(`\n📋 Saved ${wallets.length} addresses to addresses.csv`);

    return wallets;
}

// ── Step 2: Fund wallets via devnet faucet ──
async function fundWallet(address) {
    try {
        const res = await fetch('https://devnet-extras-api.multiversx.com/faucet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });
        if (res.ok) {
            const data = await res.json();
            return { success: true, data };
        } else {
            const text = await res.text();
            return { success: false, error: text };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function fundAllWallets(wallets) {
    console.log(`\n💰 Funding ${wallets.length} wallets via devnet faucet...\n`);
    let funded = 0, failed = 0;

    for (const w of wallets) {
        // Check if already has balance
        try {
            const res = await fetch(`${API_URL}/accounts/${w.address}`);
            const acc = await res.json();
            const balance = BigInt(acc.balance || '0');
            if (balance >= BigInt('1500000000000000000')) { // 1.5 EGLD
                process.stdout.write(`  ♻️  #${w.index} already funded (${(Number(balance) / 1e18).toFixed(2)} EGLD)\n`);
                funded++;
                continue;
            }
        } catch (e) { /* account doesn't exist yet */ }

        const result = await fundWallet(w.address);
        if (result.success) {
            process.stdout.write(`  ✅ #${w.index} funded\n`);
            funded++;
        } else {
            process.stdout.write(`  ❌ #${w.index} failed: ${result.error?.slice(0, 60)}\n`);
            failed++;
            // Wait a bit if rate limited
            if (result.error?.includes('rate') || result.error?.includes('429')) {
                console.log('  ⏳ Rate limited, waiting 10s...');
                await new Promise(r => setTimeout(r, 10000));
            }
        }
        // Small delay between requests
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n📊 Funding results: ${funded} funded, ${failed} failed`);
    return funded;
}

// ── Step 3: Register keepers ──
async function registerKeeper(wallet) {
    try {
        const signer = new UserSigner(wallet.secretKey);
        const address = new Address(wallet.address);

        // Get account nonce
        const accRes = await fetch(`${API_URL}/accounts/${wallet.address}`);
        const acc = await accRes.json();
        const nonce = acc.nonce || 0;
        const balance = BigInt(acc.balance || '0');

        if (balance < BigInt(MIN_STAKE)) {
            return { success: false, error: 'Insufficient balance' };
        }

        const tx = new Transaction({
            nonce,
            receiver: new Address(KEEPER_REGISTRY),
            value: BigInt(MIN_STAKE),
            gasLimit: 15000000n,
            data: new TransactionPayload('registerKeeper'),
            chainID: CHAIN_ID,
            sender: address,
        });

        const serialized = tx.serializeForSigning();
        const signature = await signer.sign(serialized);
        tx.applySignature(signature);

        const hash = await proxy.sendTransaction(tx);
        return { success: true, hash };
    } catch (err) {
        return { success: false, error: err.message?.slice(0, 80) };
    }
}

async function registerAllKeepers(wallets) {
    console.log(`\n📝 Registering ${wallets.length} keepers in KeeperRegistry...\n`);
    let registered = 0, failed = 0, skipped = 0;

    for (const w of wallets) {
        // Check if already registered (has sufficient balance)
        try {
            const accRes = await fetch(`${API_URL}/accounts/${w.address}`);
            const acc = await accRes.json();
            const balance = BigInt(acc.balance || '0');

            if (balance < BigInt(MIN_STAKE)) {
                process.stdout.write(`  ⏭️  #${w.index} skipped (balance: ${(Number(balance) / 1e18).toFixed(4)} EGLD)\n`);
                skipped++;
                continue;
            }
        } catch (e) {
            process.stdout.write(`  ⏭️  #${w.index} skipped (account not found)\n`);
            skipped++;
            continue;
        }

        const result = await registerKeeper(w);
        if (result.success) {
            process.stdout.write(`  ✅ #${w.index} registered (tx: ${result.hash?.slice(0, 16)}...)\n`);
            registered++;
        } else {
            process.stdout.write(`  ❌ #${w.index} failed: ${result.error}\n`);
            failed++;
        }

        // Small delay between transactions
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n📊 Registration results: ${registered} registered, ${failed} failed, ${skipped} skipped`);
    return registered;
}

// ── Main ──
async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  XCron Keeper Stress Test — Batch Generator');
    console.log(`  Target: ${COUNT} keepers on devnet`);
    console.log('═══════════════════════════════════════════════');

    // Step 1: Generate wallets
    const wallets = generateWallets(COUNT);

    // Step 2: Fund wallets
    const funded = await fundAllWallets(wallets);
    if (funded === 0) {
        console.log('\n⚠️  No wallets funded. Check faucet availability.');
        console.log('   You can fund them manually and re-run with --register-only');
        process.exit(1);
    }

    // Wait for funding tx confirmations
    console.log('\n⏳ Waiting 15s for funding confirmations...');
    await new Promise(r => setTimeout(r, 15000));

    // Step 3: Register keepers
    const registered = await registerAllKeepers(wallets);

    // Summary
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  ✅ Wallets generated: ${wallets.length}`);
    console.log(`  💰 Wallets funded: ${funded}`);
    console.log(`  📝 Keepers registered: ${registered}`);
    console.log(`  🏦 Registry: ${KEEPER_REGISTRY.slice(0, 20)}...`);
    console.log('═══════════════════════════════════════════════');

    // Check final count
    try {
        const res = await fetch(`${API_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scAddress: KEEPER_REGISTRY,
                funcName: 'getActiveKeeperCount',
                args: []
            })
        });
        const data = await res.json();
        if (data.returnData?.[0]) {
            const count = parseInt(Buffer.from(data.returnData[0], 'base64').toString('hex'), 16);
            console.log(`\n🎯 Active Keepers on-chain: ${count}`);
        }
    } catch (e) { /* ignore */ }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
