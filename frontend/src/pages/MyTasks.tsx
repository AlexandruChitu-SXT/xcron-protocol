import { devError, devWarn } from '../utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { useContractQuery, bufferToNumber, shortenAddress } from '../hooks/useContractQuery';
import { CONTRACTS, GAS_CANCEL_TASK } from '../config';
import { TypewriterTitle } from '../components/TypewriterTitle';

interface TaskInfo {
    id: number;
    owner: string;
    targetContract: string;
    targetEndpoint: string;
    status: string;
    triggerTime: number;
    isOwner: boolean;
    postTaskId?: number | null;
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

export function MyTasks() {
    const { wallet, signAndSendTransaction, addToast } = useWallet();
    const { query } = useContractQuery();
    const [tasks, setTasks] = useState<TaskInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState<number | null>(null);

    useEffect(() => {
        loadTasks();
        const intervalId = setInterval(() => loadTasks(true), 15000);
        return () => clearInterval(intervalId);
    }, [wallet.connected]);

    async function loadTasks(silent = false) {
        if (!silent) setLoading(true);
        try {
            if (wallet.connected && !wallet.isDemo) {
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
                        devError(`Task ${taskId} failed to decode`, err);
                    }
                }
                setTasks(taskList.sort((a, b) => a.id - b.id));
            }
        } catch (err) {
            devWarn('Failed to load tasks:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    function parseTaskData(id: number, data: Buffer): TaskInfo {
        let offset = 8;

        const ownerBytes = data.subarray(offset, offset + 32);
        let owner = '';
        try { owner = Address.newFromHex(ownerBytes.toString('hex')).toBech32(); } catch { owner = ownerBytes.toString('hex'); }
        offset += 32;

        const targetContractBytes = data.subarray(offset, offset + 32);
        let targetContract = '';
        try { targetContract = Address.newFromHex(targetContractBytes.toString('hex')).toBech32(); } catch { targetContract = targetContractBytes.toString('hex'); }
        offset += 32;

        const endpointLen = data.readUInt32BE(offset); offset += 4;
        const targetEndpoint = data.subarray(offset, offset + endpointLen).toString('utf-8');
        offset += endpointLen;

        const argsCount = data.readUInt32BE(offset); offset += 4;
        for (let j = 0; j < argsCount; j++) {
            const argLen = data.readUInt32BE(offset); offset += 4 + argLen;
        }

        const triggerVariant = data[offset]; offset += 1;
        let triggerTime = 0;
        if (triggerVariant === 0) {
            triggerTime = Number(data.readBigUInt64BE(offset)); offset += 8;
        } else if (triggerVariant === 1) {
            triggerTime = Number(data.readBigUInt64BE(offset)); offset += 24;
        } else if (triggerVariant === 2) {
            offset += 32;
            const qEndLen = data.readUInt32BE(offset); offset += 4 + qEndLen;
            const qArgsCount = data.readUInt32BE(offset); offset += 4;
            for (let j = 0; j < qArgsCount; j++) {
                const al = data.readUInt32BE(offset); offset += 4 + al;
            }
            offset += 1;
            const threshLen = data.readUInt32BE(offset); offset += 4 + threshLen;
        }

        offset += 8;
        const depositLen = data.readUInt32BE(offset); offset += 4 + depositLen;
        offset += 1;
        offset += 1;
        offset += 8;
        offset += 8;

        const statusByte = offset < data.length ? data[offset] : 0; offset += 1;
        const status = STATUS_MAP[statusByte] || 'Unknown';

        if (offset < data.length) {
            const hasKeeper = data[offset] === 1; offset += 1;
            if (hasKeeper) offset += 32;
        }

        offset += 8;

        let post_task_id = null;
        if (offset < data.length) {
            const hasPostTask = data[offset] === 1; offset += 1;
            if (hasPostTask && offset + 8 <= data.length) {
                post_task_id = Number(data.readBigUInt64BE(offset));
                offset += 8;
            }
        }

        const isOwner = wallet.connected && owner.toLowerCase() === wallet.address.toLowerCase();
        return { id, owner, targetContract, targetEndpoint, status, triggerTime, isOwner, postTaskId: post_task_id };
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
                setTimeout(() => loadTasks(), 6000);
            }
        } catch (err: any) {
            addToast(`Failed to cancel: ${err.message}`, 'error');
        } finally {
            setCancelling(null);
        }
    };

    const statusColor = (status: string) => {
        if (status === 'Completed') return { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.4)', text: 'rgb(34,197,94)' };
        if (status === 'Failed') return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)', text: 'rgb(239,68,68)' };
        if (status === 'Cancelled' || status === 'Expired') return { bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.4)', text: 'rgb(156,163,175)' };
        return { bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.4)', text: 'rgb(251,191,36)' };
    };

    if (!wallet.connected) {
        return (
            <div className="page" style={{ textAlign: 'center' }}>
                <TypewriterTitle as="h1" text="My Tasks" speed={70} />
                <p style={{ marginTop: 20, color: 'var(--text-muted)' }}>Connect wallet to view your automation tasks.</p>
            </div>
        );
    }

    return (
        <div className="page">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
                <div>
                    <TypewriterTitle as="h1" text="My Tasks" speed={70} />
                    <TypewriterTitle as="p" text="Task Chaining & Intents Network Map" speed={30} />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadTasks()} disabled={loading}>
                        {loading ? 'Syncing...' : '↻ Sync Data'}
                    </button>
                </div>
            </div>

            {/* Task Grid */}
            {loading && tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                    Loading tasks...
                </div>
            ) : tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>No tasks found</p>
                    <p style={{ fontSize: '0.85rem' }}>Schedule your first automation task to see it here.</p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 24,
                    maxWidth: 1200,
                    margin: '0 auto',
                }}>
                    {tasks.map(task => {
                        const colors = statusColor(task.status);
                        return (
                            <div key={task.id} style={{
                                padding: 24,
                                background: 'rgba(10, 15, 25, 0.75)',
                                backdropFilter: 'blur(12px)',
                                border: `1px solid ${colors.border}`,
                                borderRadius: 16,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                color: '#fff',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 14,
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                            }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.4)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
                                }}
                            >
                                {/* Card Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                                        Task #{task.id}
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem', padding: '3px 10px', borderRadius: 12, fontWeight: 700,
                                        background: colors.bg, color: colors.text,
                                    }}>
                                        {task.status}
                                    </span>
                                </div>

                                {/* Endpoint */}
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#fff' }}>
                                        {task.targetEndpoint}()
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                        Target: <span style={{ color: 'var(--accent-light)' }}>{shortenAddress(task.targetContract)}</span>
                                    </div>
                                </div>

                                {/* Trigger Time */}
                                {task.triggerTime > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        ⏰ {new Date(task.triggerTime * 1000).toLocaleString()}
                                    </div>
                                )}

                                {/* Chain indicator */}
                                {task.postTaskId && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        🔗 Chains to Task #{task.postTaskId}
                                    </div>
                                )}

                                {/* Cancel */}
                                {task.status === 'Pending' && (
                                    <button
                                        onClick={() => handleCancel(task.id)}
                                        disabled={cancelling === task.id}
                                        style={{
                                            marginTop: 4, padding: '8px 14px', borderRadius: 10,
                                            border: '1px solid rgba(239,68,68,0.3)',
                                            background: 'rgba(239,68,68,0.08)', color: '#fff',
                                            fontSize: '0.78rem', cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                    >
                                        {cancelling === task.id ? 'Cancelling...' : '✕ Cancel Task'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
