"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

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

// ── DATA BRIDGE (Temporal Mock -> Next: Live API) ──
function useSimulatedData(tick: number) {
    return useMemo(() => {
        const t = tick * 0.1;
        // Simulamos el ataque Swarm real
        const tps = 48000 + Math.sin(t) * 2000 + Math.random() * 500;
        const finality = 59.2 + Math.sin(t * 0.8) * 8 + Math.random() * 2;
        const buffer = 600 - finality - 42.8 - 15.2;
        const cpuCores = Array.from({ length: 18 }, (_, i) => 80 + Math.sin(t + i * 0.5) * 15 + Math.random() * 5); // Alta carga
        const ramUsed = 12.4 + Math.sin(t * 0.3) * 1.2;
        const txSigned = Math.floor(1489200 + tick * 470 + Math.random() * 100);
        const txFailed = Math.floor(12 + Math.random() * 3);
        const nonceFront = 28847 + tick * 3;
        const pendingPool = Math.floor(45000 + Math.sin(t * 2) * 5000);
        const networkBw = 84.2 + Math.sin(t * 1.1) * 12;
        const diskIO = 2.1 + Math.sin(t * 0.4) * 0.8;
        const round = 6663 + Math.floor(tick / 5);
        const epoch = 547;
        const shardPeers = [42, 38, 41, 44];
        const uptimeH = 47 + Math.floor(tick / 360);

        const successRate = 99.8 + Math.random() * 0.2;
        const blockSize = 48.2 + Math.sin(t * 0.9) * 8;

        // Extra Metrics
        const activeNodes = 150 - Math.floor(Math.random() * 5);
        const missedTasks = Math.floor(t % 5);
        const avgGasPrice = 0.005 + Math.sin(t * 0.5) * 0.001;
        const dbLatency = 1.2 + Math.sin(t) * 0.5;

        // Reflejando las 100,000 Wallets Hydra 
        const totalKeys = 100000;
        const activeWallets = Math.floor(65000 + Math.sin(t * 0.4) * 5000);
        // Balance estático para no alarmar al usuario con la onda senoidal cayendo
        const walletBalance = 380.69;
        const keeperPing = 2 + Math.sin(t * 2) * 1;
        const gasUsed = Math.floor(12000000 + Math.sin(t * 1.3) * 3000000); // Required for bottom widget still
        const gasLimit = 15000000;

        return {
            tps, finality, buffer, cpuCores, ramUsed, txSigned, txFailed,
            nonceFront, pendingPool, networkBw, diskIO, round, epoch,
            shardPeers, uptimeH, gasUsed, gasLimit, successRate, blockSize,
            activeWallets, totalKeys, walletBalance, keeperPing,
            activeNodes, missedTasks, avgGasPrice, dbLatency
        };
    }, [tick]);
}

// ═════════════════════════════════════════════════════════════════════
// RESTORED WIDGETS (Transparent & Suspended 3D aesthetics)
// ═════════════════════════════════════════════════════════════════════

const TPSGauge = ({ tps, history }: { tps: number, history: number[] }) => {
    // Treat TPS as a volume level up to 100k
    const MAX_TPS = 100000;
    const numBlocks = 40; // Muchas mas barras

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 relative bg-[#050505]/95 rounded-lg border border-white/10">
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
        <div className="w-full h-full p-4 flex flex-col justify-center bg-[#050505]/95 rounded-lg border border-white/10">
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
        <div className="w-full h-full p-6 flex flex-col bg-[#050505]/95 rounded-lg border border-white/10">
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
        <div className="w-full h-full p-6 flex flex-col justify-center bg-[#050505]/95 rounded-lg border border-white/10">
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
        <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-[#050505]/95 rounded-lg border border-white/10">
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
        <div className="w-full h-full p-6 flex flex-col bg-[#050505]/95 rounded-lg border border-white/10">
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
        <div className="w-full h-full flex flex-col p-6 rounded-xl overflow-hidden relative bg-[#050505]/95 border border-white/10">
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
        <Html position={position} scale={scale} transform sprite className="select-none pointer-events-auto">
            <div
                style={{
                    width: `${width}px`,
                    color: '#ffffff',
                }}
                className="flex flex-col bg-[#050505]/95 rounded-lg border border-white/10 p-4 shadow-xl"
            >
                {title && (
                    <div className="pb-4 flex items-center justify-between mb-4 border-b-2"
                        style={{ borderColor: color, boxShadow: '0 0 1px 1px rgba(0,0,0,0.5)' }}>
                        <span className="font-mono text-2xl font-black tracking-[0.2em] uppercase">
                            {title}
                        </span>
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#fff', boxShadow: '0 0 1px 1px rgba(0,0,0,0.5)' }} />
                    </div>
                )}
                <div className="flex-1 font-bold text-[16px] leading-relaxed tracking-wide">
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
        <div className="w-full p-4 rounded-xl bg-[#050505]/95 border border-white/10">
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
// COMPONENT: STAT CARD (Compact KPI — ZERO GLOW)
// ═════════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, unit, color, sub }: { label: string; value: React.ReactNode; unit?: string; color: string; sub?: string }) => (
    <motion.div
        className="p-4 relative cursor-pointer min-w-0 bg-[#050505]/95 rounded-lg border border-white/10"
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 0.2 }}
    >
        <div className="text-[14px] lg:text-[16px] font-bold tracking-widest font-mono uppercase mb-2 truncate" style={{ color: '#fff' }}>{label}</div>
        <div className="flex items-baseline gap-2 whitespace-nowrap min-w-0">
            <span className="text-4xl lg:text-5xl font-black text-white truncate">{value}</span>
            {unit && <span className="text-[14px] lg:text-lg text-white font-bold font-mono shrink-0">{unit}</span>}
        </div>
        {sub && <div className="text-[12px] lg:text-[14px] text-white font-mono mt-1 truncate">{sub}</div>}
        <div className="absolute bottom-0 left-0 w-1/2 h-[4px] rounded-full" style={{ backgroundColor: '#fff', boxShadow: '0 0 1px 1px rgba(0,0,0,0.5)' }} />
    </motion.div>
);



// ═════════════════════════════════════════════════════════════════════
// COMPONENT: 3D NEURAL SWARM — Flat Hexagonal Star + Ecosystem Ring
// ═════════════════════════════════════════════════════════════════════
const INNER_R = 120; // Inner satellite hex ring radius (massive distance)
const OUTER_R = 200; // Outer ecosystem ring radius

// Ecosystem project metadata (name + brand color)
const ECOSYSTEM_PROJECTS = [
    { name: "xExchange", color: "#01f2f0", tvl: "$142M", type: "DEX" },
    { name: "Hatom", color: "#facc15", tvl: "$98M", type: "LENDING" },
    { name: "AshSwap", color: "#f472b6", tvl: "$24M", type: "STABLE DEX" },
    { name: "xMoney", color: "#22c55e", tvl: "—", type: "PAYMENTS" },
    { name: "OneDex", color: "#c084fc", tvl: "$8M", type: "DEX" },
    { name: "Itheum", color: "#f43f5e", tvl: "—", type: "DATA NFT" },
    { name: "ZoidPay", color: "#3b82f6", tvl: "—", type: "CRYPTO CARD" },
    { name: "BwareLabs", color: "#a3e635", tvl: "—", type: "INFRA / RPC" },
];

const SERVERS = [
    // 0: Master Core (MultiversX / XCron center)
    { center: new THREE.Vector3(0, 0, 0), color: new THREE.Color("#ffffff"), hex: "#ffffff", count: 40, size: 0.9 },

    // 1-6: Inner Satellite Ring (flat hexagon on XY plane)
    ...Array(6).fill(0).map((_, i) => ({
        center: new THREE.Vector3(
            Math.cos(i * Math.PI / 3) * INNER_R,
            Math.sin(i * Math.PI / 3) * INNER_R,
            0
        ),
        color: new THREE.Color(["#06b6d4", "#f43f5e", "#eab308", "#10b981", "#d946ef", "#8b5cf6"][i]),
        hex: ["#06b6d4", "#f43f5e", "#eab308", "#10b981", "#d946ef", "#8b5cf6"][i],
        count: 20,
        size: 0.5
    })),

    // 7-14: Ecosystem Projects (8 Corners of the Outer Cube)
    ...[
        { idx: 0, pos: new THREE.Vector3(+OUTER_R, +OUTER_R, +OUTER_R) }, // 7: (+,+,+)
        { idx: 1, pos: new THREE.Vector3(-OUTER_R, +OUTER_R, +OUTER_R) }, // 8: (-,+,+)
        { idx: 2, pos: new THREE.Vector3(+OUTER_R, -OUTER_R, +OUTER_R) }, // 9: (+,-,+)
        { idx: 3, pos: new THREE.Vector3(-OUTER_R, -OUTER_R, +OUTER_R) }, // 10: (-,-,+)
        { idx: 4, pos: new THREE.Vector3(+OUTER_R, +OUTER_R, -OUTER_R) }, // 11: (+,+,-)
        { idx: 5, pos: new THREE.Vector3(-OUTER_R, +OUTER_R, -OUTER_R) }, // 12: (-,+,-)
        { idx: 6, pos: new THREE.Vector3(+OUTER_R, -OUTER_R, -OUTER_R) }, // 13: (+,-,-)
        { idx: 7, pos: new THREE.Vector3(-OUTER_R, -OUTER_R, -OUTER_R) }, // 14: (-,-,-)
    ].map((item) => ({
        center: item.pos,
        color: new THREE.Color(ECOSYSTEM_PROJECTS[item.idx].color),
        hex: ECOSYSTEM_PROJECTS[item.idx].color,
        count: 10,
        size: 0.45
    }))
];

const NeuralNetwork = ({ tps, activeServers, setActiveServers }: { tps: number; activeServers: number[]; setActiveServers: any }) => {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.LineBasicMaterial>(null);
    const sparksRef = useRef<THREE.InstancedMesh>(null);

    // Calculate node points, lines and colors once
    const { points, lines, lineColors } = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        const ptColors: THREE.Color[] = [];
        const lns: THREE.Vector3[] = [];
        const lnCols: number[] = [];

        // 1. Generate conduit lines creating the petal-shaped star arms
        const masterCenter = SERVERS[0].center;
        const conduitLinesPerSatellite = 50; // Thick sweeping petals for inner star
        const conduitLinesPerOuter = 15; // Lighter threads for ecosystem ring

        // Helper function to draw a thick, jittered conduit between two exact nodes
        const createConduit = (sourceIdx: number, targetIdx: number, numLines: number, spreadMultiplier: number) => {
            const sourceInfo = SERVERS[sourceIdx];
            const targetInfo = SERVERS[targetIdx];
            const sourceCenter = sourceInfo.center;
            const targetCenter = targetInfo.center;

            // To prevent lines from starting inside or far away from the cube, 
            // we spawn them strictly on the surface sphere of the cube.
            // Box size is server.size * 1.5. Distance from center to corner is roughly * 1.732 of half-size.
            // Using a simple radius multiplier to hit the visual surface boundary:
            const sourceRadius = sourceInfo.size * 1.2;
            const targetRadius = targetInfo.size * 1.2;

            pts.push(sourceCenter);
            ptColors.push(sourceInfo.color);
            if (targetIdx !== 0 && !pts.includes(targetCenter)) {
                pts.push(targetCenter);
                ptColors.push(targetInfo.color);
            }

            for (let c = 0; c < numLines; c++) {
                // Direction of the main tube
                const dir = new THREE.Vector3().subVectors(targetCenter, sourceCenter).normalize();

                // Surface emission points (random point on a sphere slightly larger than the cube)
                const randomSourceSurface = new THREE.Vector3(
                    (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2
                ).normalize().multiplyScalar(sourceRadius);

                const randomTargetSurface = new THREE.Vector3(
                    (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2
                ).normalize().multiplyScalar(targetRadius);

                const startPoint = new THREE.Vector3().copy(sourceCenter).add(randomSourceSurface);
                const endPoint = new THREE.Vector3().copy(targetCenter).add(randomTargetSurface);

                // Conduit tube spread (chaos in the middle)
                const randomPerp = new THREE.Vector3(
                    (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2
                ).cross(dir).normalize();

                const spread = (Math.random() * spreadMultiplier);
                const offset = randomPerp.clone().multiplyScalar(spread);

                const segments = 8;
                let prevPt = new THREE.Vector3().copy(startPoint);

                for (let seg = 1; seg <= segments; seg++) {
                    const fraction = seg / segments;
                    // Tapering to 0 at the start and end so it connects cleanly to the surface
                    const taper = Math.sin(fraction * Math.PI);
                    const currentOffset = offset.clone().multiplyScalar(taper);

                    const nextPt = new THREE.Vector3().lerpVectors(startPoint, endPoint, fraction).add(currentOffset);

                    lns.push(prevPt, nextPt);

                    // Gradient color mixing
                    const colorAtPrev = new THREE.Color().lerpColors(sourceInfo.color, targetInfo.color, (seg - 1) / segments);
                    const colorAtNext = new THREE.Color().lerpColors(sourceInfo.color, targetInfo.color, fraction);

                    lnCols.push(colorAtPrev.r, colorAtPrev.g, colorAtPrev.b);
                    lnCols.push(colorAtNext.r, colorAtNext.g, colorAtNext.b);

                    prevPt = nextPt;
                }
            }
        };

        // LAYER 1: Inner Satellites (1-6) → Master Core (0)
        for (let i = 1; i <= 6; i++) {
            createConduit(i, 0, conduitLinesPerSatellite, 8.0);
        }

        // LAYER 2: Ecosystem Corners (7-14) → Nearest Inner Satellite
        for (let i = 7; i < SERVERS.length; i++) {
            const nearestSat = ((i - 7) % 6) + 1;
            createConduit(i, nearestSat, conduitLinesPerOuter, 5.0);
        }

        // LAYER 3: Cube Edges — All 12 edges of the outer cube wireframe
        const cubeEdges = [
            [7, 8], [7, 9], [7, 11],   // From corner (+,+,+)
            [8, 10], [8, 12],           // From corner (-,+,+)
            [9, 10], [9, 13],           // From corner (+,-,+)
            [10, 14],                   // From corner (-,-,+)
            [11, 12], [11, 13],         // From corner (+,+,-)
            [12, 14],                   // From corner (-,+,-)
            [13, 14]                    // From corner (+,-,-)
        ];
        cubeEdges.forEach(([a, b]) => createConduit(a, b, 8, 4.0));


        return { points: pts, lines: lns, lineColors: new Float32Array(lnCols) };
    }, []);

    const lineGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry().setFromPoints(lines);
        geo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
        return geo;
    }, [lines, lineColors]);

    // Sparks (Live Transactions) logic - Flying ALONG the strict conduits
    const NUM_SPARKS = 150; // Optimized spark particles to prevent WebGL GPU stalling
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
                spark.progress += spark.speed * delta;

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
                // Scale spark based on progress (fade in/out effect)
                const scale = Math.sin(spark.progress * Math.PI) * 1.5;
                dummy.scale.set(scale, scale, scale);

                dummy.updateMatrix();
                sparksRef.current!.setMatrixAt(i, dummy.matrix);
            });
            sparksRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, 0]}>
            {/* The laser pathways/circuitry - Crisp rendering */}
            <lineSegments geometry={lineGeo}>
                <lineBasicMaterial ref={materialRef} vertexColors transparent opacity={0.4} depthWrite={false} />
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
                        <cylinderGeometry args={[4, 4, 1, 8]} />
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
                            <boxGeometry args={[boxSize, boxSize, boxSize]} />
                            <meshBasicMaterial color={server.color} transparent opacity={isActive ? 0.9 : 0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
                        </mesh>
                        {/* Inner Solid Core */}
                        <mesh position={[0, 0, 0]} rotation={cubeRotation}>
                            <boxGeometry args={[boxSize * 0.4, boxSize * 0.4, boxSize * 0.4]} />
                            <meshBasicMaterial color="#ffffff" opacity={isActive ? 1.0 : 0.7} transparent />
                        </mesh>
                    </mesh>
                )
            })}

            {/* Transaction Sparks (InstancedMesh for performance) */}
            <instancedMesh ref={sparksRef} args={useMemo(() => [null as any, null as any, NUM_SPARKS], [NUM_SPARKS])}>
                <sphereGeometry args={useMemo(() => [0.035, 8, 8], [])} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
            </instancedMesh>
        </group>
    );
};


// ═════════════════════════════════════════════════════════════════════
// MATRIX LEVEL 3D SCENE (React Three Fiber)
// ═════════════════════════════════════════════════════════════════════
const MatrixScene = ({ d, tpsHistory, tick }: any) => {
    const [activeServers, setActiveServers] = useState<number[]>([0]); // Default to Master Core

    return (
        <>
            <ambientLight intensity={0.4} />
            <pointLight position={[0, 0, 0]} intensity={2} color="#06b6d4" />

            {/* Continental Neural Swarm */}
            <NeuralNetwork tps={d.tps} activeServers={activeServers} setActiveServers={setActiveServers} />

            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

            {/* ---> INTERACTIVE DATA POP-UPS (Only shown when server is selected) <--- */}
            {SERVERS.map((server, idx) => (
                activeServers.includes(idx) && (
                    <group key={`ui-${idx}`} position={server.center}>
                        {/* SERVER 0: MASTER CORE */}
                        {idx === 0 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={14.4} toZ={0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[0.0, 14.4, 0]} width={800} scale={1.1}>
                                    <MassiveChart title="RAW THROUGHPUT [GLOBAL]" data={tpsHistory} color="#22d3ee" spike={`PEAK: ${Math.round(Math.max(...tpsHistory)).toLocaleString()} TPS`} />
                                </OmniPanel>

                                <PanelConnectionLine toX={-14.4} toY={0.0} toZ={0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[-14.4, 0.0, 0]} width={400} scale={0.9}>
                                    <TPSGauge tps={d.tps} history={tpsHistory} />
                                </OmniPanel>

                                <PanelConnectionLine toX={14.4} toY={0.0} toZ={0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[14.4, 0.0, 0]} width={600} scale={1.1} title="SHARD ROUTING MATRIX">
                                    <ShardMatrix d={d} />
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-14.4} toZ={0} color={SERVERS[0].hex} />
                                <OmniPanel color={SERVERS[0].hex} position={[0.0, -14.4, 0]} width={450} scale={0.9}>
                                    <PropagationBars tick={tick} />
                                </OmniPanel>
                            </>
                        )}

                        {/* SERVER 1: NORTH AMERICA - VIP KEEPER */}
                        {idx === 1 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={14.4} toZ={0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[0.0, 14.4, 0]} width={800} scale={1.1}>
                                    <MassiveChart title="NY-01 TX INJECTION RATE (KEEPER VIP)" data={tpsHistory.map((v: number) => Math.max(0, v * 0.8 + Math.random() * 5000))} color="#06b6d4" spike="BURST FIRE ENGAGED" />
                                </OmniPanel>

                                <PanelConnectionLine toX={-14.4} toY={0.0} toZ={0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[-14.4, 0.0, 0]} width={450} scale={0.9} title="NY-01 THREAT VECTOR">
                                    <div className="flex flex-col gap-4 font-mono text-xs bg-[#050505]/95 p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white">MODE</span><span className="text-cyan-400">SNIPER BATCHING</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white">GOSSIP INJECTION</span><span className="text-white">DIRECT (PORT 37330)</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white">RUST WORKERS</span><span className="text-emerald-400">200 / 200</span></div>
                                        <div className="flex justify-between"><span className="text-white">CROSS-SHARD TARGET</span><span className="text-rose-400">SHARD 2 OVERLOAD</span></div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={14.4} toY={0.0} toZ={0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[14.4, 0.0, 0]} width={450} scale={0.9}>
                                    <TxFeed txSigned={d.tps * 1.5} />
                                </OmniPanel>
                                {/* New Sensors */}

                                <PanelConnectionLine toX={0.0} toY={-10.8} toZ={0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[0.0, -10.8, 0]} width={350} scale={0.9}><StatCard label="MEM POOL PIPELINE" value={(d.pendingPool * 0.4).toLocaleString()} color="#fcd34d" /></OmniPanel>

                                <PanelConnectionLine toX={-10.8} toY={10.8} toZ={0} color={SERVERS[1].hex} />
                                <OmniPanel color={SERVERS[1].hex} position={[-10.8, 10.8, 0]} width={300} scale={0.8}><StatCard label="TCP CONNECTIONS" value="12,482" unit="ESTABLISHED" color="#22d3ee" /></OmniPanel>
                            </>
                        )}

                        {/* SERVER 2: SOUTH AMERICA - FALLBACK */}
                        {idx === 2 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={9.0} toZ={0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[0.0, 9.0, 0]} width={400} scale={1.1} title="SA-01 STATE BLOAT GENERATOR">
                                    <div className="p-4 text-center bg-[#050505]/95 rounded-lg border border-white/10">
                                        <div className="text-rose-500 font-bold text-2xl mb-2 animate-pulse">DEPLOYED</div>
                                        <div className="text-xs text-white tracking-widest">PAYLOAD COMPRESSION: OFF</div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-10.8} toZ={0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[0.0, -10.8, 0]} width={400} scale={1.1} title="Protocol Vitals (SA-01)">
                                    <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4 bg-[#050505]/95 p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">MEMORY</span><span className="text-white">58.4 GB / 64 GB</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">NETWORK TX</span><span className="text-emerald-400">2.8 Gbps</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">DISK I/O</span><span className="text-white">850.2 MB/s</span></div>
                                    </div>
                                </OmniPanel>
                                {/* New Sensors */}

                                <PanelConnectionLine toX={10.8} toY={0.0} toZ={0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[10.8, 0.0, 0]} width={400} scale={0.9}>
                                    <div className="flex flex-col gap-2 font-mono text-xs w-full h-full p-4 bg-[#050505]/95 rounded-lg border border-white/10">
                                        <div className="text-white font-bold mb-2">THERMAL MATRIX</div>
                                        <CPUHeatmap cores={d.cpuCores} />
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={-10.8} toY={0.0} toZ={0} color={SERVERS[2].hex} />
                                <OmniPanel color={SERVERS[2].hex} position={[-10.8, 0.0, 0]} width={300} scale={0.9}><StatCard label="BLOCK PROPAGATION" value="3.1" unit="ms" color="#fbbf24" /></OmniPanel>
                            </>
                        )}

                        {/* SERVER 3: EU - THE BEAST (FRANKFURT) */}
                        {idx === 3 && (
                            <>

                                <PanelConnectionLine toX={-9.0} toY={9.0} toZ={0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[-9.0, 9.0, 0]} width={350} scale={1.2}><StatCard label="P2P PEERS" value="482" unit="NODES" color="#eab308" /></OmniPanel>

                                <PanelConnectionLine toX={9.0} toY={9.0} toZ={0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[9.0, 9.0, 0]} width={350} scale={1.2}><StatCard label="MEMPOOL REJECTS" value="0.01" unit="%" color="#34d399" /></OmniPanel>

                                <PanelConnectionLine toX={-9.0} toY={-9.0} toZ={0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[-9.0, -9.0, 0]} width={350} scale={1.2}><StatCard label="LATENCY RTT" value="5.2" unit="ms" color="#34d399" /></OmniPanel>

                                <PanelConnectionLine toX={9.0} toY={-9.0} toZ={0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[9.0, -9.0, 0]} width={350} scale={1.2}><StatCard label="SIGNATURES/SEC" value={(d.tps * 0.4).toLocaleString()} color="#f8fafc" /></OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-14.4} toZ={0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[0.0, -14.4, 0]} width={400} scale={0.9} title="EU-01 CORE PIPELINE"><PropagationBars tick={tick} /></OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={14.4} toZ={0} color={SERVERS[3].hex} />
                                <OmniPanel color={SERVERS[3].hex} position={[0.0, 14.4, 0]} width={600} scale={0.9}>
                                    <MassiveChart title="EU-01 OUTBOUND BURST" data={tpsHistory.map((v: number) => Math.max(0, v * 1.1))} color="#fcd34d" spike="BEAST UNLEASHED" />
                                </OmniPanel>
                            </>
                        )}

                        {/* SERVER 4: EU - SAURON RING GUARDIAN (LONDON) */}
                        {idx === 4 && (
                            <>

                                <PanelConnectionLine toX={-9.0} toY={9.0} toZ={0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[-9.0, 9.0, 0]} width={350} scale={1.2}><StatCard label="GUARDIAN STATUS" value={"SYNCED"} color="#10b981" /></OmniPanel>

                                <PanelConnectionLine toX={9.0} toY={9.0} toZ={0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[9.0, 9.0, 0]} width={350} scale={1.2}><StatCard label="DB LATENCY" value={d.dbLatency.toFixed(1)} unit="ms" color="#10b981" /></OmniPanel>

                                <PanelConnectionLine toX={-9.0} toY={-9.0} toZ={0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[-9.0, -9.0, 0]} width={350} scale={1.2}><StatCard label="KEEPER PING" value={d.keeperPing.toFixed(1)} unit="ms" color="#10b981" /></OmniPanel>

                                <PanelConnectionLine toX={9.0} toY={-9.0} toZ={0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[9.0, -9.0, 0]} width={350} scale={1.2}><StatCard label="THREAT DETECTED" value={"NONE"} color="#10b981" /></OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={12.6} toZ={0} color={SERVERS[4].hex} />
                                <OmniPanel color={SERVERS[4].hex} position={[0.0, 12.6, 0]} width={400} scale={1.1} title="GUARDIAN SENSORS">
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

                                <PanelConnectionLine toX={0.0} toY={10.8} toZ={0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[0.0, 10.8, 0]} width={600} scale={1.1}>
                                    <MassiveChart title="AS-01 BATCH PROPAGATION" data={tpsHistory.map((v: number) => Math.max(0, v * 0.4 + Math.random() * 2000))} color="#d946ef" spike="STABLE ASSAULT" />
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-10.8} toZ={0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[0.0, -10.8, 0]} width={400} scale={1.1} title="AS-01 Analytics">
                                    <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4 bg-[#050505]/95 p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">CPU UTILIZATION</span><span className="text-fuchsia-400">92%</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">NETWORK DROPS</span><span className="text-emerald-400">0.00%</span></div>
                                        <div className="flex justify-between pt-3"><span className="text-white">UPTIME</span><span className="text-cyan-400">100%</span></div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={-10.8} toY={0.0} toZ={0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[-10.8, 0.0, 0]} width={300} scale={0.9}><StatCard label="ROUTING CACHE" value="4.2" unit="GB / 8GB" color="#d946ef" /></OmniPanel>

                                <PanelConnectionLine toX={10.8} toY={0.0} toZ={0} color={SERVERS[5].hex} />
                                <OmniPanel color={SERVERS[5].hex} position={[10.8, 0.0, 0]} width={300} scale={0.9}><StatCard label="PACKET LOSS" value="0.0001" unit="%" color="#10b981" /></OmniPanel>
                            </>
                        )}

                        {/* SERVER 6: ASIA - TOKYO OBSERVER */}
                        {idx === 6 && (
                            <>

                                <PanelConnectionLine toX={0.0} toY={10.8} toZ={0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[0.0, 10.8, 0]} width={600} scale={1.1}>
                                    <MassiveChart title="AS-02 SHARD 0 INFILTRATION" data={tpsHistory.map((v: number) => Math.max(0, v * 0.5 + Math.random() * 2000))} color="#8b5cf6" spike="MAINTAINING PRESENCE" />
                                </OmniPanel>

                                <PanelConnectionLine toX={0.0} toY={-10.8} toZ={0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[0.0, -10.8, 0]} width={400} scale={1.1} title="AS-02 Vitals">
                                    <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4 bg-[#050505]/95 p-4 rounded-lg border border-white/10">
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">ACTIVE CONNECTIONS</span><span className="text-purple-400">14,102</span></div>
                                        <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white">BLOCKED IPS</span><span className="text-white">0</span></div>
                                        <div className="flex justify-between pt-3"><span className="text-white">PROXY ROTATION</span><span className="text-emerald-400">ACTIVE</span></div>
                                    </div>
                                </OmniPanel>

                                <PanelConnectionLine toX={-12.6} toY={0.0} toZ={0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[-12.6, 0.0, 0]} width={400} scale={0.9}><TxFeed txSigned={d.tps * 0.5} /></OmniPanel>

                                <PanelConnectionLine toX={12.6} toY={0.0} toZ={0} color={SERVERS[6].hex} />
                                <OmniPanel color={SERVERS[6].hex} position={[12.6, 0.0, 0]} width={350} scale={0.9}><TPSGauge tps={d.tps * 0.5} history={tpsHistory} /></OmniPanel>
                            </>
                        )}


                        {idx >= 7 && idx <= 14 && (() => {
                            const proj = ECOSYSTEM_PROJECTS[idx - 7];
                            if (!proj) return null;
                            return (
                                <>
                                    <PanelConnectionLine toX={0.0} toY={8.0} toZ={0} color={SERVERS[idx].hex} />
                                    <OmniPanel color={SERVERS[idx].hex} position={[0.0, 8.0, 0]} width={350} scale={1.0} title={proj.name.toUpperCase()}>
                                        <div className="flex flex-col gap-3 font-mono text-xs bg-[#050505]/95 p-4 rounded-lg border border-white/10">
                                            <div className="flex justify-between border-b border-white/[0.05] pb-2">
                                                <span className="text-white">TYPE</span>
                                                <span style={{ color: proj.color }} className="font-bold">{proj.type}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-white/[0.05] pb-2">
                                                <span className="text-white">TVL</span>
                                                <span className="text-white font-bold">{proj.tvl}</span>
                                            </div>
                                            <div className="flex justify-between border-b border-white/[0.05] pb-2">
                                                <span className="text-white">CHAIN</span>
                                                <span className="text-cyan-400">MULTIVERSX</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-white">STATUS</span>
                                                <span className="text-emerald-400 font-bold">● LIVE</span>
                                            </div>
                                        </div>
                                    </OmniPanel>
                                </>
                            );
                        })()}
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

    const d = useSimulatedData(tick);

    useEffect(() => {
        setTpsHistory(prev => [...prev.slice(-59), d.tps]);
    }, [d.tps]);

    return (
        <div className="fixed inset-0 bg-[#020202] overflow-hidden font-sans text-white">
            {/* 2D HEADER (Overlays WebGL) */}
            <div className="absolute top-0 left-0 w-full z-[200] px-12 pb-2 flex justify-between items-end pointer-events-none">
                {/* Neon Sign Structure */}
                <div className="relative flex flex-col items-center">
                    {/* Hanging wires */}
                    <div className="flex w-full justify-between px-4 mb-[-2px] z-0 opacity-40">
                        <div className="w-[2px] h-4 bg-gradient-to-b from-black to-zinc-600 shadow-xl" />
                        <div className="w-[2px] h-4 bg-gradient-to-b from-black to-zinc-600 shadow-xl" />
                    </div>
                    {/* Sign Box */}
                    <div className="relative border-b border-t border-[#00f0ff] bg-[#020202]/95 px-4 py-1 shadow-[0_0_10px_-5px_#00f0ff,inset_0_0_5px_-5px_#00f0ff] z-10 flex flex-col items-center ">
                        <h1
                            className="text-base font-black tracking-widest text-center flex flex-col items-center whitespace-nowrap"
                            style={{
                                color: '#00f0ff', // Crisp Vivid Cyan
                                // Tight, sharp glow
                            }}
                        >
                            <span>XCRON PROTOCOL BATTLE OF NODES</span>
                            <span style={{ color: '#ccff00', }} className="mt-1">SUPERNOVA &apos;26</span>
                        </h1>
                        <div className="text-[8px] font-mono tracking-[0.4em] font-bold text-white uppercase opacity-90">
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

            {/* 3D CANVAS BOARD WITH CAMERA CONTROLS */}
            <div className="absolute inset-0 z-0">
                <Canvas camera={{ position: [0, 0, 160], fov: 60 }}>
                    <OrbitControls
                        enableZoom={true}
                        enablePan={true}
                        enableRotate={true}
                        maxDistance={1000}
                        minDistance={2}
                        makeDefault
                    />
                    <MatrixScene d={d} tpsHistory={tpsHistory} tick={tick} />
                </Canvas>
            </div>
        </div>
    );
}
