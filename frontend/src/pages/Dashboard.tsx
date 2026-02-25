import { devError, devWarn } from '../utils/devLog';
import { useEffect, useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useContractQuery, bufferToNumber, formatEgld, bufferToBigInt } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '../config';
import { NavLink } from 'react-router-dom';
import { LiveActivityFeed } from '../components/LiveActivityFeed';
import { PriceTicker } from '../components/PriceTicker';
import SlicedLogo3D from '../components/SlicedLogo3D';
import { AnimatedCounter } from '../components/AnimatedCounter';


interface ProtocolStats {
    totalTasks: number;
    activeKeepers: number;
    minDeposit: string;
    protocolFeeBps: number;
    totalSuccessful: number;
    totalFailed: number;
}

export function Dashboard() {
    const { wallet, setShowConnectModal } = useWallet();
    const { query } = useContractQuery();
    const [stats, setStats] = useState<ProtocolStats>({
        totalTasks: 0,
        activeKeepers: 0,
        minDeposit: '0',
        protocolFeeBps: 0,
        totalSuccessful: 0,
        totalFailed: 0,
    });
    const [txStats, setTxStats] = useState({ lifetime: 0, daily: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
        const interval = setInterval(loadStats, 15000);
        return () => clearInterval(interval);
    }, []);

    async function loadStats() {
        try {
            const [nonceRes, keeperRes, depositRes, feeRes, successRes, failedRes] = await Promise.all([
                query(CONTRACTS.scheduler, 'getTaskNonce'),
                query(CONTRACTS.keeperRegistry, 'getActiveKeeperCount'),
                query(CONTRACTS.scheduler, 'getMinDeposit'),
                query(CONTRACTS.scheduler, 'getProtocolFeeBps'),
                query(CONTRACTS.scheduler, 'getTotalSuccessfulExecs'),
                query(CONTRACTS.scheduler, 'getTotalFailedExecs'),
            ]);

            setStats({
                totalTasks: nonceRes.length > 0 ? bufferToNumber(nonceRes[0]) : 0,
                activeKeepers: keeperRes.length > 0 ? bufferToNumber(keeperRes[0]) : 0,
                minDeposit: depositRes.length > 0 ? bufferToBigInt(depositRes[0]) : '0',
                protocolFeeBps: feeRes.length > 0 ? bufferToNumber(feeRes[0]) : 0,
                totalSuccessful: successRes.length > 0 ? bufferToNumber(successRes[0]) : 0,
                totalFailed: failedRes.length > 0 ? bufferToNumber(failedRes[0]) : 0,
            });

            // Fetch transaction count stats from API (proxy through current network)
            try {
                const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
                const [lifetimeRes, dailyRes] = await Promise.all([
                    fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions/count?status=success`),
                    fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions/count?after=${oneDayAgo}&status=success`)
                ]);
                const lifetimeCount = Number(await lifetimeRes.text()) || 0;
                const dailyCount = Number(await dailyRes.text()) || 0;
                setTxStats({ lifetime: lifetimeCount, daily: dailyCount });
            } catch (err) {
                devWarn('Could not fetch tx counts:', err);
            }

        } catch (err) {
            devError('Failed to load stats:', err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="page">
            <div className="app-container">
                {/* Hero */}
                <div className="hero-section">
                    <SlicedLogo3D />
                    <h1>Decentralized Task Automation</h1>
                    <p className="hero-sub" style={{ marginBottom: 8 }}>
                        The automation layer for MultiversX. Schedule smart contract executions and let decentralized keepers handle the rest.
                    </p>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-glass)', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border-primary)' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Lifetime Executions: <span style={{ color: 'var(--text-primary)' }}>{txStats.lifetime.toLocaleString()}</span></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-glass)', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border-primary)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Past 24H: <span style={{ color: 'var(--text-primary)' }}>{txStats.daily.toLocaleString()}</span></span>
                        </div>
                    </div>
                    {!wallet.connected && (
                        <button
                            className="btn btn-connect"
                            style={{ marginTop: 24, padding: '14px 32px', fontSize: '1rem' }}
                            onClick={() => setShowConnectModal(true)}
                        >
                            Get Started
                        </button>
                    )}
                </div>

                {/* Protocol Stats */}
                <div className="stats-grid">
                    <div className="stat-card" style={{ background: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.25)', boxShadow: '0 0 25px rgba(59,130,246,0.25)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 14, right: 14 }}><polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" /><line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="8.5" x2="22" y2="8.5" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(59,130,246)' }}>Total Tasks</div>
                        <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.totalTasks} />}</div>
                        <div className="stat-sub">Scheduled on protocol</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(232,146,124,0.12)', borderColor: 'rgba(232,146,124,0.25)', boxShadow: '0 0 25px rgba(232,146,124,0.25)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(232,146,124,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 14, right: 14 }}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="1" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="1" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="23" y2="12" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(232,146,124)' }}>Active Keepers</div>
                        <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.activeKeepers} />}</div>
                        <div className="stat-sub">Executing tasks</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.2)', boxShadow: '0 0 25px rgba(251,191,36,0.25)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 14, right: 14 }}><polygon points="12,2 20,12 12,22 4,12" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(251,191,36)' }}>Min Deposit</div>
                        <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : formatEgld(stats.minDeposit, 2)}</div>
                        <div className="stat-sub">EGLD per task</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(244,114,182,0.1)', borderColor: 'rgba(244,114,182,0.2)', boxShadow: '0 0 25px rgba(244,114,182,0.25)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 26" fill="none" stroke="rgba(244,114,182,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><path d="M12 2L3 7v6c0 5.25 3.85 10.15 9 11.35C17.15 23.15 21 18.25 21 13V7L12 2z" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(244,114,182)' }}>Protocol Fee</div>
                        <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <><AnimatedCounter value={stats.protocolFeeBps / 100} />%</>}</div>
                        <div className="stat-sub">Per execution</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)', boxShadow: '0 0 25px rgba(34,197,94,0.25)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><polyline points="20,6 9,17 4,12" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(34,197,94)' }}>Successful</div>
                        <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.totalSuccessful} />}</div>
                        <div className="stat-sub">Executions</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', boxShadow: '0 0 25px rgba(239,68,68,0.15)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(239,68,68)' }}>Failed</div>
                        <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.totalFailed} />}</div>
                        <div className="stat-sub">Executions</div>
                    </div>
                </div>

                {/* Live Protocol Activity Feed */}
                <div style={{ marginTop: 32 }}>
                    <LiveActivityFeed />
                </div>

                {/* Live Ecosystem Prices */}
                <div style={{ marginTop: 24 }}>
                    <PriceTicker />
                </div>

                {/* How It Works */}
                <div className="section" style={{ marginTop: 40 }}>
                    <div className="section-title-center">How It Works</div>
                    <div className="how-it-works">
                        <div className="hiw-step">
                            <div className="hiw-number">1</div>
                            <div className="hiw-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="10" /></svg>
                            </div>
                            <h3>Schedule</h3>
                            <p>Define what contract function to call and when. Set it once and forget it.</p>
                        </div>
                        <div className="hiw-arrow">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12,5 19,12 12,19" /></svg>
                        </div>
                        <div className="hiw-step">
                            <div className="hiw-number">2</div>
                            <div className="hiw-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>
                            </div>
                            <h3>Keepers Execute</h3>
                            <p>Decentralized bots monitor and execute your tasks automatically, 24/7.</p>
                        </div>
                        <div className="hiw-arrow">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12,5 19,12 12,19" /></svg>
                        </div>
                        <div className="hiw-step">
                            <div className="hiw-number">3</div>
                            <div className="hiw-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L3 7v6c0 5.25 3.85 10.15 9 11.35C17.15 23.15 21 18.25 21 13V7L12 2z" /><polyline points="9,12 11,14 15,10" /></svg>
                            </div>
                            <h3>Done</h3>
                            <p>Your task runs on autopilot. Track status, cancel anytime, full control.</p>
                        </div>
                    </div>
                </div>

                {/* Use Cases */}
                <div className="section" style={{ marginTop: 40 }}>
                    <div className="section-title-center">What Can You Automate?</div>
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: -16, marginBottom: 24 }}>
                        These are just templates — XCron can automate <strong style={{ color: 'var(--accent-light)' }}>any smart contract call</strong> on MultiversX
                    </p>
                    <div className="use-cases-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        <NavLink to="/schedule?template=compound" className="use-case-card">
                            <div className="uc-icon" style={{ background: 'rgba(34,197,94,0.15)', color: 'rgb(34,197,94)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /><circle cx="12" cy="12" r="6" /><path d="M12 9v3l2 1" /></svg>
                            </div>
                            <h3>Auto-Compound</h3>
                            <p>Claim and reinvest farm rewards automatically for maximum APY.</p>
                            <span className="uc-cta">Set Up →</span>
                        </NavLink>
                        <NavLink to="/schedule?template=dca" className="use-case-card">
                            <div className="uc-icon" style={{ background: 'rgba(59,130,246,0.15)', color: 'rgb(59,130,246)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" /><polyline points="16,7 22,7 22,13" /></svg>
                            </div>
                            <h3>DCA</h3>
                            <p>Buy tokens on a recurring schedule. Remove emotion from investing.</p>
                            <span className="uc-cta">Set Up →</span>
                        </NavLink>
                        <NavLink to="/schedule?template=stoploss" className="use-case-card">
                            <div className="uc-icon" style={{ background: 'rgba(239,68,68,0.15)', color: 'rgb(239,68,68)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>
                            </div>
                            <h3>Stop-Loss</h3>
                            <p>Auto-sell tokens when the price drops below your threshold.</p>
                            <span className="uc-cta">Set Up →</span>
                        </NavLink>
                        <NavLink to="/schedule?template=claim" className="use-case-card">
                            <div className="uc-icon" style={{ background: 'rgba(251,191,36,0.15)', color: 'rgb(251,191,36)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M16 8l-4 4-4-4" /><line x1="12" y1="12" x2="12" y2="16" /></svg>
                            </div>
                            <h3>Claim Rewards</h3>
                            <p>Auto-claim staking or farm rewards daily without logging in.</p>
                            <span className="uc-cta">Set Up →</span>
                        </NavLink>
                        <NavLink to="/schedule?template=nftmint" className="use-case-card">
                            <div className="uc-icon" style={{ background: 'rgba(168,85,247,0.15)', color: 'rgb(168,85,247)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18" /><circle cx="8" cy="15" r="2" /><path d="M14 13l3 4h-6l3-4z" /></svg>
                            </div>
                            <h3>NFT Auto-Mint</h3>
                            <p>Schedule a mint at the exact drop time. Never miss a launch.</p>
                            <span className="uc-cta">Set Up →</span>
                        </NavLink>
                        <NavLink to="/schedule?template=custom" className="use-case-card">
                            <div className="uc-icon" style={{ background: 'rgba(139,92,246,0.15)', color: 'rgb(139,92,246)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                            </div>
                            <h3>Custom</h3>
                            <p>Call any contract function on any schedule. Full developer flexibility.</p>
                            <span className="uc-cta">Create →</span>
                        </NavLink>
                    </div>
                </div>

                {/* Ecosystem Integrations */}
                <div className="section" style={{ marginTop: 32 }}>
                    <div className="section-title-center">Ecosystem Integrations</div>
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: -12, marginBottom: 20 }}>
                        XCron becomes the <strong style={{ color: 'var(--accent-light)' }}>automation engine</strong> that every MultiversX protocol needs
                    </p>
                    <div className="use-cases-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        <div className="use-case-card" style={{ cursor: 'default' }}>
                            <div className="uc-icon" style={{ background: 'rgba(99,102,241,0.15)', color: 'rgb(99,102,241)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" /></svg>
                            </div>
                            <h3>Hatom</h3>
                            <p>Auto-compound lending positions. Claim and reinvest interest without manual intervention.</p>
                            <span className="uc-cta" style={{ color: 'rgb(99,102,241)' }}>Lending Automation</span>
                        </div>
                        <div className="use-case-card" style={{ cursor: 'default' }}>
                            <div className="uc-icon" style={{ background: 'rgba(6,182,212,0.15)', color: 'rgb(6,182,212)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M14 14l7 7M3 8V3h5M10 10L3 3" /></svg>
                            </div>
                            <h3>xExchange</h3>
                            <p>Automated DCA, scheduled swaps, and liquidity rebalancing on the largest MultiversX DEX.</p>
                            <span className="uc-cta" style={{ color: 'rgb(6,182,212)' }}>DEX Automation</span>
                        </div>
                        <div className="use-case-card" style={{ cursor: 'default' }}>
                            <div className="uc-icon" style={{ background: 'rgba(236,72,153,0.15)', color: 'rgb(236,72,153)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18" /><circle cx="8" cy="15" r="2" /><path d="M14 13l3 4h-6l3-4z" /></svg>
                            </div>
                            <h3>XOXNO</h3>
                            <p>Scheduled NFT mints at exact drop times. Auto-list, auto-bid, and collection management.</p>
                            <span className="uc-cta" style={{ color: 'rgb(236,72,153)' }}>NFT Automation</span>
                        </div>
                        <div className="use-case-card" style={{ cursor: 'default' }}>
                            <div className="uc-icon" style={{ background: 'rgba(245,158,11,0.15)', color: 'rgb(245,158,11)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                            </div>
                            <h3>AshSwap</h3>
                            <p>Automated yield farming, auto-harvest rewards, and stable pool rebalancing strategies.</p>
                            <span className="uc-cta" style={{ color: 'rgb(245,158,11)' }}>Yield Automation</span>
                        </div>
                        <div className="use-case-card" style={{ cursor: 'default' }}>
                            <div className="uc-icon" style={{ background: 'rgba(16,185,129,0.15)', color: 'rgb(16,185,129)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" /></svg>
                            </div>
                            <h3>OneDex</h3>
                            <p>Scheduled limit orders, auto-swap on price targets, and portfolio auto-balancing.</p>
                            <span className="uc-cta" style={{ color: 'rgb(16,185,129)' }}>Trading Automation</span>
                        </div>
                        <div className="use-case-card" style={{ cursor: 'default' }}>
                            <div className="uc-icon" style={{ background: 'rgba(139,92,246,0.15)', color: 'rgb(139,92,246)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                            </div>
                            <h3>Your Protocol</h3>
                            <p>Any smart contract on MultiversX can leverage XCron. Build automation into your dApp.</p>
                            <span className="uc-cta" style={{ color: 'rgb(139,92,246)' }}>npm install xcron-sdk</span>
                        </div>
                    </div>
                </div>

                {/* Who Benefits */}
                <div className="grid-2" style={{ marginTop: 40 }}>
                    <div className="card benefit-card">
                        <div className="benefit-badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'rgb(139,92,246)' }}>For Users</div>
                        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: '1.15rem' }}>Save Time, Earn More</h3>
                        <ul className="benefit-list">
                            <li>Auto-compound your staking and farm rewards</li>
                            <li>Set up recurring token purchases (DCA)</li>
                            <li>No technical knowledge required</li>
                            <li>Cancel or modify tasks anytime</li>
                        </ul>
                        <NavLink to="/schedule" style={{ display: 'block', marginTop: 16 }}>
                            <button className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>Schedule a Task</button>
                        </NavLink>
                    </div>

                    <div className="card benefit-card" style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}>
                        <div className="benefit-badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'rgb(16,185,129)' }}>Earn With XCron</div>
                        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: '1.15rem' }}>Run a Keeper Node</h3>
                        <ul className="benefit-list">
                            <li>Execute tasks and earn fees from the protocol</li>
                            <li>Join the decentralized keeper network</li>
                            <li>Earn <strong style={{ color: 'var(--success)' }}>{100 - (stats.protocolFeeBps / 100)}%</strong> of execution fees</li>
                            <li>Ideal for validators and infrastructure operators</li>
                        </ul>
                        <NavLink to="/keeper" style={{ display: 'block', marginTop: 16 }}>
                            <button className="btn" style={{ width: '100%', padding: '12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'rgb(34,197,94)' }}>
                                Learn More →
                            </button>
                        </NavLink>
                    </div>
                </div>

            </div>
        </div>
    );
}
