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
    vault: string;
}> = {
    devnet: {
        scheduler: import.meta.env.VITE_SCHEDULER_ADDRESS || 'erd1qqqqqqqqqqqqqpgqr5qa968a8wluwshh4k7ua06z0w4t9wnu7k8sefuv72',
        keeperRegistry: import.meta.env.VITE_KEEPER_REGISTRY_ADDRESS || 'erd1qqqqqqqqqqqqqpgq0zlpshzkjr5egtaueyn29a2t9kv8mywp7k8sxexula',
        rewards: import.meta.env.VITE_REWARDS_ADDRESS || 'erd1qqqqqqqqqqqqqpgqzkhxp72uzdq49dmzsng3g0tp98629k8z7k8szas8nt',
        ping: import.meta.env.VITE_PING_ADDRESS || 'erd1qqqqqqqqqqqqqpgq85c5nze8vnrkcd3sr7cscclj7tmv6nxn7k8sa9cq2a',
        vault: import.meta.env.VITE_VAULT_ADDRESS || '',
    },
    testnet: {
        scheduler: import.meta.env.VITE_SCHEDULER_ADDRESS || 'erd1qqqqqqqqqqqqqpgqcny96vj8sesktdrqkx4e5qeujh8j7ap47k8senhrj5',
        keeperRegistry: import.meta.env.VITE_KEEPER_REGISTRY_ADDRESS || 'erd1qqqqqqqqqqqqqpgq53ffcxnes943y6s27nhynxt6y9a787f07k8se4t2ka',
        rewards: import.meta.env.VITE_REWARDS_ADDRESS || 'erd1qqqqqqqqqqqqqpgq6t7um2uxapc9tk0mv4z5k68yd20a33vp7k8slmnpta',
        ping: import.meta.env.VITE_PING_ADDRESS || 'erd1qqqqqqqqqqqqqpgq2zpa5y9rp9djzsfr93ls2tmpns099cvu7k8s579232',
        vault: import.meta.env.VITE_VAULT_ADDRESS || 'erd1qqqqqqqqqqqqqpgqd2ehnkrswj9vwe9rr0xrqykhj6hlufze7k8sxtt0an',
    },
    mainnet: {
        scheduler: import.meta.env.VITE_SCHEDULER_ADDRESS || '',
        keeperRegistry: import.meta.env.VITE_KEEPER_REGISTRY_ADDRESS || '',
        rewards: import.meta.env.VITE_REWARDS_ADDRESS || '',
        ping: import.meta.env.VITE_PING_ADDRESS || '',
        vault: import.meta.env.VITE_VAULT_ADDRESS || '',
    },
};

// ── Exports ──
export const NETWORK = NETWORKS[NETWORK_ID];
export const CONTRACTS = CONTRACT_ADDRESSES[NETWORK_ID];

export const EXPLORER_TX = (hash: string) =>
    `${NETWORK.explorerUrl}/transactions/${hash}`;

export const EXPLORER_ACCOUNT = (addr: string) =>
    `${NETWORK.explorerUrl}/accounts/${addr}`;

// Min deposit: 0.1 EGLD (1e17 wei) — matches on-chain Scheduler min_deposit config
export const MIN_DEPOSIT = '100000000000000000';

// Gas limits
export const GAS_SCHEDULE_TASK = 30_000_000;
export const GAS_CANCEL_TASK = 10_000_000;
export const GAS_REGISTER_KEEPER = 10_000_000;
export const GAS_CLAIM_REWARDS = 10_000_000;
export const GAS_REQUEST_UNSTAKE = 10_000_000;
export const GAS_WITHDRAW_STAKE = 10_000_000;
export const GAS_AUTHORIZE_CLONE_KEY = 10_000_000;
export const GAS_REVOKE_CLONE_KEY = 10_000_000;
export const GAS_FUND_CLONE_KEY = 10_000_000;

// WalletConnect (xPortal)
export const WALLETCONNECT = {
    projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
    relayUrl: 'wss://relay.walletconnect.com',
};
