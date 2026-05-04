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
    const lastSeenTimestamp = useRef<number>(Math.floor(Date.now() / 1000));
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
                    lastSeenTimestamp.current = txs[0].timestamp;
                    isFirstPoll.current = false;
                    return;
                }

                // Check for new executions
                const newExecs = txs.filter((tx: any) => tx.timestamp > lastSeenTimestamp.current);
                if (newExecs.length > 0) {
                    lastSeenTimestamp.current = newExecs[0].timestamp;

                    for (const tx of newExecs) {
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

        // Poll every 15 seconds
        const intervalId = setInterval(checkExecutions, 15000);
        // First check after 5 seconds (let the page load first)
        const initialTimeout = setTimeout(checkExecutions, 5000);

        return () => {
            clearInterval(intervalId);
            clearTimeout(initialTimeout);
        };
    }, [wallet.connected, wallet.isDemo]);
}
