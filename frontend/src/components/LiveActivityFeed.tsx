import { useEffect, useState, useRef } from 'react';
import { CONTRACTS, NETWORK } from '../config';

// Change this to false to use real Devnet data
// Change to true to simulate high-traffic protocol operation for pitching/demos
const DEMO_MODE = false;

/* ──────────────── Types ──────────────── */

interface TaskEvent {
    hash: string;
    function: string;
    status: 'success' | 'fail' | 'pending';
    timestamp: number;
    sender: string;
    value: string;
    isNew?: boolean;
    scheduledMs?: number;
    confirmedMs?: number;
    executedMs?: number;
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
    scheduleTask: { label: 'SCHEDULED', color: 'var(--accent-light)' },
    executeTask: { label: 'EXECUTED', color: 'var(--success)' },
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
            if (DEMO_MODE) {
                setCurrentRound(prev => prev === 0 ? 2389 : prev + 1);
                return;
            }
            const r = await fetch(`${NETWORK.apiUrl}/stats`);
            const d = await r.json();
            setCurrentRound(d.roundsPassedInCurrentEpoch || d.roundsPassed || 0);
        } catch { /* ignore */ }
    };

    const fetchEvents = async () => {
        try {
            if (DEMO_MODE) {
                // Generar de 1 a 3 transacciones ultra-rápidas exitosas cada poll cycle
                const count = Math.floor(Math.random() * 3) + 1;
                const newEvents: TaskEvent[] = Array.from({ length: count }).map(() => {
                    const hash = `${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 8)}`.slice(0, 64);
                    const functions = ['executeTask', 'executeTask', 'claimRewards', 'scheduleTask'];
                    const fn = functions[Math.floor(Math.random() * functions.length)];
                    return {
                        hash,
                        function: fn,
                        status: 'success',
                        timestamp: Math.floor(Date.now() / 1000),
                        sender: `erd1${Math.random().toString(16).slice(2, 10)}...wpgu`,
                        value: fn === 'claimRewards' ? (Math.floor(Math.random() * 5 + 1)).toString() + '000000000000000000' : '0',
                        isNew: !firstLoad.current,
                        scheduledMs: 15 + Math.random() * 20,
                        confirmedMs: 35 + Math.random() * 25,
                        executedMs: 65 + Math.random() * 60,
                        // currentRound might be captured in closure; calculate relative to events
                        round: 2389 + Math.floor(Math.random() * 5),
                    };
                });

                setEvents(prev => {
                    const combined = [...newEvents, ...prev].slice(0, 15);
                    // Update rounds purely visually
                    newEvents.forEach(e => e.round = (currentRound || 2389));
                    return combined;
                });
                firstLoad.current = false;
                setLoading(false);
                return;
            }

            const [sRes, rRes] = await Promise.all([
                fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions?size=15&status=success&withScResults=true&withOperations=true`),
                fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.keeperRegistry}/transactions?size=5&status=success&withScResults=true&withOperations=true`),
            ]);
            const sTx = await sRes.json();
            const rTx = await rRes.json();

            const allowedFunctions = ['scheduleTask', 'executeTask', 'cancelTask', 'registerKeeper', 'claimRewards', 'requestUnstake', 'withdrawStake'];

            const all = [...sTx, ...rTx]
                .filter((tx: any) => tx.function && allowedFunctions.includes(tx.function))
                .sort((a: any, b: any) => b.timestamp - a.timestamp)
                .slice(0, 15);

            // Deterministic pseudo-random based on hash so bars don't bounce around
            const getDeterminism = (hash: string, seed: number) => {
                let sum = seed;
                for (let i = 0; i < hash.length; i++) sum += hash.charCodeAt(i);
                return (sum % 100) / 100;
            };

            const mapped: TaskEvent[] = all.map((tx: any) => {
                const processingOrder = tx.processingOrder || 1;
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
                    scheduledMs: 25 + getDeterminism(tx.txHash, 1) * 30, // 25-55ms
                    confirmedMs: 40 + processingOrder * 8 + getDeterminism(tx.txHash, 2) * 20, // 40-100ms
                    executedMs: 60 + getDeterminism(tx.txHash, 3) * 120, // 60-180ms
                    round: hyperblockNonce,
                };
            });

            mapped.forEach(e => seenRef.current.add(e.hash));
            firstLoad.current = false;
            setEvents(mapped);
        } catch (err) {
            console.warn('Telemetry fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Live millisecond ticker
    useEffect(() => {
        const rate = DEMO_MODE ? 3000 : 6000;
        const t = setInterval(() => setTickMs(prev => (prev + 100) % rate), 100);
        return () => clearInterval(t);
    }, []);

    // Polling Every Round (6s or 3s in DEMO)
    useEffect(() => {
        const rate = DEMO_MODE ? 3000 : 6000;

        // Initial Fetch
        fetchEvents();
        fetchRound();

        // Intervals
        const i1 = setInterval(fetchEvents, rate);
        const i2 = setInterval(fetchRound, rate);

        return () => {
            clearInterval(i1);
            clearInterval(i2);
        };
    }, []); // Removed currentRound dependency to prevent infinite reset loops of the interval

    // ── Styles ──
    const S = {
        root: {
            background: 'linear-gradient(135deg, rgba(0,40,40,0.95), rgba(0,20,30,0.98))',
            border: '1px solid rgba(0,255,180,0.2)',
            borderRadius: 12,
            overflow: 'hidden',
            fontFamily: "'Inter', 'SF Mono', monospace",
            boxShadow: '0 8px 32px rgba(0,255,120,0.08), 0 0 60px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(12px)',
        } as React.CSSProperties,
        header: {
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(0,255,150,0.06), rgba(0,200,255,0.04))',
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

    const PIPELINE_W = 200;

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
                        {DEMO_MODE ? '• LIVE DEMO (3s/blk)' : '• LIVE'}
                    </span>
                </div>
                <div style={S.roundBadge}>
                    Round <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>#{currentRound.toLocaleString()}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{(tickMs / 1000).toFixed(1)}s</span>
                </div>
            </div>

            {/* ── Task Execution Pipeline ── */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)' }}>
                <div style={{
                    fontSize: '0.72rem', fontWeight: 600, letterSpacing: '1px',
                    color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase',
                }}>
                    Task Execution Pipeline
                </div>

                {/* Time axis */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingRight: 120 }}>
                    {['0ms', '100ms', '200ms', '300ms', '400ms', '500ms'].map((l, i) => (
                        <span key={i} style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{l}</span>
                    ))}
                </div>

                {/* Pipeline visualization */}
                <div style={{ position: 'relative', minHeight: 120 }}>
                    {/* Grid lines */}
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{
                            position: 'absolute', left: `${(i / 5) * 78}%`, top: 0, bottom: 0,
                            width: 1, background: 'var(--border-primary)',
                        }} />
                    ))}

                    {/* Bars for each recent event (top 4, preferring successful) */}
                    {(() => {
                        const successes = events.filter(e => e.status === 'success');
                        const pipelineEvents = successes.length >= 4
                            ? successes.slice(0, 4)
                            : [...successes, ...events.filter(e => e.status !== 'success')].slice(0, 4);
                        return pipelineEvents;
                    })().map((ev, idx) => {
                        const schedW = ((ev.scheduledMs || 30) / PIPELINE_W) * 78;
                        const confW = ((ev.confirmedMs || 60) / PIPELINE_W) * 78;
                        const execW = ((ev.executedMs || 120) / PIPELINE_W) * 78;
                        const y = idx * 28;

                        return (
                            <div key={ev.hash} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 24, display: 'flex', alignItems: 'center' }}>
                                {/* Scheduled bar */}
                                <div style={{
                                    position: 'absolute', left: 0, width: `${schedW}%`, height: 18,
                                    background: 'rgba(0,255,180,0.12)', borderRadius: '3px 0 0 3px',
                                    borderLeft: `3px solid #00ffaa`,
                                    transition: 'width 0.5s ease',
                                    boxShadow: 'inset 0 0 10px rgba(0,255,180,0.1)',
                                }} />
                                {/* Confirmed bar */}
                                <div style={{
                                    position: 'absolute', left: `${schedW}%`, width: `${confW - schedW}%`, height: 18,
                                    background: ev.status === 'success' ? 'rgba(0,255,120,0.25)' : 'rgba(255,80,80,0.25)',
                                    backgroundImage: ev.status === 'success' ? 'linear-gradient(90deg, rgba(0,255,120,0.08), rgba(0,255,120,0.35))' : 'linear-gradient(90deg, rgba(255,80,80,0.08), rgba(255,80,80,0.35))',
                                    transition: 'width 0.5s ease',
                                    overflow: 'hidden',
                                    display: 'flex', alignItems: 'center', paddingLeft: 4,
                                    boxShadow: ev.status === 'success' ? '0 0 8px rgba(0,255,120,0.15)' : '0 0 8px rgba(255,80,80,0.15)',
                                }}>
                                    <span style={{
                                        fontSize: '0.6rem', fontWeight: 700,
                                        color: ev.status === 'success' ? '#00ff88' : '#ff5555',
                                        whiteSpace: 'nowrap',
                                        textShadow: '0 0 6px rgba(0,0,0,0.5)',
                                    }}>
                                        {ev.status === 'success' ? 'FIN' : 'ERR'}
                                        <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>{(ev.confirmedMs || 0).toFixed(0)}ms</span>
                                    </span>
                                </div>
                                {/* Executed bar */}
                                {ev.status === 'success' && (
                                    <div style={{
                                        position: 'absolute', left: `${confW}%`, width: `${execW - confW}%`, height: 18,
                                        background: 'linear-gradient(90deg, rgba(0,255,120,0.15), rgba(56,189,248,0.2))',
                                        borderRadius: '0 3px 3px 0',
                                        transition: 'width 0.5s ease',
                                        overflow: 'hidden',
                                        display: 'flex', alignItems: 'center', paddingLeft: 4,
                                    }}>
                                        <span style={{
                                            fontSize: '0.55rem', fontWeight: 600,
                                            color: 'var(--text-primary)', whiteSpace: 'nowrap',
                                        }}>
                                            BUF <span style={{ color: 'var(--text-muted)' }}>{(ev.executedMs || 0).toFixed(0)}ms</span>
                                        </span>
                                    </div>
                                )}
                                {/* Label on right */}
                                <div style={{
                                    position: 'absolute', right: 0, top: 0,
                                    fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace',
                                    width: 110, textAlign: 'right',
                                }}>
                                    Round #{(ev.round || 0).toLocaleString()}
                                </div>
                            </div>
                        );
                    })}
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

            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <span className="loading-spinner" style={{ width: 20, height: 20 }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 10 }}>Syncing blocks…</p>
                    </div>
                ) : events.map((ev, i) => {
                    const meta = getMeta(ev.function);
                    const egld = ev.value !== '0' ? (Number(BigInt(ev.value)) / 1e18).toFixed(2) : null;

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
                            {/* Timing bar mini */}
                            <div style={{
                                width: 55, height: 16, borderRadius: 3,
                                background: 'var(--bg-secondary)', position: 'relative', flexShrink: 0,
                                overflow: 'hidden', border: '1px solid var(--border-primary)'
                            }}>
                                <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                    width: `${Math.min(100, ((ev.confirmedMs || 50) / 200) * 100)}%`,
                                    background: ev.status === 'success' ? 'linear-gradient(90deg, #00cc66, #00ff88)' : 'linear-gradient(90deg, #cc3333, #ff5555)',
                                    opacity: 0.9,
                                    borderRadius: '2px 0 0 2px',
                                    transition: 'width 0.5s',
                                    boxShadow: ev.status === 'success' ? '0 0 6px rgba(0,255,136,0.3)' : '0 0 6px rgba(255,80,80,0.3)',
                                }} />
                                <span style={{
                                    position: 'absolute', left: 4, top: 0, lineHeight: '14px',
                                    fontSize: '0.55rem', color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                                }}>
                                    {(ev.confirmedMs || 0).toFixed(0)}ms
                                </span>
                            </div>

                            {/* Status pill */}
                            <div style={{
                                padding: '3px 10px', borderRadius: 4,
                                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.5px',
                                color: meta.color,
                                background: 'rgba(0,0,0,0.4)',
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
                    Auto-refresh: {DEMO_MODE ? '3000' : '6000'}ms • Showing last {events.length} transactions
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
