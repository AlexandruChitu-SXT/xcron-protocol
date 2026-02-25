import * as fs from "fs";
import { AIConfig, AIProvider } from "./ai_evaluator";
import { CommitRevealConfig } from "./commit_reveal";

export interface NetworkConfig {
    chainId: string;
    gatewayUrl: string;
    apiUrl: string;
}

export interface ContractAddresses {
    scheduler: string;
    keeperRegistry: string;
    rewards: string;
}

export interface KeeperSettings {
    walletPem: string;
    pollIntervalMs: number;
    maxGasPerExecution: number;
    minProfitEgld: string;
}

export interface XPortalClaimConfig {
    enabled: boolean;
    walletsDir: string;
    network: "mainnet" | "devnet";
}

export interface AppConfig {
    network: NetworkConfig;
    contracts: ContractAddresses;
    keeper: KeeperSettings;
    xportalClaim?: XPortalClaimConfig;
    ai?: AIConfig;
    commitReveal?: CommitRevealConfig;
}

export function loadConfig(path: string): AppConfig {
    const raw = fs.readFileSync(path, "utf-8");
    const config: AppConfig = JSON.parse(raw);

    if (!config.contracts.scheduler) {
        throw new Error("Scheduler contract address is required in config");
    }
    if (!config.keeper.walletPem) {
        throw new Error("Wallet PEM path is required in config");
    }

    // Default xportalClaim config if not present
    if (!config.xportalClaim) {
        config.xportalClaim = {
            enabled: false,
            walletsDir: "./.secrets/xportal-wallets",
            network: "mainnet",
        };
    }

    // Default AI config if not present (disabled by default)
    if (!config.ai) {
        config.ai = {
            enabled: false,
            provider: "openai" as AIProvider,
            apiKey: "",
            model: "gpt-4o-mini",
            maxCostPerDayUsd: 0.50,
            timeoutMs: 10000,
        };
    }

    // Default commit-reveal config if not present (disabled by default)
    if (!config.commitReveal) {
        config.commitReveal = {
            enabled: false,
            revealDelayMs: 5000,
            bondEgld: "0",
        };
    }

    return config;
}

