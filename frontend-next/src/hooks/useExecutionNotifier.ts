import { useEffect, useRef } from 'react';
import { useWallet } from './useWallet';
import { CONTRACTS, NETWORK } from '../config';
import { devWarn } from '../utils/devLog';

/**
 * useExecutionNotifier — Polls for new task executions and shows toast alerts.
 * 
 * Tracks the latest known execution timestamp and triggers a toast
 * whenever a newer execution is detected. Only for the connected user's tasks.
 */
export function useExecutionNotifier() {
    const { wallet, addToast } = useWallet();
    const seenTxHashes = useRef<Set<string>>(new Set());
    const isFirstPoll = useRef(true);

    useEffect(() => {
        if (!wallet.connected || wallet.isDemo) return;

        const checkExecutions = async () => {
            try {
                const res = await fetch(
                    `${NETWORK.apiUrl}/transactions?receiver=${CONTRACTS.scheduler}&function=executeQuantumTask&status=success&size=5&order=desc`
                );
                const txs = await res.json();
                if (!Array.isArray(txs) || txs.length === 0) return;

                // On first poll, just set the baseline
                if (isFirstPoll.current) {
                    txs.forEach((tx: any) => seenTxHashes.current.add(tx.txHash));
                    isFirstPoll.current = false;
                    return;
                }

                // Check for new executions (Supernova fix: timestamp collisions)
                const newExecs = txs.filter((tx: any) => !seenTxHashes.current.has(tx.txHash));
                if (newExecs.length > 0) {
                    for (const tx of newExecs) {
                        seenTxHashes.current.add(tx.txHash);
                        // Prevent memory leak
                        if (seenTxHashes.current.size > 50) {
                            const arr = Array.from(seenTxHashes.current);
                            seenTxHashes.current = new Set(arr.slice(arr.length - 50));
                        }
                        let taskId = '?';
                        if (tx.data) {
                            try {
                                const decoded = atob(tx.data);
                                const parts = decoded.split('@');
                                if (parts.length > 1) {
                                    taskId = '#' + parseInt(parts[1], 16).toString();
                                }
                            } catch { /* ignore */ }
                        }

                        addToast(
                            `⚡ Task ${taskId} executed! TX: ${tx.txHash.slice(0, 8)}...`,
                            'success'
                        );
                    }
                }
            } catch (err) {
                devWarn('Execution notifier poll failed:', err);
            }
        };

        // Poll every 2 seconds for Supernova sub-second finality UX
        const intervalId = setInterval(checkExecutions, 2000);
        // First check after 1 second
        const initialTimeout = setTimeout(checkExecutions, 1000);

        return () => {
            clearInterval(intervalId);
            clearTimeout(initialTimeout);
        };
    }, [wallet.connected, wallet.isDemo]);
}
