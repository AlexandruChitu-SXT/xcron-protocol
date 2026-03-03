import { Logger } from "./src/logger";
import { PriceService } from "./src/price_service";
import { XwapReporter } from "./src/xwap_reporter";

async function main() {
    console.log("Starting XWAP Reporter Test...");
    const logger = new Logger("debug");
    const priceService = new PriceService(logger);

    const xwapAddr = "erd1qqqqqqqqqqqqqpgqlnu2aqhzmy49sa9lf7vx3jsy3l622fgv7k8snmwahh";
    const pem = "/Users/alejandrochitu/Desktop/xcronpem/deployer.pem";
    const gateway = "https://testnet-api.multiversx.com";

    console.log("Initializing reporter...");
    const reporter = new XwapReporter(logger, priceService, xwapAddr, pem, gateway);

    const reserveA = 1000n * 10n ** 18n;
    const reserveB = 15000n * 10n ** 6n;

    console.log("Running XWAP reportOffChainPrice...");
    await reporter.reportOffChainPrice("EGLD");

    console.log("Running XWAP updateOnChainPrice...");
    await reporter.updateOnChainPrice(reserveA, reserveB);

    console.log("Running XWAP logSignals...");
    await reporter.logSignals();

    console.log("Testing isSafeToExecute...");
    const isSafe = await reporter.isSafeToExecute();

    console.log("\n=============================");
    console.log(`XWAP isSafeToExecute: ${isSafe}`);
    console.log("=============================\n");
}

main().then(() => {
    console.log("Test execution finished successfully.");
    process.exit(0);
}).catch(e => {
    console.error("Test execution failed:", e);
    process.exit(1);
});
