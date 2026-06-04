import { describe, it, expect } from "vitest";
import { XCronClient } from "../src/client";
import { getAddresses } from "../src/addresses";

// ═══════════════════════════════════════════════════════════
//  XCron SDK — Unit Tests
// ═══════════════════════════════════════════════════════════

describe("XCronClient — Constructor", () => {
    it("should initialize with devnet addresses", () => {
        const xcron = new XCronClient("devnet");
        const addrs = xcron.getAddresses();
        expect(addrs.scheduler).toContain("erd1");
        expect(addrs.keeperRegistry).toContain("erd1");
        expect(addrs.rewards).toContain("erd1");
    });

    it("should initialize with testnet addresses", () => {
        const xcron = new XCronClient("testnet");
        const addrs = xcron.getAddresses();
        expect(addrs.scheduler).toContain("erd1");
    });

    it("should throw for mainnet (not yet deployed)", () => {
        expect(() => new XCronClient("mainnet")).toThrow("not deployed");
    });

    it("should accept custom addresses", () => {
        const custom = {
            scheduler: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
            keeperRegistry: "erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula",
            rewards: "erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt",
        };
        const xcron = new XCronClient("devnet", custom);
        expect(xcron.getAddresses()).toEqual(custom);
    });
});

describe("XCronClient — Transaction Builders", () => {
    const xcron = new XCronClient("devnet");

    it("should build a scheduleTask transaction (TimeOnce)", () => {
        const tx = xcron.scheduleTask({
            targetContract: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
            targetEndpoint: "claimRewards",
            trigger: { type: "TimeOnce", targetTime: 1700000000 },
            depositEgld: "50000000000000000",
        });

        expect(tx).toBeDefined();
        expect(tx.getData().toString()).toContain("scheduleTask");
    });

    it("should build a scheduleTask transaction (TimeRecurring)", () => {
        const tx = xcron.scheduleTask({
            targetContract: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
            targetEndpoint: "compound",
            trigger: {
                type: "TimeRecurring",
                startTime: 1700000000,
                interval: 604800,
                remainingExecs: 52,
            },
            depositEgld: "2600000000000000000",
        });

        expect(tx).toBeDefined();
        expect(tx.getData().toString()).toContain("scheduleTask");
    });

    it("should build a scheduleTask with ConditionOnChain trigger", () => {
        const tx = xcron.scheduleTask({
            targetContract: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
            targetEndpoint: "liquidate",
            trigger: {
                type: "ConditionOnChain",
                oracleContract: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
                queryEndpoint: "getPrice",
                queryArgs: [],
                comparator: "Lt",
                threshold: "1000000000000000000",
            },
            depositEgld: "100000000000000000",
        });

        expect(tx).toBeDefined();
    });

    it("should build a scheduleRecurring transaction", () => {
        const tx = xcron.scheduleRecurring({
            targetContract: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
            targetEndpoint: "reinvest",
            intervalSeconds: 604800,
            executions: 12,
            depositEgld: "600000000000000000",
        });

        expect(tx).toBeDefined();
    });

    it("should build a cancelTask transaction", () => {
        const tx = xcron.cancelTask(42);
        expect(tx).toBeDefined();
        expect(tx.getData().toString()).toContain("cancelTask");
    });

    it("should include optional args", () => {
        const tx = xcron.scheduleTask({
            targetContract: "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
            targetEndpoint: "swap",
            targetArgs: ["45474c44", "0a"],
            trigger: { type: "TimeOnce", targetTime: 1700000000 },
            maxGas: 10_000_000,
            maxRetries: 5,
            ttlSeconds: 172800,
            depositEgld: "1000000000000000000",
        });

        expect(tx).toBeDefined();
    });

    it("should build a scheduleSovereignTask transaction", () => {
        const tx = xcron.scheduleSovereignTask({
            encryptedPayloadHex: "aabbccddeeff",
            depositEgld: "100000000000000000",
            requestedDeposit: "100000000000000000",
        });

        expect(tx).toBeDefined();
        expect(tx.getData().toString()).toContain("scheduleSovereignTask");
        expect(tx.getData().toString()).toContain("aabbccddeeff");
    });

    it("should build a cancelQuantumTask transaction with legacy task ID", () => {
        const tx = xcron.cancelQuantumTask(42);
        expect(tx).toBeDefined();
        expect(tx.getData().toString()).toContain("cancelQuantumTask");
    });

    it("should build a cancelQuantumTask transaction with task hash", () => {
        const tx = xcron.cancelQuantumTask("aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899");
        expect(tx).toBeDefined();
        expect(tx.getData().toString()).toContain("cancelQuantumTask");
        expect(tx.getData().toString()).toContain("aabbccddeeff");
    });
});

describe("XCronClient — Utility Methods", () => {
    it("should return correct chain IDs", () => {
        const devnet = new XCronClient("devnet");
        const testnet = new XCronClient("testnet");

        expect(devnet.getApiUrl()).toBe("https://devnet-api.multiversx.com");
        expect(testnet.getApiUrl()).toBe("https://testnet-api.multiversx.com");
    });

    it("should return scheduler address", () => {
        const xcron = new XCronClient("devnet");
        expect(xcron.getSchedulerAddress()).toContain("erd1");
    });
});

describe("getAddresses", () => {
    it("should return devnet addresses", () => {
        const addrs = getAddresses("devnet");
        expect(addrs.scheduler).toBeTruthy();
        expect(addrs.keeperRegistry).toBeTruthy();
        expect(addrs.rewards).toBeTruthy();
    });

    it("should return testnet addresses", () => {
        const addrs = getAddresses("testnet");
        expect(addrs.scheduler).toBeTruthy();
    });

    it("should throw for mainnet", () => {
        expect(() => getAddresses("mainnet")).toThrow();
    });
});
