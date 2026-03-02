import { devError, devWarn } from '../utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { useContractQuery, bufferToNumber, shortenAddress } from '../hooks/useContractQuery';
import { CONTRACTS, GAS_CANCEL_TASK, NETWORK } from '../config';
import { TypewriterTitle } from '../components/TypewriterTitle';
import { AnimatedCounter } from '../components/AnimatedCounter';

interface TaskInfo {
    id: number;
    owner: string;
    targetContract: string;
    targetEndpoint: string;
    status: string;
    triggerTime: number;
    isOwner: boolean;
}

interface ExecutionLog {
    txHash: string;
    taskId: string;
    status: 'success' | 'fail';
    timestamp: number;
    sender: string;
}


const STATUS_MAP: Record<number, string> = {
    0: 'Pending',
    1: 'Committed',
    2: 'Executing',
    3: 'Completed',
    4: 'Failed',
    5: 'Cancelled',
    6: 'Expired',
};

const STATUS_CLASS: Record<string, string> = {
    Pending: 'badge-pending',
    Committed: 'badge-executing',
    Executing: 'badge-executing',
    Completed: 'badge-completed',
    Failed: 'badge-failed',
    Cancelled: 'badge-cancelled',
    Expired: 'badge-cancelled',
};

export function MyTasks() {
    const { wallet, setShowConnectModal, signAndSendTransaction, addToast } = useWallet();
    const { query } = useContractQuery();
    const [tasks, setTasks] = useState<TaskInfo[]>([]);
    const [execHistory, setExecHistory] = useState<ExecutionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'mine' | 'all'>('mine');
    const [cancelling, setCancelling] = useState<number | null>(null);

    useEffect(() => {
        loadTasks();
        loadExecHistory();

        const intervalId = setInterval(() => {
            loadTasks(true);
            loadExecHistory();
        }, 15000);

        return () => clearInterval(intervalId);
    }, [wallet.connected, filter]);

    async function loadTasks(silent = false) {
        if (!silent) setLoading(true);
        try {
            // Use getOwnerTasks for 'mine' filter (efficient) or iterate for 'all'
            if (filter === 'mine' && wallet.connected && !wallet.isDemo) {
                const addrHex = Address.newFromBech32(wallet.address).toHex();
                const ownerRes = await query(CONTRACTS.scheduler, 'getOwnerTasks', [addrHex]);
                const taskList: TaskInfo[] = [];
                for (const buf of ownerRes) {
                    if (buf.length === 0) continue;
                    const taskId = bufferToNumber(buf);
                    try {
                        const res = await query(CONTRACTS.scheduler, 'getTask', [
                            taskId.toString(16).padStart(2, '0'),
                        ]);
                        if (res.length > 0 && res[0].length > 0) {
                            taskList.push(parseTaskData(taskId, res[0]));
                        }
                    } catch (err) {
                        devError(`Task ${taskId} failed to decode:`, err);
                    }
                }
                setTasks(taskList.sort((a, b) => b.id - a.id));
            } else {
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
                        devError(`Task ${i} failed to decode:`, err);
                    }
                }
                setTasks(taskList.sort((a, b) => b.id - a.id));
            }
        } catch (err) {
            devError('Failed to load tasks:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    function parseTaskData(id: number, data: Buffer): TaskInfo {
        let offset = 0;

        // 1. id: u64 (8 bytes) — skip, we already have id from the loop
        offset += 8;

        // 2. owner: ManagedAddress (32 bytes)
        const ownerBytes = data.subarray(offset, offset + 32);
        let owner = '';
        try {
            owner = Address.newFromHex(ownerBytes.toString('hex')).toBech32();
        } catch {
            owner = ownerBytes.toString('hex');
        }
        offset += 32;

        // 3. target_contract: ManagedAddress (32 bytes)
        const targetContractBytes = data.subarray(offset, offset + 32);
        let targetContract = '';
        try {
            targetContract = Address.newFromHex(targetContractBytes.toString('hex')).toBech32();
        } catch {
            targetContract = targetContractBytes.toString('hex');
        }
        offset += 32;

        // 4. target_endpoint: ManagedBuffer (nested: 4-byte len + bytes)
        const endpointLen = data.readUInt32BE(offset);
        offset += 4;
        const targetEndpoint = data.subarray(offset, offset + endpointLen).toString('utf-8');
        offset += endpointLen;

        // 5. target_args: ManagedVec<ManagedBuffer> (nested: 4-byte count + items)
        const argsCount = data.readUInt32BE(offset);
        offset += 4;
        for (let j = 0; j < argsCount; j++) {
            const argLen = data.readUInt32BE(offset);
            offset += 4 + argLen;
        }

        // 6. trigger: Trigger enum (1 byte discriminant + variant fields)
        const triggerVariant = data[offset];
        offset += 1;
        let triggerTime = 0;
        if (triggerVariant === 0) {
            // TimeOnce { target_timestamp: u64 }
            triggerTime = Number(data.readBigUInt64BE(offset));
            offset += 8;
        } else if (triggerVariant === 1) {
            // TimeRecurring { start_timestamp: u64, interval: u64, remaining_execs: u64 }
            triggerTime = Number(data.readBigUInt64BE(offset));
            offset += 24; // 3 x u64
        } else if (triggerVariant === 2) {
            // ConditionOnChain — skip oracle fields
            const oracleAddrLen = 32;
            offset += oracleAddrLen;
            const queryEndpointLen = data.readUInt32BE(offset);
            offset += 4 + queryEndpointLen;
            const queryArgsCount = data.readUInt32BE(offset);
            offset += 4;
            for (let j = 0; j < queryArgsCount; j++) {
                const al = data.readUInt32BE(offset);
                offset += 4 + al;
            }
            offset += 1; // Comparator enum
            const thresholdLen = data.readUInt32BE(offset);
            offset += 4 + thresholdLen;
        }

        // 7. max_gas: u64
        offset += 8;

        // 8. deposit: BigUint (nested: 4-byte len + bytes)
        const depositLen = data.readUInt32BE(offset);
        offset += 4 + depositLen;

        // 9. max_retries: u8
        offset += 1;

        // 10. retry_count: u8
        offset += 1;

        // 11. ttl_rounds: u64
        offset += 8;

        // 12. created_round: u64
        offset += 8;

        // 13. status: TaskStatus (1 byte enum) — read at correct offset, NOT from last byte
        const statusByte = offset < data.length ? data[offset] : 0;
        offset += 1;
        const status = STATUS_MAP[statusByte] || 'Unknown';

        // 14. assigned_keeper: Option<ManagedAddress> — skip
        // 0x00 = None, 0x01 + 32 bytes = Some

        const isOwner = wallet.connected && owner.toLowerCase() === wallet.address.toLowerCase();

        return { id, owner, targetContract, targetEndpoint, status, triggerTime, isOwner };
    }

    const handleCancel = async (taskId: number) => {
        setCancelling(taskId);
        try {
            const taskIdHex = taskId.toString(16).padStart(16, '0');
            const result = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                value: '0',
                data: `cancelTask@${taskIdHex}`,
                gasLimit: GAS_CANCEL_TASK,
            });
            if (result && result !== 'pending-web-wallet') {
                addToast(`Task #${taskId} cancelled!`, 'success');
                // Refresh tasks after a delay
                setTimeout(() => loadTasks(), 6000);
            }
        } catch (err: any) {
            addToast(`Failed to cancel: ${err.message}`, 'error');
        } finally {
            setCancelling(null);
        }
    };

    async function loadExecHistory() {
        try {
            const res = await fetch(
                `${NETWORK.apiUrl}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&status=success&size=20&order=desc`
            );
            const txs = await res.json();
            if (Array.isArray(txs)) {
                const logs: ExecutionLog[] = txs.map((tx: any) => {
                    let taskId = '?';
                    if (tx.data) {
                        try {
                            const decoded = atob(tx.data);
                            const parts = decoded.split('@');
                            if (parts.length > 1) {
                                taskId = '#' + parseInt(parts[1], 16).toString();
                            }
                        } catch { /* keep ? */ }
                    }
                    return {
                        txHash: tx.txHash,
                        taskId,
                        status: tx.status === 'success' ? 'success' as const : 'fail' as const,
                        timestamp: tx.timestamp,
                        sender: tx.sender,
                    };
                });
                setExecHistory(logs);
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

    const filteredTasks = filter === 'mine'
        ? tasks.filter((t) => t.isOwner)
        : tasks;

    if (!wallet.connected) {
        return (
            <div className="page">
                <div className="app-container">
                    <div className="page-header">
                        <TypewriterTitle as="h1" text="My Tasks" speed={70} />
                        <TypewriterTitle as="p" text="View and manage your scheduled tasks" speed={30} />
                    </div>
                    <div className="empty-state" style={{ padding: '80px 20px' }}>
                        <div style={{
                            width: 80, height: 80, borderRadius: 20,
                            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px', animation: 'pulseGlow 2s ease-in-out infinite'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgb(139,92,246)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M3 9h18" /><path d="M9 21V9" />
                            </svg>
                        </div>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: 8 }}>Connect Your Wallet</h3>
                        <p style={{ maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.6 }}>Link your MultiversX wallet to view, manage, and track all your scheduled automations in real time.</p>
                        <button className="btn btn-connect" onClick={() => setShowConnectModal(true)}>
                            Connect Wallet
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="app-container">
                <div className="page-header">
                    <TypewriterTitle as="h1" text="My Tasks" speed={70} />
                    <TypewriterTitle as="p" text="View and manage your scheduled tasks" speed={30} />
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                    <button
                        className={`btn ${filter === 'mine' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setFilter('mine')}
                        style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: 20 }}
                    >
                        My Tasks
                    </button>
                    <button
                        className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setFilter('all')}
                        style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: 20 }}
                    >
                        All Tasks
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadTasks()} disabled={loading}
                        style={{ padding: '4px 12px', fontSize: '0.75rem', borderRadius: 20 }}
                    >
                        {loading ? <span className="loading-spinner" /> : '↻'}
                    </button>
                </div>

                {/* Stats summary — Dashboard style */}
                {!loading && filteredTasks.length > 0 && (() => {
                    const myActive = filteredTasks.filter(t => t.status === 'Pending' || t.status === 'Committed').length;
                    const myCompleted = filteredTasks.filter(t => t.status === 'Completed').length;
                    const myFailed = filteredTasks.filter(t => t.status === 'Failed').length;
                    return (
                        <div className="stats-grid" style={{ marginBottom: 16 }}>
                            <div className="stat-card" style={{ background: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.25)', boxShadow: '0 0 25px rgba(59,130,246,0.25)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" /></svg>
                                <div className="stat-label" style={{ color: 'rgb(59,130,246)' }}>Total</div>
                                <div className="stat-value"><AnimatedCounter value={filteredTasks.length} /></div>
                                <div className="stat-sub">Your tasks</div>
                            </div>
                            <div className="stat-card" style={{ background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.2)', boxShadow: '0 0 25px rgba(251,191,36,0.25)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                <div className="stat-label" style={{ color: 'rgb(251,191,36)' }}>Active</div>
                                <div className="stat-value"><AnimatedCounter value={myActive} /></div>
                                <div className="stat-sub">Awaiting execution</div>
                            </div>
                            <div className="stat-card" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)', boxShadow: '0 0 25px rgba(34,197,94,0.25)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><polyline points="20,6 9,17 4,12" /></svg>
                                <div className="stat-label" style={{ color: 'rgb(34,197,94)' }}>Completed</div>
                                <div className="stat-value"><AnimatedCounter value={myCompleted} /></div>
                                <div className="stat-sub">Successfully done</div>
                            </div>
                            <div className="stat-card" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', boxShadow: '0 0 25px rgba(239,68,68,0.15)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" style={{ position: 'absolute', top: 12, right: 12 }}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                <div className="stat-label" style={{ color: 'rgb(239,68,68)' }}>Failed</div>
                                <div className="stat-value"><AnimatedCounter value={myFailed} /></div>
                                <div className="stat-sub">Reverted</div>
                            </div>
                        </div>
                    );
                })()}

                {loading ? (
                    <div className="empty-state">
                        <span className="loading-spinner" style={{ width: 32, height: 32 }} />
                        <p style={{ marginTop: 16 }}>Loading tasks from blockchain...</p>
                    </div>
                ) : filteredTasks.length === 0 ? (
                    <div className="empty-state" style={{ padding: '80px 20px' }}>
                        <div style={{
                            width: 80, height: 80, borderRadius: 20,
                            background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px', animation: 'pulseGlow 2s ease-in-out infinite'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                        </div>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: 8 }}>
                            {filter === 'mine' ? 'No Tasks Yet' : 'No Tasks Found'}
                        </h3>
                        <p style={{ maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.6 }}>
                            {filter === 'mine'
                                ? 'Schedule your first on-chain automation — auto-compound, DCA, or any custom smart contract call.'
                                : 'No tasks are registered on the protocol yet. Be the first to schedule one!'}
                        </p>
                        {filter === 'mine' && (
                            <a href="/schedule" className="btn btn-primary">Schedule Your First Task →</a>
                        )}
                    </div>
                ) : (
                    /* ── Scheduled Tasks Widget ── */
                    <div className="card" style={{
                        padding: 0, overflow: 'hidden', marginBottom: 20,
                        border: '1px solid rgba(59,130,246,0.2)',
                        boxShadow: '0 0 20px rgba(59,130,246,0.08)',
                    }}>
                        {/* Widget Header */}
                        <div
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 20px',
                                background: 'rgba(59,130,246,0.06)',
                                borderBottom: '1px solid rgba(59,130,246,0.15)',
                                cursor: 'default',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(59,130,246)" strokeWidth="2" strokeLinecap="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
                                </svg>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                    Scheduled Tasks
                                </span>
                                <span style={{
                                    padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700,
                                    background: 'rgba(59,130,246,0.15)', color: 'rgb(59,130,246)',
                                }}>
                                    {filteredTasks.length}
                                </span>
                            </div>
                        </div>

                        {/* Scrollable task list — 5 items visible (~70px each = 350px max) */}
                        <div style={{
                            maxHeight: 350, overflowY: 'auto',
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'rgba(59,130,246,0.3) transparent',
                        }}>
                            {filteredTasks.map((task, i) => (
                                <div
                                    key={task.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '10px 20px',
                                        borderBottom: i < filteredTasks.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                        background: task.status === 'Pending' ? 'rgba(251,191,36,0.02)' :
                                            task.status === 'Completed' ? 'rgba(34,197,94,0.02)' :
                                                task.status === 'Failed' ? 'rgba(239,68,68,0.02)' : 'transparent',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59,130,246,0.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* Task ID */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
                                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'rgb(59,130,246)' }}>#{task.id}</span>
                                        {task.isOwner && (
                                            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Owner
                                            </span>
                                        )}
                                    </div>

                                    {/* Task Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-light)', fontFamily: 'monospace' }}>
                                            {task.targetEndpoint}()
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                                            <span title={task.targetContract}>{shortenAddress(task.targetContract)}</span>
                                            {task.triggerTime > 0 && (
                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                    {new Date(task.triggerTime * 1000).toLocaleString(undefined, {
                                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status + Cancel */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                        <span className={`badge ${STATUS_CLASS[task.status] || ''}`} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                                            {task.status}
                                        </span>
                                        {task.isOwner && (task.status === 'Pending' || task.status === 'Committed') && (
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleCancel(task.id)}
                                                disabled={cancelling === task.id}
                                                style={{ padding: '3px 8px', fontSize: '0.65rem' }}
                                            >
                                                {cancelling === task.id ? <span className="loading-spinner" /> : '✕'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Execution History Widget ── */}
                {execHistory.length > 0 && (
                    <div className="card" style={{
                        padding: 0, overflow: 'hidden',
                        border: '1px solid rgba(34,197,94,0.2)',
                        boxShadow: '0 0 20px rgba(34,197,94,0.08)',
                    }}>
                        {/* Widget Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 20px',
                            background: 'rgba(34,197,94,0.06)',
                            borderBottom: '1px solid rgba(34,197,94,0.15)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2" strokeLinecap="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                    Execution History
                                </span>
                                <span style={{
                                    padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700,
                                    background: 'rgba(34,197,94,0.15)', color: 'rgb(34,197,94)',
                                }}>
                                    {execHistory.length}
                                </span>
                            </div>
                        </div>

                        {/* Scrollable history — 5 items visible */}
                        <div style={{
                            maxHeight: 320, overflowY: 'auto',
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'rgba(34,197,94,0.3) transparent',
                        }}>
                            {execHistory.map((log, i) => (
                                <div
                                    key={log.txHash}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '10px 20px',
                                        borderBottom: i < execHistory.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                        background: log.status === 'success' ? 'rgba(34,197,94,0.02)' : 'rgba(239,68,68,0.02)',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34,197,94,0.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{
                                        width: 28, height: 28, borderRadius: 7, display: 'flex',
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
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
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
            </div>
        </div>
    );
}
