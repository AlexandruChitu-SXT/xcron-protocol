import { NavLink } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useEffect, useState } from 'react';
import { NETWORK } from '../config';

export function Navigation() {
    const { wallet, setShowConnectModal, disconnect } = useWallet();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav className={`main-nav ${scrolled ? 'scrolled' : ''}`}>
            <div className="nav-container">
                <div className="nav-left">
                    <NavLink to="/" className="brand-logo" end>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" />
                            <line x1="21.17" y1="8" x2="12" y2="8" />
                            <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                            <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
                        </svg>
                        XCron Protocol
                    </NavLink>
                    <div className="nav-links">
                        <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>Dashboard</NavLink>
                        <NavLink to="/schedule" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Schedule Task</NavLink>
                        <NavLink to="/tasks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>My Tasks</NavLink>
                        <NavLink to="/explore" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Explore</NavLink>
                        <NavLink to="/keeper" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Keeper Panel <span>[1] Nodes</span></NavLink>
                    </div>
                </div>

                <div className="nav-right">
                    <div className="network-badge">
                        <span className="network-dot"></span>
                        {NETWORK.name.charAt(0).toUpperCase() + NETWORK.name.slice(1)}
                    </div>
                    {wallet.connected ? (
                        <div className="wallet-connected" onClick={disconnect}>
                            <div className="wallet-avatar"></div>
                            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </div>
                    ) : (
                        <button className="btn btn-connect" onClick={() => setShowConnectModal(true)}>
                            Connect Wallet
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
}
