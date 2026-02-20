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
        "erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72",
    keeperRegistry:
        "erd1qqqqqqqqqqqqqpgq9anru5s7hw4pxxf4jjdx0n883mcy85hx7k8s34ldyd",
    rewards:
        "erd1qqqqqqqqqqqqqpgqzfp45vdryaqpl6agrc2qyz3h8hsx277x7k8syfss43",
    ping:
        "erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r",
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

// WalletConnect (xPortal)
export const WALLETCONNECT = {
    projectId: '9b36b2703c75eb57d9680e44b74c4df9',
    relayUrl: 'wss://relay.walletconnect.com',
};
