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
        scheduler: import.meta.env.VITE_SCHEDULER_ADDRESS || 'erd1qqqqqqqqqqqqqpgqg49x0pq93549gt0nvds7fjaxslxc9lpt7k8sc6d263',
        keeperRegistry: import.meta.env.VITE_KEEPER_REGISTRY_ADDRESS || 'erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka',
        rewards: import.meta.env.VITE_REWARDS_ADDRESS || 'erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta',
        ping: import.meta.env.VITE_PING_ADDRESS || '',
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

// Min deposit (0.01 EGLD for devnet/testnet, 0.1 EGLD for mainnet)
export const MIN_DEPOSIT = NETWORK_ID === 'mainnet'
    ? '100000000000000000'
    : '10000000000000000';

// Gas limits
export const GAS_SCHEDULE_TASK = 30_000_000;
export const GAS_CANCEL_TASK = 10_000_000;
export const GAS_REGISTER_KEEPER = 10_000_000;
export const GAS_CLAIM_REWARDS = 10_000_000;
export const GAS_REQUEST_UNSTAKE = 10_000_000;
export const GAS_WITHDRAW_STAKE = 10_000_000;

// WalletConnect (xPortal)
export const WALLETCONNECT = {
    projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '9b36b2703c75eb57d9680e44b74c4df9',
    relayUrl: 'wss://relay.walletconnect.com',
};
