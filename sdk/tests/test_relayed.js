const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const { Address, Transaction, UserSigner, UserSecretKey } = require("@multiversx/sdk-core");

async function testCombination(version, options) {
    console.log(`\n========================================`);
    console.log(`PROBANDO COMBINACIÓN: version = ${version}, options = ${options}`);
    console.log(`========================================`);

    try {
        const pemPath = require("path").resolve(__dirname, "../../.secrets/wallet.pem");
        const pemContent = fs.readFileSync(pemPath, "utf8");
        const relayerSigner = UserSigner.fromPem(pemContent);
        const relayerAddress = relayerSigner.getAddress();

        const mockQuantumSeed = Buffer.alloc(32, 9);
        const userPubkey = relayerAddress.pubkey();
        const intentNonce = 101n;
        
        const nonceBuf = Buffer.alloc(8);
        nonceBuf.writeBigUInt64LE(intentNonce);
        
        const hasher = crypto.createHash("sha256");
        hasher.update(mockQuantumSeed);
        hasher.update(userPubkey);
        hasher.update(nonceBuf);
        const stealthSeed = hasher.digest();
        
        const stealthSecretKey = new UserSecretKey(stealthSeed);
        const stealthSigner = new UserSigner(stealthSecretKey);
        const stealthAddress = stealthSigner.getAddress();

        const tx = new Transaction({
            nonce: 0,
            value: "1000000000000000",
            receiver: "erd1qqqqqqqqqqqqqpgqeel2kumf0r8ffyhth7pqdujjat9nx0862jpsg2pqaq",
            sender: stealthAddress.bech32(),
            gasPrice: 1000000000,
            gasLimit: 10000000,
            data: Buffer.from("swapTokensFixedInput@5745474c442d626434643739"),
            chainID: "T",
            version: version,
            options: options
        });

        tx.relayer = relayerAddress;

        const innerSerialized = tx.serializeForSigning();
        const innerSignature = await stealthSigner.sign(innerSerialized);
        tx.applySignature(innerSignature);

        const relayerSerialized = tx.serializeForSigning();
        const relayerSignature = await relayerSigner.sign(relayerSerialized);
        tx.relayerSignature = relayerSignature;

        const payload = tx.toSendable();

        const resp = await axios.post("https://testnet-gateway.multiversx.com/transaction/send", payload, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        console.log("✅ ¡ÉXITO CON ESTA COMBINACIÓN!");
        console.log("Respuesta:", resp.data);
        return true;
    } catch (err) {
        console.error("❌ ERROR:", err.response?.data?.error || err.message);
        return false;
    }
}

async function main() {
    // Probamos diferentes variaciones de version y options
    await testCombination(2, 2);  // versión 2 con opción de Relayed (2)
    await testCombination(2, 0);  // versión 2 con opción ordinaria (0)
    await testCombination(2, undefined); // versión 2 sin campo options
    await testCombination(1, undefined); // versión 1
    await testCombination(3, 2);  // versión 3 con opción de Relayed (2)
    await testCombination(3, 0);  // versión 3 ordinaria
}

main().catch(console.error);
