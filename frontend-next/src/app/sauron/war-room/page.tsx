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
        <div className="w-full h-full flex flex-col items-center justify-center p-4 relative">
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
        <div className="w-full h-full p-4 flex flex-col justify-center">
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
        <div className="w-full h-full p-6 flex flex-col">
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
        <div className="w-full h-full p-6 flex flex-col justify-center">
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
        <div className="w-full h-full p-6 flex flex-col items-center justify-center">
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
        <div className="w-full h-full p-6 flex flex-col">
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
// COMPONENT: OMNI PANEL (3D HTML Overlay)
// ═════════════════════════════════════════════════════════════════════
const OmniPanel = ({ title, children, position, scale = 1, width = 400, color = "#06b6d4" }: any) => {
    return (
        <Html position={position} scale={scale} transform sprite className="select-none pointer-events-auto">
            <div
                style={{ width: `${width}px`, borderColor: color, boxShadow: `0 0 30px ${color}33` }}
                className="bg-[#0f172a]/80 backdrop-blur-md border rounded-lg flex flex-col overflow-hidden text-white"
            >
                {title && (
                    <div className="p-3 border-b border-white/10 flex items-center justify-between"
                        style={{ background: `linear-gradient(to right, ${color}33, transparent)` }}>
                        <span className="font-mono text-xs font-bold tracking-[0.2em]" style={{ color }}>{title}</span>
                        <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }} />
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.8 }} />
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
                        </div>
                    </div>
                )}
                <div className="p-4 flex-1">
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
// COMPONENT: 3D CENTRAL & 6 SATELLITE NEURAL SWARM (Clean Circuitry)
// ═════════════════════════════════════════════════════════════════════
const SERVERS = [
    // 0: Master Protocol Core
    { center: new THREE.Vector3(0, 0, 0), color: new THREE.Color("#ffffff"), count: 40, size: 0.8 },
    // 1-6: Satellite Region Clusters (Hexagon at Radius 25)
    ...Array(6).fill(0).map((_, i) => ({
        center: new THREE.Vector3(
            Math.cos(i * Math.PI / 3) * 25,
            (Math.random() - 0.5) * 10,
            Math.sin(i * Math.PI / 3) * 25
        ),
        color: new THREE.Color(["#06b6d4", "#f43f5e", "#eab308", "#10b981", "#d946ef", "#8b5cf6"][i]),
        count: 20,
        size: 0.4
    }))
];

const NeuralNetwork = ({ tps, activeServer, setActiveServer }: { tps: number, activeServer: number | null, setActiveServer: (i: number | null) => void }) => {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.LineBasicMaterial>(null);
    const sparksRef = useRef<THREE.InstancedMesh>(null);

    // Calculate node points, lines and colors once
    const { points, lines, lineColors } = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        const ptColors: THREE.Color[] = [];
        const lns: THREE.Vector3[] = [];
        const lnCols: number[] = [];

        // 1. Generate strictly defined, dense conduits from each Satellite to the Master Core
        const masterCenter = SERVERS[0].center;
        const conduitLinesPerSatellite = 25; // Thicker bundles

        for (let i = 1; i <= 6; i++) {
            const satCenter = SERVERS[i].center;
            const satColor = SERVERS[i].color;

            // Add the server points themselves to the strict points list
            if (i === 1) {
                pts.push(masterCenter);
                ptColors.push(SERVERS[0].color);
            }
            pts.push(satCenter);
            ptColors.push(satColor);

            // Generate bundled, slightly jittered parallel lines making up the conduit
            for (let c = 0; c < conduitLinesPerSatellite; c++) {
                // Determine a slight random offset vector perpendicular to the main direction
                const dir = new THREE.Vector3().subVectors(masterCenter, satCenter).normalize();
                const randomPerp = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(dir).normalize();
                // Radius of the conduit tube
                const spread = (Math.random() * 2.5);
                const offset = randomPerp.multiplyScalar(spread);

                // Create a segmented line for this strand
                const segments = 12;
                let prevPt = new THREE.Vector3().copy(satCenter).add(offset.clone().multiplyScalar(0.2));

                for (let seg = 1; seg <= segments; seg++) {
                    const fraction = seg / segments;
                    // Interpolate position along the main path, adding the offset to create the tube, tapering near the ends
                    const taper = Math.sin(fraction * Math.PI);
                    const currentOffset = offset.clone().multiplyScalar(taper);

                    const nextPt = new THREE.Vector3().lerpVectors(satCenter, masterCenter, fraction).add(currentOffset);

                    // Add the line segment
                    lns.push(prevPt, nextPt);

                    // Color gradient from Satellite to Master
                    const colorAtPrev = new THREE.Color().lerpColors(satColor, SERVERS[0].color, (seg - 1) / segments);
                    const colorAtNext = new THREE.Color().lerpColors(satColor, SERVERS[0].color, fraction);

                    lnCols.push(colorAtPrev.r, colorAtPrev.g, colorAtPrev.b);
                    lnCols.push(colorAtNext.r, colorAtNext.g, colorAtNext.b);

                    prevPt = nextPt;
                }
            }
        }

        return { points: pts, lines: lns, lineColors: new Float32Array(lnCols) };
    }, []);

    const lineGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry().setFromPoints(lines);
        geo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
        return geo;
    }, [lines, lineColors]);

    // Sparks (Live Transactions) logic - Flying ALONG the strict conduits
    const NUM_SPARKS = 250;
    const sparkData = useMemo(() => {
        return Array(NUM_SPARKS).fill(0).map(() => {
            // Pick a random line segment to start
            const lineIndex = Math.floor(Math.random() * (lines.length / 2)) * 2;
            return {
                start: lines[lineIndex] || new THREE.Vector3(),
                end: lines[lineIndex + 1] || new THREE.Vector3(),
                progress: Math.random(),
                // Much faster speed for the demo burst effect
                speed: 0.8 + Math.random() * 2.0,
                // Assign to a random line chunk to follow
                lineIdx: lineIndex
            };
        });
    }, [lines]);

    // Dummy Matrix for instanced mesh updates
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state, delta) => {
        // Pulse the network based on TPS
        if (materialRef.current) {
            const intensity = Math.min(1, tps / 10000); // 10k TPS = max intensity
            materialRef.current.opacity = 0.2 + (0.5 * intensity) + (Math.sin(state.clock.elapsedTime * 2) * 0.1);
        }

        // Move transaction sparks strictly along the segment lines
        if (sparksRef.current && lines.length > 0) {
            sparkData.forEach((spark, i) => {
                spark.progress += spark.speed * delta;

                if (spark.progress > 1) {
                    spark.progress = 0;
                    // Move to the next connected segment, or restart if at the end of the conduit
                    let nextIdx = spark.lineIdx + 2;
                    // Simple heuristic: if the next segment starts where we ended, follow it
                    if (lines[nextIdx] && lines[nextIdx].distanceToSquared(spark.end) < 0.1) {
                        spark.lineIdx = nextIdx;
                    } else {
                        // Reset to a random new starting segment
                        spark.lineIdx = Math.floor(Math.random() * (lines.length / 2)) * 2;
                    }
                    spark.start = lines[spark.lineIdx];
                    spark.end = lines[spark.lineIdx + 1];
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
            {/* The laser pathways/circuitry */}
            <lineSegments geometry={lineGeo}>
                <lineBasicMaterial ref={materialRef} vertexColors transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
            </lineSegments>

            {/* The 7 EXPLICIT SERVERS ONLY (No tiny noise dots) */}
            {SERVERS.map((server, i) => {
                const isActive = activeServer === i;
                return (
                    <mesh
                        key={`server-${i}`}
                        position={server.center}
                        onClick={(e) => { e.stopPropagation(); setActiveServer(isActive ? null : i); }}
                        onPointerOver={(e) => { document.body.style.cursor = 'pointer'; }}
                        onPointerOut={(e) => { document.body.style.cursor = 'auto'; }}
                    >
                        {/* Outer Glowing Shell */}
                        <sphereGeometry args={[isActive ? server.size * 1.5 : server.size, 24, 24]} />
                        <meshBasicMaterial color={server.color} transparent opacity={isActive ? 0.9 : 0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
                        {/* Inner Solid Core */}
                        <mesh position={[0, 0, 0]}>
                            <sphereGeometry args={[server.size * 0.4, 12, 12]} />
                            <meshBasicMaterial color="#ffffff" opacity={isActive ? 1.0 : 0.7} transparent />
                        </mesh>
                    </mesh>
                )
            })}

            {/* Transaction Sparks (InstancedMesh for performance) */}
            <instancedMesh ref={sparksRef} args={[undefined as any, undefined as any, NUM_SPARKS]}>
                <sphereGeometry args={[0.035, 8, 8]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
            </instancedMesh>
        </group>
    );
};


// ═════════════════════════════════════════════════════════════════════
// MATRIX LEVEL 3D SCENE (React Three Fiber)
// ═════════════════════════════════════════════════════════════════════
const MatrixScene = ({ d, tpsHistory, tick }: any) => {
    const [activeServer, setActiveServer] = useState<number | null>(0); // Default to Master Core

    return (
        <>
            <ambientLight intensity={0.4} />
            <pointLight position={[0, 0, 0]} intensity={2} color="#06b6d4" />

            {/* Continental Neural Swarm */}
            <NeuralNetwork tps={d.tps} activeServer={activeServer} setActiveServer={setActiveServer} />

            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

            {/* ---> INTERACTIVE DATA POP-UPS (Only shown when server is selected) <--- */}
            {activeServer !== null && (
                <group position={SERVERS[activeServer].center}>
                    {/* SERVER 0: MASTER CORE */}
                    {activeServer === 0 && (
                        <>
                            <OmniPanel color={SERVERS[0].color} position={[0, 8, 0]} width={800} scale={0.6}>
                                <MassiveChart title="RAW THROUGHPUT [GLOBAL]" data={tpsHistory} color="#22d3ee" spike={`PEAK: ${Math.round(Math.max(...tpsHistory)).toLocaleString()} TPS`} />
                            </OmniPanel>
                            <OmniPanel color={SERVERS[0].color} position={[-8, 0, 0]} width={400} scale={0.5}>
                                <TPSGauge tps={d.tps} history={tpsHistory} />
                            </OmniPanel>
                            <OmniPanel color={SERVERS[0].color} position={[8, 0, 0]} width={600} scale={0.6} title="SHARD ROUTING MATRIX">
                                <ShardMatrix d={d} />
                            </OmniPanel>
                            <OmniPanel color={SERVERS[0].color} position={[0, -8, 0]} width={450} scale={0.5}>
                                <PropagationBars tick={tick} />
                            </OmniPanel>
                        </>
                    )}

                    {/* SERVER 1: NORTH AMERICA - VIP KEEPER */}
                    {activeServer === 1 && (
                        <>
                            <OmniPanel color={SERVERS[1].color} position={[0, 8, 0]} width={800} scale={0.6}>
                                <MassiveChart title="NY-01 TX INJECTION RATE (KEEPER VIP)" data={tpsHistory.map((v: number) => Math.max(0, v * 0.8 + Math.random() * 5000))} color="#06b6d4" spike="BURST FIRE ENGAGED" />
                            </OmniPanel>
                            <OmniPanel color={SERVERS[1].color} position={[-8, 0, 0]} width={450} scale={0.5} title="NY-01 THREAT VECTOR">
                                <div className="flex flex-col gap-4 font-mono text-xs">
                                    <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white/40">MODE</span><span className="text-cyan-400">SNIPER BATCHING</span></div>
                                    <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white/40">GOSSIP INJECTION</span><span className="text-white">DIRECT (PORT 37330)</span></div>
                                    <div className="flex justify-between border-b border-white/[0.05] pb-2"><span className="text-white/40">RUST WORKERS</span><span className="text-emerald-400">200 / 200</span></div>
                                    <div className="flex justify-between"><span className="text-white/40">CROSS-SHARD TARGET</span><span className="text-rose-400">SHARD 2 OVERLOAD</span></div>
                                </div>
                            </OmniPanel>
                            <OmniPanel color={SERVERS[1].color} position={[8, 0, 0]} width={450} scale={0.5}>
                                <TxFeed txSigned={d.tps * 1.5} />
                            </OmniPanel>
                            {/* New Sensors */}
                            <OmniPanel color={SERVERS[1].color} position={[0, -6, 0]} width={350} scale={0.5}><StatCard label="MEM POOL PIPELINE" value={(d.pendingPool * 0.4).toLocaleString()} color="#fcd34d" /></OmniPanel>
                            <OmniPanel color={SERVERS[1].color} position={[-6, 6, 0]} width={300} scale={0.4}><StatCard label="TCP CONNECTIONS" value="12,482" unit="ESTABLISHED" color="#22d3ee" /></OmniPanel>
                        </>
                    )}

                    {/* SERVER 2: SOUTH AMERICA - FALLBACK */}
                    {activeServer === 2 && (
                        <>
                            <OmniPanel color={SERVERS[2].color} position={[0, 5, 0]} width={400} scale={0.6} title="SA-01 STATE BLOAT GENERATOR">
                                <div className="p-4 text-center">
                                    <div className="text-rose-500 font-bold text-2xl mb-2 animate-pulse">DEPLOYED</div>
                                    <div className="text-xs text-white/50 tracking-widest">PAYLOAD COMPRESSION: OFF</div>
                                </div>
                            </OmniPanel>
                            <OmniPanel color={SERVERS[2].color} position={[0, -6, 0]} width={400} scale={0.6} title="Protocol Vitals (SA-01)">
                                <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4">
                                    <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">MEMORY</span><span className="text-white">58.4 GB / 64 GB</span></div>
                                    <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">NETWORK TX</span><span className="text-emerald-400">2.8 Gbps</span></div>
                                    <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">DISK I/O</span><span className="text-white">850.2 MB/s</span></div>
                                </div>
                            </OmniPanel>
                            {/* New Sensors */}
                            <OmniPanel color={SERVERS[2].color} position={[6, 0, 0]} width={400} scale={0.5}>
                                <div className="flex flex-col gap-2 font-mono text-xs w-full h-full p-2">
                                    <div className="text-white/40 font-bold mb-2">THERMAL MATRIX</div>
                                    <CPUHeatmap cores={d.cpuCores} />
                                </div>
                            </OmniPanel>
                            <OmniPanel color={SERVERS[2].color} position={[-6, 0, 0]} width={300} scale={0.5}><StatCard label="BLOCK PROPAGATION" value="3.1" unit="ms" color="#fbbf24" /></OmniPanel>
                        </>
                    )}

                    {/* SERVER 3: EU - THE BEAST (FRANKFURT) */}
                    {activeServer === 3 && (
                        <>
                            <OmniPanel color={SERVERS[3].color} position={[-5, 5, 0]} width={350} scale={0.7}><StatCard label="P2P PEERS" value="482" unit="NODES" color="#eab308" /></OmniPanel>
                            <OmniPanel color={SERVERS[3].color} position={[5, 5, 0]} width={350} scale={0.7}><StatCard label="MEMPOOL REJECTS" value="0.01" unit="%" color="#34d399" /></OmniPanel>
                            <OmniPanel color={SERVERS[3].color} position={[-5, -5, 0]} width={350} scale={0.7}><StatCard label="LATENCY RTT" value="5.2" unit="ms" color="#34d399" /></OmniPanel>
                            <OmniPanel color={SERVERS[3].color} position={[5, -5, 0]} width={350} scale={0.7}><StatCard label="SIGNATURES/SEC" value={(d.tps * 0.4).toLocaleString()} color="#f8fafc" /></OmniPanel>
                            <OmniPanel color={SERVERS[3].color} position={[0, -8, 0]} width={400} scale={0.5} title="EU-01 CORE PIPELINE"><PropagationBars tick={tick} /></OmniPanel>
                            <OmniPanel color={SERVERS[3].color} position={[0, 8, 0]} width={600} scale={0.5}>
                                <MassiveChart title="EU-01 OUTBOUND BURST" data={tpsHistory.map((v: number) => Math.max(0, v * 1.1))} color="#fcd34d" spike="BEAST UNLEASHED" />
                            </OmniPanel>
                        </>
                    )}

                    {/* SERVER 4: EU - SAURON RING GUARDIAN (LONDON) */}
                    {activeServer === 4 && (
                        <>
                            <OmniPanel color={SERVERS[4].color} position={[-5, 5, 0]} width={350} scale={0.7}><StatCard label="GUARDIAN STATUS" value={"SYNCED"} color="#10b981" /></OmniPanel>
                            <OmniPanel color={SERVERS[4].color} position={[5, 5, 0]} width={350} scale={0.7}><StatCard label="DB LATENCY" value={d.dbLatency.toFixed(1)} unit="ms" color="#10b981" /></OmniPanel>
                            <OmniPanel color={SERVERS[4].color} position={[-5, -5, 0]} width={350} scale={0.7}><StatCard label="KEEPER PING" value={d.keeperPing.toFixed(1)} unit="ms" color="#10b981" /></OmniPanel>
                            <OmniPanel color={SERVERS[4].color} position={[5, -5, 0]} width={350} scale={0.7}><StatCard label="THREAT DETECTED" value={"NONE"} color="#10b981" /></OmniPanel>
                            <OmniPanel color={SERVERS[4].color} position={[0, 7, 0]} width={400} scale={0.6} title="GUARDIAN SENSORS">
                                <div className="flex flex-col gap-2 text-xs font-mono p-2">
                                    <div className="flex justify-between text-white/60"><span>PORT 443 TCP</span><span className="text-emerald-400">SECURE DUPLEX</span></div>
                                    <div className="flex justify-between text-white/60"><span>DDoS PROTECTION</span><span className="text-cyan-400">CLOUDFLARE X</span></div>
                                    <div className="flex justify-between text-white/60"><span>DATA INTEGRITY</span><span className="text-emerald-400">VERIFIED SHA-256</span></div>
                                </div>
                            </OmniPanel>
                        </>
                    )}

                    {/* SERVER 5: ASIA - SINGAPORE ROUTER */}
                    {activeServer === 5 && (
                        <>
                            <OmniPanel color={SERVERS[5].color} position={[0, 6, 0]} width={600} scale={0.6}>
                                <MassiveChart title="AS-01 BATCH PROPAGATION" data={tpsHistory.map((v: number) => Math.max(0, v * 0.4 + Math.random() * 2000))} color="#d946ef" spike="STABLE ASSAULT" />
                            </OmniPanel>
                            <OmniPanel color={SERVERS[5].color} position={[0, -6, 0]} width={400} scale={0.6} title="AS-01 Analytics">
                                <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4">
                                    <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">CPU UTILIZATION</span><span className="text-fuchsia-400">92%</span></div>
                                    <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">NETWORK DROPS</span><span className="text-emerald-400">0.00%</span></div>
                                    <div className="flex justify-between pt-3"><span className="text-white/40">UPTIME</span><span className="text-cyan-400">100%</span></div>
                                </div>
                            </OmniPanel>
                            <OmniPanel color={SERVERS[5].color} position={[-6, 0, 0]} width={300} scale={0.5}><StatCard label="ROUTING CACHE" value="4.2" unit="GB / 8GB" color="#d946ef" /></OmniPanel>
                            <OmniPanel color={SERVERS[5].color} position={[6, 0, 0]} width={300} scale={0.5}><StatCard label="PACKET LOSS" value="0.0001" unit="%" color="#10b981" /></OmniPanel>
                        </>
                    )}

                    {/* SERVER 6: ASIA - TOKYO OBSERVER */}
                    {activeServer === 6 && (
                        <>
                            <OmniPanel color={SERVERS[6].color} position={[0, 6, 0]} width={600} scale={0.6}>
                                <MassiveChart title="AS-02 SHARD 0 INFILTRATION" data={tpsHistory.map((v: number) => Math.max(0, v * 0.5 + Math.random() * 2000))} color="#8b5cf6" spike="MAINTAINING PRESENCE" />
                            </OmniPanel>
                            <OmniPanel color={SERVERS[6].color} position={[0, -6, 0]} width={400} scale={0.6} title="AS-02 Vitals">
                                <div className="flex flex-col justify-between flex-1 font-mono text-sm font-bold gap-4">
                                    <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">ACTIVE CONNECTIONS</span><span className="text-purple-400">14,102</span></div>
                                    <div className="flex justify-between border-b border-white/[0.05] pb-3"><span className="text-white/40">BLOCKED IPS</span><span className="text-white">0</span></div>
                                    <div className="flex justify-between pt-3"><span className="text-white/40">PROXY ROTATION</span><span className="text-emerald-400">ACTIVE</span></div>
                                </div>
                            </OmniPanel>
                            <OmniPanel color={SERVERS[6].color} position={[-7, 0, 0]} width={400} scale={0.5}><TxFeed txSigned={d.tps * 0.5} /></OmniPanel>
                            <OmniPanel color={SERVERS[6].color} position={[7, 0, 0]} width={350} scale={0.5}><TPSGauge tps={d.tps * 0.5} history={tpsHistory} /></OmniPanel>
                        </>
                    )}
                </group>
            )}
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
            <div className="absolute top-0 left-0 w-full z-[200] px-12 pb-2 flex justify-between items-end pointer-events-none">
                {/* Neon Sign Structure */}
                <div className="relative flex flex-col items-center">
                    {/* Hanging wires */}
                    <div className="flex w-full justify-between px-8 mb-[-2px] z-0 opacity-40">
                        <div className="w-[2px] h-16 bg-gradient-to-b from-black to-zinc-600 shadow-xl" />
                        <div className="w-[2px] h-16 bg-gradient-to-b from-black to-zinc-600 shadow-xl" />
                    </div>
                    {/* Sign Box */}
                    <div className="relative border border-cyan-900/40 bg-black/80 px-8 py-3 rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-10 flex flex-col items-center">
                        <h1
                            className="text-3xl font-black tracking-tight"
                            style={{
                                color: '#ffffff', // pure white text
                                textShadow: '0 0 2px #fff, 0 0 8px #06b6d4, 0 0 15px #06b6d4, 0 0 30px #a855f7, 0 0 60px #a855f7' // Ultra bright clean neon glow
                            }}
                        >
                            XCRON BATTLE OF NODES <span style={{ color: '#ffffff', textShadow: '0 0 2px #fff, 0 0 8px #f43f5e, 0 0 15px #f43f5e, 0 0 30px #9333ea, 0 0 60px #9333ea' }}>SUPERNOVA &apos;26</span>
                        </h1>
                        <div className="text-[10px] font-mono tracking-[0.4em] font-bold text-cyan-500/80 uppercase mt-1">
                            Global Command WebGL Matrix
                        </div>
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
