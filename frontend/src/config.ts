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
        "erd1qqqqqqqqqqqqqpgqjrysr6ml0mdsdxugjgy59u0v5j8x9qk57k8smjt09x",
    keeperRegistry:
        "erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula",
    rewards:
        "erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt",
    ping:
        "erd1qqqqqqqqqqqqqpgq85c5nze8vnrkcd3sr7cscclj7tmv6nxn7k8sa9cq2a",
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
