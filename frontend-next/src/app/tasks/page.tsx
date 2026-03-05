"use client";

import { devError, devWarn } from '@/utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '@/hooks/useWallet';
import { useContractQuery, bufferToNumber, shortenAddress } from '@/hooks/useContractQuery';
import { CONTRACTS, GAS_CANCEL_TASK } from '@/config';
import { TypewriterTitle } from '@/components/TypewriterTitle';

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

export default function MyTasks() {
    const { wallet, signAndSendTransaction, addToast, setShowConnectModal } = useWallet();
    const { query } = useContractQuery();
    const [tasks, setTasks] = useState<TaskInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState<number | null>(null);

    useEffect(() => {
        loadTasks();
        const intervalId = setInterval(() => loadTasks(true), 15000);
        return () => clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                setTasks(taskList.sort((a, b) => b.id - a.id));
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
        offset += 1; // max_retries
        offset += 1; // retry_count
        offset += 8; // ttl_rounds
        offset += 8; // created_round

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

    const getStatusStyle = (status: string) => {
        if (status === 'Completed') return 'bg-green-500/10 border-green-500/30 text-green-400';
        if (status === 'Failed') return 'bg-red-500/10 border-red-500/30 text-red-500';
        if (status === 'Pending') return 'bg-amber-500/10 border-amber-500/30 text-amber-500';
        if (status === 'Executing' || status === 'Committed') return 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400';
        return 'bg-gray-500/10 border-gray-500/30 text-gray-400'; // Cancelled, Expired
    };

    if (!wallet.connected) {
        return (
            <div className="w-full text-center py-20">
                <TypewriterTitle as="h1" text="My Tasks" speed={70} className="text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] relative z-10" />
                <p className="mt-5 text-white/50 mb-8">Connect wallet to view your automation tasks.</p>
                <button
                    className="btn btn-connect px-8 py-3.5 text-base"
                    onClick={() => setShowConnectModal(true)}
                >
                    Connect Wallet
                </button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[960px] mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
                <div>
                    <TypewriterTitle as="h1" text="My Tasks" speed={70} className="text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] relative z-10" />
                    <TypewriterTitle as="p" text="Task Chaining & Intents Network Map" speed={30} className="text-white/60" />
                </div>
                <div className="flex gap-3">
                    <button
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10 disabled:opacity-50 transition-colors"
                        onClick={() => loadTasks()}
                        disabled={loading}
                    >
                        {loading ? (
                            <><span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin align-middle mr-2" />Syncing...</>
                        ) : '↻ Sync Data'}
                    </button>
                </div>
            </div>

            {/* Summary Counters */}
            {tasks.length > 0 && (
                <div className="flex gap-3 mb-6 flex-wrap">
                    {[
                        { label: 'Total', count: tasks.length, color: 'white/60' },
                        { label: 'Pending', count: tasks.filter(t => t.status === 'Pending').length, color: 'amber-400' },
                        { label: 'Executing', count: tasks.filter(t => t.status === 'Executing' || t.status === 'Committed').length, color: 'cyan-400' },
                        { label: 'Completed', count: tasks.filter(t => t.status === 'Completed').length, color: 'green-400' },
                        { label: 'Failed', count: tasks.filter(t => t.status === 'Failed').length, color: 'red-400' },
                    ].filter(s => s.count > 0).map(s => (
                        <span key={s.label} className={`text-xs font-semibold px-3 py-1.5 rounded-full border border-${s.color}/20 bg-${s.color}/5 text-${s.color}`}>
                            {s.label}: {s.count}
                        </span>
                    ))}
                </div>
            )}

            {/* Task List */}
            {loading && tasks.length === 0 ? (
                <div className="text-center py-20 text-white/50">
                    <span className="inline-block w-8 h-8 border-2 border-white/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
                    <p>Loading your tasks...</p>
                </div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-20 text-white/50">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                    </div>
                    <p className="text-lg font-medium text-white mb-2">No tasks found</p>
                    <p className="text-sm">Schedule your first automation task to see it here.</p>
                </div>
            ) : (
                <div className="rounded-xl border border-cyan-500/20 overflow-hidden">
                    {/* List Header */}
                    <div className="flex items-center justify-between px-5 py-3 bg-cyan-500/5 border-b border-cyan-500/15">
                        <div className="flex items-center gap-3">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(6,182,212)" strokeWidth="2" strokeLinecap="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span className="font-bold text-sm text-white">Your Automations</span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400">
                                {tasks.length}
                            </span>
                        </div>
                        {/* Column labels */}
                        <div className="hidden md:flex items-center gap-6 text-[10px] text-white/30 uppercase tracking-widest font-semibold">
                            <span className="w-20 text-right">Status</span>
                            <span className="w-16 text-right">Action</span>
                        </div>
                    </div>

                    {/* Scrollable list */}
                    <div className="max-h-[340px] overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-transparent">
                        {tasks.map((task, i) => {
                            const statusClass = getStatusStyle(task.status);
                            return (
                                <div
                                    key={task.id}
                                    className={`flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-cyan-500/5 ${i < tasks.length - 1 ? 'border-b border-white/5' : ''}`}
                                >
                                    {/* Task ID */}
                                    <span className="text-[11px] font-bold text-white/30 tracking-wider uppercase w-14 shrink-0">
                                        #{task.id}
                                    </span>

                                    {/* Endpoint + Target */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-white font-mono truncate">
                                                {task.targetEndpoint}()
                                            </span>
                                            {task.postTaskId && (
                                                <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded font-medium shrink-0">
                                                    🔗 →#{task.postTaskId}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-white/40 truncate">
                                                → <span className="text-cyan-400/70" title={task.targetContract}>{shortenAddress(task.targetContract)}</span>
                                            </span>
                                            {task.triggerTime > 0 && (
                                                <span className="text-[10px] text-white/30 shrink-0">
                                                    • {new Date(task.triggerTime * 1000).toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border shrink-0 ${statusClass}`}>
                                        {task.status}
                                    </span>

                                    {/* Cancel Action */}
                                    <div className="w-16 shrink-0 flex justify-end">
                                        {task.status === 'Pending' ? (
                                            <button
                                                onClick={() => handleCancel(task.id)}
                                                disabled={cancelling === task.id}
                                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-40 cursor-pointer"
                                            >
                                                {cancelling === task.id ? '...' : '✕'}
                                            </button>
                                        ) : (
                                            <span className="w-7" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
