"use client";

import { WalletProvider } from "@/hooks/useWallet";
import { useExecutionNotifier } from "@/hooks/useExecutionNotifier";
import AiChat from "@/components/AiChat";
import { NetworkBadge } from "@/components/NetworkBadge";
import { Analytics } from '@vercel/analytics/react';
import { ReactNode } from 'react';

function ExecutionNotifier() {
    useExecutionNotifier();
    return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WalletProvider>
            {children}
            <ExecutionNotifier />
            <AiChat />
            <Analytics />
        </WalletProvider>
    );
}
