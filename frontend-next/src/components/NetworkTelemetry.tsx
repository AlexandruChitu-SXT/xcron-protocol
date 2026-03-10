"use client";

import { useEffect, useState } from 'react';
import { NETWORK } from '@/config';

interface KeeperNode {
    id: string;
    address: string;
    status: 'online' | 'syncing' | 'offline';
    shard: number;
    version: string;
    uptime: string;
    latency: number; // ms
}

export function NetworkTelemetry({ activeKeepers }: { activeKeepers: number }) {
    const [nodes, setNodes] = useState<KeeperNode[]>([]);

    // Simulate real-time node telemetry for the UI
    useEffect(() => {
        // Generate mock data based on active keepers (or minimum 3 for visual effect)
        const generateNodes = () => {
            const count = Math.max(activeKeepers, 4); // Show at least a few nodes if network empty
            const newNodes: KeeperNode[] = [];
            for (let i = 0; i < count; i++) {
                const isOnline = Math.random() > 0.1;
                newNodes.push({
                    id: `node-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
                    address: `erd1${Math.random().toString(36).substring(2, 10)}...${Math.random().toString(36).substring(2, 6)}`,
                    status: isOnline ? 'online' : (Math.random() > 0.5 ? 'syncing' : 'offline'),
                    shard: Math.floor(Math.random() * 3), // Shard 0, 1, 2
                    version: 'v1.4.2',
                    uptime: `${Math.floor(Math.random() * 99) + 1}.${Math.floor(Math.random() * 9)}%`,
                    latency: Math.floor(Math.random() * 150) + 10,
                });
            }
            setNodes(newNodes);
        };

        generateNodes();
        const interval = setInterval(() => {
            // Randomly update latency and status slightly
            setNodes(prev => prev.map(n => ({
                ...n,
                latency: Math.max(5, n.latency + (Math.floor(Math.random() * 21) - 10)),
                status: Math.random() > 0.98 ? (n.status === 'online' ? 'syncing' : 'online') : n.status
            })));
        }, 3000);

        return () => clearInterval(interval);
    }, [activeKeepers]);

    return (
        <div className="w-full flex-col font-mono text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse" />
                    <span className="text-cyan-400 font-bold uppercase tracking-widest text-[10px]">Keeper Network Topology</span>
                </div>
                <div className="flex gap-4 text-white/50 text-[10px]">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /> Online</div>
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Syncing</div>
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /> Offline</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {nodes.map((node, i) => {
                    const isOnline = node.status === 'online';
                    const isSyncing = node.status === 'syncing';

                    const statusColor = isOnline ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' :
                        isSyncing ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.6)]' :
                            'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]';

                    const textColor = isOnline ? 'text-green-400' :
                        isSyncing ? 'text-yellow-400' : 'text-red-400';

                    return (
                        <div key={i} className="bg-[#080808] border border-white/5 p-4 rounded-[16px] flex flex-col gap-3 relative overflow-hidden group shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_8px_20px_rgba(0,0,0,0.8)] transition-all hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_10px_30px_rgba(0,0,0,0.9)] hover:border-white/10">

                            {/* Inner subtle glow based on status at the top edge */}
                            <div className={`absolute top-0 left-0 right-0 h-[2px] opacity-40 ${isOnline ? 'bg-gradient-to-r from-transparent via-green-500 to-transparent' : isSyncing ? 'bg-gradient-to-r from-transparent via-yellow-500 to-transparent' : 'bg-gradient-to-r from-transparent via-red-500 to-transparent'}`} />

                            {/* Scanning line animation overlay purely for telemetry aesthetic */}
                            <div className="absolute top-0 left-0 w-full h-[1px] bg-white/10 -translate-y-full group-hover:animate-[scan_2s_linear_infinite]" />

                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                                    <span className="text-[#ececec] font-bold tracking-wide">{node.id}</span>
                                </div>
                                <span className="text-[#555] text-[10px] bg-[#111] px-2 py-0.5 rounded-md border border-white/5 shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]">{node.version}</span>
                            </div>

                            <div className="text-[11px] text-[#888] font-mono border-b border-white/5 pb-3">
                                {node.address}
                            </div>

                            <div className="grid grid-cols-2 gap-x-3 gap-y-3 mt-1">
                                <div className="flex flex-col">
                                    <span className="text-[#555] text-[9px] uppercase tracking-widest font-bold mb-0.5">Shard</span>
                                    <span className="text-[#ddd] text-sm font-medium">{node.shard}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[#555] text-[9px] uppercase tracking-widest font-bold mb-0.5">Latency</span>
                                    <span className={`text-sm font-medium ${node.latency < 50 ? 'text-green-400' : node.latency < 100 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                        {node.latency}ms
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[#555] text-[9px] uppercase tracking-widest font-bold mb-0.5">Status</span>
                                    <span className={`capitalize text-sm font-medium ${textColor}`}>{node.status}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[#555] text-[9px] uppercase tracking-widest font-bold mb-0.5">Uptime</span>
                                    <span className="text-[#ddd] text-sm font-medium">{node.uptime}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <style jsx>{`
                @keyframes scan {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100px); }
                }
            `}</style>
        </div>
    );
}
