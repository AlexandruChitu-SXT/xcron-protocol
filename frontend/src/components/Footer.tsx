import { NavLink } from 'react-router-dom';
import { NETWORK } from '../config';

export function Footer() {
    return (
        <footer className="footer">
            <div className="footer-inner">
                <div className="footer-grid">
                    {/* Brand */}
                    <div className="footer-col">
                        <div className="footer-brand">
                            <span className="footer-logo-text">XCron</span>
                            <span className="footer-logo-badge">Protocol</span>
                        </div>
                        <p className="footer-tagline">
                            Decentralized task automation for MultiversX. Schedule once, execute forever.
                        </p>
                        <div className="footer-built-on">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
                            </svg>
                            Built on <span style={{ color: '#00e5ff', fontWeight: 700 }}>MultiversX</span> with <span style={{ color: '#ef4444' }}>❤️</span>
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="footer-col">
                        <h4 className="footer-heading">Navigate</h4>
                        <div className="footer-links">
                            <NavLink to="/">Dashboard</NavLink>
                            <NavLink to="/schedule">Schedule Task</NavLink>
                            <NavLink to="/tasks">My Tasks</NavLink>
                            <NavLink to="/keeper">Keeper Panel</NavLink>
                        </div>
                    </div>

                    {/* Resources */}
                    <div className="footer-col">
                        <h4 className="footer-heading">Resources</h4>
                        <div className="footer-links">
                            <a href="https://github.com/AlexandruChitu-SXT/xcron-protocol" target="_blank" rel="noopener noreferrer">GitHub</a>
                            <a href={NETWORK.explorerUrl} target="_blank" rel="noopener noreferrer">Explorer</a>
                            <a href="https://docs.multiversx.com" target="_blank" rel="noopener noreferrer">MultiversX Docs</a>
                        </div>
                    </div>

                    {/* Community */}
                    <div className="footer-col">
                        <h4 className="footer-heading">Community</h4>
                        <div className="footer-links">
                            <a href="https://x.com/AlejandroChitu" target="_blank" rel="noopener noreferrer">X (Twitter)</a>
                            <a href="https://t.me/alexandruchituxcron" target="_blank" rel="noopener noreferrer">Telegram</a>
                        </div>
                    </div>
                </div>

                <div className="footer-bottom">
                    <span>© {new Date().getFullYear()} XCron Protocol. All rights reserved.</span>
                    <div className="footer-bottom-links">
                        <span className="footer-status">
                            <span className="footer-status-dot" />
                            {NETWORK.name.charAt(0).toUpperCase() + NETWORK.name.slice(1)} Live
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
