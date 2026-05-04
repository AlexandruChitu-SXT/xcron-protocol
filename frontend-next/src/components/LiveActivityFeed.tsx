import { devWarn } from '../utils/devLog';
import { useEffect, useState, useRef } from 'react';
import { CONTRACTS, NETWORK } from '../config';

// All data sourced from real on-chain transactions — no simulated data

/* ──────────────── Types ──────────────── */

interface TaskEvent {
    hash: string;
    function: string;
    status: 'success' | 'fail' | 'pending';
    timestamp: number;
    sender: string;
    value: string;
    isNew?: boolean;
    round?: number;
}

/* ──────────────── Helpers ──────────────── */

function timeAgo(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function shortenHash(h: string): string {
    return h.slice(0, 8) + '…' + h.slice(-6);
}

function shortenAddr(a: string): string {
    return a.slice(0, 10) + '…' + a.slice(-4);
}

const FN_META: Record<string, { label: string; color: string }> = {
    scheduleQuantumTask: { label: 'SCHEDULED', color: 'var(--accent-light)' },
    executeQuantumTask: { label: 'EXECUTED', color: 'var(--success)' },
    cancelTask: { label: 'CANCELLED', color: 'var(--error)' },
    registerKeeper: { label: 'KEEPER REG', color: 'var(--accent)' },
    claimRewards: { label: 'CLAIMED', color: 'var(--warning)' },
    requestUnstake: { label: 'UNSTAKE', color: '#f97316' },
    withdrawStake: { label: 'WITHDRAWN', color: '#34d399' },
    addAuthorizedCaller: { label: 'AUTH', color: '#38bdf8' },
};

function getMeta(fn: string) {
    return FN_META[fn] || { label: fn.toUpperCase(), color: 'var(--text-muted)' };
}

/* ──────────────── Component ──────────────── */

export function LiveActivityFeed() {
    const [events, setEvents] = useState<TaskEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentRound, setCurrentRound] = useState(0);
    const [tickMs, setTickMs] = useState(0);
    const seenRef = useRef<Set<string>>(new Set());
    const firstLoad = useRef(true);

    const fetchRound = async () => {
        try {
            const r = await fetch(`${NETWORK.apiUrl}/stats`);
            const d = await r.json();
            setCurrentRound(d.roundsPassedInCurrentEpoch || d.roundsPassed || 0);
        } catch { /* ignore */ }
    };

    const fetchEvents = async () => {
        try {

            const [sRes, rRes] = await Promise.all([
                fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions?size=15&status=success&withScResults=true&withOperations=true`),
                fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.keeperRegistry}/transactions?size=5&status=success&withScResults=true&withOperations=true`),
            ]);
            const sTx = await sRes.json();
            const rTx = await rRes.json();

            const allowedFunctions = ['scheduleQuantumTask', 'executeQuantumTask', 'cancelTask', 'registerKeeper', 'claimRewards', 'requestUnstake', 'withdrawStake'];

            const all = [...sTx, ...rTx]
                .filter((tx: any) => tx.function && allowedFunctions.includes(tx.function))
                .sort((a: any, b: any) => b.timestamp - a.timestamp)
                .slice(0, 15);

            const mapped: TaskEvent[] = all.map((tx: any) => {
                const hyperblockNonce = tx.hyperblockNonce || tx.round || 0;

                let displayStatus: 'success' | 'fail' | 'pending' =
                    tx.status === 'success' ? 'success' : tx.status === 'fail' ? 'fail' : 'pending';

                return {
                    hash: tx.txHash,
                    function: tx.function || '',
                    status: displayStatus,
                    timestamp: tx.timestamp,
                    sender: tx.sender,
                    value: tx.value || '0',
                    isNew: !firstLoad.current && !seenRef.current.has(tx.txHash),
                    round: hyperblockNonce,
                };
            });

            mapped.forEach(e => seenRef.current.add(e.hash));
            firstLoad.current = false;
            setEvents(mapped);
        } catch (err) {
            devWarn('Telemetry fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Live millisecond ticker
    useEffect(() => {
        const t = setInterval(() => setTickMs(prev => (prev + 100) % 6000), 100);
        return () => clearInterval(t);
    }, []);

    // Polling every 30 seconds
    useEffect(() => {
        fetchEvents();
        fetchRound();

        const i1 = setInterval(fetchEvents, 30000);
        const i2 = setInterval(fetchRound, 30000);

        return () => {
            clearInterval(i1);
            clearInterval(i2);
        };
    }, []);

    // ── Styles ──
    const S = {
        root: {
            background: 'transparent',
            border: '1px solid rgba(0,255,180,0.2)',
            borderRadius: 12,
            overflow: 'hidden',
            fontFamily: "'Inter', 'SF Mono', monospace",
            boxShadow: '0 8px 32px rgba(0,255,120,0.08), 0 0 60px rgba(0,0,0,0.3)',
            backdropFilter: 'none',
            flex: 1,
            display: 'flex',
            flexDirection: 'column' as const,
        } as React.CSSProperties,
        header: {
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            borderBottom: '1px solid rgba(0,255,180,0.15)',
        } as React.CSSProperties,
        title: {
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: '0.82rem', fontWeight: 600, letterSpacing: '1px',
            color: 'var(--text-primary)', textTransform: 'uppercase' as const,
        } as React.CSSProperties,
        roundBadge: {
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontSize: '0.75rem', color: 'var(--text-secondary)',
            background: 'var(--bg-secondary)',
            padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--border-primary)',
        } as React.CSSProperties,
    };

    return (
        <div style={S.root}>
            {/* ── Header ── */}
            <div style={S.header}>
                <div style={S.title}>
                    <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: '#00ff88',
                        boxShadow: '0 0 12px #00ff88, 0 0 24px rgba(0,255,136,0.4)',
                        animation: 'pulse 2s infinite',
                    }} />
                    XCron Telemetry
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 400 }}>
                        • LIVE
                    </span>
                </div>
                <div style={S.roundBadge}>
                    Round <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>#{currentRound.toLocaleString()}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{(tickMs / 1000).toFixed(1)}s</span>
                </div>
            </div>



            {/* ── Live Transaction Feed ── */}
            <div style={{ padding: '12px 20px 4px' }}>
                <div style={{
                    fontSize: '0.72rem', fontWeight: 600, letterSpacing: '1px',
                    color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase',
                }}>
                    Recent Protocol Transactions
                </div>
            </div>

            <div className="telemetry-scroll-container" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                <style jsx>{`
                    .telemetry-scroll-container::-webkit-scrollbar { width: 4px; }
                    .telemetry-scroll-container::-webkit-scrollbar-track { background: transparent; }
                    .telemetry-scroll-container::-webkit-scrollbar-thumb { background: rgba(0,255,180,0.2); border-radius: 4px; }
                `}</style>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <span className="loading-spinner" style={{ width: 20, height: 20 }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 10 }}>Syncing blocks…</p>
                    </div>
                ) : events.map((ev, i) => {
                    const meta = getMeta(ev.function);
                    const egldNum = ev.value !== '0' ? Number(BigInt(ev.value)) / 1e18 : 0;
                    const egld = egldNum > 0 ? (egldNum < 0.01 ? egldNum.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : egldNum.toFixed(2)) : null;

                    return (
                        <a
                            key={ev.hash}
                            href={`${NETWORK.explorerUrl}/transactions/${ev.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="telemetry-row"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 20px',
                                textDecoration: 'none',
                                borderBottom: i < events.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                transition: 'background 0.15s',
                                animation: ev.isNew ? 'slideInLeft 0.4s ease-out' : 'none',
                                background: ev.isNew ? 'var(--bg-card-hover)' : 'transparent',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-glass-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ev.isNew ? 'var(--bg-card-hover)' : 'transparent'}
                        >
                            {/* Status indicator */}
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                background: ev.status === 'success' ? '#00ff88' : ev.status === 'fail' ? '#ff5555' : 'var(--accent)',
                                boxShadow: `0 0 8px ${ev.status === 'success' ? 'rgba(0,255,136,0.4)' : ev.status === 'fail' ? 'rgba(255,80,80,0.4)' : 'rgba(0,200,255,0.4)'}`,
                            }} />

                            {/* Status pill */}
                            <div style={{
                                padding: '3px 10px', borderRadius: 4,
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.5px',
                                color: meta.color,
                                background: 'transparent',
                                border: `1px solid ${meta.color}40`,
                                whiteSpace: 'nowrap',
                                textShadow: `0 0 8px ${meta.color}30`,
                            }}>
                                {meta.label}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                    {shortenHash(ev.hash)}
                                    {egld && <span style={{ color: 'var(--accent-light)', marginLeft: 8, fontSize: '0.72rem' }}>{egld} EGLD</span>}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                    {shortenAddr(ev.sender)}
                                </div>
                            </div>

                            {/* Time + Status */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{
                                    fontSize: '0.62rem', fontWeight: 600,
                                    color: ev.status === 'success' ? 'var(--accent-light)' : ev.status === 'fail' ? 'var(--error)' : 'var(--accent)',
                                }}>
                                    {ev.status === 'success' ? 'CONFIRMED' : ev.status === 'fail' ? 'FAILED' : 'PENDING'}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                    {timeAgo(ev.timestamp)}
                                </div>
                            </div>
                        </a>
                    );
                })}
            </div>

            {/* ── Footer ── */}
            <div style={{
                padding: '8px 20px',
                borderTop: '1px solid var(--border-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-glass)',
            }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    Auto-refresh: 30s • Showing last {events.length} transactions
                </span>
                <a
                    href={`${NETWORK.explorerUrl}/accounts/${CONTRACTS.scheduler}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: '0.65rem', color: 'var(--accent-light)', textDecoration: 'none', fontFamily: 'monospace' }}
                >
                    Explorer ↗
                </a>
            </div>
        </div>
    );
}
