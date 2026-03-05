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
    X
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useState } from "react";
import { TransparentLogo } from "@/components/TransparentLogo";

export function Sidebar() {
    const pathname = usePathname();
    const { wallet, connect, disconnect, setShowConnectModal } = useWallet();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const routes = [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/schedule", label: "Schedule Task", icon: ListTodo },
        { href: "/tasks", label: "My Tasks", icon: BrainCircuit },
        { href: "/explore", label: "Explore Tasks", icon: Search },
        { href: "/clone-keys", label: "Clone-Keys", icon: KeyRound },
        { href: "/keeper", label: "Keeper Node", icon: Network },
        { href: "/stats", label: "Protocol Stats", icon: Activity },
        { href: "/admin", label: "Admin Panel", icon: Terminal, strict: true },
    ];

    const isAdmin = wallet.address === "erd1zz5n2x5mms5y7es2ksm9675edx6m8yzz7p2ntst6tzr6t2gugk0suu7lmy";

    return (
        <>
            {/* Mobile toggle logic omitted for brevity but container maintained */}
            <aside className="w-[280px] h-full flex flex-col bg-transparent shrink-0 hidden md:flex">
                <div className="p-6">
                    <Link href="/" className="flex items-center gap-4 group mb-4">
                        <div className="relative w-24 h-24 flex items-center justify-center transition-all duration-300 pointer-events-none drop-shadow-[0_0_20px_rgba(192,132,252,0.3)] shrink-0">
                            {/* Órbitas 3D estilo MultiversX Telemetry */}
                            <div className="absolute inset-[-15%] [transform:rotateX(70deg)] [transform-style:preserve-3d] group-hover:scale-110 transition-transform duration-700 relative">
                                <div className="w-full h-full rounded-full border border-cyan-400/30 animate-[spin_5s_linear_infinite]">
                                    {/* Esfera brillante horizontal */}
                                    <div className="absolute top-[-4px] inset-x-1/2 w-2 h-2 bg-white rounded-full 
                                        shadow-[0_0_10px_2px_#22d3ee,0_0_20px_5px_rgba(34,211,238,0.6),0_0_30px_8px_rgba(34,211,238,0.3)]">
                                    </div>
                                </div>
                            </div>
                            <div className="absolute inset-[-15%] [transform:rotateZ(60deg)_rotateX(70deg)] [transform-style:preserve-3d] group-hover:scale-110 transition-transform duration-700">
                                <div className="w-full h-full rounded-full border border-cyan-400/20 animate-[spin_7s_linear_infinite_reverse]">
                                    {/* Esfera brillante inclinada cruzada */}
                                    <div className="absolute bottom-1/4 left-[-4px] w-2 h-2 bg-white rounded-full 
                                        shadow-[0_0_10px_2px_#22d3ee,0_0_20px_5px_rgba(34,211,238,0.4)]">
                                    </div>
                                </div>
                            </div>
                            <div className="absolute inset-[-15%] [transform:rotateZ(-60deg)_rotateX(70deg)] [transform-style:preserve-3d] group-hover:scale-110 transition-transform duration-700">
                                <div className="w-full h-full rounded-full border border-purple-500/30 animate-[spin_9s_linear_infinite]">
                                    {/* Esfera brillante inclinada cruzada púrpura */}
                                    <div className="absolute top-1/4 right-[-4px] w-2 h-2 bg-white rounded-full 
                                        shadow-[0_0_10px_2px_#c084fc,0_0_20px_5px_rgba(192,132,252,0.6),0_0_30px_8px_rgba(192,132,252,0.3)]">
                                    </div>
                                </div>
                            </div>

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
