import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { useContractQuery, bufferToNumber, shortenAddress } from '../hooks/useContractQuery';
import { CONTRACTS, GAS_CANCEL_TASK, NETWORK } from '../config';

interface TaskInfo {
    id: number;
    owner: string;
    targetContract: string;
    targetEndpoint: string;
    status: string;
    triggerRound: number;
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
    }, [wallet.connected]);

    async function loadTasks() {
        setLoading(true);
        try {
            const nonceRes = await query(CONTRACTS.scheduler, 'getTaskNonce');
            const totalTasks = nonceRes.length > 0 ? bufferToNumber(nonceRes[0]) : 0;

            const taskList: TaskInfo[] = [];
            for (let i = 1; i <= totalTasks; i++) {
                try {
                    const res = await query(CONTRACTS.scheduler, 'getTask', [
                        i.toString(16).padStart(2, '0'),
                    ]);
                    console.log(`Task ${i}: got ${res.length} buffers, size: ${res[0]?.length || 0}`);
                    if (res.length > 0) {
                        const data = res[0];
                        const task = parseTaskData(i, data);
                        taskList.push(task);
                    }
                } catch (err) {
                    console.error(`Task ${i} failed to decode:`, err);
                }
            }

            setTasks(taskList);
        } catch (err) {
            console.error('Failed to load tasks:', err);
        } finally {
            setLoading(false);
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
        let triggerRound = 0;
        if (triggerVariant === 0) {
            // TimeOnce { target_round: u64 }
            triggerRound = Number(data.readBigUInt64BE(offset));
            offset += 8;
        } else if (triggerVariant === 1) {
            // TimeRecurring { start_round: u64, interval: u64, remaining_execs: u64 }
            triggerRound = Number(data.readBigUInt64BE(offset));
            offset += 24; // 3 x u64
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

        // 13. status: TaskStatus (1 byte enum)
        const statusByte = data[offset] ?? 0;
        const status = STATUS_MAP[statusByte] || 'Unknown';

        const isOwner = wallet.connected && owner.toLowerCase() === wallet.address.toLowerCase();

        return { id, owner, targetContract, targetEndpoint, status, triggerRound, isOwner };
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
                `${NETWORK.apiUrl}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&status=success,fail&size=20&order=desc`
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
            console.warn('Failed to load execution history:', err);
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
                        <h1>My Tasks</h1>
                        <p>View and manage your scheduled tasks</p>
                    </div>
                    <div className="empty-state">
                        <div className="empty-icon">—</div>
                        <p>Connect your wallet to view your tasks</p>
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
                <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h1>My Tasks</h1>
                        <p>View and manage your scheduled tasks</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className={`btn ${filter === 'mine' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setFilter('mine')}
                        >
                            My Tasks
                        </button>
                        <button
                            className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setFilter('all')}
                        >
                            All Tasks
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={loadTasks} disabled={loading}>
                            {loading ? <span className="loading-spinner" /> : '↻'}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="empty-state">
                        <span className="loading-spinner" style={{ width: 32, height: 32 }} />
                        <p style={{ marginTop: 16 }}>Loading tasks from blockchain...</p>
                    </div>
                ) : filteredTasks.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">—</div>
                        <p>{filter === 'mine' ? 'You have no tasks yet' : 'No tasks found'}</p>
                        {filter === 'mine' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setFilter('all')}>
                                View All Tasks →
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="task-list">
                        {filteredTasks.map((task) => (
                            <div key={task.id} className="task-card" style={{ position: 'relative' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <span className="task-id"># {task.id}</span>
                                    {task.isOwner && (
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                            Owner
                                        </span>
                                    )}
                                </div>
                                <div className="task-info">
                                    <div className="task-target">
                                        <span style={{ fontFamily: 'monospace', color: 'var(--accent-light)' }}>
                                            {task.targetEndpoint}()
                                        </span>
                                    </div>
                                    <div className="task-detail" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                                        <span title={task.targetContract} style={{ cursor: 'help' }}>
                                            Target: {shortenAddress(task.targetContract)}
                                        </span>
                                        {!task.isOwner && (
                                            <span title={task.owner} style={{ cursor: 'help' }}>
                                                Owner: {shortenAddress(task.owner)}
                                            </span>
                                        )}
                                        {task.triggerRound > 0 && (
                                            <span style={{ color: 'var(--text-primary)' }}>
                                                Round {task.triggerRound.toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span className={`badge ${STATUS_CLASS[task.status] || ''}`}>
                                        {task.status}
                                    </span>
                                    {task.isOwner && (task.status === 'Pending' || task.status === 'Committed') && (
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleCancel(task.id)}
                                            disabled={cancelling === task.id}
                                        >
                                            {cancelling === task.id ? <span className="loading-spinner" /> : 'Cancel'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Execution History */}
                {execHistory.length > 0 && (
                    <div style={{ marginTop: 40 }}>
                        <div className="section-title" style={{ marginBottom: 16 }}>
                            Execution History
                        </div>
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {execHistory.map((log, i) => (
                                <div
                                    key={log.txHash}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '14px 20px',
                                        borderBottom: i < execHistory.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                        background: log.status === 'success' ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)',
                                    }}
                                >
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        background: log.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                    }}>
                                        {log.status === 'success' ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(239,68,68)" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                            Task {log.taskId}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                                            <span>Keeper: {shortenAddress(log.sender)}</span>
                                            <span>{timeAgo(log.timestamp)}</span>
                                        </div>
                                    </div>
                                    <a
                                        href={`${NETWORK.explorerUrl}/transactions/${log.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--accent-light)', fontSize: '0.8rem', textDecoration: 'none', flexShrink: 0 }}
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
