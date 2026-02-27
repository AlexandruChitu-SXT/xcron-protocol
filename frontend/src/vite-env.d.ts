/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_NETWORK: 'devnet' | 'testnet' | 'mainnet';
    readonly VITE_WALLETCONNECT_PROJECT_ID: string;
    readonly VITE_SCHEDULER_ADDRESS?: string;
    readonly VITE_KEEPER_REGISTRY_ADDRESS?: string;
    readonly VITE_REWARDS_ADDRESS?: string;
    readonly VITE_PING_ADDRESS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
