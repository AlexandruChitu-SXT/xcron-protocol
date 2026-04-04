"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
    TrendingUp, Users, Zap, ShieldCheck,
    ArrowUpRight, BarChart3, AlertTriangle, FileText
} from 'lucide-react';

/* =========================================================================
   COMPONENTS
   ========================================================================= */

// Massive Executive Metric Card
function ExecCard({ title, value, unit, description, icon: Icon, trend, isPositive, sparklineData }: any) {
    return (
        <div className="col-span-12 lg:col-span-4 bg-white/[0.02] backdrop-blur-3xl border border-white/[0.08] rounded-[32px] p-10 flex flex-col hover:-translate-y-2 transition-transform duration-500 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] group relative overflow-hidden">

            {/* Subtle Glow */}
            <div className={`absolute -inset-10 bg-gradient-to-br ${isPositive ? 'from-[#00f5d4]/10' : 'from-rose-500/10'} to-transparent blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 -z-10`} />

            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-2xl ${isPositive ? 'bg-[#00f5d4]/10 text-[#00f5d4]' : 'bg-rose-500/10 text-rose-500'} border border-white/5 shadow-inner`}>
                        <Icon className="w-8 h-8 drop-shadow-lg" />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-wide">{title}</h3>
                </div>
            </div>

            <div className="flex-1 flex flex-col justify-center my-6">
                <div className="flex items-baseline gap-2">
                    <span className="text-[5rem] font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tighter drop-shadow-sm leading-none">{value}</span>
                    <span className="text-2xl text-slate-500 font-bold">{unit}</span>
                </div>
                <p className="text-sm text-slate-400 font-medium mt-4">{description}</p>
            </div>

            <div className="flex items-end justify-between mt-auto">
                <div className={`flex items-center gap-2 ${isPositive ? 'text-[#00f5d4]' : 'text-rose-500'} text-lg font-black bg-white/5 px-4 py-2 rounded-xl`}>
                    {isPositive ? <TrendingUp className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    {trend}
                </div>

                {/* Simple Soft Area Chart */}
                <div className="w-32 h-16 opacity-50">
                    <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id={`grad-${title.replace(/\\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={isPositive ? "#00f5d4" : "#e11d48"} stopOpacity="0.4" />
                                <stop offset="100%" stopColor={isPositive ? "#00f5d4" : "#e11d48"} stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <polygon
                            points={`0,40 ${sparklineData.map((v: number, i: number) => `${i * (100 / (sparklineData.length - 1))},${40 - (v / 100) * 40}`).join(' ')} 100,40`}
                            fill={`url(#grad-${title.replace(/\\s/g, '')})`}
                        />
                        <polyline
                            points={sparklineData.map((v: number, i: number) => `${i * (100 / (sparklineData.length - 1))},${40 - (v / 100) * 40}`).join(' ')}
                            fill="none"
                            stroke={isPositive ? "#00f5d4" : "#e11d48"}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            </div>
        </div>
    );
}

/* =========================================================================
   MAIN LAYOUT (Z-Pattern)
   ========================================================================= */
export default function ZPatternDashboard() {
    // Mock Data
    const spLat = [20, 22, 18, 25, 20, 45, 80, 50, 22, 18];
    const spErr = [0, 0, 0, 0, 10, 30, 15, 5, 0, 0];
    const spTps = [60, 65, 70, 62, 80, 85, 95, 90, 88, 92];

    return (
        <div className="min-h-screen bg-[#0b0e17] text-white font-sans selection:bg-[#00f5d4]/30 overflow-x-hidden">

            {/* Background Deep Space */}
            <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-950/20 via-[#0b0e17] to-[#040608] mix-blend-screen pointer-events-none" />

            <div className="relative z-10 w-full max-w-[2560px] mx-auto px-8 md:px-16 lg:px-24 py-12 min-h-screen flex flex-col">

                {/* TOP LEVEL: Z-Start (Left to Right) */}
                <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center w-full mb-20 gap-10">

                    {/* Top Left: Logo & Master Health Score */}
                    <div className="flex items-center gap-10">
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-slate-400">XCron Protocol</h1>
                            <h2 className="text-5xl font-black text-white mt-2 tracking-tighter">Executive Snapshot</h2>
                        </div>

                        <div className="h-16 w-[1px] bg-white/10 hidden md:block" />

                        <div className="flex items-center gap-6">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                {/* Master Health Ring */}
                                <svg className="absolute inset-0 w-full h-full -rotate-90">
                                    <circle cx="48" cy="48" r="44" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="none" />
                                    <circle cx="48" cy="48" r="44" stroke="#00f5d4" strokeWidth="6" fill="none" strokeDasharray="276" strokeDashoffset="0.2" className="drop-shadow-[0_0_8px_#00f5d4]" />
                                </svg>
                                <ShieldCheck className="w-10 h-10 text-[#00f5d4] drop-shadow-[0_0_10px_#00f5d4]" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">System Uptime</span>
                                <span className="text-[3.5rem] leading-none font-black text-[#00f5d4] drop-shadow-[0_0_15px_rgba(0,245,212,0.4)] tracking-tighter">99.98<span className="text-2xl text-white/50">%</span></span>
                            </div>
                        </div>
                    </div>

                    {/* Top Right: CTA & Time Selector */}
                    <div className="flex items-center gap-6">
                        <button className="flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/50 px-6 py-4 rounded-2xl font-black tracking-wide transition-all shadow-[0_0_20px_rgba(225,29,72,0.2)]">
                            <AlertTriangle className="w-5 h-5" />
                            1 ACTIVE INCIDENT
                        </button>

                        <div className="flex bg-white/5 border border-white/10 rounded-2xl p-2 backdrop-blur-md">
                            {['24H', '7D', '30D', 'YTD'].map((t, i) => (
                                <button key={t} className={`px-6 py-3 rounded-xl text-sm font-black transition-all ${i === 2 ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                {/* DIAGONAL / CENTER (The 3 Giants) */}
                <div className="grid grid-cols-12 gap-10 flex-1 content-center mb-20">

                    <ExecCard
                        title="Global Processing Latency"
                        value="42"
                        unit="ms"
                        description="Average response time across all clusters. End-user perception is optimal."
                        icon={Zap}
                        trend="-12% vs 30D"
                        isPositive={true}
                        sparklineData={spLat}
                    />

                    <ExecCard
                        title="Critical Error Rate"
                        value="0.04"
                        unit="%"
                        description="Spike detected at 14:00 UTC. Estimated revenue impact: < $5,000. Isolated to EU."
                        icon={AlertTriangle}
                        trend="+0.01% vs 30D"
                        isPositive={false}
                        sparklineData={spErr}
                    />

                    <ExecCard
                        title="Sustained Throughput"
                        value="14.2"
                        unit="k"
                        description="Transactions per second. Operating at 65% of provisioned infrastructure capacity."
                        icon={BarChart3}
                        trend="+18% vs 30D"
                        isPositive={true}
                        sparklineData={spTps}
                    />

                </div>

                {/* BOTTOM RIGHT: Z-End (Action) */}
                <footer className="flex justify-end mt-auto pt-10 border-t border-white/5">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col items-end mr-4">
                            <span className="text-sm font-bold text-slate-400">Total Users Impacted Today</span>
                            <div className="flex items-center gap-2 mt-1">
                                <Users className="w-5 h-5 text-amber-500" />
                                <span className="text-2xl font-black text-white">412</span>
                                <span className="text-sm text-slate-500">of 1.2M</span>
                            </div>
                        </div>

                        <button className="group flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-10 py-5 rounded-[20px] font-black text-lg transition-all shadow-[0_10px_30px_rgba(79,70,229,0.4)] hover:-translate-y-1">
                            <FileText className="w-6 h-6" />
                            GENERATE EXECUTIVE REPORT
                            <ArrowUpRight className="w-5 h-5 ml-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        </button>
                    </div>
                </footer>

            </div>
        </div>
    );
}
