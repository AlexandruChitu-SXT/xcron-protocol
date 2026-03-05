"use client";

import { useEffect, useState } from 'react';
import { useContractQuery, bufferToNumber, formatEgld, bufferToBigInt } from '@/hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '@/config';
import { TypewriterTitle } from '@/components/TypewriterTitle';
import { ProtocolRadar } from '@/components/ProtocolRadar';

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

export default function ProtocolStats() {
    const { query } = useContractQuery();
    const [data, setData] = useState<ProtocolData | null>(null);
    const [recentExecs, setRecentExecs] = useState<KeeperExecEntry[]>([]);
    const [netStats, setNetStats] = useState({ block: 0, epoch: 0, roundsPerEpoch: 0, shard: 0 });
    const [keeperStats, setKeeperStats] = useState<{ address: string; execs: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

            try {
                const resNet = await fetch(`${NETWORK.apiUrl}/stats`);
                const netData = await resNet.json();
                setNetStats({ block: netData.blocks || 0, epoch: netData.epoch || 0, roundsPerEpoch: netData.roundsPerEpoch || 0, shard: netData.shards || 3 });
            } catch { /* ignore */ }

            try {
                const resK = await fetch(`${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions?size=50&status=success&function=executeTask`);
                const txsK = await resK.json();
                const counts: Record<string, number> = {};
                for (const tx of txsK) { counts[tx.sender || ''] = (counts[tx.sender || ''] || 0) + 1; }
                const sorted = Object.entries(counts).map(([address, execs]) => ({ address, execs })).sort((a, b) => b.execs - a.execs).slice(0, 3);
                setKeeperStats(sorted);
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
        <div className="w-full max-w-6xl mx-auto px-4 md:px-0">
            {/* Header */}
            <div className="mb-10 text-center sm:text-left">
                <TypewriterTitle as="h1" text="Protocol Analytics" speed={70} className="text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] relative z-10" />
                <TypewriterTitle as="p" text={`Real-time on-chain metrics for XCron Protocol on MultiversX ${NETWORK.name}`} speed={30} className="text-white/60" />
            </div>

            {/* Main Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
                <StatCard
                    label="Total Tasks"
                    value={data?.totalTasks ?? 0}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="10" /></svg>}
                    colorClass="text-cyan-400 group-hover:border-cyan-400/50"
                    bgClass="bg-cyan-500/10 border-cyan-500/20"
                    loading={loading}
                />
                <StatCard
                    label="Lifetime Executions"
                    value={totalExecs}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>}
                    colorClass="text-orange-400 group-hover:border-orange-400/50"
                    bgClass="bg-orange-500/10 border-orange-500/20"
                    loading={loading}
                />
                <StatCard
                    label="Success Rate"
                    value={`${successRate}%`}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L3 7v6c0 5.25 3.85 10.15 9 11.35C17.15 23.15 21 18.25 21 13V7L12 2z" /><polyline points="9,12 11,14 15,10" /></svg>}
                    colorClass={`${successRate >= 90 ? 'text-green-400 group-hover:border-green-400/50' : successRate >= 50 ? 'text-yellow-400 group-hover:border-yellow-400/50' : 'text-red-400 group-hover:border-red-400/50'}`}
                    bgClass={`${successRate >= 90 ? 'bg-green-500/10 border-green-500/20' : successRate >= 50 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20'}`}
                    loading={loading}
                />
                <StatCard
                    label="Active Keepers"
                    value={data?.activeKeepers ?? 0}
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>}
                    colorClass="text-purple-400 group-hover:border-purple-400/50"
                    bgClass="bg-purple-500/10 border-purple-500/20"
                    loading={loading}
                />
            </div>

            {/* Detailed Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {/* Execution Breakdown */}
                <div className="rounded-2xl border border-white/10 p-6 shadow-xl">
                    <h3 className="text-white font-bold tracking-wide uppercase text-xs mb-6 opacity-80">Execution Breakdown</h3>
                    <div className="flex flex-col gap-5">
                        <MetricRow label="Successful" value={data?.totalExecuted ?? 0} colorClass="bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)] text-green-400" total={totalExecs} />
                        <MetricRow label="Failed" value={data?.totalFailed ?? 0} colorClass="bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] text-red-500" total={totalExecs} />
                        <MetricRow label="Pending" value={data?.pendingCount ?? 0} colorClass="bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.5)] text-orange-400" total={data?.totalTasks ?? 1} />
                    </div>
                </div>

                {/* Protocol Economics */}
                <div className="rounded-2xl border border-white/10 p-6 shadow-xl flex flex-col">
                    <h3 className="text-white font-bold tracking-wide uppercase text-xs mb-6 opacity-80">Protocol Economics</h3>
                    <div className="flex flex-col gap-4 flex-1 justify-center">
                        <div className="flex justify-between items-center py-1">
                            <span className="text-white/60 text-sm">Protocol Balance</span>
                            <span className="font-bold text-white tracking-wide">{data ? formatEgld(data.protocolBalance) : '...'} EGLD</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-white/60 text-sm">Min Deposit</span>
                            <span className="font-bold text-white tracking-wide">{data ? formatEgld(data.minDeposit) : '...'} EGLD</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-white/60 text-sm">Protocol Fee</span>
                            <span className="font-bold text-white tracking-wide">{data ? `${(data.protocolFeeBps / 100).toFixed(0)}%` : '...'}</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-white/60 text-sm">Keeper Share</span>
                            <span className="font-bold text-green-400 tracking-wide">{data ? `${100 - data.protocolFeeBps / 100}%` : '...'}</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-white/60 text-sm">Network</span>
                            <span className="font-bold text-cyan-400 uppercase tracking-widest text-xs">{NETWORK.name}</span>
                        </div>
                    </div>
                </div>

                {/* Protocol Health Score */}
                <div className="rounded-2xl border border-white/10 p-6 shadow-xl">
                    <h3 className="text-white font-bold tracking-wide uppercase text-xs mb-6 opacity-80">Protocol Health</h3>
                    <div className="flex flex-col items-center justify-center h-[calc(100%-2.5rem)] gap-5">
                        <div className={`w-28 h-28 rounded-full flex items-center justify-center p-1 relative ${successRate >= 90 ? 'bg-gradient-to-tr from-green-500 to-green-300' : successRate >= 50 ? 'bg-gradient-to-tr from-yellow-500 to-yellow-300' : 'bg-gradient-to-tr from-red-500 to-red-300'}`}>
                            <div className="absolute inset-x-0 bottom-0 top-0 rounded-full bg-black/60 m-1"></div>
                            <div className="w-full h-full rounded-full bg-black flex flex-col items-center justify-center relative z-10 border border-white/10">
                                <span className="text-3xl font-light text-white leading-none">
                                    {loading ? '...' : successRate}
                                </span>
                                <span className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Score</span>
                            </div>
                        </div>
                        <div className="text-center">
                            <div className={`text-sm font-bold flex items-center justify-center gap-2 ${successRate >= 90 ? 'text-green-400' : successRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${successRate >= 90 ? 'bg-green-400' : successRate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`} />
                                <span>{successRate >= 90 ? 'Excellent' : successRate >= 50 ? 'Fair' : 'Needs Attention'}</span>
                            </div>
                            <div className="text-xs text-white/50 mt-1.5 font-light">
                                Based on execution success rate
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Network & Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Protocol Radar */}
                <div className="lg:col-span-2 rounded-2xl border border-white/10 p-6 shadow-xl flex flex-col items-center justify-center">
                    <h3 className="text-white w-full font-bold tracking-wide uppercase text-xs mb-2 opacity-80">Protocol Performance</h3>
                    <div className="w-full flex-1 min-h-[300px] flex items-center justify-center -mt-4">
                        <ProtocolRadar />
                    </div>
                </div>

                {/* Network & Keepers */}
                <div className="flex flex-col gap-6">
                    {/* Network Live */}
                    <div className="rounded-2xl border border-white/10 p-6 shadow-xl flex-1 border-t-2 border-t-cyan-500/50">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
                            <h3 className="text-cyan-400 font-bold tracking-wide uppercase text-xs">Network Live</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                            <div><div className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Block</div><div className="text-sm font-mono text-white/90">{netStats.block > 0 ? netStats.block.toLocaleString() : '...'}</div></div>
                            <div><div className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Epoch</div><div className="text-sm font-mono text-white/90">{netStats.epoch > 0 ? netStats.epoch.toLocaleString() : '...'}</div></div>
                            <div><div className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Shard</div><div className="text-sm font-mono text-white/90">{netStats.shard}</div></div>
                            <div><div className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Rnd/Epch</div><div className="text-sm font-mono text-white/90">{netStats.roundsPerEpoch > 0 ? netStats.roundsPerEpoch.toLocaleString() : '...'}</div></div>
                        </div>
                    </div>
                    {/* Top Keepers */}
                    <div className="rounded-2xl border border-white/10 p-6 shadow-xl flex-1 border-t-2 border-t-orange-500/50">
                        <h3 className="text-orange-400 font-bold tracking-wide uppercase text-xs mb-4">Top Keepers</h3>
                        {keeperStats.length === 0 ? (
                            <div className="text-xs text-white/40 mt-4">No executions yet</div>
                        ) : (
                            <div className="flex flex-col gap-3 mt-2">
                                {keeperStats.map((k, i) => (
                                    <div key={k.address} className={`flex items-center justify-between p-2.5 rounded-lg ${i === 0 ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-white/5'}`}>
                                        <div className="flex items-center gap-2.5">
                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-orange-500 text-white shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 'bg-white/10 text-white/50'}`}>
                                                {i + 1}
                                            </span>
                                            <span className="font-mono text-[10px] text-white/70">
                                                {k.address.slice(0, 8)}...{k.address.slice(-4)}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-bold text-orange-400">{k.execs} tx</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
                {/* Deployed Contracts */}
                <div className="rounded-2xl border border-white/10 p-6 shadow-xl">
                    <h3 className="text-white font-bold tracking-wide uppercase text-xs mb-6 opacity-80">Deployed Contracts</h3>
                    <div className="flex flex-col gap-2">
                        <ContractRow label="Scheduler" address={CONTRACTS.scheduler} />
                        <ContractRow label="Keeper Registry" address={CONTRACTS.keeperRegistry} />
                        <ContractRow label="Rewards Pool" address={CONTRACTS.rewards} />
                    </div>
                </div>

                {/* Recent Executions */}
                <div className="rounded-2xl border border-white/10 p-6 shadow-xl flex flex-col h-[340px] overflow-hidden">
                    <h3 className="text-white font-bold tracking-wide uppercase text-xs mb-4 opacity-80 shrink-0">Recent Executions</h3>

                    {recentExecs.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
                            No executions recorded yet
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-[#0a0f19] z-10">
                                    <tr className="border-b border-white/10">
                                        <th className="text-left font-bold text-white/50 text-[10px] uppercase tracking-wider py-2">Task</th>
                                        <th className="text-left font-bold text-white/50 text-[10px] uppercase tracking-wider py-2">Keeper</th>
                                        <th className="text-left font-bold text-white/50 text-[10px] uppercase tracking-wider py-2">Time</th>
                                        <th className="text-left font-bold text-white/50 text-[10px] uppercase tracking-wider py-2">TX</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentExecs.map((exec, i) => (
                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-2.5 text-white/90">{exec.taskId}</td>
                                            <td className="py-2.5">
                                                <span className="font-mono text-xs text-cyan-400">
                                                    {exec.keeper.slice(0, 10)}...{exec.keeper.slice(-6)}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-white/60 text-xs">
                                                {new Date(exec.timestamp * 1000).toLocaleString()}
                                            </td>
                                            <td className="py-2.5">
                                                <a
                                                    href={`${NETWORK.explorerUrl}/transactions/${exec.txHash}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-cyan-400 hover:text-cyan-300 transition-colors font-mono text-xs flex items-center gap-1"
                                                >
                                                    {exec.txHash.slice(0, 8)}... <span className="text-[10px]">↗</span>
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

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────

function StatCard({ label, value, icon, colorClass, bgClass, loading }: {
    label: string; value: number | string; icon: React.ReactNode; colorClass: string; bgClass: string; loading: boolean;
}) {
    return (
        <div className={`group rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 ${bgClass} cursor-default`}>
            <div className={`flex items-center gap-2.5 mb-3 ${colorClass} transition-colors duration-300`}>
                <span className="opacity-80 group-hover:opacity-100 transition-opacity">{icon}</span>
                <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold group-hover:text-white/80 transition-colors">
                    {label}
                </span>
            </div>
            <div className={`text-2xl md:text-3xl font-light tracking-tight font-mono ${colorClass.split(' ')[0]}`}>
                {loading ? <span className="inline-block w-16 h-8 bg-white/10 animate-pulse rounded-lg" /> : value}
            </div>
        </div>
    );
}

function MetricRow({ label, value, colorClass, total }: { label: string; value: number; colorClass: string; total: number }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    const bgParts = colorClass.split(' ');
    const widthClass = `w-[${pct}%]`;

    return (
        <div>
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-white/60">{label}</span>
                <span className={`text-sm font-bold ${bgParts[bgParts.length - 1]}`}>
                    {value} <span className="text-white/40 font-normal ml-1">({pct}%)</span>
                </span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${bgParts[0]} ${bgParts[1]}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function ContractRow({ label, address }: { label: string; address: string }) {
    return (
        <div className="flex justify-between items-center py-3 border-b border-white/5 hover:bg-white/5 px-2 -mx-2 rounded-lg transition-colors">
            <span className="text-sm text-white/70 font-medium">{label}</span>
            <a
                href={`${NETWORK.explorerUrl}/accounts/${address}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors bg-cyan-500/10 px-2 py-1 rounded"
            >
                {address.slice(0, 10)}...{address.slice(-6)} <span>↗</span>
            </a>
        </div>
    );
}
