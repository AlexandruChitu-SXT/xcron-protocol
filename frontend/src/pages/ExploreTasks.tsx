import { devError, devWarn } from '../utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useContractQuery, bufferToNumber, formatEgld, shortenAddress } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '../config';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { TypewriterTitle } from '../components/TypewriterTitle';

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

const STATUS_MAP: Record<number, string> = {
    0: 'Pending', 1: 'Committed', 2: 'Executing',
    3: 'Completed', 4: 'Failed', 5: 'Cancelled', 6: 'Expired',
};

const STATUS_CLASS: Record<string, string> = {
    Pending: 'badge-pending', Committed: 'badge-executing', Executing: 'badge-executing',
    Completed: 'badge-completed', Failed: 'badge-failed', Cancelled: 'badge-cancelled', Expired: 'badge-cancelled',
};



export function ExploreTasks() {
    const { query } = useContractQuery();
    const [tasks, setTasks] = useState<TaskInfo[]>([]);
    const [execHistory, setExecHistory] = useState<ExecutionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [stats, setStats] = useState({ total: 0, active: 0, completed: 0, failed: 0 });

    useEffect(() => {
        loadAll();
        const interval = setInterval(() => loadAll(true), 30000);
        return () => clearInterval(interval);
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
            const nonceRes = await query(CONTRACTS.scheduler, 'getTaskNonce');
            const totalTasks = nonceRes.length > 0 ? bufferToNumber(nonceRes[0]) : 0;

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

            // Calculate stats
            const active = taskList.filter(t => t.status === 'Pending' || t.status === 'Committed').length;
            const completed = taskList.filter(t => t.status === 'Completed').length;
            const failed = taskList.filter(t => t.status === 'Failed').length;
            setStats({ total: taskList.length, active, completed, failed });
        } catch (err) {
            devError('Failed to load tasks:', err);
        }
    }

    function parseTaskData(id: number, data: Buffer): TaskInfo {
        let offset = 0;

        // 1. id: u64 (8 bytes)
        offset += 8;

        // 2. owner: ManagedAddress (32 bytes)
        const ownerBytes = data.subarray(offset, offset + 32);
        let owner = '';
        try { owner = Address.newFromHex(ownerBytes.toString('hex')).toBech32(); } catch { owner = ownerBytes.toString('hex'); }
        offset += 32;

        // 3. target_contract: ManagedAddress (32 bytes)
        const targetContractBytes = data.subarray(offset, offset + 32);
        let targetContract = '';
        try { targetContract = Address.newFromHex(targetContractBytes.toString('hex')).toBech32(); } catch { targetContract = targetContractBytes.toString('hex'); }
        offset += 32;

        // 4. target_endpoint: ManagedBuffer
        const endpointLen = data.readUInt32BE(offset);
        offset += 4;
        const targetEndpoint = data.subarray(offset, offset + endpointLen).toString('utf-8');
        offset += endpointLen;

        // 5. target_args
        const argsCount = data.readUInt32BE(offset);
        offset += 4;
        for (let j = 0; j < argsCount; j++) {
            const argLen = data.readUInt32BE(offset);
            offset += 4 + argLen;
        }

        // 6. trigger
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

        // 7. max_gas: u64
        offset += 8;

        // 8. deposit: BigUint
        const depositLen = data.readUInt32BE(offset);
        offset += 4;
        const depositBytes = data.subarray(offset, offset + depositLen);
        const deposit = depositLen > 0 ? BigInt('0x' + depositBytes.toString('hex')).toString() : '0';
        offset += depositLen;

        // 9. max_retries + retry_count
        offset += 2;

        // 10. ttl_rounds + created_round
        offset += 16;

        // 11. status
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
                setExecHistory(txs.map((tx: any) => {
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
        <div className="page">
            <div className="app-container">
                <div className="page-header" style={{ marginBottom: 8 }}>
                    <TypewriterTitle as="h1" text="Explore Tasks" speed={70} />
                    <TypewriterTitle as="p" text="Browse all tasks scheduled on XCron Protocol" speed={30} />
                </div>

                {/* Protocol overview stats — Dashboard style */}
                <div className="stats-grid" style={{ marginBottom: 16 }}>
                    <div className="stat-card" style={{ background: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.25)', boxShadow: '0 0 25px rgba(59,130,246,0.25)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" /><line x1="12" y1="2" x2="12" y2="22" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(59,130,246)' }}>Total Tasks</div>
                        <div className="stat-value"><AnimatedCounter value={displayStats.total} /></div>
                        <div className="stat-sub">Scheduled on-chain</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.2)', boxShadow: '0 0 25px rgba(251,191,36,0.25)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(251,191,36)' }}>Active</div>
                        <div className="stat-value"><AnimatedCounter value={displayStats.active} /></div>
                        <div className="stat-sub">Pending execution</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)', boxShadow: '0 0 25px rgba(34,197,94,0.25)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><polyline points="20,6 9,17 4,12" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(34,197,94)' }}>Completed</div>
                        <div className="stat-value"><AnimatedCounter value={displayStats.completed} /></div>
                        <div className="stat-sub">Successfully executed</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', boxShadow: '0 0 25px rgba(239,68,68,0.15)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        <div className="stat-label" style={{ color: 'rgb(239,68,68)' }}>Failed</div>
                        <div className="stat-value"><AnimatedCounter value={displayStats.failed} /></div>
                        <div className="stat-sub">Reverted on-chain</div>
                    </div>
                </div>

                {/* Execution History — shown above task list */}
                {displayHistory.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <TypewriterTitle text="Recent Executions" className="section-title" style={{ marginBottom: 12 }} />
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {displayHistory.map((log, i) => (
                                <div
                                    key={log.txHash}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 16px',
                                        borderBottom: i < displayHistory.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                        background: log.status === 'success' ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)',
                                    }}
                                >
                                    <div style={{
                                        width: 28, height: 28, borderRadius: 6, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        background: log.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                    }}>
                                        {log.status === 'success' ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(239,68,68)" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                            Task {log.taskId}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                                            <span>Keeper: {shortenAddress(log.sender)}</span>
                                            <span>{timeAgo(log.timestamp)}</span>
                                        </div>
                                    </div>
                                    <a
                                        href={`${NETWORK.explorerUrl}/transactions/${log.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--accent-light)', fontSize: '0.75rem', textDecoration: 'none', flexShrink: 0 }}
                                    >
                                        View Tx →
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Filters — pill style */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    {['all', 'pending', 'committed', 'completed', 'failed', 'cancelled'].map(f => (
                        <button
                            key={f}
                            className={`btn ${statusFilter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setStatusFilter(f)}
                            style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: 20 }}
                        >
                            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => loadAll()}
                        disabled={loading}
                        style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '0.75rem', borderRadius: 20 }}
                    >
                        {loading ? <span className="loading-spinner" /> : '↻ Refresh'}
                    </button>
                </div>

                {/* Task List */}
                {loading ? (
                    <div className="empty-state">
                        <span className="loading-spinner" style={{ width: 32, height: 32 }} />
                        <p style={{ marginTop: 16 }}>Loading tasks from blockchain...</p>
                    </div>
                ) : filteredDisplay.length === 0 ? (
                    <div className="empty-state" style={{ padding: '60px 20px' }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 16,
                            background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px', animation: 'pulseGlow 2s ease-in-out infinite'
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(59,130,246)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </div>
                        <p>No tasks found{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}</p>
                    </div>
                ) : (
                    <div className="task-list">
                        {filteredDisplay.map(task => (
                            <div key={task.id} className="task-card">
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <span className="task-id"># {task.id}</span>
                                </div>
                                <div className="task-info">
                                    <div className="task-target">
                                        <span style={{ fontFamily: 'monospace', color: 'var(--accent-light)' }}>
                                            {task.targetEndpoint}()
                                        </span>
                                    </div>
                                    <div className="task-detail" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                                        <span title={task.targetContract} style={{ cursor: 'help' }}>
                                            Target: {shortenAddress(task.targetContract)}
                                        </span>
                                        <span title={task.owner} style={{ cursor: 'help' }}>
                                            Owner: {shortenAddress(task.owner)}
                                        </span>
                                        {task.deposit !== '0' && (
                                            <span style={{ color: 'var(--accent-light)' }}>
                                                {formatEgld(task.deposit, 4)} EGLD
                                            </span>
                                        )}
                                        {task.triggerTime > 0 && (
                                            <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                {new Date(task.triggerTime * 1000).toLocaleString(undefined, {
                                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span className={`badge ${STATUS_CLASS[task.status] || ''}`}>
                                        {task.status}
                                    </span>
                                    <a
                                        href={`${NETWORK.explorerUrl}/accounts/${task.targetContract}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--accent-light)', fontSize: '0.75rem', textDecoration: 'none' }}
                                    >
                                        Explorer →
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}
