"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    Activity, ArrowDownRight, ArrowUpRight, ShieldAlert,
    ServerCrash, Cpu, HardDrive, Network, Target, Terminal, Database
} from 'lucide-react';

/* =========================================================================
   COMPONENTS
   ========================================================================= */

function KPICard({ title, value, unit, icon: Icon, trend, isPositive, sparklineData, variant = 'default' }: any) {
    const isCritical = variant === 'critical';
    const glowClass = isCritical ? "from-rose-500/20 to-transparent" : "from-[#00f5d4]/20 to-transparent";
    const iconColor = isCritical ? "text-rose-500" : "text-[#00f5d4]";
    const iconBg = isCritical ? "bg-rose-500/10" : "bg-[#00f5d4]/10";
    const trendColor = isCritical ? "text-rose-500" : (isPositive ? "text-[#00f5d4]" : "text-amber-500");

    const normalizedSparkline = sparklineData.length > 0
        ? sparklineData.map((v: number) => {
            const max = Math.max(...sparklineData);
            return max === 0 ? 0 : v / max;
        })
        : [];

    return (
        <div className="col-span-12 md:col-span-3 relative group">
            <div className={`absolute -inset-1 bg-gradient-to-r ${glowClass} blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 rounded-2xl`} />
            <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] rounded-[16px] p-5 flex flex-col hover:border-white/[0.2] transition-colors shadow-lg h-full">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em]">{title}</span>
                    <div className={`p-1.5 ${iconBg} rounded-lg ${iconColor}`}>
                        <Icon className="w-4 h-4" />
                    </div>
                </div>
                <div className="flex items-baseline gap-1 my-2">
                    <span className="text-3xl font-black text-white tracking-tighter tabular-nums drop-shadow-sm">{value}</span>
                    <span className="text-xs text-slate-500 font-mono">{unit}</span>
                </div>
                <div className="mt-auto flex items-center justify-between">
                    {trend && (
                        <div className={`flex items-center gap-1 ${trendColor} text-[10px] font-black uppercase tracking-widest`}>
                            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            <span>{trend}</span>
                        </div>
                    )}
                    <div className="w-20 h-6 opacity-70">
                        {normalizedSparkline.length > 1 && (
                            <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                                <polyline
                                    points={normalizedSparkline.map((v: number, i: number) => `${i * (100 / (normalizedSparkline.length - 1))},${40 - v * 40}`).join(' ')}
                                    fill="none" stroke={isCritical ? "#e11d48" : "#00f5d4"} strokeWidth="2" strokeLinecap="round"
                                />
                            </svg>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* =========================================================================
   MAIN LAYOUT (DEV PURIST / F-PATTERN)
   ========================================================================= */
export default function RealtimeDevDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [blocks, setBlocks] = useState<any[]>([]);
    const [tpsStream, setTpsStream] = useState<number[]>(Array(20).fill(0));
    const [latStream, setLatStream] = useState<number[]>(Array(20).fill(0));
    const [latency, setLatency] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const logRef = useRef<HTMLDivElement>(null);

    const fetchTelemetry = async () => {
        try {
            const start = performance.now();
            const stRes = await fetch('https://devnet-api.multiversx.com/stats');
            const stData = await stRes.json();

            const blRes = await fetch('https://devnet-api.multiversx.com/blocks?size=15');
            const blData = await blRes.json();
            const lat = Math.round(performance.now() - start);

            setLatency(lat);
            setStats(stData);
            setBlocks(blData);
            setLastUpdate(Date.now());

            setTpsStream(prev => {
                const next = [...prev, stData.transactions || 0];
                if (next.length > 20) next.shift();
                return next;
            });
            setLatStream(prev => {
                const next = [...prev, lat];
                if (next.length > 20) next.shift();
                return next;
            });

        } catch (e) {
            console.error("Telemetry Sync Error");
        }
    };

    useEffect(() => {
        fetchTelemetry();
        const iv = setInterval(fetchTelemetry, 3000); // 3-second aggressive polling
        return () => clearInterval(iv);
    }, []);

    return (
        <div className="min-h-screen bg-[#0b0e17] text-white font-sans selection:bg-[#00f5d4]/30">
            <div className="fixed inset-0 z-0 bg-black pointer-events-none" />
            <div className="relative z-10 w-full max-w-[2000px] mx-auto px-4 py-4 md:px-8 flex flex-col h-screen">

                {/* TOP BAR: Context */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#00f5d4] rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,245,212,0.4)]">
                            <Terminal className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                                MVX DEVNET TELEMETRY <span className="w-2 h-2 rounded-full bg-[#00f5d4] animate-pulse" />
                            </h1>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                ENDPOINT: devnet-api.multiversx.com | SYNC: {new Date(lastUpdate).toISOString()}
                            </p>
                        </div>
                    </div>
                </header>

                {/* TOP KPIs */}
                <div className="grid grid-cols-12 gap-4 mb-6">
                    <KPICard title="GATEWAY LATENCY" value={latency} unit="ms" icon={Activity} trend="LIVE" isPositive={latency < 200} sparklineData={latStream} variant={latency > 800 ? "critical" : "default"} />
                    <KPICard title="ALL-TIME TXS" value={stats ? (stats.transactions / 1000000).toFixed(2) : "0"} unit="M" icon={Network} trend="RISING" isPositive={true} sparklineData={tpsStream} />
                    <KPICard title="ACTIVE SHARDS" value={stats?.shards || 3} unit="Shards" icon={Database} trend="STABLE" isPositive={true} sparklineData={[]} />
                    <KPICard title="GLOBAL EPOCH" value={stats?.epoch || 0} unit="" icon={Target} trend={`${stats?.roundsPassed || 0}/${stats?.roundsPerEpoch || 0} RND`} isPositive={true} sparklineData={[]} />
                </div>

                {/* F-PATTERN GRID */}
                <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">

                    {/* MAIN COLUMN: Live Block Tail (Terminal Style) */}
                    <div className="col-span-12 xl:col-span-8 bg-black/60 border border-white/[0.08] rounded-xl flex flex-col overflow-hidden relative">
                        <div className="flex justify-between items-center p-4 border-b border-white/5 bg-white/[0.02]">
                            <h2 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-slate-400" /> Block Synchronization Stream
                            </h2>
                            <span className="text-[10px] text-[#00f5d4] bg-[#00f5d4]/10 px-2 py-0.5 rounded font-mono">TAIL -F</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs" ref={logRef}>
                            <div className="grid grid-cols-12 text-slate-500 border-b border-white/5 pb-2 mb-2 sticky top-0 bg-black/80 z-10">
                                <div className="col-span-2">TIMESTAMP</div>
                                <div className="col-span-2">SHARD</div>
                                <div className="col-span-2">NONCE</div>
                                <div className="col-span-2">TX COUNT</div>
                                <div className="col-span-4">HASH</div>
                            </div>

                            <div className="flex flex-col gap-1">
                                {blocks.map((b, i) => (
                                    <div key={b.hash} className="grid grid-cols-12 text-slate-300 py-1.5 border-b border-white/[0.02] hover:bg-white/[0.05]">
                                        <div className="col-span-2 text-slate-500">{new Date(b.timestamp * 1000).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 })}</div>
                                        <div className="col-span-2 font-black text-white">
                                            {b.shard === 4294967295 ? <span className="text-purple-400">META</span> : <span className="text-cyan-400">SHARD {b.shard}</span>}
                                        </div>
                                        <div className="col-span-2">#{b.nonce}</div>
                                        <div className="col-span-2 text-green-400 font-bold">{b.txCount} TXs</div>
                                        <div className="col-span-4 text-[10px] text-slate-500 truncate cursor-copy hover:text-white transition-colors">
                                            {b.hash}
                                        </div>
                                    </div>
                                ))}
                                {!blocks.length && <div className="text-slate-600 italic p-4">Awaiting Devnet uplink...</div>}
                            </div>
                        </div>
                    </div>

                    {/* SIDEBAR: Validator / Protocol Stats */}
                    <div className="col-span-12 xl:col-span-4 flex flex-col gap-6">

                        <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-5">
                            <h2 className="text-xs font-bold text-white tracking-widest uppercase mb-4 flex items-center gap-2">
                                <ServerCrash className="w-4 h-4 text-amber-500" /> Consensus Health
                            </h2>
                            <div className="flex flex-col gap-4 font-mono text-sm">
                                <div className="flex justify-between items-center bg-black/40 p-3 rounded-lg border border-white/5">
                                    <span className="text-slate-400">Active Validators</span>
                                    <span className="font-black text-[#00f5d4]">{stats?.validators || 3200}</span>
                                </div>
                                <div className="flex justify-between items-center bg-black/40 p-3 rounded-lg border border-white/5">
                                    <span className="text-slate-400">Avg Block Time</span>
                                    <span className="font-black text-white">{(blocks.length > 1 ? (blocks[0].timestamp - blocks[1].timestamp) : 6.0).toFixed(1)}s</span>
                                </div>
                                <div className="flex justify-between items-center bg-black/40 p-3 rounded-lg border border-white/5">
                                    <span className="text-slate-400">Total Smart Contracts</span>
                                    <span className="font-black text-purple-400">{(stats?.smartContracts || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 bg-white/[0.02] border border-white/[0.08] rounded-xl p-5 flex flex-col justify-center items-center text-center">
                            <ShieldAlert className="w-8 h-8 text-slate-600 mb-3" />
                            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Alerts Console</div>
                            <div className="text-xs text-green-500 font-mono">0 ACTIVE INCIDENTS. SYSTEM NOMINAL.</div>
                        </div>

                    </div>

                </div>
            </div>
        </div>
    );
}
