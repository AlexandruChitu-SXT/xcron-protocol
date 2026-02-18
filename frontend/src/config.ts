// XCron Protocol — Frontend Configuration

export const NETWORK = {
    name: "devnet",
    apiUrl: "https://devnet-api.multiversx.com",
    gatewayUrl: "https://devnet-gateway.multiversx.com",
    explorerUrl: "https://devnet-explorer.multiversx.com",
    walletUrl: "https://devnet-wallet.multiversx.com",
    chainId: "D",
};

export const CONTRACTS = {
    scheduler:
        "erd1qqqqqqqqqqqqqpgqsmmpmp7hh6cqrnng0vp9ywgre70luvus7k8svk7ejh",
    keeperRegistry:
        "erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula",
    rewards:
        "erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt",
};

export const EXPLORER_TX = (hash: string) =>
    `${NETWORK.explorerUrl}/transactions/${hash}`;

export const EXPLORER_ACCOUNT = (addr: string) =>
    `${NETWORK.explorerUrl}/accounts/${addr}`;

// Min deposit (0.1 EGLD)
export const MIN_DEPOSIT = "100000000000000000";

// Gas limits
export const GAS_SCHEDULE_TASK = 30_000_000;
export const GAS_CANCEL_TASK = 10_000_000;
export const GAS_REGISTER_KEEPER = 10_000_000;
export const GAS_CLAIM_REWARDS = 10_000_000;
export const GAS_REQUEST_UNSTAKE = 10_000_000;
export const GAS_WITHDRAW_STAKE = 10_000_000;
