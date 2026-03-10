"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    ListTodo,
    Search,
    Network,
    Activity,
    BrainCircuit,
    Terminal,
    KeyRound,
    Menu,
    X,
    Globe
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useState } from "react";
import { TransparentLogo } from "@/components/TransparentLogo";

export function Sidebar() {
    const pathname = usePathname();
    const { wallet, connect, disconnect, setShowConnectModal } = useWallet();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Hide sidebar completely on War Room (full-width telemetry dashboard)
    if (pathname === "/battlesofnodes") return null;

    const routes = [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/schedule", label: "Schedule Task", icon: ListTodo },
        { href: "/tasks", label: "My Tasks", icon: BrainCircuit },
        { href: "/explore", label: "Explore Tasks", icon: Search },
        { href: "/clone-keys", label: "Clone-Keys", icon: KeyRound },
        { href: "/keeper", label: "Keeper Node", icon: Network },
        { href: "/stats", label: "Protocol Stats", icon: Activity },
        { href: "/battlesofnodes", label: "War Room 3D", icon: Globe },
        { href: "/admin", label: "Admin Panel", icon: Terminal, strict: true },
    ];

    const isAdmin = wallet.address === "erd1zz5n2x5mms5y7es2ksm9675edx6m8yzz7p2ntst6tzr6t2gugk0suu7lmy";

    return (
        <>
            {/* Mobile Header (Fixed Top) */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#0a0f19]/90 backdrop-blur-md border-b border-white/5 z-50 flex items-center justify-between px-4">
                {/* Logo in Mobile Header */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="w-10 h-10 relative flex items-center justify-center">
                        <TransparentLogo src="/xcron-logo-x.jpg" className="w-full h-full object-contain scale-[1.3] group-hover:scale-[1.4] transition-transform duration-500 relative z-10" />
                    </div>
                    <span className="text-xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400">
                        XCron
                    </span>
                </Link>

                {/* Hamburger Toggle */}
                <button
                    onClick={() => setIsMobileOpen(!isMobileOpen)}
                    className="p-2 text-white/70 hover:text-white transition-colors"
                    aria-label="Toggle menu"
                >
                    {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Desktop & Mobile Drawer Sidebar */}
            <aside
                className={`
                    w-[280px] h-full flex flex-col bg-[#0a0f19] md:bg-transparent shrink-0 
                    fixed md:relative top-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}
            >
                <div className="p-6">
                    <Link href="/" className="flex items-center gap-4 group mb-4" onClick={() => setIsMobileOpen(false)}>
                        <div className="relative w-24 h-24 flex items-center justify-center transition-all duration-300 pointer-events-none drop-shadow-[0_0_20px_rgba(192,132,252,0.3)] shrink-0">
                            {/* Órbitas 3D perfectas en SVG (Evita el achatamiento de los hijos por rotateX) */}
                            <svg className="absolute inset-[-20%] w-[140%] h-[140%] overflow-visible group-hover:scale-110 transition-transform duration-700" viewBox="0 0 100 100">
                                <defs>
                                    <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                                        <feComponentTransfer in="blur" result="glow">
                                            <feFuncA type="linear" slope="2" />
                                        </feComponentTransfer>
                                        <feMerge>
                                            <feMergeNode in="glow" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                    <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                                        <feComponentTransfer in="blur" result="glow">
                                            <feFuncA type="linear" slope="2" />
                                        </feComponentTransfer>
                                        <feMerge>
                                            <feMergeNode in="glow" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                </defs>

                                {/* Órbita 1: Horizontal */}
                                <g transform="rotate(0 50 50)">
                                    <ellipse cx="50" cy="50" rx="45" ry="12" fill="none" className="stroke-cyan-400/40" strokeWidth="0.5" />
                                    <circle r="1.5" fill="#22d3ee" filter="url(#glow-cyan)">
                                        <animateMotion dur="5s" repeatCount="indefinite" path="M 95 50 A 45 12 0 1 0 5 50 A 45 12 0 1 0 95 50" />
                                    </circle>
                                    <circle r="0.5" fill="#fff">
                                        <animateMotion dur="5s" repeatCount="indefinite" path="M 95 50 A 45 12 0 1 0 5 50 A 45 12 0 1 0 95 50" />
                                    </circle>
                                </g>

                                {/* Órbita 2: Inclinada 60deg (Dirección opuesta) */}
                                <g transform="rotate(60 50 50)">
                                    <ellipse cx="50" cy="50" rx="45" ry="12" fill="none" className="stroke-cyan-400/20" strokeWidth="0.5" />
                                    <circle r="1.5" fill="#22d3ee" filter="url(#glow-cyan)">
                                        <animateMotion dur="7s" repeatCount="indefinite" path="M 95 50 A 45 12 0 1 1 5 50 A 45 12 0 1 1 95 50" />
                                    </circle>
                                    <circle r="0.5" fill="#fff">
                                        <animateMotion dur="7s" repeatCount="indefinite" path="M 95 50 A 45 12 0 1 1 5 50 A 45 12 0 1 1 95 50" />
                                    </circle>
                                </g>

                                {/* Órbita 3: Inclinada -60deg */}
                                <g transform="rotate(-60 50 50)">
                                    <ellipse cx="50" cy="50" rx="45" ry="12" fill="none" className="stroke-purple-500/30" strokeWidth="0.5" />
                                    <circle r="1.5" fill="#c084fc" filter="url(#glow-purple)">
                                        <animateMotion dur="9s" repeatCount="indefinite" path="M 95 50 A 45 12 0 1 0 5 50 A 45 12 0 1 0 95 50" />
                                    </circle>
                                    <circle r="0.5" fill="#fff">
                                        <animateMotion dur="9s" repeatCount="indefinite" path="M 95 50 A 45 12 0 1 0 5 50 A 45 12 0 1 0 95 50" />
                                    </circle>
                                </g>
                            </svg>

                            <TransparentLogo src="/xcron-logo-x.jpg" className="w-full h-full object-contain scale-[1.3] group-hover:scale-[1.4] transition-transform duration-500 relative z-10" />
                        </div>
                        <span className="text-3xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] transition-all duration-500">
                            XCron
                        </span>
                    </Link>
                </div>

                <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
                    {routes.map((route) => {
                        if (route.strict && !isAdmin) return null;

                        const isActive = pathname === route.href;

                        return (
                            <Link
                                key={route.href}
                                href={route.href}
                                onClick={() => setIsMobileOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 group ${isActive
                                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                                    : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
                                    }`}
                            >
                                <route.icon
                                    className={`w-5 h-5 transition-colors ${isActive ? "text-cyan-400" : "text-white/40 group-hover:text-white/80"
                                        }`}
                                />
                                {route.label}
                            </Link>
                        );
                    })}
                </div>

                <div className="p-4">
                    {wallet.connected ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between px-4 py-3 bg-transparent rounded-xl">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse"></div>
                                    <span className="text-xs font-mono text-white/80 truncate">
                                        {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={disconnect}
                                className="w-full px-4 py-2.5 text-sm font-medium text-red-400 bg-red-500/10 rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-all duration-200"
                            >
                                Disconnect
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowConnectModal(true)}
                            className="w-full flex justify-center items-center py-3.5 rounded-xl font-bold bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all duration-300"
                        >
                            Connect Wallet
                        </button>
                    )}
                </div>
                <div className="px-4 pb-3 flex justify-center">
                    <NetworkBadge />
                </div>
            </aside>
        </>
    );
}
