"use client";

import { WalletProvider } from "@/hooks/useWallet";
import { useExecutionNotifier } from "@/hooks/useExecutionNotifier";
import AiChat from "@/components/AiChat";
import { NetworkBadge } from "@/components/NetworkBadge";
import { ReactNode } from 'react';

import { usePathname } from 'next/navigation';

function ExecutionNotifier() {
    useExecutionNotifier();
    return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '';
    const isSauron = pathname.startsWith('/sauron') || pathname.startsWith('/battlesofnodes');

    return (
        <WalletProvider>
            {children}
            <ExecutionNotifier />
            {!isSauron && <AiChat />}
        </WalletProvider>
    );
}
