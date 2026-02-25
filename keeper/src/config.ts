import * as fs from "fs";

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

    return config;
}

