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
        const walletBalance = 380.5 + Math.sin(t * 0.2) * 0.3; // Aproximación realista del Master
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
    const fillValue = Math.min(100, (tps / 60000) * 100);
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-black/20 backdrop-blur-md relative">
            <div className="text-sm font-bold text-white/70 tracking-widest mb-4 z-10 w-full text-center">LIVE TPS</div>
            <div className="relative w-40 h-40 flex items-center justify-center z-10">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#22d3ee" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 - (283 * fillValue) / 100} className="transition-all duration-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-black text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"><AnimCounter value={tps} /></span>
                    <span className="text-xs text-cyan-400 font-bold tracking-widest mt-1">TX/s</span>
                </div>
            </div>
            <div className="mt-4 w-full h-12 opacity-50 z-10"><Sparkline data={history} color="#22d3ee" h={40} /></div>
        </div>
    );
};

const Pipeline = ({ tick }: { tick: number }) => {
    const stages = ['MEMPOOL', 'CONSENSUS', 'EXECUTION', 'FINALITY'];
    const activeIdx = tick % 4;
    return (
        <div className="w-full h-full p-4 flex flex-col justify-center bg-black/20 backdrop-blur-md">
            <div className="text-[11px] font-bold text-white/70 tracking-widest mb-4">TX PIPELINE INJECTION</div>
            <div className="flex justify-between items-center w-full relative">
                <div className="absolute left-0 right-0 h-[1px] bg-white/10 top-1/2 -translate-y-1/2 z-0" />
                {stages.map((stage, i) => (
                    <div key={stage} className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`w-3 h-3 rounded-full transition-all duration-300 ${i === activeIdx ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,1)] transform scale-125' : i < activeIdx ? 'bg-white/40' : 'bg-black border border-white/20'}`} />
                        <span className={`text-[9px] font-mono ${i === activeIdx ? 'text-cyan-400 font-bold drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]' : 'text-white/40'}`}>{stage}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CPUHeatmap = ({ cores }: { cores: number[] }) => {
    return (
        <div className="w-full h-full p-6 flex flex-col bg-black/20 backdrop-blur-md">
            <div className="text-sm font-bold text-white/70 tracking-widest mb-4 flex justify-between">
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
        <div className="w-full h-full p-6 flex flex-col justify-center bg-black/20 backdrop-blur-md">
            <div className="text-sm font-bold text-white/70 tracking-widest mb-4">SWARM LATENCY</div>
            <div className="flex flex-col gap-4 flex-1 justify-center">
                {nodes.map((node, i) => {
                    const ping = 10 + Math.sin(tick + i) * 5 + Math.random() * 4;
                    return (
                        <div key={node} className="flex flex-col gap-2">
                            <div className="flex justify-between text-xs font-mono font-bold text-white/60"><span>{node}</span><span>{ping.toFixed(1)}ms</span></div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div className="h-full bg-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" animate={{ width: `${Math.min(100, (ping / 30) * 100)}%` }} />
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
        <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-black/20 backdrop-blur-md">
            <div className="text-sm font-bold text-white/70 tracking-widest mb-4">BLOCK GAS UTILIZATION</div>
            <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="8" strokeDasharray="251" strokeDashoffset={251 - (251 * fill) / 100} className="transition-all duration-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-black text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]">{fill.toFixed(0)}%</span>
                </div>
            </div>
        </div>
    );
};

const TxFeed = ({ txSigned }: { txSigned: number }) => {
    return (
        <div className="w-full h-full p-6 flex flex-col bg-black/20 backdrop-blur-md">
            <div className="text-sm font-bold text-white/70 tracking-widest mb-4 flex justify-between">
                <span>LIVE TX FEED</span>
                <span className="text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(52,211,153,0.8)] animate-pulse">● REC</span>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col gap-2 text-xs font-mono font-bold opacity-80 mt-1">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="flex justify-between border-b border-white/[0.05] pb-2">
                        <span className="text-white/30">[{txSigned - i}]</span>
                        <span className="text-cyan-400/90">erd1...{Math.random().toString(36).substring(7, 11)}</span>
                        <span className="text-amber-400/90">{Array.from({ length: 4 }).map(() => (Math.random() * 10 | 0)).join('')}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: MASSIVE CHART (XOXNO Style)
// ═════════════════════════════════════════════════════════════════════
const MassiveChart = ({ title, data, color, subtitle, spike }: { title: string; data: number[]; color: string; subtitle?: string; spike?: string }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const w = 400;
    const h = 100;

    // Add jitter to lines like XOXNO
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 10) + Math.random() * 5}`).join(' ');

    return (
        <div className="w-full h-full flex flex-col p-6 bg-black/40 border border-white/[0.05] rounded-xl overflow-hidden relative">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="text-sm font-bold text-white/60 tracking-wider mb-1 flex items-center gap-3">
                        {title}
                        {spike && <span className="text-xs px-2 py-1 rounded-sm bg-rose-500/20 text-rose-400 font-bold">{spike}</span>}
                    </div>
                </div>
            </div>

            {/* Chart Area */}
            <div className="relative w-full flex-1">
                {/* Y-Axis scale */}
                <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-[11px] font-mono font-bold text-white/30">
                    <span>{Math.round(max).toLocaleString()}</span>
                    <span>{Math.round(min + range / 2).toLocaleString()}</span>
                    <span>{Math.round(min).toLocaleString()}</span>
                </div>

                <div className="absolute inset-y-0 left-12 right-0 border-l border-b border-white/[0.1]">
                    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
                        <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="miter" />
                    </svg>
                </div>
            </div>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════
// COMPONENT: SHARD MATRIX
// ═════════════════════════════════════════════════════════════════════
const ShardMatrix = ({ d }: { d: any }) => {
    return (
        <div className="w-full p-4 bg-[#111216] border border-white/[0.05] rounded-xl">
            <div className="text-[13px] font-bold text-white/90 mb-4">Shard Matrix</div>
            <div className="w-full text-left text-[11px] font-mono">
                <div className="grid grid-cols-8 gap-4 text-white/40 mb-3 border-b border-white/[0.05] pb-2">
                    <div className="col-span-1">Shard</div>
                    <div className="col-span-2 text-right">Nonce</div>
                    <div className="col-span-1 text-right">TPS</div>
                    <div className="col-span-1 text-right">User</div>
                    <div className="col-span-1 text-right">Block Time</div>
                    <div className="col-span-1 text-right">Tx</div>
                    <div className="col-span-1 text-right">Age</div>
                </div>
                {[0, 1, 2, "Metachain"].map((shard, i) => (
                    <div key={i} className="grid grid-cols-8 gap-4 text-white/80 py-2 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02]">
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
                        <div className="col-span-1 text-right text-white/50">
                            {(shard === "Metachain" ? 0 : d.tps / 3 + Math.random() * 500).toFixed(1)}
                        </div>
                        <div className="col-span-1 text-right text-emerald-400">
                            600ms
                        </div>
                        <div className="col-span-1 text-right">
                            {Math.floor(d.tps * 0.6 + Math.random() * 200).toLocaleString()}
                        </div>
                        <div className="col-span-1 text-right text-white/50">
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
        className="p-2 relative cursor-pointer min-w-0"
        whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.03)' }}
        transition={{ duration: 0.2 }}
    >
        <div className="text-[10px] lg:text-[11px] font-bold tracking-widest font-mono uppercase mb-1 truncate" style={{ color }}>{label}</div>
        <div className="flex items-baseline gap-1 whitespace-nowrap min-w-0">
            <span className="text-xl lg:text-2xl font-black text-white truncate">{value}</span>
            {unit && <span className="text-[10px] lg:text-sm text-white/50 font-mono shrink-0">{unit}</span>}
        </div>
        {sub && <div className="text-[9px] lg:text-[10px] text-white/45 font-mono mt-0.5 truncate">{sub}</div>}
        <div className="absolute bottom-0 left-0 w-1/3 h-[2px] rounded-full" style={{ backgroundColor: color }} />
    </motion.div>
);



// ═════════════════════════════════════════════════════════════════════
// COMPONENT: 3D NEURAL NETWORK (Protocol Swarm Activity)
// ═════════════════════════════════════════════════════════════════════
const NeuralNetwork = ({ tps }: { tps: number }) => {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.LineBasicMaterial>(null);

    // Calculate node points once
    const { points, lines } = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        const lns: THREE.Vector3[] = [];

        // Generate 150 points (representing our Swarm nodes) in a cylinder shape
        for (let i = 0; i < 150; i++) {
            const theta = Math.random() * Math.PI * 2;
            const y = (Math.random() - 0.5) * 40;
            const r = 10 + Math.random() * 5;
            pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
        }

        // Connect nearby nodes
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                if (pts[i].distanceTo(pts[j]) < 8) {
                    lns.push(pts[i], pts[j]);
                }
            }
        }
        return { points: pts, lines: lns };
    }, []);

    // Create a geometry for the lines
    const lineGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry().setFromPoints(lines);
        return geo;
    }, [lines]);

    useFrame((state, delta) => {
        if (groupRef.current) {
            // Slow rotation of the entire network
            groupRef.current.rotation.y += delta * 0.05;
        }
        if (materialRef.current) {
            // The intensity of the neural laser depends on the TPS
            // Base intensity + TPS spikes
            const baseOpacity = 0.15;
            const tpsSpike = Math.min(1.0, (tps - 40000) / 20000); // Normalizes TPS to a 0-1 spike

            // Pulse effect using sine wave + TPS intensity
            const pulse = (Math.sin(state.clock.elapsedTime * 2) + 1) / 2;
            materialRef.current.opacity = baseOpacity + (tpsSpike * 0.5) + (pulse * 0.2);

            // Color shifts towards white/magenta under heavy load
            const baseColor = new THREE.Color("#06b6d4"); // Cyan
            const hotColor = new THREE.Color("#f43f5e"); // Rose/Magenta
            materialRef.current.color.lerpColors(baseColor, hotColor, tpsSpike * 0.8);
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, -20]}>
            {/* The laser connections between nodes */}
            <lineSegments geometry={lineGeo}>
                <lineBasicMaterial ref={materialRef} color="#06b6d4" transparent opacity={0.2} linewidth={1} blending={THREE.AdditiveBlending} />
            </lineSegments>

            {/* The nodes themselves (glowing points) */}
            {points.map((p, i) => (
                <mesh key={i} position={p}>
                    <sphereGeometry args={[0.15, 8, 8]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
                </mesh>
            ))}
        </group>
    );
};


// ═════════════════════════════════════════════════════════════════════
// MATRIX LEVEL 3D SCENE (React Three Fiber)
// ═════════════════════════════════════════════════════════════════════
const MatrixScene = ({ d, tpsHistory, tick }: any) => {

    return (
        <>
            <ambientLight intensity={0.4} />
            <pointLight position={[0, 0, 0]} intensity={2} color="#06b6d4" />

            {/* Neural Network Swarm Core that reacts to TPS */}
            <NeuralNetwork tps={d.tps} />

            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

            {/* --- TRIPLE MONITOR SETUP IN 3D SPACE --- */}
            {/* LEFT PANEL */}
            <Html transform position={[-11, 0, -3]} rotation={[0, 0.6, 0]} scale={0.55} zIndexRange={[100, 0]}>
                <div className="w-[450px] h-[750px] flex flex-col gap-4 py-4 drop-shadow-[0_0_80px_rgba(6,-182,212,0.1)]">
                    <div className="flex-1 bg-black/70 backdrop-blur-xl border border-white/[0.08] rounded-tl-2xl rounded-bl-2xl rounded-r-md overflow-hidden flex flex-col">
                        <TPSGauge tps={d.tps} history={tpsHistory} />
                    </div>
                    <div className="flex-[1.5] bg-black/70 backdrop-blur-xl border border-white/[0.08] rounded-tl-md rounded-bl-2xl rounded-r-md overflow-hidden flex flex-col">
                        <TxFeed txSigned={d.tps * 2} />
                    </div>
                    <div className="flex-1 bg-black/70 backdrop-blur-xl border border-white/[0.08] rounded-tl-md rounded-bl-2xl rounded-r-md overflow-hidden flex flex-col">
                        <GasRing gasUsed={d.gasUsed} gasLimit={d.gasLimit} />
                    </div>
                </div>
            </Html>

            {/* CENTER PANEL */}
            <Html transform position={[0, 0, -1]} rotation={[0, 0, 0]} scale={0.55} zIndexRange={[100, 0]}>
                <div className="w-[1150px] h-[750px] flex flex-col gap-6 drop-shadow-[0_0_120px_rgba(0,0,0,0.8)]">
                    {/* Top Stats - Larger Text */}
                    <div className="grid grid-cols-4 gap-4 shrink-0">
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">LIVE FINALITY</div>
                            <div className="text-6xl font-black text-cyan-400 tracking-tighter">{d.finality.toFixed(1)}<span className="text-xl text-white/30 ml-2">ms</span></div>
                        </div>
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">TX SIGNED</div>
                            <div className="text-6xl font-black text-emerald-400 tracking-tighter line-clamp-1">{d.txSigned.toLocaleString()}</div>
                        </div>
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">PENDING POOL</div>
                            <div className="text-6xl font-black text-rose-400 tracking-tighter">{d.pendingPool.toLocaleString()}</div>
                        </div>
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">KEEPER PING</div>
                            <div className="text-6xl font-black text-amber-400 tracking-tighter">{d.keeperPing.toFixed(1)}<span className="text-xl text-white/30 ml-2">ms</span></div>
                        </div>
                    </div>

                    {/* Middle Stats - High Density Addition */}
                    <div className="grid grid-cols-4 gap-4 shrink-0">
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6 text-center">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">NETWORK SUCCESS</div>
                            <div className="text-5xl font-black text-emerald-400/90">{d.successRate.toFixed(2)}<span className="text-xl">%</span></div>
                        </div>
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6 text-center">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">AVERAGE GAS PRICE</div>
                            <div className="text-5xl font-black text-fuchsia-400">{d.avgGasPrice.toFixed(4)}<span className="text-xl ml-1">Ξ</span></div>
                        </div>
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6 text-center">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">DB LATENCY</div>
                            <div className="text-5xl font-black text-purple-400">{d.dbLatency.toFixed(1)}<span className="text-xl ml-1">ms</span></div>
                        </div>
                        <div className="bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-md p-6 text-center">
                            <div className="text-sm text-white/50 font-bold tracking-widest mb-2 font-mono">ACTIVE NODES</div>
                            <div className="text-5xl font-black text-white">{d.activeNodes}<span className="text-xl ml-1 text-white/30">/150</span></div>
                        </div>
                    </div>

                    {/* Smaller Charts at bottom */}
                    <div className="flex-1 min-h-0 grid grid-cols-2 gap-4">
                        <div className="h-full bg-black/80 backdrop-blur-xl rounded-xl border border-white/[0.08] overflow-hidden">
                            <MassiveChart
                                title="RAW THROUGHPUT"
                                data={tpsHistory}
                                color="#22d3ee"
                                spike={`PEAK: ${Math.round(Math.max(...tpsHistory)).toLocaleString()} TPS`}
                            />
                        </div>
                        <div className="h-full bg-black/80 backdrop-blur-xl rounded-xl border border-white/[0.08] overflow-hidden">
                            <MassiveChart
                                title="MEMPOOL SATURATION LEVEL"
                                data={tpsHistory.map((v: number) => Math.max(0, v * 1.5 - 20000 + Math.random() * 5000))}
                                color="#f43f5e"
                                spike="SEVERE SATURATION"
                            />
                        </div>
                    </div>
                </div>
            </Html>

            {/* RIGHT PANEL */}
            <Html transform position={[11, 0, -3]} rotation={[0, -0.6, 0]} scale={0.55} zIndexRange={[100, 0]}>
                <div className="w-[450px] h-[750px] flex flex-col gap-4 py-4 drop-shadow-[0_0_80px_rgba(6,-182,212,0.1)]">
                    <div className="flex-1 bg-black/70 backdrop-blur-xl border border-white/[0.08] rounded-tr-2xl rounded-br-2xl rounded-l-md overflow-hidden flex flex-col">
                        <CPUHeatmap cores={d.cpuCores} />
                    </div>
                    <div className="flex-[1.5] bg-black/70 backdrop-blur-xl border border-white/[0.08] rounded-tr-md rounded-br-2xl rounded-l-md overflow-hidden flex flex-col">
                        <PropagationBars tick={tick} />
                    </div>
                    <div className="flex-1 bg-black/70 backdrop-blur-xl border border-white/[0.08] rounded-tr-md rounded-br-2xl rounded-l-md overflow-hidden flex flex-col p-8">
                        <div className="text-sm font-bold text-white/80 tracking-widest mb-6">SYSTEM VITALS</div>
                        <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold">
                            <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">MEMORY</span><span className="text-white">{d.ramUsed.toFixed(1)} GB</span></div>
                            <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">NETWORK</span><span className="text-emerald-400">{d.networkBw.toFixed(1)} Gbps</span></div>
                            <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">DISK I/O</span><span className="text-white">{d.diskIO.toFixed(1)} MB/s</span></div>
                            <div className="flex justify-between pt-3"><span className="text-white/40">UPTIME</span><span className="text-cyan-400">99.98%</span></div>
                        </div>
                    </div>
                </div>
            </Html>
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
        const iv = setInterval(() => setTick(t => t + 1), 150);
        return () => clearInterval(iv);
    }, []);

    const d = useSimulatedData(tick);

    useEffect(() => {
        setTpsHistory(prev => [...prev.slice(-59), d.tps]);
    }, [d.tps]);

    return (
        <div className="fixed inset-0 bg-[#020202] overflow-hidden font-sans">
            {/* 2D HEADER (Overlays WebGL) */}
            <div className="absolute top-0 left-0 w-full z-[200] px-12 pt-6 pb-2 border-b border-white/[0.05] flex justify-between items-end bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white mb-1 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]"><span className="text-cyan-500">XCron</span> SUPERNOVA</h1>
                        <div className="text-[10px] font-mono tracking-[0.2em] text-cyan-400 uppercase">Global Command WebGL Matrix</div>
                    </div>
                </div>
                <div className="flex gap-8 text-[11px] font-mono text-white/50">
                    <div className="flex flex-col"><span className="text-white/30">STATUS</span><span className="text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]">● MATRIX LIVE</span></div>
                    <div className="flex flex-col"><span className="text-white/30">EPOCH // ROUND</span><span className="text-white">{d.epoch} // {d.round}</span></div>
                    <div className="flex flex-col"><span className="text-white/30">TOTAL WALLETS</span><span className="text-white">{d.totalKeys.toLocaleString()}</span></div>
                    <div className="flex flex-col"><span className="text-white/30">MASTER BALANCE</span><span className="text-fuchsia-400">{d.walletBalance.toFixed(2)} EGLD</span></div>
                </div>
            </div>

            {/* 3D CANVAS BOARD WITH CAMERA CONTROLS */}
            <div className="absolute inset-0 z-0">
                <Canvas camera={{ position: [0, 0, 16], fov: 60 }}>
                    <OrbitControls
                        enableZoom={true}
                        enablePan={true}
                        enableRotate={true}
                        maxDistance={50}
                        minDistance={2}
                        maxPolarAngle={Math.PI / 1.5}
                        minPolarAngle={Math.PI / 4}
                        makeDefault
                    />
                    <MatrixScene d={d} tpsHistory={tpsHistory} tick={tick} />
                </Canvas>
            </div>
        </div>
    );
}
