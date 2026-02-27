import { useEffect, useState } from 'react';
import { formatEgld } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '../config';
import { AnimatedCounter } from './AnimatedCounter';

/* ─── Mini-widget style helpers ─── */
const widgetStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-primary)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
    transition: 'var(--transition)',
};

const labelStyle: React.CSSProperties = {
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    color: 'var(--text-muted)',
    marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
    fontSize: '1.2rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    lineHeight: 1,
};

const subStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    color: 'var(--text-secondary)',
    marginTop: 4,
};

/* ─── Success Rate Gauge ─── */
function SuccessGauge({ rate, total }: { rate: number; total: number }) {
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (rate / 100) * circumference;
    const color = rate >= 90 ? 'rgb(34,197,94)' : rate >= 70 ? 'rgb(251,191,36)' : 'rgb(239,68,68)';

    return (
        <div style={{ ...widgetStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="76" height="76" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                <circle
                    cx="40" cy="40" r={radius} fill="none"
                    stroke={color} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
                />
                <text x="40" y="38" textAnchor="middle" fill={color} fontSize="16" fontWeight="800">{rate}%</text>
                <text x="40" y="52" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontWeight="500">SUCCESS</text>
            </svg>
            <div>
                <div style={labelStyle}>Execution Health</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    <span style={{ color: 'rgb(34,197,94)', fontWeight: 700 }}>{total > 0 ? Math.round(rate * total / 100) : 0}</span>
                    {' '}passed · <span style={{ color: 'rgb(239,68,68)', fontWeight: 700 }}>{total > 0 ? total - Math.round(rate * total / 100) : 0}</span> failed
                </div>
            </div>
        </div>
    );
}

/* ─── Network Status Widget ─── */
function NetworkStatus({ stats }: { stats: { block: number; epoch: number; roundsPerEpoch: number; shard: number } }) {
    return (
        <div style={{ ...widgetStyle }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)', animation: 'pulseGlow 2s infinite' }} />
                <span style={{ ...labelStyle, marginBottom: 0, color: 'var(--accent-light)' }}>Network Live</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                    <div style={{ ...labelStyle }}>Block</div>
                    <div style={{ ...valueStyle, fontSize: '1rem' }}>{stats.block > 0 ? stats.block.toLocaleString() : '...'}</div>
                </div>
                <div>
                    <div style={{ ...labelStyle }}>Epoch</div>
                    <div style={{ ...valueStyle, fontSize: '1rem' }}>{stats.epoch > 0 ? stats.epoch.toLocaleString() : '...'}</div>
                </div>
                <div>
                    <div style={{ ...labelStyle }}>Shard</div>
                    <div style={{ ...valueStyle, fontSize: '1rem' }}>{stats.shard}</div>
                </div>
                <div>
                    <div style={{ ...labelStyle }}>Rounds/Epoch</div>
                    <div style={{ ...valueStyle, fontSize: '1rem' }}>{stats.roundsPerEpoch > 0 ? stats.roundsPerEpoch.toLocaleString() : '...'}</div>
                </div>
            </div>
        </div>
    );
}

/* ─── Protocol Balance Widget ─── */
function ProtocolBalance({ balance, loading }: { balance: string; loading: boolean }) {
    return (
        <div style={{ ...widgetStyle, background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.15)' }}>
            <div style={{ ...labelStyle, color: 'rgb(251,191,36)' }}>Protocol EGLD Balance</div>
            <div style={{ ...valueStyle, color: 'rgb(251,191,36)' }}>
                {loading ? '...' : formatEgld(balance, 4)}
            </div>
            <div style={subStyle}>Scheduler contract</div>
        </div>
    );
}

/* ─── Task Queue Widget ─── */
function TaskQueue({ pending, completed, total }: { pending: number; completed: number; total: number }) {
    const pctCompleted = total > 0 ? (completed / total) * 100 : 0;
    const pctPending = total > 0 ? (pending / total) * 100 : 0;

    return (
        <div style={widgetStyle}>
            <div style={labelStyle}>Task Pipeline</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <div>
                    <div style={{ ...valueStyle, color: 'rgb(59,130,246)' }}><AnimatedCounter value={pending} /></div>
                    <div style={subStyle}>Pending</div>
                </div>
                <div>
                    <div style={{ ...valueStyle, color: 'rgb(34,197,94)' }}><AnimatedCounter value={completed} /></div>
                    <div style={subStyle}>Completed</div>
                </div>
                <div>
                    <div style={{ ...valueStyle, color: 'var(--text-muted)' }}><AnimatedCounter value={total} /></div>
                    <div style={subStyle}>Total</div>
                </div>
            </div>
            {/* Mini progress bar */}
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 10, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${pctCompleted}%`, background: 'rgb(34,197,94)', transition: 'width 1s ease' }} />
                <div style={{ width: `${pctPending}%`, background: 'rgb(59,130,246)', transition: 'width 1s ease' }} />
            </div>
        </div>
    );
}

/* ─── Main Side Panels Export ─── */

interface SidePanelData {
    successRate: number;
    totalExecs: number;
    pendingTasks: number;
    completedTasks: number;
    totalTasks: number;
    protocolBalance: string;
    balanceLoading: boolean;
}

export function LeftSidePanel({ data }: { data: SidePanelData }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SuccessGauge rate={data.successRate} total={data.totalExecs} />
            <TaskQueue pending={data.pendingTasks} completed={data.completedTasks} total={data.totalTasks} />
            <ProtocolBalance balance={data.protocolBalance} loading={data.balanceLoading} />
        </div>
    );
}

export function RightSidePanel() {
    const [netStats, setNetStats] = useState({ block: 0, epoch: 0, roundsPerEpoch: 0, shard: 0 });
    const [keeperStats, setKeeperStats] = useState<{ address: string; execs: number }[]>([]);

    useEffect(() => {
        async function fetchNetworkStats() {
            try {
                const res = await fetch(`${NETWORK.apiUrl}/stats`);
                const data = await res.json();
                setNetStats({
                    block: data.blocks || 0,
                    epoch: data.epoch || 0,
                    roundsPerEpoch: data.roundsPerEpoch || 0,
                    shard: data.shards || 3,
                });
            } catch { /* ignore */ }
        }

        async function fetchTopKeepers() {
            try {
                const res = await fetch(
                    `${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions?size=50&status=success&function=executeTask`
                );
                const txs = await res.json();
                // Count executions per sender
                const counts: Record<string, number> = {};
                for (const tx of txs) {
                    const sender = tx.sender || '';
                    counts[sender] = (counts[sender] || 0) + 1;
                }
                const sorted = Object.entries(counts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([address, execs]) => ({ address, execs }));
                setKeeperStats(sorted);
            } catch { /* ignore */ }
        }

        fetchNetworkStats();
        fetchTopKeepers();
        const interval = setInterval(() => {
            fetchNetworkStats();
            fetchTopKeepers();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <NetworkStatus stats={netStats} />
            {/* Top Keepers */}
            <div style={widgetStyle}>
                <div style={{ ...labelStyle, color: 'rgb(232,146,124)' }}>Top Keepers</div>
                {keeperStats.length === 0 ? (
                    <div style={{ ...subStyle, marginTop: 8 }}>No executions yet</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {keeperStats.map((k, i) => (
                            <div key={k.address} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 8px', borderRadius: 8,
                                background: i === 0 ? 'rgba(232,146,124,0.08)' : 'transparent',
                            }}>
                                <span style={{
                                    fontSize: '0.7rem', fontWeight: 800, width: 18, height: 18,
                                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: i === 0 ? 'rgba(232,146,124,0.2)' : 'rgba(255,255,255,0.06)',
                                    color: i === 0 ? 'rgb(232,146,124)' : 'var(--text-muted)',
                                }}>
                                    {i + 1}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {k.address.slice(0, 8)}...{k.address.slice(-4)}
                                </span>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgb(232,146,124)' }}>
                                    {k.execs} exec{k.execs !== 1 ? 's' : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* Protocol Status */}
            <div style={{ ...widgetStyle, background: 'rgba(34,197,94,0.04)', borderColor: 'rgba(34,197,94,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ ...labelStyle, color: 'rgb(34,197,94)' }}>Protocol Status</div>
                        <div style={{ ...valueStyle, color: 'rgb(34,197,94)' }}>Active</div>
                        <div style={subStyle}>Testnet deployment</div>
                    </div>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9,12 11,14 15,10" />
                    </svg>
                </div>
            </div>
        </div>
    );
}
