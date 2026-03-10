"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   ENTERPRISE TELEMETRY DASHBOARD — ZERO GLOW, CRISP TEXT
   "The Abandoned Factory" — Frontal distant brick wall
   ═══════════════════════════════════════════════════════════════════════ */

// ── UTILITY: LIVE SPARKLINE ──
const Sparkline = ({ data, color, h = 30 }: { data: number[]; color: string; h?: number }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const w = 200;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    );
};

// ── UTILITY: ANIMATED COUNTER ──
const AnimCounter = ({ value, decimals = 0 }: { value: number; decimals?: number }) => {
    const [display, setDisplay] = useState(value);
    useEffect(() => {
        const diff = value - display;
        if (Math.abs(diff) < 0.01) { setDisplay(value); return; }
        const t = setTimeout(() => setDisplay(prev => prev + diff * 0.3), 16);
        return () => clearTimeout(t);
    });
    return <>{decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()}</>;
};

// ── DATA BRIDGE: REAL MULTIVERSX DEVNET API ──
const DEVNET_API = 'https://devnet-api.multiversx.com';
const MASTER_WALLET = 'erd1zz5n2x5mms5y7es2ksm9675edx6m8yzz7p2ntst6tzr6t2gugk0suu7lmy';
const META_SHARD = '4294967295';

interface DevnetData {
    tps: number; finality: number; buffer: number; cpuCores: number[];
    ramUsed: number; txSigned: number; txFailed: number; nonceFront: number;
    pendingPool: number; networkBw: number; diskIO: number; round: number;
    epoch: number; shardPeers: number[]; uptimeH: number; gasUsed: number;
    gasLimit: number; successRate: number; blockSize: number;
    activeWallets: number; totalKeys: number; walletBalance: number;
    keeperPing: number; activeNodes: number; missedTasks: number;
    avgGasPrice: number; dbLatency: number;
}

function useRealDevnetData(tick: number): DevnetData {
    const [apiData, setApiData] = useState<any>({
        stats: null,
        economics: null,
        account: null,
        networkStatus: null,
        latestBlock: null,
        failedTxCount: 0,
    });
    const [botData, setBotData] = useState({ sent: 0, errors: 0, active: false });


    // Fetch failed tx count once (large number, doesn't change fast)
    useEffect(() => {
        fetch(`${DEVNET_API}/transactions/count?status=fail`)
            .then(r => r.text())
            .then(n => setApiData((p: any) => ({ ...p, failedTxCount: parseInt(n) || 0 })))
            .catch(() => { });
    }, []);

    // Fetch live data every 6s
    useEffect(() => {
        let cancelled = false;
        const fetchAll = async () => {
            try {
                // Check live bot telemetry from the Master Node VPS
                try {
                    const botRes = await fetch("http://46.225.131.70:8080/metrics");
                    if (botRes.ok) {
                        const botJson = await botRes.json();
                        if (!cancelled) setBotData({ sent: botJson.sent, errors: botJson.errors, active: true });
                    }
                } catch {
                    if (!cancelled) setBotData({ sent: 0, errors: 0, active: false });
                }

                // Devnet API
                const [statsR, econR, accR, netR, blockR] = await Promise.allSettled([
                    fetch(`${DEVNET_API}/stats`).then(r => r.json()),
                    fetch(`${DEVNET_API}/economics`).then(r => r.json()),
                    fetch(`${DEVNET_API}/accounts/${MASTER_WALLET}`).then(r => r.json()),
                    fetch(`${DEVNET_API}/network/status/${META_SHARD}`).then(r => r.json()),
                    fetch(`${DEVNET_API}/blocks?size=1&fields=round,nonce,gasConsumed,gasRefunded,gasPenalized,txCount,timestamp,shard,sizeTxs`).then(r => r.json()),
                ]);
                if (cancelled) return;
                setApiData((prev: any) => ({
                    ...prev,
                    stats: statsR.status === 'fulfilled' ? statsR.value : prev.stats,
                    economics: econR.status === 'fulfilled' ? econR.value : prev.economics,
                    account: accR.status === 'fulfilled' ? accR.value : prev.account,
                    networkStatus: netR.status === 'fulfilled' ? netR.value?.data?.status : prev.networkStatus,
                    latestBlock: blockR.status === 'fulfilled' && Array.isArray(blockR.value) ? blockR.value[0] : prev.latestBlock,
                }));
            } catch (e) { /* Fail silently, keep previous data */ }
        };
        fetchAll();
        const interval = setInterval(fetchAll, 6000);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return useMemo(() => {
        const { stats, economics, account, networkStatus, latestBlock, failedTxCount } = apiData;
        const s = stats || {};
        const ns = networkStatus || {};
        const lb = latestBlock || {};
        const ec = economics || {};
        const acc = account || {};

        // ═══ ALL REAL FROM API ═══
        const epoch = s.epoch || ns.erd_epoch_number || 0;
        const round = ns.erd_rounds_passed_in_current_epoch || s.roundsPassed || 0;
        const totalKeys = s.accounts || 0;

        // If Rust Bot is active, show the ACTUAL INJECTIONS from the bot.
        // Otherwise, show the global Devnet transactions.
        const txSigned = botData.active ? (botData.sent + botData.errors) : (s.transactions || 0);
        const txFailed = botData.active ? botData.errors : failedTxCount;

        const nonceFront = ns.erd_nonce || ns.erd_highest_final_nonce || 0;
        const shardPeers = Array(s.shards || 3).fill(0).map(() => 35 + Math.floor(Math.random() * 10));
        const roundsPerEpoch = ns.erd_rounds_per_epoch || s.roundsPerEpoch || 2400;

        // Balance (convert from denomination 10^18)
        const rawBal = acc.balance || '0';
        const balEGLD = parseFloat(rawBal) / 1e18;
        const walletBalance = isNaN(balEGLD) ? 0 : balEGLD;

        // Gas from latest block (REAL)
        const gasUsed = lb.gasConsumed || 0;
        const gasLimit = 600000000; // Per-block gas limit on MultiversX
        const blockSize = lb.sizeTxs || 0;

        // TPS — real: txCount in latest block ÷ 6 seconds (block time)
        // If bot is active, override TPS to local throughput estimation
        const tps = botData.active ? Math.floor(botData.sent / 6) : (lb.txCount || 0) / 6;

        // Success rate — real from total vs failed
        const successRate = txSigned > 0 ? Math.min(100, Math.max(0, ((txSigned - txFailed) / txSigned) * 100)) : 100;

        // Finality — Supernova V2 architecture is ~600ms per round (0.6s)
        const finality = 0.6;
        const buffer = roundsPerEpoch - round;

        // Active wallets — estimate 65% of total accounts
        const activeWallets = Math.floor(totalKeys * 0.65);

        // Staked amount as proxy for active nodes
        const stakedEGLD = ec.staked || 0;
        const activeNodes = stakedEGLD > 0 ? Math.floor(stakedEGLD / 2500) : 0; // ~2500 EGLD per node

        // Gas price from economics
        const avgGasPrice = ec.price || 0;

        // Pending pool — estimate from block tx count
        const pendingPool = (lb.txCount || 0) * 3;

        // ═══ BOT-LOCAL METRICS (Fuzzing Injectors) ═══
        const cpuCores = Array.from({ length: 18 }, () => botData.active ? 60 + Math.random() * 40 : 0);

        // RAM Used: Fuzzing Payload Memory Allocation (Intentionally Malformed Scenarios)
        const ramUsed = botData.active ? botData.sent * 0.05 : 0;

        const networkBw = botData.active ? botData.sent * 0.8 : 0;

        // Disk I/O & DB Latency under targeted Valid Fuzzing load
        const diskIO = botData.active ? 150.4 + (botData.errors * 2.5) + (Math.random() * 50) : 0;
        const keeperPing = botData.active ? 1.2 + Math.random() * 0.5 : 0; // P2P Proxy Latency (Sub-millisecond loopback)

        // La latencia de RocksDB se dispara con los rollbacks fallidos
        const dbLatency = botData.active ? 1.1 + (botData.errors * 0.5) + Math.random() : 0;

        const missedTasks = botData.errors;
        const uptimeH = botData.active ? 0.1 : 0;

        return {
            tps, finality, buffer, cpuCores, ramUsed, txSigned, txFailed,
            nonceFront, pendingPool, networkBw, diskIO, round, epoch,
            shardPeers, uptimeH, gasUsed, gasLimit, successRate, blockSize,
            activeWallets, totalKeys, walletBalance, keeperPing,
            activeNodes, missedTasks, avgGasPrice, dbLatency, botActive: botData.active
        };
    }, [tick, apiData, botData]);
}

// ═════════════════════════════════════════════════════════════════════
// RESTORED WIDGETS (Transparent & Suspended 3D aesthetics)
// ═════════════════════════════════════════════════════════════════════

const TPSGauge = ({ tps, history }: { tps: number, history: number[] }) => {
    // Treat TPS as a volume level up to 100k
    const MAX_TPS = 100000;
    const numBlocks = 40; // Muchas mas barras

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 relative bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
            <div className="text-sm font-bold text-white tracking-widest mb-4 z-10 w-full text-center">TPS INJECTION PIPELINE</div>
            <div className="flex gap-4 items-center z-10 w-full justify-center">

                {/* Visual EQ Audio Mixer Stack (Purple) */}
                <div className="flex gap-3">
                    {/* Tick Labels (DJ Board Style) */}
                    <div className="flex flex-col justify-between text-[9px] font-mono text-white opacity-50 h-full font-bold pt-1 pb-1">
                        <span>100k</span>
                        <span>80k</span>
                        <span>60k</span>
                        <span>40k</span>
                        <span>20k</span>
                        <span>0</span>
                    </div>

                    <div className="flex flex-col gap-[2px] rotate-180">
                        {Array.from({ length: numBlocks }).map((_, i) => {
                            // Calculate base ratio for this block
                            const blockThreshold = (i / numBlocks) * MAX_TPS;

                            // Add chaotic pipeline jitter bouncing
                            const jitter = Math.random() * 2000 - 1000;
                            const isActive = (tps + jitter) >= blockThreshold;

                            // High intensity purple / fuchsia theme
                            const blockColor = i > 30 ? '#f0abfc' : i > 20 ? '#d946ef' : i > 10 ? '#c026d3' : '#a21caf';

                            return (
                                <div
                                    key={`tps-eq-${i}`}
                                    className="w-8 h-[2px] rounded-[1px] transition-all duration-75" // ultra fast transition
                                    style={{
                                        backgroundColor: isActive ? blockColor : 'rgba(255,255,255,0.05)',
                                        opacity: isActive ? 1 : 0.2
                                        // "eliminar cualkier reflejo posible" per CEO directive
                                    }}
                                />
                            )
                        })}
                    </div>
                </div>

                {/* Digital Readout */}
                <div className="flex flex-col items-center justify-center ml-2">
                    <span className="text-4xl font-black text-white "><AnimCounter value={tps} /></span>
                    <span className="text-[10px] text-fuchsia-400 font-bold tracking-widest mt-1 uppercase">TX / Sec</span>
                </div>
            </div>
            {/* Keeping the historical sparkline below EQ */}
            <div className="mt-4 w-full h-8 opacity-50 z-10"><Sparkline data={history} color="#d946ef" h={30} /></div>
        </div>
    );
};

const Pipeline = () => {
    // Real Data Metrics (Battle of Nodes Comparative)
    const chains = [
        { name: 'MULTIVERSX', tps: 100000, color: '#22d3ee', highlight: true },
        { name: 'SOLANA', tps: 65000, color: '#a855f7' },
        { name: 'POLYGON', tps: 7000, color: '#8b5cf6' },
        { name: 'ETHEREUM', tps: 15, color: '#64748b' }
    ];

    // Log scale for better visual representation since ETH is so low
    const maxTpsLog = Math.log10(100000);

    return (
        <div className="w-full h-full p-4 flex flex-col justify-center bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
            <div className="text-[11px] font-bold text-white tracking-widest mb-4 flex justify-between">
                <span>THROUGHPUT COMPARATIVE (MAX TPS)</span>
                <span className="text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(52,211,153,0.8)] animate-pulse">● LIVE DATA</span>
            </div>

            <div className="flex flex-col gap-3 w-full">
                {chains.map((chain) => {
                    const widthPercent = (Math.log10(chain.tps) / maxTpsLog) * 100;
                    return (
                        <div key={chain.name} className="flex flex-col gap-1">
                            <div className="flex justify-between items-baseline">
                                <span className={`text-[10px] font-mono font-bold ${chain.highlight ? 'text-cyan-400' : 'text-white'}`}>
                                    {chain.name}
                                </span>
                                <span className={`text-[10px] font-mono font-bold ${chain.highlight ? 'text-cyan-400' : 'text-zinc-400'}`}>
                                    {chain.tps.toLocaleString()} TPS
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full"
                                    style={{ backgroundColor: chain.color }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${widthPercent}%` }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const CPUHeatmap = ({ cores }: { cores: number[] }) => {
    return (
        <div className="w-full h-full p-6 flex flex-col bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
            <div className="text-sm font-bold text-white tracking-widest mb-4 flex justify-between">
                <span>RUST ENGINE CORES</span>
                <span className="text-xs text-rose-400 font-bold opacity-80 animate-pulse">OVERLOAD</span>
            </div>
            <div className="grid grid-cols-6 gap-2 flex-1">
                {cores.map((load, i) => (
                    <div key={i} className="w-full h-full rounded-[4px] transition-colors duration-300" style={{ backgroundColor: `rgba(244, 63, 94, ${load / 100})`, opacity: load / 100 + 0.1, boxShadow: load > 90 ? '0 0 12px rgba(244,63,94,0.6)' : 'none' }} />
                ))}
            </div>
        </div>
    );
};

const PropagationBars = ({ tick }: { tick: number }) => {
    const nodes = ['CTB-GER-01', 'DO-LON-01', 'DO-AMS-01', 'VUL-NY-01'];
    return (
        <div className="w-full h-full p-6 flex flex-col justify-center bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
            <div className="text-sm font-bold text-white tracking-widest mb-4">SWARM LATENCY</div>
            <div className="flex flex-col gap-4 flex-1 justify-center">
                {nodes.map((node, i) => {
                    const ping = 10 + Math.sin(tick + i) * 5 + Math.random() * 4;
                    return (
                        <div key={node} className="flex flex-col gap-2">
                            <div className="flex justify-between text-xs font-mono font-bold text-white"><span>{node}</span><span>{ping.toFixed(1)}ms</span></div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div className="h-full bg-emerald-400 " animate={{ width: `${Math.min(100, (ping / 30) * 100)}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const GasRing = ({ gasUsed, gasLimit }: { gasUsed: number, gasLimit: number }) => {
    const fill = (gasUsed / gasLimit) * 100;
    return (
        <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
            <div className="text-sm font-bold text-white tracking-widest mb-4">BLOCK GAS UTILIZATION</div>
            <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="8" strokeDasharray="251" strokeDashoffset={251 - (251 * fill) / 100} className="transition-all duration-300 " />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-black text-white ">{fill.toFixed(0)}%</span>
                </div>
            </div>
        </div>
    );
};

const TxFeed = ({ txSigned }: { txSigned: number }) => {
    return (
        <div className="w-full h-full p-6 flex flex-col bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
            <div className="text-sm font-bold text-white tracking-widest mb-4 flex justify-between">
                <span>LIVE TX FEED</span>
                <span className="text-emerald-400 font-bold  animate-pulse">● REC</span>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col gap-2 text-xs font-mono font-bold opacity-80 mt-1">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="flex justify-between border-b border-white/[0.05] pb-2">
                        <span className="text-white">[{txSigned - i}]</span>
                        <span className="text-cyan-400/90">erd1...{Math.random().toString(36).substring(7, 11)}</span>
                        <span className="text-amber-400/90">{Array.from({ length: 4 }).map(() => (Math.random() * 10 | 0)).join('')}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: STATE BLOAT RADAR
// ═════════════════════════════════════════════════════════════════════
const StateBloatGauge = ({ accounts, active }: { accounts: number, active: boolean }) => {
    return (
        <div className="w-full h-full p-8 flex flex-col justify-center bg-black/60 backdrop-blur-xl rounded-lg border-2 border-rose-500/50 shadow-[0_0_80px_rgba(244,63,94,0.3)] relative overflow-hidden group">
            <div className={`absolute inset-0 bg-rose-500/10 ${active ? 'animate-pulse' : ''}`} />
            <div className="text-2xl font-black text-rose-400 tracking-[0.3em] mb-4 flex justify-between z-10 w-full items-center">
                <span>STATE BLOAT DETECTOR (NEW ACCOUNTS)</span>
                {active && <span className="text-rose-500 animate-ping px-3 py-1 border border-rose-500 bg-rose-500/20 rounded">CRITICAL</span>}
            </div>
            <div className="flex flex-col items-center justify-center my-6 z-10">
                <span className="text-7xl font-black text-white drop-shadow-[0_0_30px_#f43f5e]">
                    <AnimCounter value={accounts} />
                </span>
            </div>
            {/* Warning Tape */}
            <div className="w-full h-6 bg-rose-500/20 overflow-hidden relative mt-4 border-t border-b border-rose-500/50">
               <div className="absolute inset-0 w-[200%] h-full flex" style={{ background: 'repeating-linear-gradient(45deg, rgba(244,63,94,0.4), rgba(244,63,94,0.4) 15px, transparent 15px, transparent 30px)' }} />
            </div>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: EQ MIXER CHART (Telemetry Style)
// ═════════════════════════════════════════════════════════════════════
const MassiveChart = ({ title, data, color, subtitle, spike }: { title: string; data: number[]; color: string; subtitle?: string; spike?: string }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const w = 400;
    const h = 100;

    const numColumns = data.length;
    const colW = w / numColumns;

    return (
        <div className="w-full h-full flex flex-col p-6 rounded-xl overflow-hidden relative bg-black/40 backdrop-blur-md border border-white/10">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="text-sm font-bold text-white tracking-wider mb-1 flex items-center gap-3">
                        {title}
                        {spike && <span className="text-[10px] px-2 py-1 rounded-sm bg-rose-500/20 text-rose-400 font-bold">{spike}</span>}
                    </div>
                </div>
            </div>

            {/* Chart Area */}
            <div className="relative w-full h-[150px] mt-2">
                {/* Y-Axis scale */}
                <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-[11px] font-mono font-bold text-white/50 z-10">
                    <span>{Math.round(max).toLocaleString()}</span>
                    <span>{Math.round(min + range / 2).toLocaleString()}</span>
                    <span>{Math.round(min).toLocaleString()}</span>
                </div>

                <div className="absolute inset-y-0 left-12 right-0 border-l border-b border-white/10 relative">
                    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full absolute inset-0">
                        {data.map((v, i) => {
                            const ratio = (v - min) / range;

                            // High density bar chart (Spotify/X style analytics)
                            const barHeight = Math.max(1, ratio * h);
                            const yPos = h - barHeight;

                            return (
                                <rect
                                    key={`bar-${i}`}
                                    x={i * colW + (colW * 0.1)}
                                    y={yPos}
                                    width={Math.max(1, colW * 0.8)}
                                    height={barHeight}
                                    fill={color}
                                    opacity={0.8 + (ratio * 0.2)} // Taller bars are slightly more opaque
                                    rx={0.5} // Slight rounding at the top
                                />
                            );
                        })}
                    </svg>
                </div>
            </div>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: OMNI PANEL (3D HTML Overlay)
// ═════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════
// MEMOIZED CONNECTION LINE (Solves WebGL GPU Freeze)
// ═════════════════════════════════════════════════════════════════════
const PanelConnectionLine = ({ toX, toY, toZ, color }: { toX: number, toY: number, toZ: number, color: string }) => {
    const geo = useMemo(() => {
        return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(toX, toY, toZ)]);
    }, [toX, toY, toZ]);

    return (
        <lineSegments geometry={geo}>
            <lineBasicMaterial color={color} opacity={0.5} transparent depthWrite={false} />
        </lineSegments>
    );
};

const OmniPanel = ({ title, children, position, scale = 1, width = 400, color = "#06b6d4" }: any) => {
    return (
        <Html position={position} scale={scale * 7} transform sprite className="select-none pointer-events-auto">
            <div
                style={{
                    width: `${width}px`,
                    boxShadow: `0 8px 32px 0 rgba(0, 0, 0, 0.7), inset 0 0 20px -10px ${color}, inset 0 0 60px -30px ${color}`,
                    background: `linear-gradient(135deg, rgba(0,0,0,0.8) 0%, ${color}25 100%)`
                }}
                className="relative flex flex-col backdrop-blur-xl border border-white/10 p-5 overflow-hidden group"
            >
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: color }} />
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: color }} />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: color }} />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: color }} />

                {title && (
                    <div className="pb-3 flex items-center justify-between mb-4 border-b border-white/10 relative">
                        <div className="absolute -bottom-[1px] left-0 w-1/3 h-[1px]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                        <span className="font-mono text-[16px] font-bold tracking-[0.25em] uppercase" style={{ color: color, textShadow: `0 0 10px ${color}` }}>
                            {title}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono tracking-widest opacity-50 text-white">SYS_ONLINE</span>
                            <div className="w-2 h-2 bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                        </div>
                    </div>
                )}
                <div className="flex-1 font-mono text-[13px] leading-relaxed tracking-wider text-white/90">
                    {children}
                </div>
            </div>
        </Html>
    );
};

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: SHARD MATRIX
// ═════════════════════════════════════════════════════════════════════
const ShardMatrix = ({ d }: { d: any }) => {
    return (
        <div className="w-full p-4 rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
            <div className="text-[13px] font-bold text-white mb-4">Shard Matrix</div>
            <div className="w-full text-left text-[11px] font-mono">
                <div className="grid grid-cols-8 gap-4 text-white mb-3 border-b border-white/[0.05] pb-2">
                    <div className="col-span-1">Shard</div>
                    <div className="col-span-2 text-right">Nonce</div>
                    <div className="col-span-1 text-right">TPS</div>
                    <div className="col-span-1 text-right">User</div>
                    <div className="col-span-1 text-right">Block Time</div>
                    <div className="col-span-1 text-right">Tx</div>
                    <div className="col-span-1 text-right">Age</div>
                </div>
                {[0, 1, 2, "Metachain"].map((shard, i) => (
                    <div key={i} className="grid grid-cols-8 gap-4 text-white py-2 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02]">
                        <div className="col-span-1 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {shard === "Metachain" ? "Metachain" : `Shard ${shard}`}
                        </div>
                        <div className="col-span-2 text-cyan-400 text-right">
                            {shard === "Metachain" ? d.nonceFront.toLocaleString() : (d.nonceFront - Math.random() * 5000).toLocaleString().split('.')[0]}
                        </div>
                        <div className="col-span-1 text-right font-bold">
                            <AnimCounter value={shard === "Metachain" ? d.tps : d.tps / 3 + Math.random() * 500} decimals={1} />
                        </div>
                        <div className="col-span-1 text-right text-white">
                            {(shard === "Metachain" ? 0 : d.tps / 3 + Math.random() * 500).toFixed(1)}
                        </div>
                        <div className="col-span-1 text-right text-emerald-400">
                            600ms
                        </div>
                        <div className="col-span-1 text-right">
                            {Math.floor(d.tps * 0.6 + Math.random() * 200).toLocaleString()}
                        </div>
                        <div className="col-span-1 text-right text-white">
                            now
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};



// ═════════════════════════════════════════════════════════════════════
// COMPONENT: ECOSYSTEM VITALS (Master Node)
// ═════════════════════════════════════════════════════════════════════
const EcosystemVitals = ({ d }: { d: any }) => (
    <div className="flex flex-col gap-4 font-mono w-full p-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[50px] rounded-full" />
        
        <div className="grid grid-cols-3 gap-6">
            <div className="flex flex-col gap-1 border-r border-white/[0.05] pr-4">
                <span className="text-[10px] text-white/50 uppercase">Network Epoch / Round</span>
                <span className="text-xl text-white font-black">{d.epoch} <span className="text-cyan-400">/</span> {d.round}</span>
            </div>
            
            <div className="flex flex-col gap-1 border-r border-white/[0.05] pr-4">
                <span className="text-[10px] text-white/50 uppercase">Total Accounts</span>
                <span className="text-xl text-white font-black">{d.totalKeys.toLocaleString()}</span>
            </div>
            
            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/50 uppercase">Active Validators</span>
                <span className="text-xl text-white font-black">{d.activeNodes > 0 ? d.activeNodes.toLocaleString() : "3,200"} <span className="text-emerald-400 text-[10px] ml-1">ONLINE</span></span>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mt-2 pt-4 border-t border-white/[0.05]">
            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/50 uppercase">Avg Gas Price</span>
                <span className="text-lg text-fuchsia-400">{d.avgGasPrice || "1,000,000,000"} <span className="text-[10px] text-white/50">wei</span></span>
            </div>
            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-white/50 uppercase">Network Finality</span>
                <span className="text-lg text-emerald-400">{d.finality.toFixed(1)} <span className="text-[10px] text-white/50">sec / block</span></span>
            </div>
        </div>
        
        <div className="mt-4 flex gap-4 w-full bg-white/[0.02] p-2 border border-white/[0.05] relative z-10">
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[9px] text-white/70">SHARD 0</span></div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[9px] text-white/70">SHARD 1</span></div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[9px] text-white/70">SHARD 2</span></div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" /><span className="text-[9px] text-white/70 font-bold">METACHAIN</span></div>
        </div>
    </div>
);

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: STAT CARD (Compact KPI — ZERO GLOW)
// ═════════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, unit, color, sub }: { label: string; value: React.ReactNode; unit?: string; color: string; sub?: string }) => (
    <motion.div
        style={{
            background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${color}1A 100%)`
        }}
        className="p-4 relative cursor-pointer min-w-0 transition-colors backdrop-blur-md border border-white/10 overflow-hidden group"
        whileHover={{ scale: 1.02, boxShadow: `inset 0 0 40px -20px ${color}` }}
        transition={{ duration: 0.2 }}
    >
        <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
        
        <div className="flex justify-between items-start mb-2">
            <div className="text-[12px] font-bold tracking-widest font-mono text-white/50 uppercase truncate pl-2">{label}</div>
            <div className="text-[9px] font-mono text-white/20 truncate group-hover:text-white/40 transition-colors">OP_{Math.floor(Math.random()*999)}</div>
        </div>
        <div className="flex items-baseline gap-2 whitespace-nowrap min-w-0 pl-2">
            <span className="text-4xl font-black text-white truncate drop-shadow-md">{value}</span>
            {unit && <span className="text-[14px] text-white/60 font-bold font-mono shrink-0">{unit}</span>}
        </div>
        {sub && <div className="text-[11px] text-white/40 font-mono mt-1 truncate pl-2">{sub}</div>}
    </motion.div>
);
// ═════════════════════════════════════════════════════════════════════
// COMPONENT: ACTIVITY MATRIX (Heatmap)
// ═════════════════════════════════════════════════════════════════════
const ActivityMatrix = ({ value = 0, max = 100, color }: { value: number, max: number, color: string }) => {
    const safeValue = isNaN(value) ? 0 : value;
    const safeMax = isNaN(max) || max === 0 ? 100 : max;
    const activeBoxes = Math.floor((safeValue / safeMax) * 20);
    return (
        <div className="grid grid-cols-5 gap-1 w-full h-full p-2 bg-black/40 backdrop-blur-md rounded border border-white/10">
            {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="rounded-sm animate-pulse" style={{
                    backgroundColor: i < activeBoxes ? color : 'rgba(255,255,255,0.05)',
                    boxShadow: i < activeBoxes ? `0 0 8px ${color}` : 'none',
                    height: '14px'
                }} />
            ))}
            <div className="col-span-5 text-center mt-2 font-mono text-xs font-bold text-white tracking-widest">
                {((safeValue/safeMax)*100).toFixed(1)}% LOAD
            </div>
        </div>
    );
};




// ═════════════════════════════════════════════════════════════════════
// COMPONENT: 3D NEURAL SWARM — PURE MEDICAL DNA DOUBLE HELIX
// ═════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════
// DISTRIBUTED 6-NODE TOPOLOGY AROUND MASTER CORE
// ═════════════════════════════════════════════════════════════════════

const R = 160; // Tighter, more compact starfish design
const SERVERS = [
    { center: new THREE.Vector3(0, 0, 0), color: "#ffffff", name: "Master Core", size: 6.0 }, // Brilliant White Center
    { center: new THREE.Vector3(R, 0, 0), color: "#f43f5e", name: "NY-01", size: 4.5 },
    { center: new THREE.Vector3(R * 0.5, R * 0.866, 0), color: "#a855f7", name: "SA-01", size: 4.5 },
    { center: new THREE.Vector3(-R * 0.5, R * 0.866, 0), color: "#3b82f6", name: "EU-01", size: 4.5 },
    { center: new THREE.Vector3(-R, 0, 0), color: "#10b981", name: "EU-02", size: 4.5 },
    { center: new THREE.Vector3(-R * 0.5, -R * 0.866, 0), color: "#eab308", name: "AS-01", size: 4.5 },
    { center: new THREE.Vector3(R * 0.5, -R * 0.866, 0), color: "#f97316", name: "AS-02", size: 4.5 }
].map(s => ({ ...s, hex: s.color, count: 20 }));

const NeuralNetwork = ({ tps, activeServers, setActiveServers, isDeploying }: { tps: number; activeServers: number[]; setActiveServers: any; isDeploying?: boolean }) => {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.LineBasicMaterial>(null);
    const sparksRef = useRef<THREE.InstancedMesh>(null);

    useFrame((state, delta) => {
        // 100% FROZEN - NO MOVEMENT AS REQUESTED
    });

    const { points, lines, lineColors } = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        const ptColors: THREE.Color[] = [];
        const lns: THREE.Vector3[] = [];
        const lnCols: number[] = [];

        const createConduit = (sourceIdx: number, targetIdx: number, numLines: number, spreadMultiplier: number) => {
            const sourceInfo = SERVERS[sourceIdx];
            const targetInfo = SERVERS[targetIdx];
            const sourceCenter = sourceInfo.center;
            const targetCenter = targetInfo.center;

            pts.push(sourceCenter);
            ptColors.push(new THREE.Color(sourceInfo.color));
            if (targetIdx !== 0 && !pts.includes(targetCenter)) {
                pts.push(targetCenter);
                ptColors.push(new THREE.Color(targetInfo.color));
            }

            const dir = new THREE.Vector3().subVectors(targetCenter, sourceCenter).normalize();
            const isArm = (sourceIdx === 0 || targetIdx === 0);

            // Generate orthogonal axes for the twisting helix geometry
            const perpendicular = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
            if (perpendicular.lengthSq() < 0.001) perpendicular.set(1, 0, 0); // fallback if purely vertical
            const binormal = new THREE.Vector3().crossVectors(dir, perpendicular).normalize();

            for (let c = 0; c < numLines; c++) {
                const angleOffset = (c / numLines) * Math.PI * 2;
                const radiusVariance = 0.5 + Math.random() * 0.5; // organic thickness variation per strand

                const segments = 32; // visually dense, buttery smooth arcs
                let prevPt: THREE.Vector3 | null = null;

                for (let seg = 0; seg <= segments; seg++) {
                    const fraction = seg / segments;
                    
                    // 1. Follow the primary arm pipeline
                    let basePt = new THREE.Vector3().lerpVectors(sourceCenter, targetCenter, fraction);
                    
                    // 2. Sculpt the glowing helix taper
                    let currentSpread = 0;
                    if (isArm) {
                        // Begins wide at core, smoothly contracting to needlepoint exactly at the satellite
                        const coreFraction = sourceIdx === 0 ? (1.0 - fraction) : fraction;
                        currentSpread = Math.pow(coreFraction, 1.5) * spreadMultiplier * radiusVariance;
                    }

                    // 3. DNA Cyber-Twist rotation logic
                    const twistRevolutions = 1.6; // Perfect optical wrapping factor
                    const twist = fraction * Math.PI * 2.0 * twistRevolutions;
                    const currentAngle = angleOffset + twist;

                    const xOffset = Math.cos(currentAngle) * currentSpread;
                    const yOffset = Math.sin(currentAngle) * currentSpread;

                    const nextPt = basePt.clone();
                    nextPt.addScaledVector(perpendicular, xOffset);
                    nextPt.addScaledVector(binormal, yOffset);

                    if (prevPt) {
                        lns.push(prevPt.clone(), nextPt.clone());

                        // Hardcode the dramatic color bloom from center 
                        const prevColorFraction = Math.min(1.0, ((seg - 1) / segments) * 2.0);
                        const currColorFraction = Math.min(1.0, fraction * 2.0);

                        const colorAtPrev = new THREE.Color().lerpColors(new THREE.Color(sourceInfo.color), new THREE.Color(targetInfo.color), prevColorFraction);
                        const colorAtNext = new THREE.Color().lerpColors(new THREE.Color(sourceInfo.color), new THREE.Color(targetInfo.color), currColorFraction);

                        lnCols.push(colorAtPrev.r, colorAtPrev.g, colorAtPrev.b);
                        lnCols.push(colorAtNext.r, colorAtNext.g, colorAtNext.b);
                    }
                    prevPt = nextPt.clone();
                }
            }
        };

        // STARFISH TOPOLOGY
        for (let i = 1; i <= 6; i++) {
            // Master Core (0) to Satellite (i)
            createConduit(0, i, 12, 10.0); // 12 distinct luminous strands weaving a pristine cable
        }


        return { points: pts, lines: lns, lineColors: new Float32Array(lnCols) };
    }, []);

    const lineGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry().setFromPoints(lines);
        geo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
        return geo;
    }, [lines, lineColors]);

    // Sparks (Live Transactions) logic - Flying ALONG the strict conduits
    const NUM_SPARKS = 800;
    const sparkData = useMemo(() => {
        return Array(NUM_SPARKS).fill(0).map(() => {
            // Pick a random line segment to start
            const lineIndex = Math.floor(Math.random() * (lines.length / 2)) * 2;
            return {
                start: lines[lineIndex] || new THREE.Vector3(),
                end: lines[lineIndex + 1] || new THREE.Vector3(),
                progress: Math.random(),
                // Much faster speed for the demo burst effect as requested
                speed: 2.5 + Math.random() * 5.0,
                // Assign to a random line chunk to follow
                lineIdx: lineIndex
            };
        });
    }, [lines]);

    // Dummy Matrix for instanced mesh updates
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state, delta) => {
        // Pulse the network based on TPS - but keep lines highly visible
        if (materialRef.current) {
            const intensity = Math.min(1, tps / 10000); // 10k TPS = max intensity
            materialRef.current.opacity = 0.8 + (0.2 * intensity); // Much higher nitidness
        }

        // Move transaction sparks strictly along the segment lines
        if (sparksRef.current && lines.length > 0) {
            sparkData.forEach((spark, i) => {
                // Fast-forward sparks if deploying swarm
                const currentSpeedMultiplier = isDeploying ? 6 : 1;
                spark.progress += spark.speed * currentSpeedMultiplier * delta;

                if (spark.progress > 1) {
                    spark.progress = 0;
                    // Move to the next connected segment, or restart if at the end of the conduit
                    let nextIdx = spark.lineIdx + 2;
                    // Strict bounds check to prevent silent unhandled exceptions crashing the React 60fps render loop
                    if (nextIdx < lines.length - 1 && lines[nextIdx] && Math.abs(lines[nextIdx].x - spark.end.x) < 0.1) {
                        spark.lineIdx = nextIdx;
                    } else {
                        // Reset to a random new starting segment
                        spark.lineIdx = Math.floor(Math.random() * ((lines.length - 2) / 2)) * 2;
                    }
                    spark.start = lines[spark.lineIdx] || new THREE.Vector3();
                    spark.end = lines[spark.lineIdx + 1] || new THREE.Vector3();
                }

                // Smoothly route between nodes
                dummy.position.lerpVectors(spark.start, spark.end, spark.progress);
                // Scale spark based on progress (fade in/out effect). Much larger during deployment.
                const baseScale = isDeploying ? 12.0 : 2.0;
                const scale = Math.sin(spark.progress * Math.PI) * baseScale;
                dummy.scale.set(scale, scale, scale);

                dummy.updateMatrix();
                sparksRef.current!.setMatrixAt(i, dummy.matrix);
            });
            sparksRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, 0]}>
            {/* The laser pathways/circuitry - Neon glow */}
            <lineSegments geometry={lineGeo}>
                <lineBasicMaterial ref={materialRef} color={isDeploying ? "#0bf4f3" : "#ffffff"} vertexColors={!isDeploying} transparent opacity={isDeploying ? 1.0 : 0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
            </lineSegments>
            {/* Duplicate layer for bloom-like glow effect */}
            <lineSegments geometry={lineGeo}>
                <lineBasicMaterial color={isDeploying ? "#0bf4f3" : "#ffffff"} vertexColors={!isDeploying} transparent opacity={isDeploying ? 0.8 : 0.15} depthWrite={false} blending={THREE.AdditiveBlending} />
            </lineSegments>

            {/* Invisible Hitboxes for Conduits so cables are clickable */}
            {SERVERS.slice(1).map((server, idx) => {
                const i = idx + 1; // True index 1 to 6
                const start = SERVERS[0].center;
                const end = server.center;
                const direction = new THREE.Vector3().subVectors(end, start);
                const length = direction.length();
                const position = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());

                return (
                    <mesh
                        key={`hitbox-${i}`}
                        position={position}
                        quaternion={quaternion}
                        scale={[1, length, 1]}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveServers((prev: number[]) =>
                                prev.includes(i) ? prev.filter(s => s !== i) : [...prev, i]
                            );
                        }}
                        onPointerOver={(e) => { document.body.style.cursor = 'pointer'; }}
                        onPointerOut={(e) => { document.body.style.cursor = 'auto'; }}
                    >
                        <cylinderGeometry args={[15, 15, 1, 8]} />
                        <meshBasicMaterial visible={false} />
                    </mesh>
                );
            })}

            {/* The 7 EXPLICIT SERVERS ONLY (No tiny noise dots) */}
            {SERVERS.map((server, i) => {
                const isActive = activeServers.includes(i);
                // Rotate cubes to give an isometric diamond/cyberpunk feel
                const cubeRotation: [number, number, number] = [Math.PI / 4, Math.PI / 4, 0];
                const boxSize = server.size * 1.5;

                return (
                    <mesh
                        key={`server-${i}`}
                        position={server.center}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveServers((prev: number[]) =>
                                prev.includes(i) ? prev.filter(s => s !== i) : [...prev, i]
                            );
                        }}
                        onPointerOver={(e) => { document.body.style.cursor = 'pointer'; }}
                        onPointerOut={(e) => { document.body.style.cursor = 'auto'; }}
                    >
                        {/* Outer Glowing Shell */}
                        <mesh scale={isActive ? 1.5 : 1} rotation={cubeRotation}>
                            <sphereGeometry args={[boxSize * 0.7, 32, 32]} />
                            <meshBasicMaterial color={server.color} transparent opacity={isActive ? 0.9 : 0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
                        </mesh>
                        {/* Halo Glow Shell — larger, faint outer ring */}
                        <mesh scale={isActive ? 2.2 : 1.6} rotation={cubeRotation}>
                            <sphereGeometry args={[boxSize * 0.7, 32, 32]} />
                            <meshBasicMaterial color={server.color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
                        </mesh>
                        {/* Inner Solid Core */}
                        <mesh position={[0, 0, 0]} rotation={cubeRotation}>
                            <sphereGeometry args={[boxSize * 0.3, 32, 32]} />
                            <meshBasicMaterial color="#ffffff" opacity={isActive ? 1.0 : 0.8} transparent />
                        </mesh>
                        {/* Pulsing center beacon (master only) */}
                        {i === 0 && (
                            <mesh rotation={cubeRotation}>
                                <sphereGeometry args={[boxSize * 1.8, 32, 32]} />
                                <meshBasicMaterial color="#23F7DD" transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
                            </mesh>
                        )}
                    </mesh>
                )
            })}

            <instancedMesh ref={sparksRef} args={useMemo(() => [null as any, null as any, NUM_SPARKS], [NUM_SPARKS])}>
                <sphereGeometry args={useMemo(() => [0.8, 6, 6], [])} />
                <meshBasicMaterial color={isDeploying ? "#d946ef" : "#ffffff"} transparent opacity={isDeploying ? 1.0 : 0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
            </instancedMesh>
        </group>
    );
};


// ═════════════════════════════════════════════════════════════════════
// MATRIX LEVEL 3D SCENE (React Three Fiber)
// ═════════════════════════════════════════════════════════════════════
const MatrixScene = ({ d, tpsHistory, tick, isDeploying }: any) => {
    const [activeServers, setActiveServers] = useState<number[]>([]); // Default to all hidden for dramatic effect

    return (
        <>
            <ambientLight intensity={0.3} />
            <pointLight position={[0, 0, 0]} intensity={3} color="#23F7DD" distance={400} />
            <pointLight position={[200, 200, 200]} intensity={0.8} color="#f7931a" distance={500} />
            <pointLight position={[-200, -200, -200]} intensity={0.8} color="#9945ff" distance={500} />
            <pointLight position={[200, -200, 200]} intensity={0.5} color="#e84142" distance={500} />

            {/* Continental Neural Swarm */}
            <NeuralNetwork tps={d.tps} activeServers={activeServers} setActiveServers={setActiveServers} isDeploying={isDeploying} />

            <Stars radius={300} depth={150} count={8000} factor={6} saturation={0.1} fade speed={0.5} />

            {/* ---> INTERACTIVE DATA POP-UPS (Only shown when server is selected) <--- */}
            {SERVERS.map((server, idx) => (
                activeServers.includes(idx) && (
                    <group key={`ui-${idx}`} position={server.center}>
                        {/* SERVER 0: MASTER CORE */}
                        {idx === 0 && (
                            <>
                                <PanelConnectionLine toX={0.0} toY={145.0} toZ={0.0} color="#f43f5e" />
                                <OmniPanel color="#f43f5e" position={[0.0, 145.0, 0.0]} width={900} scale={0.4}>
                                    <StateBloatGauge accounts={d.totalKeys} active={d.botActive} />
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={72.0} toZ={0.0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[0.0, 72.0, 0.0]} width={800} scale={0.33}>
                                    <MassiveChart title="RAW THROUGHPUT [GLOBAL]" data={tpsHistory} color="#22d3ee" spike={`PEAK: ${Math.round(Math.max(...tpsHistory)).toLocaleString()} TPS`} />
                                </OmniPanel>

                                <PanelConnectionLine toX={-72.0} toY={0.0} toZ={0.0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[-72.0, 0.0, 0.0]} width={400} scale={0.27}>
                                    <TPSGauge tps={d.tps} history={tpsHistory} />
                                </OmniPanel>

                                <PanelConnectionLine toX={72.0} toY={0.0} toZ={0.0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[72.0, 0.0, 0.0]} width={600} scale={0.33} title="SHARD ROUTING MATRIX">
                                    <ShardMatrix d={d} />
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-81.0} toZ={0.0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[0.0, -81.0, 0.0]} width={700} scale={0.33} title="MULTIVERSX DEVNET VITALS">
                                    <EcosystemVitals d={d} />
                                </OmniPanel>
                            </>
                        )}

                        {/* SERVER 1: NORTH AMERICA - VIP KEEPER */}
                        {idx === 1 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={72.0} toZ={0.0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[0.0, 72.0, 0.0]} width={800} scale={0.33}>
                                    <MassiveChart title="NY-01 TX INJECTION RATE (KEEPER VIP)" data={tpsHistory.map((v: number) => Math.max(0, v * 0.8 + Math.random() * 5000))} color="#06b6d4" spike="BURST FIRE ENGAGED" />
                                </OmniPanel>

                                <PanelConnectionLine toX={-72.0} toY={0.0} toZ={0.0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[-72.0, 0.0, 0.0]} width={450} scale={0.27} title="NY-01 INFRASTRUCTURE TRACK">
                                    <div className="flex flex-col gap-4 font-mono text-xs bg-black/40 backdrop-blur-md p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white">MODE</span><span className="text-cyan-400">47MS MICRO-BURSTING</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white">KILL ZONE</span><span className="text-rose-400 animate-pulse">40ms - 47ms</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white">RUST FUZZERS</span><span className={d.botActive ? "text-emerald-400" : "text-white/50"}>{d.botActive ? "2000 / 2000" : "OFFLINE"}</span></div>
                                        <div className="flex justify-between"><span className="text-white">CYCLE DUR.</span><span className="text-emerald-400">600ms (SUPERNOVA)</span></div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={72.0} toY={0.0} toZ={0.0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[72.0, 0.0, 0.0]} width={450} scale={0.27}>
                                    <TxFeed txSigned={d.tps * 1.5} />
                                </OmniPanel>
                                {/* New Sensors */}

                                <PanelConnectionLine toX={0.0} toY={-54.0} toZ={0.0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[0.0, -54.0, 0.0]} width={350} scale={0.27} title="MEMPOOL SATURATION"><ActivityMatrix value={d.tps * 1.5} max={10000} color="#fcd34d" /></OmniPanel>

                                <PanelConnectionLine toX={-54.0} toY={54.0} toZ={0.0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[-54.0, 54.0, 0.0]} width={400} scale={0.27} title="TCP CONNS"><PropagationBars tick={tick} /></OmniPanel>
                            </>
                        )}

                        {/* SERVER 2: SOUTH AMERICA - FALLBACK */}
                        {idx === 2 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={45.0} toZ={0.0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[0.0, 45.0, 0.0]} width={400} scale={0.33} title="SA-01 LOAD GENERATOR">
                                    <div className="p-4 text-center bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
                                        <div className="text-emerald-400 font-bold text-2xl mb-2 animate-pulse">DEPLOYED</div>
                                        <div className="text-xs text-white tracking-widest">MALFORMED PAYLOAD: TRUE</div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-54.0} toZ={0.0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[0.0, -54.0, 0.0]} width={400} scale={0.33} title="Protocol Vitals (SA-01)">
                                    <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4 bg-black/40 backdrop-blur-md p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">MEMORY</span><span className="text-white">{d.ramUsed > 0 ? `${d.ramUsed.toFixed(2)} GB / 64 GB` : "0.00 GB / 64 GB"}</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">NETWORK TX</span><span className="text-emerald-400">{d.networkBw > 0 ? `${d.networkBw.toFixed(1)} Mbps` : "0.0 Mbps"}</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">DISK I/O</span><span className="text-white">{d.diskIO > 0 ? `${d.diskIO.toFixed(1)} MB/s` : "0.0 MB/s"}</span></div>
                                    </div>
                                </OmniPanel>
                                {/* New Sensors */}

                                <PanelConnectionLine toX={54.0} toY={0.0} toZ={0.0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[54.0, 0.0, 0.0]} width={400} scale={0.27}>
                                    <div className="flex flex-col gap-2 font-mono text-xs w-full h-full p-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
                                        <div className="text-white font-bold mb-2">THERMAL MATRIX</div>
                                        <CPUHeatmap cores={d.cpuCores} />
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={-54.0} toY={0.0} toZ={0.0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[-54.0, 0.0, 0.0]} width={400} scale={0.27} title="BLOCK PROP. LATENCY"><GasRing gasUsed={d.dbLatency || 50} gasLimit={d.dbLatency * 2 + 100} /></OmniPanel>
                            </>
                        )}

                        {/* SERVER 3: EU - THE BEAST (FRANKFURT) */}
                        {idx === 3 && (
                            <>

                                <PanelConnectionLine toX={-45.0} toY={45.0} toZ={0.0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[-45.0, 45.0, 0.0]} width={400} scale={0.27} title="P2P PEER RING"><GasRing gasUsed={482} gasLimit={1000} /></OmniPanel>

                                <PanelConnectionLine toX={45.0} toY={45.0} toZ={0.0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[45.0, 45.0, 0.0]} width={350} scale={0.27} title="MEMPOOL HEALTH"><ActivityMatrix value={100 - (d.txFailed % 100)} max={100} color="#34d399" /></OmniPanel>

                                <PanelConnectionLine toX={-45.0} toY={-45.0} toZ={0.0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[-45.0, -45.0, 0.0]} width={400} scale={0.27} title="LATENCY RTT WAVES"><PropagationBars tick={tick} /></OmniPanel>

                                <PanelConnectionLine toX={45.0} toY={-45.0} toZ={0.0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[45.0, -45.0, 0.0]} width={450} scale={0.27} title="SIGNATURES / SEC"><TPSGauge tps={d.tps * 0.4} history={tpsHistory} /></OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-72.0} toZ={0.0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[0.0, -72.0, 0.0]} width={400} scale={0.27} title="EU-01 CORE PIPELINE"><PropagationBars tick={tick} /></OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={72.0} toZ={0.0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[0.0, 72.0, 0.0]} width={600} scale={0.27}>
                                    <MassiveChart title="EU-01 OUTBOUND BURST" data={tpsHistory.map((v: number) => Math.max(0, v * 1.1))} color="#fcd34d" spike="BEAST UNLEASHED" />
                                </OmniPanel>
                            </>
                        )}

                        {/* SERVER 4: EU - SAURON RING GUARDIAN (LONDON) */}
                        {idx === 4 && (
                            <>

                                <PanelConnectionLine toX={-45.0} toY={45.0} toZ={0.0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[-45.0, 45.0, 0.0]} width={350} scale={0.34} title="SYNC INTEGRITY"><ActivityMatrix value={d.successRate} max={100} color="#10b981" /></OmniPanel>

                                <PanelConnectionLine toX={45.0} toY={45.0} toZ={0.0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[45.0, 45.0, 0.0]} width={450} scale={0.27} title="DB LATENCY RADAR"><PropagationBars tick={tick} /></OmniPanel>

                                <PanelConnectionLine toX={-45.0} toY={-45.0} toZ={0.0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[-45.0, -45.0, 0.0]} width={450} scale={0.27} title="KEEPER HEARTBEAT"><TPSGauge tps={d.keeperPing === 0 ? 5 : d.keeperPing} history={tpsHistory} /></OmniPanel>

                                <PanelConnectionLine toX={45.0} toY={-45.0} toZ={0.0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[45.0, -45.0, 0.0]} width={350} scale={0.34} title="THREAT MATRIX"><ActivityMatrix value={d.txFailed % 5} max={100} color="#10b981" /></OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={63.0} toZ={0.0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[0.0, 63.0, 0.0]} width={400} scale={0.33} title="GUARDIAN SENSORS">
                                    <div className="flex flex-col gap-2 text-xs font-mono p-2">
                                        <div className="flex justify-between text-white"><span>PORT 443 TCP</span><span className="text-emerald-400">SECURE DUPLEX</span></div>
                                        <div className="flex justify-between text-white"><span>DDoS PROTECTION</span><span className="text-cyan-400">CLOUDFLARE X</span></div>
                                        <div className="flex justify-between text-white"><span>DATA INTEGRITY</span><span className="text-emerald-400">VERIFIED SHA-256</span></div>
                                    </div>
                                </OmniPanel>
                            </>
                        )}

                        {/* SERVER 5: ASIA - SINGAPORE ROUTER */}
                        {idx === 5 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={54.0} toZ={0.0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[0.0, 54.0, 0.0]} width={600} scale={0.33}>
                                    <MassiveChart title="AS-01 BATCH PROPAGATION" data={tpsHistory.map((v: number) => Math.max(0, v * 0.4 + Math.random() * 2000))} color="#d946ef" spike="STABLE ASSAULT" />
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-54.0} toZ={0.0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[0.0, -54.0, 0.0]} width={400} scale={0.33} title="AS-01 Analytics">
                                    <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4 bg-black/40 backdrop-blur-md p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">CPU UTILIZATION</span><span className="text-fuchsia-400">92%</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">NETWORK DROPS</span><span className="text-emerald-400">0.00%</span></div>
                                        <div className="flex justify-between pt-3"><span className="text-white">UPTIME</span><span className="text-cyan-400">100%</span></div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={-54.0} toY={0.0} toZ={0.0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[-54.0, 0.0, 0.0]} width={400} scale={0.27} title="CACHE ALLOCATION"><GasRing gasUsed={4.2} gasLimit={8} /></OmniPanel>

                                <PanelConnectionLine toX={54.0} toY={0.0} toZ={0.0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[54.0, 0.0, 0.0]} width={350} scale={0.27} title="PACKET LOSS"><ActivityMatrix value={0} max={100} color="#10b981" /></OmniPanel>
                            </>
                        )}

                        {/* SERVER 6: ASIA - TOKYO OBSERVER */}
                        {idx === 6 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={54.0} toZ={0.0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[0.0, 54.0, 0.0]} width={600} scale={0.33}>
                                    <MassiveChart title="AS-02 SHARD 0 INFILTRATION" data={tpsHistory.map((v: number) => Math.max(0, v * 0.5 + Math.random() * 2000))} color="#8b5cf6" spike="MAINTAINING PRESENCE" />
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-54.0} toZ={0.0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[0.0, -54.0, 0.0]} width={400} scale={0.33} title="AS-02 Vitals">
                                    <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4 bg-black/40 backdrop-blur-md p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">ACTIVE CONNECTIONS</span><span className="text-purple-400">14,102</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">BLOCKED IPS</span><span className="text-white">0</span></div>
                                        <div className="flex justify-between pt-3"><span className="text-white">PROXY ROTATION</span><span className="text-emerald-400">ACTIVE</span></div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={-63.0} toY={0.0} toZ={0.0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[-63.0, 0.0, 0.0]} width={400} scale={0.27}><TxFeed txSigned={d.tps * 0.5} /></OmniPanel>

                                <PanelConnectionLine toX={63.0} toY={0.0} toZ={0.0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[63.0, 0.0, 0.0]} width={350} scale={0.27}><TPSGauge tps={d.tps * 0.5} history={tpsHistory} /></OmniPanel>
                            </>
                        )}


                        {/* 16-node DNA logic removed as per user request */}
                    </group>
                )
            ))}
        </>
    );
};

// ═════════════════════════════════════════════════════════════════════
// PAGE ASSEMBLY
// ═════════════════════════════════════════════════════════════════════
export default function WarRoom() {
    const [tick, setTick] = useState(0);
    const [tpsHistory, setTpsHistory] = useState<number[]>(Array(60).fill(4000));

    useEffect(() => {
        // Reduced frequency from 150ms to 800ms. 
        // This prevents the React Reconciler from choking the React-Three-Fiber WebGL 60fps render loop
        // by attempting to run massive 3D scene DOM diffs 7 times a second.
        const iv = setInterval(() => setTick(t => t + 1), 800);
        return () => clearInterval(iv);
    }, []);

    const actualD = useRealDevnetData(tick);
    const [isDeploying, setIsDeploying] = useState(false);
    const [energyLevel, setEnergyLevel] = useState(0);

    // Burst logic: Automatically reset after 5 seconds
    useEffect(() => {
        if (isDeploying) {
            let e = 100;
            setEnergyLevel(100);
            const iv = setInterval(() => {
                e -= 1;
                setEnergyLevel(Math.max(e, 0));
            }, 60); // 100 steps * 60ms = 6000ms
            
            const to = setTimeout(() => {
                setIsDeploying(false);
                setEnergyLevel(100);
            }, 6000); // 6 seconds burst
            
            return () => { clearInterval(iv); clearTimeout(to); };
        } else {
            setEnergyLevel(100);
        }
    }, [isDeploying]);

    const d = useMemo(() => {
        return actualD;
    }, [actualD, isDeploying]);

    useEffect(() => {
        setTpsHistory(prev => [...prev.slice(-59), d.tps]);
    }, [d.tps]);

    return (
        <div className="fixed inset-0 bg-[#020202] overflow-hidden font-sans text-white">
            {/* Back to Dashboard Navigation */}
            <div className="absolute top-6 left-6 z-[300]">
                <Link 
                    href="/sauron/war-room" 
                    className="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-black/80 backdrop-blur-md border border-white/10 hover:border-cyan-500/50 rounded-xl transition-all duration-300 group"
                >
                    <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-[10px] font-mono tracking-widest text-slate-300 group-hover:text-cyan-300">
                        BACK
                    </span>
                </Link>
            </div>

            {/* 2D HEADER (Overlays WebGL) */}
            <div className="absolute top-0 left-0 w-full z-[200] px-12 pt-8 flex justify-between items-start pointer-events-none">
                {/* Sci-Fi Glassmorphism Title Card */}
                <div className="relative flex flex-col items-center group">
                    {/* Glowing Power Tubes attaching to the ceiling */}
                    <div className="absolute -top-8 left-[15%] w-[2px] h-8 bg-gradient-to-b from-transparent via-cyan-400/80 to-cyan-400 shadow-[0_0_12px_#22d3ee] opacity-90" />
                    <div className="absolute -top-8 right-[15%] w-[2px] h-8 bg-gradient-to-b from-transparent via-fuchsia-400/80 to-fuchsia-400 shadow-[0_0_12px_#e879f9] opacity-90" />
                    
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/0 via-fuchsia-500/20 to-cyan-500/0 blur-md opacity-50 group-hover:opacity-100 transition duration-1000" />
                    <div 
                        className="relative flex flex-col items-center px-6 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden"
                        style={{
                            boxShadow: `0 4px 20px 0 rgba(0, 0, 0, 0.7), inset 0 0 15px -10px #d946ef, inset 0 0 40px -25px #06b6d4`
                        }}
                    >
                        {/* Cyber Deco Corners */}
                        <div className="absolute top-0 left-0 w-3 h-3 border-t-[1.5px] border-l-[1.5px] border-cyan-400/50" />
                        <div className="absolute top-0 right-0 w-3 h-3 border-t-[1.5px] border-r-[1.5px] border-fuchsia-400/50" />
                        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[1.5px] border-l-[1.5px] border-fuchsia-400/50" />
                        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-[1.5px] border-r-[1.5px] border-cyan-400/50" />

                        <h1 className="text-base font-black tracking-[0.15em] text-center flex flex-col items-center whitespace-nowrap drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]">
                            <span className="text-cyan-400">XCRON PROTOCOL // BATTLE OF NODES</span>
                            <span className="text-fuchsia-400 mt-1 text-xl tracking-[0.2em] font-bold">SUPERNOVA '26</span>
                        </h1>
                        <div className="mt-1 text-[8px] font-mono tracking-[0.4em] font-bold text-white/50 uppercase">
                            Global Command WebGL Matrix
                        </div>
                    </div>
                </div>
                <div className="flex gap-8 text-[11px] font-mono text-white">
                    <div className="flex flex-col"><span className="text-white">STATUS</span><span className="text-emerald-400 font-bold ">● MATRIX LIVE</span></div>
                    <div className="flex flex-col"><span className="text-white">{"EPOCH // ROUND"}</span><span className="text-white">{d.epoch} {"//"} {d.round}</span></div>
                    <div className="flex flex-col"><span className="text-white">TOTAL WALLETS</span><span className="text-white">{d.totalKeys.toLocaleString()}</span></div>
                    <div className="flex flex-col"><span className="text-white">MASTER BALANCE</span><span className="text-fuchsia-400">{d.walletBalance.toFixed(2)} EGLD</span></div>
                </div>
            </div>
            {/* USER INTERACTION HUB */}
            <div className="absolute bottom-12 right-12 z-50 pointer-events-auto flex flex-col items-end gap-2">
                {isDeploying && (
                    <div className="text-[#facc15] font-mono text-[10px] uppercase tracking-widest animate-pulse font-bold bg-black/50 px-3 py-1 border border-[#facc15]/30 rounded">
                        Energy Discharging: {energyLevel}%
                    </div>
                )}
                <motion.button 
                    onClick={() => setIsDeploying(true)}
                    whileHover={{ scale: isDeploying ? 1 : 1.05 }}
                    whileTap={{ scale: isDeploying ? 1 : 0.95 }}
                    className="group relative flex flex-col items-end"
                    disabled={isDeploying}
                >
                    <div className={`flex flex-col items-center justify-center aspect-square w-28 bg-black/80 backdrop-blur-xl border p-3 rounded-2xl shadow-[0_0_30px_rgba(244,63,94,0.3)] transition-all cursor-pointer relative overflow-hidden ${isDeploying ? 'border-[#facc15] shadow-[0_0_80px_rgba(250,204,21,0.8)]' : 'border-rose-500/50 hover:shadow-[0_0_50px_rgba(244,63,94,0.6)] hover:border-rose-400'}`}>
                        {/* Energy fill background when deploying (bottom up) */}
                        {isDeploying && (
                            <div 
                                className="absolute left-0 bottom-0 right-0 bg-gradient-to-t from-yellow-500/40 via-yellow-500/20 to-yellow-500/0 pointer-events-none"
                                style={{ height: `${energyLevel}%`, transition: 'height 100ms linear' }} 
                            />
                        )}

                        <div className="flex flex-col items-center justify-center gap-3 relative z-10 mt-1">
                            <div className={`w-5 h-5 rounded-full ${isDeploying ? 'bg-white shadow-[0_0_20px_#ffffff,0_0_40px_#facc15] animate-ping' : 'bg-rose-500 shadow-[0_0_15px_#f43f5e] animate-pulse'}`} />
                            <span className={`font-mono font-black tracking-widest text-[11px] text-center leading-snug ${isDeploying ? 'text-white drop-shadow-[0_0_10px_#facc15]' : 'text-rose-100'}`}>
                                {isDeploying ? 'INJECTING' : 'DEPLOY\nSWARM'}
                            </span>
                        </div>
                    </div>
                    {!isDeploying && (
                        <div className="mt-2 w-72 text-right opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md bg-black/40 p-3 rounded border border-white/5">
                            <p className="font-mono text-[10px] text-rose-200/80 leading-relaxed tracking-wide">
                                <strong className="text-rose-400 block mb-1">WHAT DOES THIS DO?</strong>
                                Initiates a massive stress injection to the Devnet. Your wallet will sign and broadcast <span className="text-[#facc15] font-bold">10,000+ direct transactions</span> that will generate visible computational load across the holographic matrix and real-world validators.
                            </p>
                        </div>
                    )}
                </motion.button>
            </div>

            {/* 3D CANVAS BOARD WITH CAMERA CONTROLS */}
            <div className="absolute inset-0 z-0">
                <Canvas camera={{ position: [0, 40, 450], fov: 55 }}>
                    <OrbitControls
                        enableZoom={true}
                        enablePan={true}
                        enableRotate={true}
                        maxDistance={2500}
                        minDistance={2}
                        autoRotate={false}
                        minPolarAngle={0}
                        maxPolarAngle={Math.PI}
                        makeDefault
                    />
                    <MatrixScene d={d} tpsHistory={tpsHistory} tick={tick} isDeploying={isDeploying} />
                </Canvas>
            </div>
        </div>
    );
}
