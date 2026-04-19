const { ApiNetworkProvider } = require("@multiversx/sdk-network-providers");
const provider = new ApiNetworkProvider("https://devnet-api.multiversx.com");

async function main() {
    const scAddress = "erd1qqqqqqqqqqqqqpgqak8zt22wl2ph4tswtyc39namqx6ysa2sd8ss4xmlj3";
    console.log("Querying Devnet Identity Registry...");
    try {
        const txs = await provider.getTransactions({ receiver: scAddress, size: 5 });
        console.log("Recent Transactions to Identity Registry:");
        txs.forEach(t => console.log(t.function, "by", t.sender));
    } catch(e) {
        console.error(e);
    }
}
main();
