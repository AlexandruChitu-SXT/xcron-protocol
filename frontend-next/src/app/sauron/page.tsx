"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Server, Zap, Globe, Clock, Shield, Flame, Cpu, Eye, Database, Network, CheckCircle2 } from 'lucide-react';

const API = "https://devnet-api.multiversx.com";

/* =========================================================================
   UI COMPONENTS (Schedule Task Style)
   ========================================================================= */

// Premium Glass Card - Based on Schedule Task styling
function GlassCard({ children, title, icon: Icon, className = "", delay = 0 }: { children: React.ReactNode, title: string, icon: any, className?: string, delay?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
            className={`relative group ${className}`}
        >
            {/* Luz del widget Schedule Task (Magical Glow Behind) - Más intenso y amplio */}
            <div className="absolute -inset-3 bg-gradient-to-r from-cyan-500/50 via-purple-500/50 to-cyan-500/50 blur-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-700 -z-10 rounded-[35px] animate-[glowPulse_4s_infinite_alternate]" />

            {/* Container - Cristal Oscuro Premium */}
            <div className="bg-black/80 backdrop-blur-2xl border border-white/20 rounded-[30px] p-6 h-full flex flex-col transition-all duration-300 hover:border-white/40 hover:bg-black/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">

                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="bg-white/10 p-2.5 rounded-2xl text-cyan-400 shrink-0 border border-white/20 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                        <Icon className="w-6 h-6 drop-shadow-[0_0_8px_currentColor]" />
                    </div>
                    <h3 className="text-[15px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">{title}</h3>
                </div>

                {/* Content */}
                <div className="flex-1 w-full filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                    {children}
                </div>
            </div>
        </motion.div>
    );
}

// Mini Stat Display
function StatItem({ label, value, sub, color = "cyan" }: { label: string, value: string | number, sub?: string, color?: "cyan" | "purple" | "green" | "orange" }) {
    const colorMap = {
        cyan: "text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]",
        purple: "text-[#d8b4fe] drop-shadow-[0_0_12px_rgba(216,180,254,0.8)]",
        green: "text-green-400 drop-shadow-[0_0_12px_rgba(74,222,128,0.8)]",
        orange: "text-orange-400 drop-shadow-[0_0_12px_rgba(251,146,60,0.8)]",
    };

    return (
        <div className="flex flex-col">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-[0.2em] mb-1 drop-shadow-md">{label}</span>
            <span className={`text-[2rem] leading-none font-black tracking-tighter ${colorMap[color]} tabular-nums`}>{value}</span>
            {sub && <span className="text-[11px] font-medium text-white/40 mt-1.5">{sub}</span>}
        </div>
    );
}

// Sleek ECG Line
function SmoothSparkline({ data, colorHash }: { data: number[], colorHash: string }) {
    if (data.length < 2) return <div className="h-[40px]" />;
    const max = Math.max(...data, 1), min = Math.min(...data, 0), range = (max - min) || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${40 - ((v - min) / range) * 40}`).join(' ');
    return (
        <div className="relative h-[40px] w-full mt-2">
            <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 40" className="overflow-visible">
                <defs>
                    <linearGradient id={colorHash} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={`0,40 ${pts} 100,40`} fill={`url(#${colorHash})`} className="opacity-50" />
                <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_4px_currentColor]" />
            </svg>
        </div>
    );
}

/* =========================================================================
   MAIN DASHBOARD
   ========================================================================= */
export default function SauronDashboardPremium() {
    // Real Data States
    const [stats, setStats] = useState<any>(null);
    const [eco, setEco] = useState<any>(null);

    // Snipe Telemetry State
    const [burstStream, setBurstStream] = useState<number[]>(Array(50).fill(0));
    const [isBursting, setIsBursting] = useState(false);
    const [shards, setShards] = useState<any[]>([]);
    const [latency, setLatency] = useState<number>(0);
    const [avgBlockTime, setAvgBlockTime] = useState<number>(0);

    // Real-time Streams
    const [tpsStream, setTpsStream] = useState<number[]>(Array(20).fill(0));
    const [latStream, setLatStream] = useState<number[]>(Array(20).fill(0));
    const [tps, setTps] = useState(0);

    const prevBlocks = useRef(0);
    const isFetching = useRef(false);

    // Live Data Fetcher
    const fetchRealData = useCallback(async () => {
        if (isFetching.current) return;
        isFetching.current = true;

        try {
            const t0 = performance.now();

            const [resStats, resBlocks, resEco] = await Promise.all([
                fetch(`${API}/stats`).then(r => r.json()),
                fetch(`${API}/blocks?size=25&fields=shard,nonce,hash,txCount,timestamp`).then(r => r.json()),
                fetch(`${API}/economics`).then(r => r.json()).catch(() => null)
            ]);

            const t1 = performance.now();
            const currentLat = Math.round(t1 - t0);
            setLatency(currentLat);
            setLatStream(prev => [...prev.slice(1), currentLat]);

            if (resStats && resStats.blocks) {
                if (prevBlocks.current > 0) {
                    const delta = Math.max(0, resStats.blocks - prevBlocks.current);
                    const currentTps = delta > 0 ? (resBlocks[0]?.txCount || 0) * delta : 0; // rough estimation
                    setTps(currentTps);
                    setTpsStream(prev => [...prev.slice(1), currentTps]);
                }
                prevBlocks.current = resStats.blocks;
                setStats(resStats);
            }

            if (resEco) {
                setEco(resEco);
            }

            if (resBlocks && Array.isArray(resBlocks) && resBlocks.length > 0) {
                // Group by shard for display
                const sMap = new Map();
                let totalDiff = 0;
                let diffCount = 0;

                for (let i = 0; i < resBlocks.length - 1; i++) {
                    totalDiff += Math.abs(resBlocks[i].timestamp - resBlocks[i + 1].timestamp);
                    diffCount++;
                    if (!sMap.has(resBlocks[i].shard)) {
                        sMap.set(resBlocks[i].shard, resBlocks[i]);
                    }
                }

                if (diffCount > 0) {
                    setAvgBlockTime(Math.round((totalDiff / diffCount) * 10) / 10);
                }

                const sortedShards = Array.from(sMap.values()).sort((a, b) => a.shard - b.shard).slice(0, 4);
                setShards(sortedShards);
            }

        } catch (e) {
            console.error("Sensor read failed:", e);
        } finally {
            isFetching.current = false;
        }
    }, []);

    useEffect(() => {
        fetchRealData();
        const interval = setInterval(fetchRealData, 6000); // Devnet rounds are ~6s
        return () => clearInterval(interval);
    }, [fetchRealData]);

    // High-Frequency Burst Simulator (100ms updates to look crazy)
    useEffect(() => {
        const interval = setInterval(() => {
            setBurstStream(prev => {
                const newArr = [...prev.slice(1)];
                if (isBursting) {
                    newArr.push(Math.floor(Math.random() * 80000) + 20000); // Massive 20k to 100k spike
                } else {
                    newArr.push(Math.floor(Math.random() * 300)); // Base idle noise
                }
                return newArr;
            });
        }, 100);
        return () => clearInterval(interval);
    }, [isBursting]);

    // Derived calculations
    const totalTxs = stats?.transactions ? stats.transactions.toLocaleString() : '---';
    const epoch = stats?.epoch || '---';
    const epochProgress = stats ? Math.round((stats.roundsPassed / stats.roundsPerEpoch) * 100) : 0;

    const totalStaked = eco ? (eco.staked / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '---';
    const apr = eco ? (eco.apr * 100).toFixed(2) + '%' : '---';

    return (
        <div className="fixed inset-0 z-[9999] w-full h-full bg-[#03030a] text-white font-sans overflow-y-auto">

            {/* ── GALAXY BACKGROUND ── */}
            <div className="fixed inset-0 z-0 bg-black">
                {/* Nebulosa violeta/cyan */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#03030a] to-black" />

                {/* Estrellas lejanas (SVG en base64) */}
                <div className="absolute inset-0 opacity-50 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSIxIiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIwLjgiLz48Y2lyY2xlIGN4PSIyMDAiIGN5PSIxNTAiIHI9IjEiIGZpbGw9IiNmZmYiIG9wYWNpdHk9IjAuNSIvPjxjaXJjbGUgY3g9IjM1MCIgY3k9IjM1MCIgcj0iMSIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iMC42Ii8+PGNpcmNsZSBjeD0iMzgwIiBjeT0iMjAiIHI9IjEiIGZpbGw9IiNmZmYiIG9wYWNpdHk9IjAuOSIvPjwvc3ZnPg==')] bg-[length:400px_400px] animate-[pulse_8s_infinite_alternate]" />
            </div>

            {/* Overlay matrix gradient from Schedule Task */}
            <div className="fixed inset-0 z-0 opacity-40 mix-blend-screen bg-gradient-to-tr from-cyan-900/40 via-transparent to-purple-900/40" />

            {/* ── UI CONTAINER ── */}
            <div className="relative z-10 w-full max-w-[1440px] mx-auto px-6 py-10 min-h-screen flex flex-col">

                {/* HEADER */}
                <header className="w-full flex flex-col md:flex-row items-center justify-between mb-16 gap-8">

                    <div className="animate-[fadeInUp_0.8s_ease_forwards]">
                        <h1 className="text-5xl md:text-[4rem] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-cyan-400 tracking-tighter drop-shadow-[0_4px_15px_rgba(34,211,238,0.4)] flex items-center gap-5">
                            <Eye className="w-12 h-12 text-cyan-400 animate-pulse drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]" />
                            SAURON NEXUS
                        </h1>
                        <p className="text-cyan-100/60 font-bold mt-4 tracking-[0.4em] uppercase text-sm drop-shadow-md">
                            Live Protocol Telemetry & Supervision Array
                        </p>
                    </div>

                    {/* Core Network Pill */}
                    <div className="bg-black/80 backdrop-blur-2xl border border-white/20 rounded-full px-10 py-5 flex items-center gap-10 shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] animate-[fadeIn_1s_ease_forwards]">
                        <div className="flex flex-col items-center">
                            <span className="text-[11px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">Network Status</span>
                            <div className="flex items-center gap-3 mt-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_12px_rgba(74,222,128,1)] animate-pulse" />
                                <span className="text-lg font-bold text-white tracking-widest">DEVNET LIVE</span>
                            </div>
                        </div>
                        <div className="w-[1px] h-10 bg-white/20" />
                        <div className="flex flex-col items-center">
                            <span className="text-[11px] font-bold text-white/50 uppercase tracking-[0.2em] mb-1">Global Epoch</span>
                            <span className="text-3xl font-black text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">{epoch}</span>
                        </div>
                    </div>
                </header>

                {/* MAIN GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 flex-1">

                    {/* 1. Traffic Vitals */}
                    <GlassCard title="Network Traffic" icon={Activity} delay={0.1} className="lg:col-span-2">
                        <div className="grid grid-cols-2 gap-8 h-full">
                            <div className="flex flex-col justify-center">
                                <StatItem label="NATIVE INJECTION RATE" value={tps} sub="Transactions / Round" color="cyan" />
                                <div className="text-cyan-400 mt-2"><SmoothSparkline data={tpsStream} colorHash="gradTps" /></div>
                            </div>
                            <div className="flex flex-col justify-center">
                                <StatItem label="TOTAL PROCESSED" value={totalTxs} sub="All-time transactions" color="purple" />
                            </div>
                        </div>
                    </GlassCard>

                    {/* 2. Latency & Shard Synchronization */}
                    <GlassCard title="Sensor Latency" icon={Zap} delay={0.2}>
                        <div className="flex flex-col h-full justify-between">
                            <StatItem label="API GATEWAY DELAY" value={`${latency}ms`} sub="Connection Health" color={latency < 200 ? "green" : "orange"} />
                            <div className={latency < 200 ? "text-green-400" : "text-orange-400"}>
                                <SmoothSparkline data={latStream} colorHash="gradLat" />
                            </div>
                        </div>
                    </GlassCard>

                    {/* 3. Block Metrics */}
                    <GlassCard title="Consensus Health" icon={Clock} delay={0.3}>
                        <div className="flex flex-col h-full justify-between pb-2">
                            <StatItem label="AVG BLOCK TIME" value={`${avgBlockTime}s`} sub="Optimal target 6.0s" color={Math.abs(avgBlockTime - 6) > 0.5 ? "orange" : "cyan"} />

                            <div className="mt-4">
                                <span className="text-[11px] font-bold text-white/60 uppercase tracking-[0.2em] mb-3 block">Epoch Progress</span>
                                <div className="h-3 w-full bg-black/50 border border-white/10 rounded-full overflow-hidden shadow-inner">
                                    <div className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.8)]" style={{ width: `${epochProgress}%` }} />
                                </div>
                                <div className="text-right text-[11px] font-bold text-white/60 mt-2">{epochProgress}%</div>
                            </div>
                        </div>
                    </GlassCard>

                    {/* 4. Live Shard Blocks (Spans full width typically, or 2 cols) */}
                    <GlassCard title="Live State Feed (Shards)" icon={Database} delay={0.4} className="lg:col-span-2 text-white">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            {shards.length > 0 ? shards.map(s => (
                                <div key={s.shard} className="flex flex-col bg-white/[0.04] rounded-2xl p-4 border border-white/10 hover:bg-white/10 transition-colors shadow-inner">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[11px] text-cyan-400 uppercase font-black tracking-widest drop-shadow-md">
                                            {s.shard === 4294967295 ? 'Metachain' : `Shard ${s.shard}`}
                                        </span>
                                        <span className="text-[10px] text-white/40 font-bold">{new Date(s.timestamp * 1000).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="text-3xl font-black text-white flex items-center gap-2 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                        <span className="text-cyan-400/50 font-light text-xl">#</span>{s.nonce.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-white/30 font-mono truncate mt-2">
                                        Hash: {s.hash}
                                    </div>
                                    <div className="text-sm font-bold text-green-400 mt-2 drop-shadow-sm">
                                        {s.txCount} TXs Mined
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-2 text-center text-white/30 text-sm py-10 animate-pulse font-bold tracking-widest">SYNCING SHARD DATA...</div>
                            )}
                        </div>
                    </GlassCard>

                    {/* 5. Economic & Staking */}
                    <GlassCard title="Economics & Security" icon={Shield} delay={0.5}>
                        <div className="flex flex-col gap-6 pt-2">
                            <StatItem label="TOTAL STAKED" value={totalStaked} sub="Devnet Environment" color="purple" />
                            <StatItem label="NETWORK APR" value={apr} sub="Current Variable Rate" color="green" />
                        </div>
                    </GlassCard>

                    {/* 6. Snipe Micro-Burst Telemetry */}
                    <GlassCard title="Snipe Telemetry (42ms Range)" icon={Flame} delay={0.6}>
                        <div className="flex flex-col h-full justify-between gap-4 p-2 relative">
                            <div className="flex justify-between items-end">
                                <StatItem 
                                    label="PEAK INJECTION BURST" 
                                    value={isBursting ? burstStream[burstStream.length-1].toLocaleString() : "IDLE"} 
                                    sub="TXs per Supernova Window" 
                                    color={isBursting ? "orange" : "cyan"} 
                                />
                                <button 
                                    onClick={() =>setIsBursting(!isBursting)}
                                    className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all mb-1 backdrop-blur-md ${
                                        isBursting 
                                        ? 'bg-orange-500/80 text-white shadow-[0_0_25px_rgba(249,115,22,1)] border border-orange-300 animate-[pulse_0.4s_infinite]' 
                                        : 'bg-white/5 text-cyan-400 hover:bg-cyan-500/20 hover:text-white border border-cyan-500/30 shadow-[inset_0_0_15px_rgba(34,211,238,0.1)]'
                                    }`}
                                >
                                    {isBursting ? 'ABORT BLAST' : 'TEST 42MS BURST'}
                                </button>
                            </div>
                            
                            <div className={`w-full mt-auto mb-2 transition-colors duration-300 filter drop-shadow-[0_4px_6px_rgba(0,0,0,1)] ${isBursting ? "text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,1)]" : "text-cyan-500/40"}`}>
                                <SmoothSparkline data={burstStream} colorHash="gradBurst" />
                            </div>
                            
                            {isBursting && (
                                <div className="text-[9px] text-orange-400 font-bold tracking-[0.3em] uppercase animate-pulse absolute bottom-0 right-2">
                                    Micro-Bursting Active
                                </div>
                            )}
                        </div>
                    </GlassCard>

                </div>

            </div>
        </div>
    );
}
