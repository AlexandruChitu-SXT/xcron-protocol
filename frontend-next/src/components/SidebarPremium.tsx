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

export function SidebarPremium() {
    const pathname = usePathname();
    const { wallet, connect, disconnect, setShowConnectModal } = useWallet();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const routes: { href: string; label: string; icon: any; strict?: boolean }[] = [
        { href: "#dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "#schedule", label: "Schedule Task", icon: ListTodo },
        { href: "#tasks", label: "My Tasks", icon: BrainCircuit },
        { href: "/clone-keys", label: "Clone-Keys", icon: KeyRound },
        { href: "#stats", label: "Protocol Stats", icon: Activity },
        { href: "#security", label: "Security & Advances", icon: Network },
    ];

    const isAdmin = wallet.address === "erd1zz5n2x5mms5y7es2ksm9675edx6m8yzz7p2ntst6tzr6t2gugk0suu7lmy";

    return (
        <>
            {/* Mobile Header (Fixed Top) */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#030303]/90 backdrop-blur-md border-b border-white/5 z-50 flex items-center justify-between px-4">
                <Link href="/" className="flex items-center gap-2 group">
                    <span className="text-xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neutral-200 to-neutral-500">
                        XCron
                    </span>
                </Link>
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

            {/* Premium Neumorphic Sidebar */}
            <aside
                className={`
                    w-[290px] h-[calc(100vh-2rem)] my-4 ml-4 flex flex-col shrink-0 
                    fixed md:relative top-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    rounded-[32px] overflow-hidden
                    bg-[#080808] border border-white/5
                    shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_40px_rgba(0,0,0,0.8)]
                `}
            >
                {/* Subtle top glare effect */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

                <div className="p-8 relative z-10">
                    <Link href="/" className="flex items-center gap-4 group mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#2a2a2a] to-[#121212] flex items-center justify-center p-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_4px_10px_rgba(0,0,0,0.5)] border border-[#333]">
                            <LayoutDashboard className="w-5 h-5 text-white/80" />
                        </div>
                        <span className="text-2xl font-bold tracking-widest text-[#ececec]">
                            XCron
                        </span>
                    </Link>
                </div>

                <div className="flex-1 px-4 py-2 space-y-2 overflow-y-auto relative z-10">
                    {routes.map((route) => {
                        if (route.strict && !isAdmin) return null;

                        const isActive = pathname === route.href;

                        return (
                            <a
                                key={route.href}
                                href={route.href}
                                onClick={(e) => {
                                    if (route.href.startsWith('#')) {
                                        e.preventDefault();
                                        const element = document.querySelector(route.href);
                                        if (element) {
                                            element.scrollIntoView({ behavior: 'smooth' });
                                        }
                                        if (isMobileOpen) setIsMobileOpen(false);
                                    } else {
                                        if (isMobileOpen) setIsMobileOpen(false);
                                    }
                                }}
                                className={`
                                    relative flex items-center gap-4 px-5 py-3.5 rounded-[20px] font-medium transition-all duration-300 group text-[#7a7a7a] hover:text-[#ececec] hover:bg-white/[0.02]
                                `}
                            >
                                <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors`}>
                                    <route.icon strokeWidth={2} className={`w-5 h-5 transition-colors text-[#555] group-hover:text-[#888]`} />
                                </div>
                                <span className={"text-[15px] tracking-wide"}>
                                    {route.label}
                                </span>
                            </a>
                        );
                    })}
                </div>

                <div className="p-6 relative z-10 border-t border-white/[0.05]">
                    {wallet.connected ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-center px-4 py-3 bg-[#111] rounded-[16px] border border-white/[0.05] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                <span className="text-[13px] font-mono text-[#888] tracking-widest">
                                    {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                                </span>
                            </div>
                            <button
                                onClick={disconnect}
                                className="w-full px-4 py-3 text-[14px] font-semibold text-[#888] hover:text-[#ececec] bg-[#1a1a1a] rounded-[16px] border border-white/[0.05] shadow-[0_2px_10px_rgba(0,0,0,0.2)] hover:bg-[#222] transition-colors"
                            >
                                Disconnect
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowConnectModal(true)}
                            className="relative w-full overflow-hidden flex justify-center items-center py-4 rounded-[16px] font-bold text-black bg-gradient-to-b from-[#d4af37] to-[#aa8822] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_5px_15px_rgba(212,175,55,0.2)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_5px_20px_rgba(212,175,55,0.4)] transition-all duration-300"
                        >
                            <span className="relative z-10 tracking-widest text-[14px]">CONNECT WALLET</span>
                        </button>
                    )}
                </div>
            </aside>
        </>
    );
}
