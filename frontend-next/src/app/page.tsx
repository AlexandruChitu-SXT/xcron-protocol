"use client";

import { devError } from '@/utils/devLog';
import { useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useContractQuery, bufferToNumber, formatEgld, bufferToBigInt } from '@/hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '@/config';
import Link from 'next/link';
import { LiveActivityFeed } from '@/components/LiveActivityFeed';
import { ProtocolRadar } from '@/components/ProtocolRadar';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { TypewriterTitle } from '@/components/TypewriterTitle';
import { TransparentLogo } from '@/components/TransparentLogo';

interface ProtocolStats {
  totalTasks: number;
  activeKeepers: number;
  minDeposit: string;
  protocolFeeBps: number;
  totalSuccessful: number;
  totalFailed: number;
  pendingCount: number;
}

export default function Dashboard() {
  const { wallet, setShowConnectModal } = useWallet();
  const { query } = useContractQuery();
  const [stats, setStats] = useState<ProtocolStats>({
    totalTasks: 0,
    activeKeepers: 0,
    minDeposit: '0',
    protocolFeeBps: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    pendingCount: 0,
  });
  const [txStats, setTxStats] = useState({ lifetime: 0, daily: 0 });
  const [protocolBalance, setProtocolBalance] = useState('0');
  const [loading, setLoading] = useState(true);
  const [netStats, setNetStats] = useState({ block: 0, epoch: 0, roundsPerEpoch: 0, shard: 0 });
  const [keeperStats, setKeeperStats] = useState<{ address: string; execs: number }[]>([]);

  useEffect(() => {
    loadStats();
    loadNetworkData();
    const interval = setInterval(() => { loadStats(); loadNetworkData(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadNetworkData() {
    try {
      const res = await fetch(`${NETWORK.apiUrl}/stats`);
      const data = await res.json();
      setNetStats({ block: data.blocks || 0, epoch: data.epoch || 0, roundsPerEpoch: data.roundsPerEpoch || 0, shard: data.shards || 3 });
    } catch { /* ignore */ }

    try {
      const res = await fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions?size=50&status=success&function=executeTask`);
      const txs = await res.json();
      const counts: Record<string, number> = {};
      for (const tx of txs) { counts[tx.sender || ''] = (counts[tx.sender || ''] || 0) + 1; }
      setKeeperStats(Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([address, execs]) => ({ address, execs })));
    } catch { /* ignore */ }
  }

  async function loadStats() {
    try {
      const [nonceRes, keeperRes, depositRes, feeRes, metricsRes] = await Promise.all([
        query(CONTRACTS.scheduler, 'getTaskNonce'),
        query(CONTRACTS.keeperRegistry, 'getActiveKeeperCount'),
        query(CONTRACTS.scheduler, 'getMinDeposit'),
        query(CONTRACTS.scheduler, 'getProtocolFeeBps'),
        query(CONTRACTS.scheduler, 'getSecurityMetrics'),
      ]);

      // getSecurityMetrics returns MultiValue3<u64, u64, usize> = (totalExecuted, totalFailed, pendingCount)
      const totalSuccessful = metricsRes.length > 0 ? bufferToNumber(metricsRes[0]) : 0;
      const totalFailed = metricsRes.length > 1 ? bufferToNumber(metricsRes[1]) : 0;
      const pendingCount = metricsRes.length > 2 ? bufferToNumber(metricsRes[2]) : 0;

      setStats({
        totalTasks: nonceRes.length > 0 ? bufferToNumber(nonceRes[0]) : 0,
        activeKeepers: keeperRes.length > 0 ? bufferToNumber(keeperRes[0]) : 0,
        minDeposit: depositRes.length > 0 ? bufferToBigInt(depositRes[0]) : '0',
        protocolFeeBps: feeRes.length > 0 ? bufferToNumber(feeRes[0]) : 0,
        totalSuccessful,
        totalFailed,
        pendingCount,
      });

      // Use on-chain metrics for tx stats (API /transactions/count times out on testnet)
      const lifetimeExecs = totalSuccessful + totalFailed;
      setTxStats({ lifetime: lifetimeExecs, daily: lifetimeExecs > 0 ? totalSuccessful : 0 });


      // Fetch protocol balance
      try {
        const balRes = await fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}`);
        const balData = await balRes.json();
        setProtocolBalance(balData.balance || '0');
      } catch { /* ignore */ }

    } catch (err) {
      devError('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalExecs = stats.totalSuccessful + stats.totalFailed;
  const successRate = totalExecs > 0 ? Math.round((stats.totalSuccessful / totalExecs) * 100) : 0;

  return (
    <div className="w-full">
      {/* Hero Title — above logo, centered */}
      <div className="app-container">
        <div className="hero-section" style={{ paddingBottom: 0 }}>
          {/* Logo — standalone centered (Moved to top) */}
          <div className="flex justify-center pt-2 pb-6">
            <div className="w-[320px] aspect-square relative animate-[pulse_4s_ease-in-out_infinite] pointer-events-none drop-shadow-[0_0_40px_rgba(34,211,238,0.15)] flex items-center justify-center">
              <TransparentLogo src="/logo.png" className="w-full h-full object-contain scale-[1.2]" />
            </div>
          </div>

          <h1 className="text-4xl md:text-[2.6rem] font-black tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-[#c4705a] via-[#d08a6e] to-[#c4705a] drop-shadow-sm title-animate-in">
            Agentic Automation Protocol
          </h1>
          <p className="hero-sub text-white/90 text-sm md:text-base max-w-[520px] mx-auto leading-relaxed mb-4 title-animate-in" style={{ animationDelay: '0.1s' }}>
            The coordination layer for autonomous agents on MultiversX. Schedule on-chain actions, let decentralized keepers execute them trustlessly.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-glass)', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border-primary)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Lifetime Executions: <span style={{ color: 'var(--text-primary)' }}>{txStats.lifetime.toLocaleString()}</span></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-glass)', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border-primary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Successful: <span style={{ color: 'var(--text-primary)' }}>{txStats.daily.toLocaleString()}</span></span>
            </div>
          </div>
          {!wallet.connected && (
            <button
              className="btn btn-connect mt-5 px-8 py-3.5 text-base"
              onClick={() => setShowConnectModal(true)}
            >
              Get Started
            </button>
          )}
        </div>

        {/* Protocol Stats — Row 1: Core Metrics */}
        <div className="stats-grid">
          <div className="stat-card" style={{ borderColor: 'rgba(59,130,246,0.25)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 14, right: 14 }}><polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" /><line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="8.5" x2="22" y2="8.5" /></svg>
            <div className="stat-label" style={{ color: 'rgb(59,130,246)' }}>Total Tasks</div>
            <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.totalTasks} />}</div>
            <div className="stat-sub">Scheduled on protocol</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(232,146,124,0.25)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(232,146,124,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 14, right: 14 }}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="1" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="1" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="23" y2="12" /></svg>
            <div className="stat-label" style={{ color: 'rgb(232,146,124)' }}>Active Keepers</div>
            <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.activeKeepers} />}</div>
            <div className="stat-sub">Executing tasks</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(251,191,36,0.2)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 14, right: 14 }}><polygon points="12,2 20,12 12,22 4,12" /></svg>
            <div className="stat-label" style={{ color: 'rgb(251,191,36)' }}>Min Deposit</div>
            <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : formatEgld(stats.minDeposit, 2)}</div>
            <div className="stat-sub">EGLD per task</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(244,114,182,0.2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 26" fill="none" stroke="rgba(244,114,182,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><path d="M12 2L3 7v6c0 5.25 3.85 10.15 9 11.35C17.15 23.15 21 18.25 21 13V7L12 2z" /></svg>
            <div className="stat-label" style={{ color: 'rgb(244,114,182)' }}>Protocol Fee</div>
            <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <><AnimatedCounter value={stats.protocolFeeBps / 100} />%</>}</div>
            <div className="stat-sub">Per execution</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><polyline points="20,6 9,17 4,12" /></svg>
            <div className="stat-label" style={{ color: 'rgb(34,197,94)' }}>Successful</div>
            <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.totalSuccessful} />}</div>
            <div className="stat-sub">Executions</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            <div className="stat-label" style={{ color: 'rgb(239,68,68)' }}>Failed</div>
            <div className="stat-value">{loading ? <span className="skeleton skeleton-stat" /> : <AnimatedCounter value={stats.totalFailed} />}</div>
            <div className="stat-sub">Executions</div>
          </div>
        </div>

        {/* Row 2: Protocol Health Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          {/* Success Rate */}
          <div className="stat-card" style={{ borderColor: 'rgba(6,182,212,0.2)' }}>
            <div className="stat-label" style={{ color: 'rgb(6,182,212)' }}>Success Rate</div>
            <div className="stat-value">{successRate}%</div>
            <div className="stat-sub">{totalExecs} total executions</div>
          </div>
          {/* Protocol Balance */}
          <div className="stat-card" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
            <div className="stat-label" style={{ color: 'rgb(139,92,246)' }}>Protocol Balance</div>
            <div className="stat-value">{loading ? '...' : formatEgld(protocolBalance, 4)}</div>
            <div className="stat-sub">EGLD in scheduler</div>
          </div>
          {/* Task Pipeline */}
          <div className="stat-card" style={{ borderColor: 'rgba(251,191,36,0.2)' }}>
            <div className="stat-label" style={{ color: 'rgb(251,191,36)' }}>Task Pipeline</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <div><div className="stat-value" style={{ fontSize: '1rem' }}>{stats.pendingCount}</div><div className="stat-sub">Pending</div></div>
              <div><div className="stat-value" style={{ fontSize: '1rem' }}>{stats.totalSuccessful}</div><div className="stat-sub">Done</div></div>
              <div><div className="stat-value" style={{ fontSize: '1rem' }}>{stats.totalTasks}</div><div className="stat-sub">Total</div></div>
            </div>
          </div>
          {/* Protocol Status */}
          <div className="stat-card" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
            <div className="stat-label" style={{ color: 'rgb(34,197,94)' }}>Protocol Status</div>
            <div className="stat-value" style={{ color: 'rgb(34,197,94)' }}>Active</div>
            <div className="stat-sub">Testnet deployment</div>
          </div>
        </div>

        {/* Recent Network Activity */}
        <div className="max-w-4xl mx-auto mt-6">
          <LiveActivityFeed />
        </div>

        {/* How It Works */}
        <div className="section mt-8">
          <TypewriterTitle text="How It Works" className="section-title-center" />
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

        {/* Use Cases — compact 6-column */}
        <div className="section mt-5">
          <TypewriterTitle text="What Can You Automate?" className="section-title-center" />
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: -14, marginBottom: 14 }}>
            Templates — XCron can automate <strong style={{ color: 'var(--accent-light)' }}>any smart contract call</strong> on MultiversX
          </p>
          <div className="use-cases-grid grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { to: '/schedule?template=compound', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /><circle cx="12" cy="12" r="6" /><path d="M12 9v3l2 1" /></svg>, name: 'Auto-Compound', color: 'rgb(34,197,94)', cta: 'Set Up →' },
              { to: '/schedule?template=dca', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" /><polyline points="16,7 22,7 22,13" /></svg>, name: 'DCA', color: 'rgb(59,130,246)', cta: 'Set Up →' },
              { to: '/schedule?template=stoploss', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>, name: 'Stop-Loss', color: 'rgb(239,68,68)', cta: 'Set Up →' },
              { to: '/schedule?template=claim', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M16 8l-4 4-4-4" /><line x1="12" y1="12" x2="12" y2="16" /></svg>, name: 'Claim Rewards', color: 'rgb(251,191,36)', cta: 'Set Up →' },
              { to: '/schedule?template=nftmint', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18" /><circle cx="8" cy="15" r="2" /><path d="M14 13l3 4h-6l3-4z" /></svg>, name: 'NFT Mint', color: 'rgb(168,85,247)', cta: 'Set Up →' },
              { to: '/schedule?template=custom', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>, name: 'Custom', color: 'rgb(139,92,246)', cta: 'Create →' },
            ].map(uc => (
              <Link key={uc.name} href={uc.to} className="use-case-card flex flex-col items-center text-center p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
                <div className="uc-icon" style={{ background: `${uc.color}22`, color: uc.color, width: 28, height: 28, margin: '0 auto 6px' }}>
                  {uc.icon}
                </div>
                <h3 style={{ fontSize: '0.78rem', marginBottom: 2 }}>{uc.name}</h3>
                <span className="uc-cta text-xs mt-1 text-white/50">{uc.cta}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Possible Automations — compact 6-column mini-cards */}
        <div className="section mt-4">
          <TypewriterTitle text="Possible Automations" className="section-title-center" />
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: -12, marginBottom: 12 }}>
            Examples of what you <strong style={{ color: 'var(--accent-light)' }}>could automate</strong> with XCron on MultiversX
          </p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {[
              { name: 'Hatom', badge: 'Lending', color: 'rgb(99,102,241)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" /></svg> },
              { name: 'xExchange', badge: 'DEX', color: 'rgb(6,182,212)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M14 14l7 7M3 8V3h5M10 10L3 3" /></svg> },
              { name: 'XOXNO', badge: 'NFT', color: 'rgb(236,72,153)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18" /></svg> },
              { name: 'AshSwap', badge: 'Yield', color: 'rgb(245,158,11)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg> },
              { name: 'OneDex', badge: 'Trading', color: 'rgb(16,185,129)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" /></svg> },
              { name: 'Your dApp', badge: 'SDK', color: 'rgb(139,92,246)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg> },
            ].map(a => (
              <div key={a.name} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 6px', background: `${a.color}08`, border: `1px solid ${a.color}20`,
                borderRadius: 'var(--radius-md)', textAlign: 'center',
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${a.color}18`, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a.icon}
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{a.name}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: a.color, padding: '1px 6px', borderRadius: 4, background: `${a.color}12` }}>{a.badge}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Who Benefits — compact */}
        <div className="grid grid-cols-1 md:grid-cols-2 mt-4 gap-3">
          <div className="card benefit-card" style={{ padding: 14 }}>
            <div className="benefit-badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'rgb(139,92,246)' }}>For Users</div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 4, fontSize: '0.92rem' }}>Save Time, Earn More</h3>
            <ul className="benefit-list" style={{ fontSize: '0.8rem' }}>
              <li>Auto-compound staking & farm rewards</li>
              <li>Recurring token purchases (DCA)</li>
              <li>No technical knowledge required</li>
              <li>Cancel or modify anytime</li>
            </ul>
            <Link href="/schedule" className="block mt-2">
              <button className="btn btn-primary w-full p-2 text-sm">Schedule a Task</button>
            </Link>
          </div>

          <div className="card benefit-card" style={{ padding: 14, borderColor: 'rgba(16,185,129,0.2)' }}>
            <div className="benefit-badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'rgb(16,185,129)' }}>Earn With XCron</div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 4, fontSize: '0.92rem' }}>Run a Keeper Node</h3>
            <ul className="benefit-list" style={{ fontSize: '0.8rem' }}>
              <li>Execute tasks and earn protocol fees</li>
              <li>Join the decentralized keeper network</li>
              <li>Earn <strong style={{ color: 'var(--success)' }}>{100 - (stats.protocolFeeBps / 100)}%</strong> of fees</li>
              <li>Ideal for validators & operators</li>
            </ul>
            <Link href="/keeper" className="block mt-2">
              <button className="btn w-full p-2 text-sm" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'rgb(34,197,94)' }}>
                Learn More →
              </button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
