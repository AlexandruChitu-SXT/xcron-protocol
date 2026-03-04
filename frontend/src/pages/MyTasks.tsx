import { devError, devWarn } from '../utils/devLog';
import { useEffect, useState, useRef } from 'react';
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

    // Canvas panning/zooming state
    const canvasRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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
                setTasks(taskList.sort((a, b) => a.id - b.id)); // Ascending for layout
            }
        } catch (err) {
            devWarn('Failed to load tasks:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    // Simplified robust parser
    function parseTaskData(id: number, data: Buffer): TaskInfo {
        let offset = 8; // skip id

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

        offset += 8; // gas
        const depositLen = data.readUInt32BE(offset); offset += 4 + depositLen;
        offset += 1; // max_retries
        offset += 1; // retry_count
        offset += 8; // ttl
        offset += 8; // created_at

        const statusByte = offset < data.length ? data[offset] : 0; offset += 1;
        const status = STATUS_MAP[statusByte] || 'Unknown';

        // Read Option<Address> assigned_keeper
        if (offset < data.length) {
            const hasKeeper = data[offset] === 1; offset += 1;
            if (hasKeeper) offset += 32;
        }

        offset += 8; // completed_at

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

    // Canvas Interaction Handlers
    const handleWheel = (e: React.WheelEvent) => {
        // Zoom in/out instead of panning
        e.preventDefault();
        const zoomSensitivity = 0.002;
        setTransform(prev => ({
            ...prev,
            scale: Math.min(Math.max(0.2, prev.scale - e.deltaY * zoomSensitivity), 4)
        }));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setTransform(prev => ({
            ...prev,
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        }));
    };

    const handleMouseUp = () => setIsDragging(false);

    // Compute layout for Node Graph
    const nodes = tasks.map((t, index) => {
        // Grid layout instead of infinite vertical line
        const columns = window.innerWidth > 1000 ? 3 : window.innerWidth > 700 ? 2 : 1;
        const col = index % columns;
        const row = Math.floor(index / columns);

        let x = 40 + col * 320;
        let y = 40 + row * 180;

        // If this task is a dependency (has a postTaskId), or is a child
        const parent = tasks.find(pt => pt.postTaskId === t.id);
        if (parent) {
            // It's a chained task, place it slightly offset from parent
            const parentIndex = tasks.findIndex(pt => pt.id === parent.id);
            const pCol = parentIndex % columns;
            const pRow = Math.floor(parentIndex / columns);
            x = 40 + pCol * 320 + 60;
            y = 40 + pRow * 180 + 100;
        }

        return { ...t, x, y };
    });

    if (!wallet.connected) {
        return (
            <div className="page" style={{ padding: '80px 20px', textAlign: 'center' }}>
                <TypewriterTitle as="h1" text="Visual Canvas" speed={70} />
                <p style={{ marginTop: 20 }}>Connect wallet to view your automation graph.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingTop: '80px' }}>
            {/* Header Overlay */}
            <div style={{ padding: '20px 40px', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', background: 'linear-gradient(to bottom, rgba(3,7,18,0.9) 0%, transparent 100%)', pointerEvents: 'none', flexShrink: 0 }}>
                <div style={{ pointerEvents: 'auto' }}>
                    <TypewriterTitle as="h1" text="Visual Canvas" speed={70} />
                    <TypewriterTitle as="p" text="Task Chaining & Intents Network Map" speed={30} />
                </div>
                <div style={{ display: 'flex', gap: 12, pointerEvents: 'auto' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadTasks()} disabled={loading}>
                        {loading ? 'Syncing...' : '↻ Sync Data'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}>
                        Recenter View
                    </button>
                </div>
            </div>

            {/* The Graph Canvas - Full transparent to show app starry background */}
            <div
                ref={canvasRef}
                style={{
                    flex: 1,
                    position: 'relative',
                    background: 'transparent',
                    overflow: 'hidden',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    minHeight: '500px', // Fallback for small screens
                    backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.05) 0%, transparent 60%), linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
                    backgroundSize: '100% 100%, 40px 40px, 40px 40px',
                    backgroundPosition: `${transform.x}px ${transform.y}px`,
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, width: '100%', height: '100%',
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}>
                    {/* SVG Layer for connection lines */}
                    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                        {nodes.map(node => {
                            if (node.postTaskId) {
                                const targetNode = nodes.find(n => n.id === node.postTaskId);
                                if (targetNode) {
                                    return (
                                        <g key={`edge-${node.id}-${targetNode.id}`}>
                                            <path
                                                d={`M ${node.x + 280} ${node.y + 60} C ${node.x + 330} ${node.y + 60}, ${targetNode.x - 50} ${targetNode.y + 60}, ${targetNode.x} ${targetNode.y + 60}`}
                                                fill="none"
                                                stroke="rgba(6, 182, 212, 0.5)"
                                                strokeWidth="2"
                                                strokeDasharray="4 4"
                                            />
                                            <circle cx={targetNode.x - 2} cy={targetNode.y + 60} r="4" fill="rgba(6, 182, 212, 0.8)" />
                                        </g>
                                    );
                                }
                            }
                            return null;
                        })}
                    </svg>

                    {/* HTML Layer for Nodes */}
                    {nodes.map(node => (
                        <div key={node.id} style={{
                            position: 'absolute',
                            left: node.x,
                            top: node.y,
                            width: 280,
                            padding: 20,
                            background: 'rgba(10, 15, 25, 0.85)',
                            backdropFilter: 'blur(10px)',
                            border: `1px solid ${node.status === 'Completed' ? 'rgba(34,197,94,0.4)' : node.status === 'Failed' ? 'rgba(239,68,68,0.4)' : 'rgba(6,182,212,0.3)'}`,
                            borderRadius: 16,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            color: '#fff',
                            display: 'flex', flexDirection: 'column', gap: 12
                        }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                                    Task #{node.id}
                                </span>
                                <span style={{
                                    fontSize: '0.65rem', padding: '2px 8px', borderRadius: 12, fontWeight: 700,
                                    background: node.status === 'Completed' ? 'rgba(34,197,94,0.1)' : node.status === 'Failed' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
                                    color: node.status === 'Completed' ? 'rgb(34,197,94)' : node.status === 'Failed' ? 'rgb(239,68,68)' : 'rgb(251,191,36)',
                                }}>
                                    {node.status}
                                </span>
                            </div>

                            {/* Content */}
                            <div>
                                <div style={{ fontWeight: 500, fontSize: '1.1rem', color: '#fff' }}>{node.targetEndpoint}()</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                    Target: <span style={{ color: 'var(--accent-light)' }}>{shortenAddress(node.targetContract)}</span>
                                </div>
                            </div>

                            {node.status === 'Pending' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleCancel(node.id); }}
                                    disabled={cancelling === node.id}
                                    style={{
                                        marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                                        background: 'rgba(239,68,68,0.1)', color: '#fff', fontSize: '0.75rem', cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                >
                                    {cancelling === node.id ? 'Cancelling...' : 'Cancel Task'}
                                </button>
                            )}

                            {/* Connection Points */}
                            <div style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, background: 'rgba(6, 182, 212, 0.8)', borderRadius: '50%', border: '2px solid rgba(10,15,25,1)', boxShadow: '0 0 10px rgba(6,182,212,0.5)' }} />
                            <div style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, background: 'rgba(6, 182, 212, 0.2)', borderRadius: '50%', border: '2px solid rgba(10,15,25,1)', boxShadow: 'inset 0 0 4px rgba(6,182,212,0.5)' }} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
