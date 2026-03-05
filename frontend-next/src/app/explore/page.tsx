"use client";

import { devError, devWarn } from '@/utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useContractQuery, bufferToNumber, formatEgld, shortenAddress } from '@/hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '@/config';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { TypewriterTitle } from '@/components/TypewriterTitle';

interface TaskInfo {
    id: number;
    owner: string;
    targetContract: string;
    targetEndpoint: string;
    status: string;
    triggerTime: number;
    deposit: string;
}

interface ExecutionLog {
    txHash: string;
    taskId: string;
    status: 'success' | 'fail';
    timestamp: number;
    sender: string;
}

interface ApiTransaction {
    txHash: string;
    data?: string;
    status: string;
    timestamp: number;
    sender: string;
}

const STATUS_MAP: Record<number, string> = {
    0: 'Pending', 1: 'Committed', 2: 'Executing',
    3: 'Completed', 4: 'Failed', 5: 'Cancelled', 6: 'Expired',
};

const STATUS_CLASS: Record<string, string> = {
    Pending: 'badge-pending', Committed: 'badge-executing', Executing: 'badge-executing',
    Completed: 'badge-completed', Failed: 'badge-failed', Cancelled: 'badge-cancelled', Expired: 'badge-cancelled',
};

export default function ExploreTasks() {
    const { query } = useContractQuery();
    const [tasks, setTasks] = useState<TaskInfo[]>([]);
    const [execHistory, setExecHistory] = useState<ExecutionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [stats, setStats] = useState({ total: 0, lifetime: 0, active: 0, completed: 0, failed: 0 });

    useEffect(() => {
        loadAll();
        const interval = setInterval(() => loadAll(true), 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadAll(silent = false) {
        if (!silent) setLoading(true);
        try {
            await Promise.all([loadTasks(silent), loadExecHistory()]);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    async function loadTasks(_silent = false) {
        try {
            const [nonceRes, metricsRes] = await Promise.all([
                query(CONTRACTS.scheduler, 'getTaskNonce'),
                query(CONTRACTS.scheduler, 'getSecurityMetrics'),
            ]);
            const totalTasks = nonceRes.length > 0 ? bufferToNumber(nonceRes[0]) : 0;
            const totalExecuted = metricsRes.length > 0 ? bufferToNumber(metricsRes[0]) : 0;
            const totalFailed = metricsRes.length > 1 ? bufferToNumber(metricsRes[1]) : 0;
            const pendingCount = metricsRes.length > 2 ? bufferToNumber(metricsRes[2]) : 0;

            setStats({
                total: totalTasks,
                lifetime: totalTasks,
                active: pendingCount,
                completed: totalExecuted,
                failed: totalFailed,
            });

            const taskList: TaskInfo[] = [];
            for (let i = 1; i <= totalTasks; i++) {
                try {
                    const res = await query(CONTRACTS.scheduler, 'getTask', [
                        i.toString(16).padStart(2, '0'),
                    ]);
                    if (res.length > 0 && res[0].length > 0) {
                        taskList.push(parseTaskData(i, res[0]));
                    }
                } catch (err) {
                    devWarn(`Task ${i} parse failed:`, err);
                }
            }

            taskList.sort((a, b) => b.id - a.id);
            setTasks(taskList);
        } catch (err) {
            devError('Failed to load tasks:', err);
        }
    }

    function parseTaskData(id: number, data: Buffer): TaskInfo {
        let offset = 0;
        offset += 8;

        const ownerBytes = data.subarray(offset, offset + 32);
        let owner = '';
        try { owner = Address.newFromHex(ownerBytes.toString('hex')).toBech32(); } catch { owner = ownerBytes.toString('hex'); }
        offset += 32;

        const targetContractBytes = data.subarray(offset, offset + 32);
        let targetContract = '';
        try { targetContract = Address.newFromHex(targetContractBytes.toString('hex')).toBech32(); } catch { targetContract = targetContractBytes.toString('hex'); }
        offset += 32;

        const endpointLen = data.readUInt32BE(offset);
        offset += 4;
        const targetEndpoint = data.subarray(offset, offset + endpointLen).toString('utf-8');
        offset += endpointLen;

        const argsCount = data.readUInt32BE(offset);
        offset += 4;
        for (let j = 0; j < argsCount; j++) {
            const argLen = data.readUInt32BE(offset);
            offset += 4 + argLen;
        }

        const triggerVariant = data[offset];
        offset += 1;
        let triggerTime = 0;
        if (triggerVariant === 0) {
            triggerTime = Number(data.readBigUInt64BE(offset));
            offset += 8;
        } else if (triggerVariant === 1) {
            triggerTime = Number(data.readBigUInt64BE(offset));
            offset += 24;
        } else if (triggerVariant === 2) {
            offset += 32;
            const qLen = data.readUInt32BE(offset);
            offset += 4 + qLen;
            const qaCount = data.readUInt32BE(offset);
            offset += 4;
            for (let j = 0; j < qaCount; j++) { const al = data.readUInt32BE(offset); offset += 4 + al; }
            offset += 1;
            const tLen = data.readUInt32BE(offset);
            offset += 4 + tLen;
        }

        offset += 8;

        const depositLen = data.readUInt32BE(offset);
        offset += 4;
        const depositBytes = data.subarray(offset, offset + depositLen);
        const deposit = depositLen > 0 ? BigInt('0x' + depositBytes.toString('hex')).toString() : '0';
        offset += depositLen;

        offset += 2;
        offset += 16;

        const statusByte = offset < data.length ? data[offset] : 0;
        const status = STATUS_MAP[statusByte] || 'Unknown';

        return { id, owner, targetContract, targetEndpoint, status, triggerTime, deposit };
    }

    async function loadExecHistory() {
        try {
            const res = await fetch(
                `${NETWORK.apiUrl}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&status=success&size=25&order=desc`
            );
            const txs = await res.json();
            if (Array.isArray(txs)) {
                setExecHistory(txs.map((tx: ApiTransaction) => {
                    let taskId = '?';
                    if (tx.data) {
                        try {
                            const decoded = atob(tx.data);
                            const parts = decoded.split('@');
                            if (parts.length > 1) taskId = '#' + parseInt(parts[1], 16).toString();
                        } catch { /* keep ? */ }
                    }
                    return { txHash: tx.txHash, taskId, status: tx.status === 'success' ? 'success' as const : 'fail' as const, timestamp: tx.timestamp, sender: tx.sender };
                }));
            }
        } catch (err) {
            devWarn('Failed to load execution history:', err);
        }
    }

    function timeAgo(ts: number): string {
        const now = Math.floor(Date.now() / 1000);
        const diff = now - ts;
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    const displayTasks = tasks;
    const displayHistory = execHistory;
    const displayStats = stats;

    const filteredDisplay = statusFilter === 'all'
        ? displayTasks
        : displayTasks.filter(t => t.status.toLowerCase() === statusFilter);

    return (
        <div className="w-full">
            <div className="mb-8 text-center">
                <TypewriterTitle as="h1" text="Explore Tasks" speed={70} className="text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] relative z-10" />
                <TypewriterTitle as="p" text="Browse all tasks scheduled on XCron Protocol" speed={30} className="text-white/60" />
            </div>

            {/* Protocol overview stats — Tailwind UX */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="p-5 rounded-xl border border-blue-500/20 hover:border-blue-500/30 transition-colors relative overflow-hidden group">
                    <div className="absolute top-4 right-4 text-blue-500/40 group-hover:text-blue-500/60 transition-colors">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" /><line x1="12" y1="2" x2="12" y2="22" /></svg>
                    </div>
                    <div className="text-sm font-semibold text-blue-400 mb-1">Total Tasks</div>
                    <div className="text-3xl font-bold text-white mb-1"><AnimatedCounter value={displayStats.lifetime} /></div>
                    <div className="text-xs text-white/50">{displayStats.total} visible on-chain</div>
                </div>

                <div className="p-5 rounded-xl border border-amber-500/20 hover:border-amber-500/30 transition-colors relative overflow-hidden group">
                    <div className="absolute top-4 right-4 text-amber-500/40 group-hover:text-amber-500/60 transition-colors">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    </div>
                    <div className="text-sm font-semibold text-amber-400 mb-1">Active</div>
                    <div className="text-3xl font-bold text-white mb-1"><AnimatedCounter value={displayStats.active} /></div>
                    <div className="text-xs text-white/50">Pending execution</div>
                </div>

                <div className="p-5 rounded-xl border border-green-500/20 hover:border-green-500/30 transition-colors relative overflow-hidden group">
                    <div className="absolute top-4 right-4 text-green-500/40 group-hover:text-green-500/60 transition-colors">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20,6 9,17 4,12" /></svg>
                    </div>
                    <div className="text-sm font-semibold text-green-400 mb-1">Completed</div>
                    <div className="text-3xl font-bold text-white mb-1"><AnimatedCounter value={displayStats.completed} /></div>
                    <div className="text-xs text-white/50">Successfully executed</div>
                </div>

                <div className="p-5 rounded-xl border border-red-500/20 hover:border-red-500/30 transition-colors relative overflow-hidden group">
                    <div className="absolute top-4 right-4 text-red-500/40 group-hover:text-red-500/60 transition-colors">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    </div>
                    <div className="text-sm font-semibold text-red-400 mb-1">Failed</div>
                    <div className="text-3xl font-bold text-white mb-1"><AnimatedCounter value={displayStats.failed} /></div>
                    <div className="text-xs text-white/50">Reverted on-chain</div>
                </div>
            </div>

            {/* ── Recent Executions Widget ── */}
            {displayHistory.length > 0 && (
                <div className="rounded-xl border border-green-500/30 overflow-hidden mb-8">
                    <div className="flex items-center justify-between p-4 bg-green-500/10 border-b border-green-500/20">
                        <div className="flex items-center gap-3">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2" strokeLinecap="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                            <span className="font-bold text-sm text-white">Recent Executions</span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400">
                                {displayHistory.length}
                            </span>
                        </div>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-green-500/30 scrollbar-track-transparent">
                        {displayHistory.map((log, i) => (
                            <div
                                key={log.txHash}
                                className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-green-500/5 ${i < displayHistory.length - 1 ? 'border-b border-white/5' : ''
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.status === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
                                    }`}>
                                    {log.status === 'success' ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(239,68,68)" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-white">Task {log.taskId}</div>
                                    <div className="text-xs text-white/50 flex gap-3 mt-1">
                                        <span>Keeper: {shortenAddress(log.sender)}</span>
                                        <span>{timeAgo(log.timestamp)}</span>
                                    </div>
                                </div>
                                <a
                                    href={`${NETWORK.explorerUrl}/transactions/${log.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors"
                                >
                                    View Tx →
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center mb-6">
                {['all', 'pending', 'committed', 'completed', 'failed', 'cancelled'].map(f => (
                    <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${statusFilter === f
                            ? 'bg-cyan-500 text-black'
                            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
                            }`}
                    >
                        {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
                <button
                    onClick={() => loadAll()}
                    disabled={loading}
                    className="ml-auto px-4 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10 disabled:opacity-50 transition-colors"
                >
                    {loading ? <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin align-middle mr-2" /> : '↻ Refresh'}
                </button>
            </div>

            {/* ── All Tasks Widget ── */}
            {loading ? (
                <div className="py-20 text-center text-white/50">
                    <span className="inline-block w-8 h-8 border-2 border-white/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
                    <p>Loading tasks from blockchain...</p>
                </div>
            ) : filteredDisplay.length === 0 ? (
                <div className="py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 animate-[pulseGlow_2s_ease-in-out_infinite]">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(59,130,246)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </div>
                    <p className="text-white/60">No tasks found{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}</p>
                </div>
            ) : (
                <div className="rounded-xl border border-blue-500/30 overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-blue-500/10 border-b border-blue-500/20">
                        <div className="flex items-center gap-3">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(59,130,246)" strokeWidth="2" strokeLinecap="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
                            </svg>
                            <span className="font-bold text-sm text-white">All Tasks</span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400">
                                {filteredDisplay.length}
                            </span>
                        </div>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto scrollbar-thin scrollbar-thumb-blue-500/30 scrollbar-track-transparent">
                        {filteredDisplay.map((task, i) => (
                            <div
                                key={task.id}
                                className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-blue-500/5 ${i < filteredDisplay.length - 1 ? 'border-b border-white/5' : ''
                                    }`}
                            >
                                <div className="flex flex-col items-center min-w-[44px]">
                                    <span className="font-black text-sm text-blue-500">#{task.id}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-cyan-400 font-mono">
                                        {task.targetEndpoint}()
                                    </div>
                                    <div className="text-xs text-white/50 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                        <span title={task.targetContract}>{shortenAddress(task.targetContract)}</span>
                                        <span title={task.owner}>Owner: {shortenAddress(task.owner)}</span>
                                        {task.deposit !== '0' && (
                                            <span className="text-cyan-400 font-medium">{formatEgld(task.deposit, 4)} EGLD</span>
                                        )}
                                        {task.triggerTime > 0 && (
                                            <span className="text-white/60">
                                                {new Date(task.triggerTime * 1000).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${task.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                                        task.status === 'Failed' ? 'bg-red-500/20 text-red-400' :
                                            task.status === 'Pending' ? 'bg-amber-500/20 text-amber-400' :
                                                task.status === 'Executing' || task.status === 'Committed' ? 'bg-cyan-500/20 text-cyan-400' :
                                                    'bg-white/10 text-white/60'
                                        }`}>
                                        {task.status}
                                    </span>
                                    <a
                                        href={`${NETWORK.explorerUrl}/accounts/${task.targetContract}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors p-1"
                                    >
                                        →
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
