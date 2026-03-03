import {
    Address,
    SmartContract,
    AbiRegistry,
    ContractFunction,
    BigUIntValue,
    Account,
    TransactionWatcher,
    ApiNetworkProvider,
} from "@multiversx/sdk-core";
import { UserSigner } from "@multiversx/sdk-wallet";
import { readFileSync } from "fs";
import { Logger } from "./logger";
import { PriceService } from "./price_service";

const SCALE_1E18 = BigInt("1000000000000000000");

/**
 * XwapReporter — integrates the XWAP oracle contract with the keeper bot.
 *
 * Responsibilities:
 *   1. Call `reportPrice` on the XWAP contract every block (off-chain price from Binance/CoinGecko)
 *   2. Call `updatePrice` on the XWAP contract with xExchange pool reserves
 *   3. Query `isSafeToExecute()` before any price-triggered task
 *   4. Log gate status, consensus, and freshness every cycle
 */
export class XwapReporter {
    private readonly logger: Logger;
    private readonly priceService: PriceService;
    private readonly provider: ApiNetworkProvider;
    private readonly signer: UserSigner;
    private readonly xwapAddress: Address;
    private readonly gatewayUrl: string;

    constructor(
        logger: Logger,
        priceService: PriceService,
        xwapContractAddress: string,
        pemPath: string,
        gatewayUrl: string,
    ) {
        this.logger = logger;
        this.priceService = priceService;
        this.xwapAddress = Address.fromBech32(xwapContractAddress);
        this.provider = new ApiNetworkProvider(gatewayUrl, { timeout: 10000 });
        this.signer = UserSigner.fromPem(readFileSync(pemPath, "utf8"));
        this.gatewayUrl = gatewayUrl;
    }

    // ─── Report off-chain price ────────────────────────────────────────────

    /**
     * Fetch price from Binance/CoinGecko and report it to the XWAP contract.
     * This is the off-chain signal that feeds the verification gate.
     */
    async reportOffChainPrice(token: string = "EGLD"): Promise<boolean> {
        try {
            const usdPrice = await this.priceService.getPrice(token);
            if (!usdPrice || usdPrice <= 0) {
                this.log(`No off-chain price for ${token}, skipping report`);
                return false;
            }

            // Scale to x1e18 for on-chain storage
            console.log("xwap_reporter.ts executing line A...");
            const priceScaled = BigInt(Math.round(usdPrice * 1e9)) * BigInt(1e9);

            console.log("xwap_reporter.ts executing line B...");
            const senderAddress = this.signer.getAddress();
            console.log("xwap_reporter.ts executing line C...");
            const account = new Account(senderAddress);
            console.log("xwap_reporter.ts executing line D...");
            const accountOnChain = await this.provider.getAccount(senderAddress);
            console.log("xwap_reporter.ts executing line E...");
            account.update(accountOnChain);

            console.log("xwap_reporter.ts executing line F...");
            const tx = new SmartContract({ address: this.xwapAddress }).call({
                func: new ContractFunction("reportPrice"),
                args: [new BigUIntValue(priceScaled)],
                gasLimit: 5_000_000,
                caller: senderAddress,
                chainID: "T",
            });
            console.log("xwap_reporter.ts executing line G...");

            tx.setNonce(account.nonce);
            console.log("xwap_reporter.ts executing line H...");
            const signature = await this.signer.sign(tx.serializeForSigning());
            console.log("xwap_reporter.ts executing line I...");
            tx.applySignature(signature);
            console.log("xwap_reporter.ts executing line J...");
            await this.provider.sendTransaction(tx);
            console.log("xwap_reporter.ts executing line K...");

            this.log(`reportPrice: ${token} = $${usdPrice.toFixed(2)} (${priceScaled.toString()} x1e18)`);
            return true;
        } catch (err: any) {
            this.log(`reportPrice failed: ${err.message || err}`);
            return false;
        }
    }

    // ─── Update on-chain EWMA ──────────────────────────────────────────────

    /**
     * Fetch xExchange pool reserves, normalize them to 18 decimals,
     * and call updatePrice to advance the EWMA.
     * This is the on-chain computation step.
     *
     * `reserveA`: token A reserves (raw from xExchange)
     * `decimalsA`: token A decimals
     * `reserveB`: token B reserves (raw from xExchange)
     * `decimalsB`: token B decimals
     */
    async updateOnChainPrice(reserveA: bigint, decimalsA: number, reserveB: bigint, decimalsB: number): Promise<boolean> {
        try {
            const normA = this.normalizeReserve(reserveA, decimalsA);
            const normB = this.normalizeReserve(reserveB, decimalsB);

            const senderAddress = this.signer.getAddress();
            const account = new Account(senderAddress);
            const accountOnChain = await this.provider.getAccount(senderAddress);
            account.update(accountOnChain);

            const tx = new SmartContract({ address: this.xwapAddress }).call({
                func: new ContractFunction("updatePrice"),
                args: [
                    new BigUIntValue(normA),
                    new BigUIntValue(normB),
                ],
                gasLimit: 10_000_000,
                caller: senderAddress,
                chainID: "T",
            });

            tx.setNonce(account.nonce);
            const signature = await this.signer.sign(tx.serializeForSigning());
            tx.applySignature(signature);
            await this.provider.sendTransaction(tx);

            this.log(`updatePrice: normA=${normA}, normB=${normB}`);
            return true;
        } catch (err: any) {
            this.log(`updatePrice failed: ${err.message || err}`);
            return false;
        }
    }

    private normalizeReserve(rawReserve: bigint, decimals: number): bigint {
        if (decimals === 18) return rawReserve;
        if (decimals < 18) {
            return rawReserve * (10n ** BigInt(18 - decimals));
        } else {
            return rawReserve / (10n ** BigInt(decimals - 18));
        }
    }

    // ─── Query signals ─────────────────────────────────────────────────────

    /**
     * Query isSafeToExecute() from the XWAP contract.
     * Returns true if gate is open, consensus ok, and data is fresh.
     */
    async isSafeToExecute(): Promise<boolean> {
        try {
            const query = new SmartContract({ address: this.xwapAddress }).createQuery({
                func: new ContractFunction("isSafeToExecute")
            });
            const result = await this.provider.queryContract(query);

            if (!result.returnData || result.returnData.length === 0) return false;
            const buf = Buffer.from(result.returnData[0], "base64");
            return buf.length > 0 && buf[0] === 1;
        } catch (err: any) {
            this.log(`isSafeToExecute query failed: ${err.message || err}`);
            return false;
        }
    }

    /**
     * Query and log all four XWAP signals (gate, consensus, freshness, stability).
     * Call this at the start of each keeper cycle for observability.
     */
    async logSignals(): Promise<void> {
        try {
            const queryPrice = new SmartContract({ address: this.xwapAddress }).createQuery({ func: new ContractFunction("getXwapPrice") });
            const queryGate = new SmartContract({ address: this.xwapAddress }).createQuery({ func: new ContractFunction("isGateOpen") });

            const [priceResult, safeResult] = await Promise.all([
                this.provider.queryContract(queryPrice),
                this.provider.queryContract(queryGate),
            ]);

            const priceRaw = priceResult.returnData?.[0]
                ? BigInt("0x" + Buffer.from(priceResult.returnData[0], "base64").toString("hex") || "0")
                : 0n;
            const priceUsd = Number(priceRaw) / 1e18;

            const gateOpen = safeResult.returnData?.[0]
                ? Buffer.from(safeResult.returnData[0], "base64")[0] === 1
                : false;

            this.log(
                `XWAP $${priceUsd.toFixed(4)} | Gate: ${gateOpen ? "🟢 OPEN" : "🔴 CLOSED"}`,
            );
        } catch (err: any) {
            this.log(`logSignals failed: ${err.message || err}`);
        }
    }

    // ─── Full cycle ────────────────────────────────────────────────────────

    /**
     * Run a full XWAP oracle cycle:
     *   1. Report off-chain price
     *   2. Fetch xExchange reserves and update EWMA
     *   3. Log current signals
     *   4. Return whether it's safe to execute price-triggered tasks
     */
    async runCycle(xExchangeReserveA: bigint, decimalsA: number, xExchangeReserveB: bigint, decimalsB: number): Promise<boolean> {
        await this.reportOffChainPrice("EGLD");
        await this.updateOnChainPrice(xExchangeReserveA, decimalsA, xExchangeReserveB, decimalsB);
        await this.logSignals();
        return await this.isSafeToExecute();
    }

    private log(msg: string): void {
        this.logger.info("XwapReporter", msg);
    }
}
