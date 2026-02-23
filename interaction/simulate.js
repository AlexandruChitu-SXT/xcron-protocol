const fs = require('fs');
const { UserSigner } = require('@multiversx/sdk-wallet');

async function main() {
    const pemText = fs.readFileSync('../.secrets/deployer.pem', { encoding: 'utf8' });
    const signer = UserSigner.fromPem(pemText);
    const callerBech32 = signer.getAddress().bech32();

    const txPayload = {
        nonce: 121, // Hardcoded for test
        value: "0",
        receiver: "erd1qqqqqqqqqqqqqpgqkchuk2w2nsmsrdqkd4s2t7z4m7wq6st27k8sqwqdju",
        sender: callerBech32,
        gasPrice: 1000000000,
        gasLimit: 300000000,
        data: Buffer.from("executeTask@02").toString('base64'),
        chainID: "T",
        version: 2
    };

    const signature = await signer.sign(Buffer.from(JSON.stringify(txPayload)));
    txPayload.signature = signature.toString('hex');

    const body = {
        transaction: txPayload
    };

    try {
        const fetch = require('node-fetch'); // Usando node-fetch nativo de node 18
        const res = await fetch('https://testnet-api.multiversx.com/transaction/simulate', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
    } catch (e) {
        console.error(e);
    }
}
main();
