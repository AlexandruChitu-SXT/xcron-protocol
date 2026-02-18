import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { NETWORK } from '../config';

/**
 * Wallet connection modal supporting:
 * 1. MultiversX DeFi Wallet (browser extension)
 * 2. xPortal Mobile (WalletConnect QR)
 * 3. MultiversX Web Wallet (redirect)
 * 4. Quick connect (deployer wallet for testing)
 */
export function ConnectModal() {
    const { showConnectModal, setShowConnectModal, connect } = useWallet();
    const [loading, setLoading] = useState('');
    const [qrUri, setQrUri] = useState('');
    const [error, setError] = useState('');

    if (!showConnectModal) return null;

    const handleExtensionLogin = async () => {
        setLoading('extension');
        setError('');
        try {
            const { ExtensionProvider } = await import('@multiversx/sdk-extension-provider');
            const provider = ExtensionProvider.getInstance();
            const initialized = await provider.init();

            if (!initialized) {
                throw new Error('Extension not installed');
            }

            const address = await provider.login();
            if (address) {
                localStorage.setItem('xcron_wallet_provider', 'extension');
                await connect(address as unknown as string);
            }
        } catch (err: any) {
            console.error('Extension login failed:', err);
            if (err?.message?.includes('not installed') || err?.message?.includes('not found')) {
                setError('MultiversX DeFi Wallet extension not detected. Please install it first.');
                window.open('https://chrome.google.com/webstore/detail/multiversx-defi-wallet/dngmlblcodfobpdpecaadgfbcggfjfnm', '_blank');
            } else {
                setError(err.message || 'Extension login failed');
            }
        } finally {
            setLoading('');
        }
    };

    const handleXPortalLogin = async () => {
        setLoading('xportal');
        setError('');
        try {
            const { WalletConnectV2Provider } = await import('@multiversx/sdk-wallet-connect-provider');

            const callbacks = {
                onClientLogin: async () => {
                    const address = await provider.getAddress();
                    if (address) {
                        localStorage.setItem('xcron_wallet_provider', 'walletconnect');
                        await connect(address);
                        setQrUri('');
                    }
                },
                onClientLogout: () => {
                    console.log('WalletConnect logged out');
                },
                onClientEvent: (event: any) => {
                    console.log('WalletConnect event:', event);
                },
            };

            const provider = new WalletConnectV2Provider(
                callbacks,
                NETWORK.chainId,
                '9b36b2703c75eb57d9680e44b74c4df9', // WalletConnect V2 Project ID
                'wss://relay.walletconnect.com'
            );

            await provider.init();
            const { uri, approval } = await provider.connect();

            if (uri) {
                setQrUri(uri);
            }

            // Wait for approval
            await approval();
            const address = await provider.getAddress();
            if (address) {
                localStorage.setItem('xcron_wallet_provider', 'walletconnect');
                await connect(address);
                setQrUri('');
            }
        } catch (err: any) {
            console.error('xPortal login failed:', err);
            setError(err.message || 'xPortal connection failed');
            setQrUri('');
        } finally {
            setLoading('');
        }
    };

    const handleWebWalletLogin = () => {
        setLoading('webwallet');
        const callbackUrl = encodeURIComponent(`${window.location.origin}/`);
        window.location.href = `${NETWORK.walletUrl}/hook/login?callbackUrl=${callbackUrl}`;
    };

    const handleQuickConnect = async () => {
        setLoading('quick');
        try {
            // Deployer wallet for testing
            await connect('erd1yakg9yvumdf67y6klp2yxy9yv4rw8rmrk6xw8462wdy0nk78dv4qkspvp9');
        } catch (err: any) {
            setError(err.message || 'Quick connect failed');
        } finally {
            setLoading('');
        }
    };

    const onClose = () => {
        setShowConnectModal(false);
        setQrUri('');
        setError('');
        setLoading('');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>Connect Wallet</h2>
                <p>Choose how you want to connect to XCron Protocol on MultiversX Devnet.</p>

                {error && (
                    <div className="toast-error" style={{ position: 'relative', marginBottom: 12, padding: 10, borderRadius: 8, fontSize: '0.8rem' }}>
                        {error}
                    </div>
                )}

                <div className="modal-options">
                    {/* DeFi Wallet Extension */}
                    <button
                        className="modal-option"
                        onClick={handleExtensionLogin}
                        disabled={!!loading}
                    >
                        <div className="option-icon"></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>DeFi Wallet Extension</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                Browser extension — instant login
                            </div>
                        </div>
                        {loading === 'extension' && <span className="loading-spinner" />}
                    </button>

                    {/* xPortal Mobile */}
                    <button
                        className="modal-option"
                        onClick={handleXPortalLogin}
                        disabled={!!loading}
                    >
                        <div className="option-icon"></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>xPortal Mobile</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                Scan QR code with xPortal app
                            </div>
                        </div>
                        {loading === 'xportal' && <span className="loading-spinner" />}
                    </button>

                    {/* Web Wallet */}
                    <button
                        className="modal-option"
                        onClick={handleWebWalletLogin}
                        disabled={!!loading}
                    >
                        <div className="option-icon"></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>MultiversX Web Wallet</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                Login via web wallet (redirect)
                            </div>
                        </div>
                        {loading === 'webwallet' && <span className="loading-spinner" />}
                    </button>

                    {/* Quick Connect (Devnet) */}
                    <button
                        className="modal-option"
                        onClick={handleQuickConnect}
                        disabled={!!loading}
                        style={{ borderColor: 'rgba(99, 102, 241, 0.2)' }}
                    >
                        <div className="option-icon" style={{ background: 'rgba(99, 102, 241, 0.15)' }}></div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--accent-light)' }}>Deployer Wallet</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                Quick-connect for devnet testing
                            </div>
                        </div>
                        {loading === 'quick' && <span className="loading-spinner" />}
                    </button>

                    {/* WalletConnect QR Code */}
                    {qrUri && (
                        <div style={{ textAlign: 'center', padding: 16 }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                                Scan with xPortal app
                            </p>
                            <div style={{ background: 'white', padding: 16, borderRadius: 12, display: 'inline-block' }}>
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                                    alt="WalletConnect QR"
                                    width={200}
                                    height={200}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <button className="modal-close" onClick={onClose}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
