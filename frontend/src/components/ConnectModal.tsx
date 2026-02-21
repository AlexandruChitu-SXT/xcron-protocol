import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { NETWORK, WALLETCONNECT } from '../config';

/**
 * Secure Wallet Connection Modal
 * Supports: DeFi Wallet Extension, xPortal Mobile (WalletConnect QR),
 * MultiversX Web Wallet (redirect), and Devnet Quick Connect (testing only)
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
                WALLETCONNECT.relayUrl,
                WALLETCONNECT.projectId
            );

            // Timeout: if init takes > 10s, the projectId is likely invalid
            const initTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('WalletConnect timed out. The xPortal connection is not available yet — use Web Wallet or Quick Connect instead.')), 10000)
            );

            await Promise.race([provider.init(), initTimeout]);
            const { uri, approval } = await provider.connect();

            if (uri) {
                setQrUri(uri);
            }

            // Wait for approval with timeout
            const approvalTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timed out. Please try scanning the QR code again.')), 60000)
            );
            await Promise.race([approval(), approvalTimeout]);
            const address = await provider.getAddress();
            if (address) {
                localStorage.setItem('xcron_wallet_provider', 'walletconnect');
                await connect(address);
                setQrUri('');
            }
        } catch (err: any) {
            console.error('xPortal login failed:', err);
            const msg = err?.message || 'xPortal connection failed';
            if (msg.includes('Project not found') || msg.includes('timed out')) {
                setError('xPortal connection is not available in this version. Please use Web Wallet or Quick Connect.');
            } else {
                setError(msg);
            }
            setQrUri('');
        } finally {
            setLoading('');
        }
    };

    const handleWebWalletLogin = () => {
        setLoading('webwallet');
        const callbackUrl = encodeURIComponent(window.location.href);
        window.location.href = `${NETWORK.walletUrl}/hook/login?callbackUrl=${callbackUrl}`;
    };

    const handleQuickConnect = async () => {
        setLoading('quick');
        try {
            await connect('erd135zkexfnzryv7z04vppm28uajdsxfvnel2n3kdw2spv3jk0j7k8stpwpgu');
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

    // SVG icons for each option
    const ShieldIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );

    const ExtensionIcon = () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
    );

    const PhoneIcon = () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
    );

    const GlobeIcon = () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#50c878" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    );

    const TestIcon = () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
    );

    const S = {
        modal: {
            background: 'linear-gradient(145deg, #0a2020, #0d2a2a)',
            border: '1px solid rgba(0,255,180,0.15)',
            borderRadius: 20,
            padding: '28px 28px 20px',
            width: '92%',
            maxWidth: 440,
            boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 40px rgba(0,255,120,0.05)',
        } as React.CSSProperties,
        securityBanner: {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: 'rgba(0,255,136,0.06)',
            border: '1px solid rgba(0,255,136,0.15)',
            borderRadius: 10,
            marginBottom: 20,
        } as React.CSSProperties,
        option: {
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#e8f5f0',
            width: '100%',
            textAlign: 'left' as const,
        } as React.CSSProperties,
        iconBox: {
            width: 42,
            height: 42,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        } as React.CSSProperties,
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div style={S.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 6, color: '#e8f5f0' }}>
                    Connect Wallet
                </h2>
                <p style={{ color: 'rgba(232,245,240,0.55)', fontSize: '0.82rem', marginBottom: 16 }}>
                    Choose a secure connection method
                </p>

                {/* Security Banner */}
                <div style={S.securityBanner}>
                    <ShieldIcon />
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#00ff88' }}>
                            Secure Connection
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(232,245,240,0.5)', lineHeight: 1.4, marginTop: 2 }}>
                            XCron never requests or stores your private keys. All transactions
                            are signed securely through your wallet provider.
                        </div>
                    </div>
                </div>

                {/* Devnet Warning */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                    background: 'rgba(251,191,36,0.08)',
                    border: '1px solid rgba(251,191,36,0.25)',
                }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fbbf24' }}>
                            Devnet Environment
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(251,191,36,0.7)', lineHeight: 1.4, marginTop: 2 }}>
                            This is a test network. Do NOT use your mainnet wallet with real EGLD.
                            Use a devnet wallet or Quick Connect for testing.
                        </div>
                    </div>
                </div>

                {error && (
                    <div style={{
                        padding: '10px 14px', borderRadius: 10, fontSize: '0.8rem',
                        background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.2)',
                        color: '#fca5a5', marginBottom: 14,
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* DeFi Wallet Extension */}
                    <button
                        style={S.option}
                        onClick={handleExtensionLogin}
                        disabled={!!loading}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(56,189,248,0.08)';
                            e.currentTarget.style.borderColor = 'rgba(56,189,248,0.25)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        }}
                    >
                        <div style={{ ...S.iconBox, background: 'rgba(56,189,248,0.1)' }}>
                            <ExtensionIcon />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>DeFi Wallet</div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(232,245,240,0.45)', marginTop: 2 }}>
                                Browser extension — instant & secure
                            </div>
                        </div>
                        {loading === 'extension' && <span className="loading-spinner" />}
                    </button>

                    {/* xPortal Mobile */}
                    <button
                        style={S.option}
                        onClick={handleXPortalLogin}
                        disabled={!!loading}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(167,139,250,0.08)';
                            e.currentTarget.style.borderColor = 'rgba(167,139,250,0.25)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        }}
                    >
                        <div style={{ ...S.iconBox, background: 'rgba(167,139,250,0.1)' }}>
                            <PhoneIcon />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>xPortal Mobile</div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(232,245,240,0.45)', marginTop: 2 }}>
                                Scan QR code — WalletConnect v2
                            </div>
                        </div>
                        {loading === 'xportal' && <span className="loading-spinner" />}
                    </button>

                    {/* Web Wallet */}
                    <button
                        style={S.option}
                        onClick={handleWebWalletLogin}
                        disabled={!!loading}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(80,200,120,0.08)';
                            e.currentTarget.style.borderColor = 'rgba(80,200,120,0.25)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        }}
                    >
                        <div style={{ ...S.iconBox, background: 'rgba(80,200,120,0.1)' }}>
                            <GlobeIcon />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Web Wallet</div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(232,245,240,0.45)', marginTop: 2 }}>
                                Official MultiversX web wallet
                            </div>
                        </div>
                        {loading === 'webwallet' && <span className="loading-spinner" />}
                    </button>

                    {/* Devnet Quick Connect — clearly labeled */}
                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        paddingTop: 8, marginTop: 4,
                    }}>
                        <div style={{
                            fontSize: '0.62rem', fontWeight: 600, letterSpacing: '1px',
                            color: 'rgba(232,245,240,0.3)', textTransform: 'uppercase',
                            marginBottom: 6, paddingLeft: 4,
                        }}>
                            Devnet Testing Only
                        </div>
                        <button
                            style={{
                                ...S.option,
                                opacity: 0.7,
                                border: '1px dashed rgba(251,191,36,0.2)',
                            }}
                            onClick={handleQuickConnect}
                            disabled={!!loading}
                            onMouseEnter={e => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.background = 'rgba(251,191,36,0.06)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.opacity = '0.7';
                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            }}
                        >
                            <div style={{ ...S.iconBox, background: 'rgba(251,191,36,0.1)' }}>
                                <TestIcon />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fbbf24' }}>
                                    Quick Connect (Read-Only)
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(232,245,240,0.4)', marginTop: 2 }}>
                                    View deployer dashboard — no signing
                                </div>
                            </div>
                            {loading === 'quick' && <span className="loading-spinner" />}
                        </button>
                    </div>

                    {/* WalletConnect QR Code */}
                    {qrUri && (
                        <div style={{ textAlign: 'center', padding: 16 }}>
                            <p style={{ fontSize: '0.85rem', color: 'rgba(232,245,240,0.55)', marginBottom: 12 }}>
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

                {/* Footer security note */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    marginTop: 16, paddingTop: 12,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(232,245,240,0.3)" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(232,245,240,0.3)', letterSpacing: '0.3px' }}>
                        Secured by MultiversX SDK • No private keys stored
                    </span>
                </div>

                <button
                    onClick={onClose}
                    style={{
                        width: '100%', marginTop: 12, padding: 11,
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10, color: 'rgba(232,245,240,0.5)',
                        fontFamily: "'Inter', sans-serif", fontSize: '0.82rem',
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
