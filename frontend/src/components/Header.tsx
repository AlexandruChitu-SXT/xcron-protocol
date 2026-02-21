import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { shortenAddress, formatEgld } from '../hooks/useContractQuery';

export function Header() {
    const { wallet, disconnect, setShowConnectModal, addToast } = useWallet();
    const [mobileOpen, setMobileOpen] = useState(false);
    const logoCanvasRef = useRef<HTMLCanvasElement>(null);

    // Process header logo: remove black background
    useEffect(() => {
        const canvas = logoCanvasRef.current;
        if (!canvas) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = '/logo.png';
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let p = 0; p < data.length; p += 4) {
                const brightness = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
                if (brightness < 40) {
                    data[p + 3] = 0;
                } else if (brightness < 70) {
                    data[p + 3] = Math.round(((brightness - 40) / 30) * 255);
                }
            }
            ctx.putImageData(imageData, 0, 0);
        };
    }, []);

    const copyAddress = () => {
        navigator.clipboard.writeText(wallet.address).then(() => {
            addToast('Address copied!', 'info');
        });
    };

    const navLinks = [
        { to: '/', label: 'Dashboard' },
        { to: '/schedule', label: 'Schedule' },
        { to: '/tasks', label: 'My Tasks' },
        { to: '/keeper', label: 'Keeper Nodes' },
    ];

    return (
        <>
            <header className="header">
                <div className="header-inner">
                    <NavLink to="/" className="header-logo">
                        <canvas ref={logoCanvasRef} className="logo-icon" style={{ width: 64, height: 64 }} />
                        <span style={{ fontFamily: 'Inter', fontWeight: 800, letterSpacing: '-0.5px', fontSize: '1.4em' }}>XCron</span>
                        <span className="logo-badge">Devnet</span>
                    </NavLink>

                    <nav className="header-nav">
                        {navLinks.map((link) => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={({ isActive }) => (isActive ? 'active' : '')}
                            >
                                {link.label}
                            </NavLink>
                        ))}
                    </nav>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {wallet.connected ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div className="wallet-chip" onClick={wallet.isDemo ? undefined : copyAddress} title={wallet.isDemo ? 'Demo mode — read-only preview' : 'Click to copy address'}>
                                    <span className="wallet-dot" style={wallet.isDemo ? { background: '#fbbf24' } : {}} />
                                    {wallet.isDemo ? (
                                        <>
                                            <span style={{ color: '#fbbf24', fontWeight: 600, letterSpacing: '0.5px' }}>DEMO MODE</span>
                                            <span style={{ fontSize: '0.7rem', color: 'rgba(251,191,36,0.6)', marginLeft: 4 }}>read-only</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>{shortenAddress(wallet.address)}</span>
                                            <span style={{ color: 'var(--accent-light)', fontWeight: 600, marginLeft: 4 }}>
                                                {formatEgld(wallet.balance, 2)} EGLD
                                            </span>
                                        </>
                                    )}
                                </div>
                                <button
                                    className="btn-disconnect"
                                    onClick={disconnect}
                                    title={wallet.isDemo ? 'Exit demo' : 'Disconnect wallet'}
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <button className="btn btn-connect" onClick={() => setShowConnectModal(true)}>
                                Connect Wallet
                            </button>
                        )}

                        <button className="mobile-nav-toggle" onClick={() => setMobileOpen(true)}>
                            ☰
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Nav Drawer */}
            {mobileOpen && (
                <>
                    <div className="mobile-nav-overlay open" onClick={() => setMobileOpen(false)} />
                    <div className="mobile-nav-drawer">
                        <button className="mobile-nav-close" onClick={() => setMobileOpen(false)}>
                            ✕
                        </button>
                        {navLinks.map((link) => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={({ isActive }) => (isActive ? 'active' : '')}
                                onClick={() => setMobileOpen(false)}
                            >
                                {link.label}
                            </NavLink>
                        ))}

                        {wallet.connected ? (
                            <div style={{ marginTop: 16, padding: '12px 16px' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {wallet.isDemo ? 'Demo Mode' : 'Connected'}
                                </div>
                                {wallet.isDemo ? (
                                    <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 600 }}>
                                        Read-only preview
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                            {shortenAddress(wallet.address)}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-light)', marginTop: 4 }}>
                                            {formatEgld(wallet.balance, 2)} EGLD
                                        </div>
                                    </>
                                )}
                                <button
                                    className="btn btn-danger btn-sm"
                                    style={{ marginTop: 12, width: '100%' }}
                                    onClick={() => { disconnect(); setMobileOpen(false); }}
                                >
                                    {wallet.isDemo ? 'Exit Demo' : 'Disconnect'}
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-connect"
                                style={{ marginTop: 16 }}
                                onClick={() => { setShowConnectModal(true); setMobileOpen(false); }}
                            >
                                Connect Wallet
                            </button>
                        )}
                    </div>
                </>
            )}
        </>
    );
}
