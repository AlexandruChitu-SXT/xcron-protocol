import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { NETWORK, WALLETCONNECT } from '../config';

// PEM signing imports (lazy loaded for tree-shaking)

/* ──────────────── Types ──────────────── */

export interface WalletState {
    address: string;
    balance: string;
    connected: boolean;
    isDemo: boolean;
}

export interface TransactionPayload {
    receiver: string;
    data: string;
    value: string;
    gasLimit: number;
}

export type ToastType = 'success' | 'error' | 'info';
export interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface WalletContextType {
    wallet: WalletState;
    connect: (address: string) => Promise<void>;
    connectPem: (pemText: string) => Promise<void>;
    connectDemo: () => void;
    disconnect: () => void;
    showConnectModal: boolean;
    setShowConnectModal: (v: boolean) => void;
    signAndSendTransaction: (tx: TransactionPayload) => Promise<string | null>;
    toasts: Toast[];
    addToast: (message: string, type: ToastType) => void;
    removeToast: (id: number) => void;
    refreshBalance: () => Promise<void>;
}

/* ──────────────── Context ──────────────── */

const defaultWallet: WalletState = { address: '', balance: '0', connected: false, isDemo: false };
const WalletContext = createContext<WalletContextType>({
    wallet: defaultWallet,
    connect: async () => { },
    connectPem: async () => { },
    connectDemo: () => { },
    disconnect: () => { },
    showConnectModal: false,
    setShowConnectModal: () => { },
    signAndSendTransaction: async () => null,
    toasts: [],
    addToast: () => { },
    removeToast: () => { },
    refreshBalance: async () => { },
});

export const useWallet = () => useContext(WalletContext);

/* ──────────────── Provider ──────────────── */

export function WalletProvider({ children }: { children: ReactNode }) {
    const [wallet, setWallet] = useState<WalletState>(defaultWallet);
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    // PEM helpers: sessionStorage so it survives page refreshes
    // but is cleared when the tab/browser closes (secure for testnet)
    const getPemContent = () => sessionStorage.getItem('xcron_pem_session') || '';
    const setPemContent = (pem: string) => sessionStorage.setItem('xcron_pem_session', pem);
    const clearPemContent = () => sessionStorage.removeItem('xcron_pem_session');

    /* ── Toast helpers ── */
    const addToast = useCallback((message: string, type: ToastType) => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    /* ── Connect ── */
    const connect = useCallback(async (address: string) => {
        try {
            const resp = await fetch(`${NETWORK.apiUrl}/accounts/${address}`);
            if (!resp.ok) throw new Error(`Account not found: ${resp.status}`);
            const account = await resp.json();
            setWallet({
                address,
                balance: account.balance || '0',
                connected: true,
                isDemo: false,
            });
            setShowConnectModal(false);
            localStorage.setItem('xcron_wallet', address);
            if (!localStorage.getItem('xcron_wallet_provider')) {
                localStorage.setItem('xcron_wallet_provider', 'manual');
            }
        } catch (err) {
            console.error('Failed to connect:', err);
        }
    }, []);

    /* ── Demo Mode Connect — no real wallet, transparent preview ── */
    const connectDemo = useCallback(() => {
        setWallet({
            address: 'demo',
            balance: '0',
            connected: true,
            isDemo: true,
        });
        setShowConnectModal(false);
        localStorage.setItem('xcron_wallet', 'demo');
        localStorage.setItem('xcron_wallet_provider', 'demo');
    }, []);

    /* ── Connect via PEM — devnet/testnet only, key in memory ── */
    const connectPem = useCallback(async (pemText: string) => {
        try {
            if (NETWORK.name === 'mainnet') {
                throw new Error('PEM signing is not allowed on mainnet for security');
            }
            const { UserSigner } = await import('@multiversx/sdk-wallet');
            const signer = UserSigner.fromPem(pemText);
            const address = signer.getAddress().bech32();

            // Store PEM in sessionStorage (survives refreshes, cleared on tab close)
            setPemContent(pemText);

            const resp = await fetch(`${NETWORK.apiUrl}/accounts/${address}`);
            if (!resp.ok) throw new Error(`Account not found: ${resp.status}`);
            const account = await resp.json();

            setWallet({
                address,
                balance: account.balance || '0',
                connected: true,
                isDemo: false,
            });
            setShowConnectModal(false);
            localStorage.setItem('xcron_wallet', address);
            localStorage.setItem('xcron_wallet_provider', 'pem');
            addToast(`Connected via PEM: ${address.slice(0, 8)}...${address.slice(-4)}`, 'success');
        } catch (err: any) {
            console.error('PEM connect failed:', err);
            addToast(`PEM error: ${err.message}`, 'error');
        }
    }, [addToast]);

    /* ── Disconnect ── */
    const disconnect = useCallback(() => {
        setWallet(defaultWallet);
        clearPemContent(); // Clear PEM from session
        localStorage.removeItem('xcron_wallet');
        localStorage.removeItem('xcron_wallet_provider');
        addToast('Wallet disconnected', 'info');
    }, [addToast]);

    /* ── Refresh balance ── */
    const refreshBalance = useCallback(async () => {
        if (!wallet.address) return;
        try {
            const resp = await fetch(`${NETWORK.apiUrl}/accounts/${wallet.address}`);
            if (resp.ok) {
                const account = await resp.json();
                setWallet((prev) => ({ ...prev, balance: account.balance || '0' }));
            }
        } catch (err) {
            console.error('Failed to refresh balance:', err);
        }
    }, [wallet.address]);

    /* ── Sign & Send Transaction ── */
    const signAndSendTransaction = useCallback(async (tx: TransactionPayload): Promise<string | null> => {
        if (!wallet.connected) return null;
        if (wallet.isDemo) {
            addToast('Demo mode — connect a real wallet to submit transactions', 'info');
            return null;
        }

        const provider = localStorage.getItem('xcron_wallet_provider');

        // ── PEM signing (devnet/testnet only) ──
        if (provider === 'pem') {
            try {
                if (!getPemContent()) {
                    addToast('PEM session expired — please reconnect with your PEM file', 'error');
                    return null;
                }
                addToast('Signing with PEM wallet...', 'info');

                const { UserSigner } = await import('@multiversx/sdk-wallet');
                const { Transaction, TransactionComputer, Address } = await import('@multiversx/sdk-core');

                const signer = UserSigner.fromPem(getPemContent());

                // Get fresh nonce
                const accountResp = await fetch(`${NETWORK.apiUrl}/accounts/${wallet.address}`);
                const accountData = await accountResp.json();

                const transaction = new Transaction({
                    nonce: BigInt(accountData.nonce),
                    value: BigInt(tx.value),
                    receiver: Address.newFromBech32(tx.receiver),
                    sender: Address.newFromBech32(wallet.address),
                    gasLimit: BigInt(tx.gasLimit),
                    gasPrice: BigInt(1000000000),
                    data: new TextEncoder().encode(tx.data),
                    chainID: NETWORK.chainId,
                    version: 1,
                });

                // Serialize and sign
                const computer = new TransactionComputer();
                const bytesForSigning = computer.computeBytesForSigning(transaction);
                const signature = await signer.sign(bytesForSigning);
                transaction.signature = new Uint8Array(signature);

                // Broadcast via API
                addToast('Broadcasting transaction...', 'info');
                const sendable = transaction.toSendable();
                const broadcastResp = await fetch(`${NETWORK.apiUrl}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sendable),
                });

                if (!broadcastResp.ok) {
                    const errText = await broadcastResp.text();
                    throw new Error(`Broadcast failed: ${errText}`);
                }
                const result = await broadcastResp.json();
                addToast(`✅ Transaction sent! ${result.txHash?.slice(0, 12)}...`, 'success');
                setTimeout(() => refreshBalance(), 6000);
                return result.txHash || null;
            } catch (err: any) {
                console.error('PEM sign failed:', err);
                addToast(`PEM sign error: ${err.message}`, 'error');
                return null;
            }
        }

        if (provider === 'extension') {
            try {
                addToast('Signing with DeFi Wallet...', 'info');
                const { ExtensionProvider } = await import('@multiversx/sdk-extension-provider');
                const extensionProvider = ExtensionProvider.getInstance();
                await extensionProvider.init();

                const accountResp = await fetch(`${NETWORK.apiUrl}/accounts/${wallet.address}`);
                const accountData = await accountResp.json();

                const transaction = {
                    nonce: accountData.nonce,
                    value: tx.value,
                    receiver: tx.receiver,
                    sender: wallet.address,
                    gasLimit: tx.gasLimit,
                    gasPrice: 1000000000,
                    data: btoa(tx.data),
                    chainID: NETWORK.chainId,
                    version: 1,
                };

                const signedTx = await extensionProvider.signTransaction(transaction as any);

                addToast('Broadcasting transaction...', 'info');
                const broadcastResp = await fetch(`${NETWORK.apiUrl}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(signedTx),
                });

                if (!broadcastResp.ok) {
                    const errText = await broadcastResp.text();
                    throw new Error(`Broadcast failed: ${errText}`);
                }
                const result = await broadcastResp.json();
                addToast(`Transaction sent! Hash: ${result.txHash?.slice(0, 12)}...`, 'success');

                // Auto-refresh balance after ~6s
                setTimeout(() => refreshBalance(), 6000);

                return result.txHash || null;
            } catch (err: any) {
                console.error('Extension sign failed:', err);
                addToast(`Extension error: ${err.message}. Opening Web Wallet...`, 'error');
                return signViaWebWallet(tx);
            }
        }

        if (provider === 'walletconnect') {
            try {
                addToast('Signing with xPortal...', 'info');
                const { WalletConnectV2Provider } = await import('@multiversx/sdk-wallet-connect-provider');

                const callbacks = {
                    onClientLogin: () => { },
                    onClientLogout: () => { },
                    onClientEvent: () => { },
                };

                const wcProvider = new WalletConnectV2Provider(
                    callbacks,
                    NETWORK.chainId,
                    WALLETCONNECT.relayUrl,
                    WALLETCONNECT.projectId
                );
                await wcProvider.init();

                const accountResp = await fetch(`${NETWORK.apiUrl}/accounts/${wallet.address}`);
                const accountData = await accountResp.json();

                const transaction = {
                    nonce: accountData.nonce,
                    value: tx.value,
                    receiver: tx.receiver,
                    sender: wallet.address,
                    gasLimit: tx.gasLimit,
                    gasPrice: 1000000000,
                    data: btoa(tx.data),
                    chainID: NETWORK.chainId,
                    version: 1,
                };

                const signedTx = await wcProvider.signTransaction(transaction as any);

                addToast('Broadcasting transaction...', 'info');
                const broadcastResp = await fetch(`${NETWORK.apiUrl}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(signedTx),
                });

                if (!broadcastResp.ok) {
                    const errText = await broadcastResp.text();
                    throw new Error(`Broadcast failed: ${errText}`);
                }
                const result = await broadcastResp.json();
                addToast(`Transaction sent! Hash: ${result.txHash?.slice(0, 12)}...`, 'success');

                setTimeout(() => refreshBalance(), 6000);
                return result.txHash || null;
            } catch (err: any) {
                console.error('WalletConnect sign failed:', err);
                addToast(`xPortal error: ${err.message}. Opening Web Wallet...`, 'error');
                return signViaWebWallet(tx);
            }
        }

        // Default: sign via Web Wallet redirect
        addToast('Opening Web Wallet for signing...', 'info');
        return signViaWebWallet(tx);
    }, [wallet, addToast, refreshBalance]);

    const signViaWebWallet = async (tx: TransactionPayload): Promise<string | null> => {
        try {
            const { WalletProvider } = await import('@multiversx/sdk-web-wallet-provider');
            const { Transaction, Address } = await import('@multiversx/sdk-core');

            const provider = new WalletProvider(NETWORK.walletUrl);

            // Need fresh nonce for the account to ensure transaction builds correctly
            const accountResp = await fetch(`${NETWORK.apiUrl}/accounts/${wallet.address}`);
            const accountData = await accountResp.json();

            const transaction = new Transaction({
                nonce: BigInt(accountData.nonce),
                value: BigInt(tx.value),
                receiver: Address.newFromBech32(tx.receiver),
                sender: Address.newFromBech32(wallet.address),
                gasLimit: BigInt(tx.gasLimit),
                gasPrice: BigInt(1000000000),
                data: new TextEncoder().encode(tx.data),
                chainID: NETWORK.chainId,
                version: 1,
            });

            // Redirects to web wallet
            await provider.signTransaction(transaction, {
                callbackUrl: `${window.location.origin}${window.location.pathname}`,
            });

            return 'pending-web-wallet';
        } catch (err: any) {
            console.error('Failed to build Web Wallet URL:', err);
            addToast(`Web Wallet error: ${err.message}`, 'error');
            return null;
        }
    };

    /* ── Web Wallet callback handling ── */
    useEffect(() => {
        const url = new URL(window.location.href);
        const address = url.searchParams.get('address');

        if (address && address.startsWith('erd1')) {
            // Login callback from Web Wallet
            localStorage.setItem('xcron_wallet_provider', 'webwallet');
            connect(address).then(() => {
                addToast('Connected via Web Wallet!', 'success');
            });
            // Clean URL
            url.searchParams.delete('address');
            url.searchParams.delete('signature');
            url.searchParams.delete('loginToken');
            window.history.replaceState({}, '', url.pathname + url.hash);
        }

        if (url.searchParams.has('status')) {
            // Transaction callback from Web Wallet
            const status = url.searchParams.get('status');
            const txHash = url.searchParams.get('txHash');
            if (status === 'success' && txHash) {
                addToast(`Transaction confirmed! ${txHash.slice(0, 12)}...`, 'success');
            } else if (status === 'failed') {
                addToast('Transaction failed in Web Wallet', 'error');
            } else if (status === 'cancelled') {
                addToast('Transaction cancelled', 'info');
            }
            // Clean URL
            url.searchParams.delete('status');
            url.searchParams.delete('txHash');
            window.history.replaceState({}, '', url.pathname + url.hash);
        }
    }, []);

    /* ── Auto-reconnect from localStorage ── */
    useEffect(() => {
        const saved = localStorage.getItem('xcron_wallet');
        const provider = localStorage.getItem('xcron_wallet_provider');
        if (!saved || wallet.connected) return;

        // Clean up legacy zero-address from old Quick Connect
        const ZERO_ADDR = 'erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu';
        if (saved === ZERO_ADDR || saved === 'erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu') {
            localStorage.removeItem('xcron_wallet');
            localStorage.removeItem('xcron_wallet_provider');
            return;
        }

        // If saved as demo, reconnect in demo mode
        if (saved === 'demo' || provider === 'demo') {
            connectDemo();
            return;
        }

        // Normal wallet reconnect
        connect(saved).catch(() => {
            setTimeout(() => {
                const stillSaved = localStorage.getItem('xcron_wallet');
                if (stillSaved && !wallet.connected) {
                    connect(stillSaved).catch(() => {
                        console.warn('Auto-reconnect failed after retry');
                    });
                }
            }, 3000);
        });
    }, [connect, wallet.connected]);

    /* ── Periodic balance refresh (every 30s) ── */
    useEffect(() => {
        if (!wallet.connected) return;
        const interval = setInterval(() => refreshBalance(), 30000);
        return () => clearInterval(interval);
    }, [wallet.connected, refreshBalance]);

    /* ── Network reconnection (WiFi ↔ mobile data) ── */
    useEffect(() => {
        const handleOnline = () => {
            if (wallet.connected) {
                refreshBalance();
                addToast('Connection restored', 'success');
            }
        };
        const handleOffline = () => {
            if (wallet.connected) {
                addToast('Network offline — will reconnect automatically', 'info');
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [wallet.connected, refreshBalance, addToast]);

    return (
        <WalletContext.Provider
            value={{
                wallet, connect, connectPem, connectDemo, disconnect,
                showConnectModal, setShowConnectModal,
                signAndSendTransaction,
                toasts, addToast, removeToast,
                refreshBalance,
            }}
        >
            {children}
        </WalletContext.Provider>
    );
}

