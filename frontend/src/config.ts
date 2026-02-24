// XCron Protocol — Frontend Configuration
// Network is read from VITE_NETWORK env var (defaults to "devnet")

type NetworkId = 'devnet' | 'testnet' | 'mainnet';

const NETWORK_ID = (import.meta.env.VITE_NETWORK as NetworkId) || 'devnet';

// ── Network URLs & Config ──
const NETWORKS: Record<NetworkId, {
    name: string;
    apiUrl: string;
    gatewayUrl: string;
    explorerUrl: string;
    walletUrl: string;
    chainId: string;
}> = {
    devnet: {
        name: 'devnet',
        apiUrl: 'https://devnet-api.multiversx.com',
        gatewayUrl: 'https://devnet-gateway.multiversx.com',
        explorerUrl: 'https://devnet-explorer.multiversx.com',
        walletUrl: 'https://devnet-wallet.multiversx.com',
        chainId: 'D',
    },
    testnet: {
        name: 'testnet',
        apiUrl: 'https://testnet-api.multiversx.com',
        gatewayUrl: 'https://testnet-gateway.multiversx.com',
        explorerUrl: 'https://testnet-explorer.multiversx.com',
        walletUrl: 'https://testnet-wallet.multiversx.com',
        chainId: 'T',
    },
    mainnet: {
        name: 'mainnet',
        apiUrl: 'https://api.multiversx.com',
        gatewayUrl: 'https://gateway.multiversx.com',
        explorerUrl: 'https://explorer.multiversx.com',
        walletUrl: 'https://wallet.multiversx.com',
        chainId: '1',
    },
};

// ── Contract Addresses (per network) ──
const CONTRACT_ADDRESSES: Record<NetworkId, {
    scheduler: string;
    keeperRegistry: string;
    rewards: string;
    ping: string;
}> = {
    devnet: {
        scheduler: import.meta.env.VITE_SCHEDULER_ADDRESS || 'erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72',
        keeperRegistry: import.meta.env.VITE_KEEPER_REGISTRY_ADDRESS || 'erd1qqqqqqqqqqqqqpgqdeyw8mmzkza4tlndeztty0f6hgng5z4s7k8suagqha',
        rewards: import.meta.env.VITE_REWARDS_ADDRESS || 'erd1qqqqqqqqqqqqqpgqtjjy56pj7gmqyaa9hagzvx4y5mkdll977k8sxcw2vd',
        ping: import.meta.env.VITE_PING_ADDRESS || 'erd1qqqqqqqqqqqqqpgq5nywkk07w37j8579v3uhayp6n78ppq8q7k8s2grq2r',
    },
    testnet: {
        scheduler: import.meta.env.VITE_SCHEDULER_ADDRESS || 'erd1qqqqqqqqqqqqqpgqkchuk2w2nsmsrdqkd4s2t7z4m7wq6st27k8sqwqdju',
        keeperRegistry: import.meta.env.VITE_KEEPER_REGISTRY_ADDRESS || 'erd1qqqqqqqqqqqqqpgqhxvdt2c5y0c4g4aj8fsaar4f9v2ejque7k8ss6c2xs',
        rewards: import.meta.env.VITE_REWARDS_ADDRESS || 'erd1qqqqqqqqqqqqqpgqwk66v5rfvafvat9gye7hj5zzuy3aj82a7k8sjuytfd',
        ping: import.meta.env.VITE_PING_ADDRESS || 'erd1qqqqqqqqqqqqqpgqurq9m4acsgv43d256c6crhj200tn9sj57k8sp7szmx',
    },
    mainnet: {
        scheduler: import.meta.env.VITE_SCHEDULER_ADDRESS || '',
        keeperRegistry: import.meta.env.VITE_KEEPER_REGISTRY_ADDRESS || '',
        rewards: import.meta.env.VITE_REWARDS_ADDRESS || '',
        ping: import.meta.env.VITE_PING_ADDRESS || '',
    },
};

// ── Exports ──
export const NETWORK = NETWORKS[NETWORK_ID];
export const CONTRACTS = CONTRACT_ADDRESSES[NETWORK_ID];

export const EXPLORER_TX = (hash: string) =>
    `${NETWORK.explorerUrl}/transactions/${hash}`;

export const EXPLORER_ACCOUNT = (addr: string) =>
    `${NETWORK.explorerUrl}/accounts/${addr}`;

// Min deposit (0.001 EGLD — matches on-chain Scheduler config)
export const MIN_DEPOSIT = '1000000000000000';

// Gas limits
export const GAS_SCHEDULE_TASK = 30_000_000;
export const GAS_CANCEL_TASK = 10_000_000;
export const GAS_REGISTER_KEEPER = 10_000_000;
export const GAS_CLAIM_REWARDS = 10_000_000;
export const GAS_REQUEST_UNSTAKE = 10_000_000;
export const GAS_WITHDRAW_STAKE = 10_000_000;

// WalletConnect (xPortal)
export const WALLETCONNECT = {
    projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
    relayUrl: 'wss://relay.walletconnect.com',
};
