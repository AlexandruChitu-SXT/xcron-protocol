import { useEffect, useState } from 'react';
import { useContractQuery, bufferToNumber, formatEgld, bufferToBigInt } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '../config';

/**
 * ProtocolStats — Full analytics page for XCron Protocol.
 * Shows on-chain metrics, execution history, keeper leaderboard, and protocol health.
 */

interface ProtocolData {
    totalTasks: number;
    activeKeepers: number;
    minDeposit: string;
    protocolFeeBps: number;
    totalExecuted: number;
    totalFailed: number;
    pendingCount: number;
    protocolBalance: string;
}

interface KeeperExecEntry {
    keeper: string;
    txHash: string;
    timestamp: number;
    taskId: string;
}

export function ProtocolStats() {
    const { query } = useContractQuery();
    const [data, setData] = useState<ProtocolData | null>(null);
    const [recentExecs, setRecentExecs] = useState<KeeperExecEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, []);

    async function loadData() {
        try {
            const [nonceRes, keeperRes, depositRes, feeRes, metricsRes] = await Promise.all([
                query(CONTRACTS.scheduler, 'getTaskNonce'),
                query(CONTRACTS.keeperRegistry, 'getActiveKeeperCount'),
                query(CONTRACTS.scheduler, 'getMinDeposit'),
                query(CONTRACTS.scheduler, 'getProtocolFeeBps'),
                query(CONTRACTS.scheduler, 'getSecurityMetrics'),
            ]);

            const totalExecuted = metricsRes.length > 0 ? bufferToNumber(metricsRes[0]) : 0;
            const totalFailed = metricsRes.length > 1 ? bufferToNumber(metricsRes[1]) : 0;
            const pendingCount = metricsRes.length > 2 ? bufferToNumber(metricsRes[2]) : 0;

            let protocolBalance = '0';
            try {
                const balRes = await fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}`);
                const balData = await balRes.json();
                protocolBalance = balData.balance || '0';
            } catch { /* ignore */ }

            setData({
                totalTasks: nonceRes.length > 0 ? bufferToNumber(nonceRes[0]) : 0,
                activeKeepers: keeperRes.length > 0 ? bufferToNumber(keeperRes[0]) : 0,
                minDeposit: depositRes.length > 0 ? bufferToBigInt(depositRes[0]) : '0',
                protocolFeeBps: feeRes.length > 0 ? bufferToNumber(feeRes[0]) : 0,
                totalExecuted,
                totalFailed,
                pendingCount,
                protocolBalance,
            });

            // Fetch recent executions from API
            try {
                const execRes = await fetch(
                    `${NETWORK.apiUrl}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&status=success&size=10&order=desc`
                );
                const txs = await execRes.json();
                if (Array.isArray(txs)) {
                    setRecentExecs(txs.map((tx: any) => {
                        let taskId = '?';
                        if (tx.data) {
                            try {
                                const decoded = atob(tx.data);
                                const parts = decoded.split('@');
                                if (parts.length > 1) taskId = '#' + parseInt(parts[1], 16);
                            } catch { /* ignore */ }
                        }
                        return {
                            keeper: tx.sender || '?',
                            txHash: tx.txHash || '',
                            timestamp: tx.timestamp || 0,
                            taskId,
                        };
                    }));
                }
            } catch { /* ignore */ }

        } catch (err) {
            console.error('Stats load error:', err);
        } finally {
            setLoading(false);
        }
    }

    const successRate = data && (data.totalExecuted + data.totalFailed) > 0
        ? Math.round((data.totalExecuted / (data.totalExecuted + data.totalFailed)) * 100)
        : 0;

    const totalExecs = data ? data.totalExecuted + data.totalFailed : 0;

    return (
        <div className="page-container" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <h1 style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #00e5ff, #00e676)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: 6,
                }}>
                    Protocol Analytics
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Real-time on-chain metrics for XCron Protocol on MultiversX {NETWORK.name}
                </p>
            </div>

            {/* Main Stat Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14,
                marginBottom: 24,
            }}>
                <StatCard label="Total Tasks" value={data?.totalTasks ?? 0} icon="📋" color="#00e5ff" loading={loading} />
                <StatCard label="Lifetime Executions" value={totalExecs} icon="⚡" color="#ffa726" loading={loading} />
                <StatCard label="Success Rate" value={`${successRate}%`} icon="✅" color={successRate >= 90 ? '#00e676' : successRate >= 50 ? '#ffa726' : '#ff5252'} loading={loading} />
                <StatCard label="Active Keepers" value={data?.activeKeepers ?? 0} icon="🤖" color="#ab47bc" loading={loading} />
            </div>

            {/* Detailed Metrics Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
                marginBottom: 24,
            }}>
                {/* Execution Breakdown */}
                <div className="glass-card" style={cardStyle}>
                    <h3 style={cardTitle}>Execution Breakdown</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                        <MetricRow label="Successful" value={data?.totalExecuted ?? 0} color="#00e676" total={totalExecs} />
                        <MetricRow label="Failed" value={data?.totalFailed ?? 0} color="#ff5252" total={totalExecs} />
                        <MetricRow label="Pending" value={data?.pendingCount ?? 0} color="#ffa726" total={data?.totalTasks ?? 1} />
                    </div>
                </div>

                {/* Protocol Economics */}
                <div className="glass-card" style={cardStyle}>
                    <h3 style={cardTitle}>Protocol Economics</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                        <div style={econRow}>
                            <span style={econLabel}>Protocol Balance</span>
                            <span style={econValue}>{data ? formatEgld(data.protocolBalance) : '...'} EGLD</span>
                        </div>
                        <div style={econRow}>
                            <span style={econLabel}>Min Deposit</span>
                            <span style={econValue}>{data ? formatEgld(data.minDeposit) : '...'} EGLD</span>
                        </div>
                        <div style={econRow}>
                            <span style={econLabel}>Protocol Fee</span>
                            <span style={econValue}>{data ? `${(data.protocolFeeBps / 100).toFixed(0)}%` : '...'}</span>
                        </div>
                        <div style={econRow}>
                            <span style={econLabel}>Keeper Share</span>
                            <span style={econValue}>{data ? `${100 - data.protocolFeeBps / 100}%` : '...'}</span>
                        </div>
                        <div style={econRow}>
                            <span style={econLabel}>Network</span>
                            <span style={{ ...econValue, color: '#00e5ff' }}>{NETWORK.name.toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                {/* Protocol Health Score */}
                <div className="glass-card" style={cardStyle}>
                    <h3 style={cardTitle}>Protocol Health</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 12 }}>
                        <div style={{
                            width: 120, height: 120,
                            borderRadius: '50%',
                            background: `conic-gradient(${successRate >= 90 ? '#00e676' : successRate >= 50 ? '#ffa726' : '#ff5252'} ${successRate * 3.6}deg, rgba(255,255,255,0.05) 0deg)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <div style={{
                                width: 96, height: 96, borderRadius: '50%',
                                background: 'var(--bg-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexDirection: 'column',
                            }}>
                                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
                                    {loading ? '...' : successRate}
                                </span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Score
                                </span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: successRate >= 90 ? '#00e676' : successRate >= 50 ? '#ffa726' : '#ff5252', fontWeight: 700 }}>
                                {successRate >= 90 ? '🟢 Excellent' : successRate >= 50 ? '🟡 Fair' : '🔴 Needs Attention'}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                                Based on execution success rate
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Contract Addresses */}
            <div className="glass-card" style={{ ...cardStyle, marginBottom: 24 }}>
                <h3 style={cardTitle}>Deployed Contracts</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    <ContractRow label="Scheduler" address={CONTRACTS.scheduler} />
                    <ContractRow label="Keeper Registry" address={CONTRACTS.keeperRegistry} />
                    <ContractRow label="Rewards Pool" address={CONTRACTS.rewards} />
                </div>
            </div>

            {/* Recent Executions */}
            <div className="glass-card" style={cardStyle}>
                <h3 style={cardTitle}>Recent Executions</h3>
                {recentExecs.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 12 }}>
                        No executions recorded yet
                    </p>
                ) : (
                    <div style={{ marginTop: 12, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <th style={thStyle}>Task</th>
                                    <th style={thStyle}>Keeper</th>
                                    <th style={thStyle}>Time</th>
                                    <th style={thStyle}>TX</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentExecs.map((exec, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={tdStyle}>{exec.taskId}</td>
                                        <td style={tdStyle}>
                                            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                                                {exec.keeper.slice(0, 10)}...{exec.keeper.slice(-6)}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            {new Date(exec.timestamp * 1000).toLocaleString()}
                                        </td>
                                        <td style={tdStyle}>
                                            <a
                                                href={`${NETWORK.explorerUrl}/transactions/${exec.txHash}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ color: '#00e5ff', textDecoration: 'none', fontSize: '0.72rem' }}
                                            >
                                                {exec.txHash.slice(0, 8)}... ↗
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────

function StatCard({ label, value, icon, color, loading }: {
    label: string; value: number | string; icon: string; color: string; loading: boolean;
}) {
    return (
        <div className="glass-card" style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: '18px 16px',
            transition: 'transform 0.2s, border-color 0.2s',
            cursor: 'default',
        }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.borderColor = color;
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)';
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {label}
                </span>
            </div>
            <div style={{
                fontSize: '1.8rem',
                fontWeight: 800,
                color,
                fontFeatureSettings: '"tnum"',
            }}>
                {loading ? <span className="skeleton" style={{ width: 60, height: 28, display: 'inline-block', borderRadius: 6 }} /> : value}
            </div>
        </div>
    );
}

function MetricRow({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{value} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({pct}%)</span></span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 3,
                    transition: 'width 0.6s ease',
                    boxShadow: `0 0 8px ${color}40`,
                }} />
            </div>
        </div>
    );
}

function ContractRow({ label, address }: { label: string; address: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
            <a
                href={`${NETWORK.explorerUrl}/accounts/${address}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#00e5ff', textDecoration: 'none' }}
            >
                {address.slice(0, 14)}...{address.slice(-8)} ↗
            </a>
        </div>
    );
}

// ── Styles ────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
    background: 'var(--bg-glass)',
    border: '1px solid var(--border-primary)',
    borderRadius: 14,
    padding: '20px 18px',
};

const cardTitle: React.CSSProperties = {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: 0.3,
};

const econRow: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
};

const econLabel: React.CSSProperties = {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
};

const econValue: React.CSSProperties = {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontFeatureSettings: '"tnum"',
};

const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 6px',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
    padding: '10px 6px',
    color: 'var(--text-primary)',
};
