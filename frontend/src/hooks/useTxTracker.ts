import { useState, useEffect } from 'react';
import { NETWORK } from '../config';

export type TxStatus = 'pending' | 'success' | 'fail' | 'invalid' | null;

export function useTxTracker() {
    const [txHash, setTxHash] = useState<string | null>(null);
    const [status, setStatus] = useState<TxStatus>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!txHash || txHash === 'pending-web-wallet') return;

        let intervalId: NodeJS.Timeout;
        setLoading(true);
        setStatus('pending');

        const checkStatus = async () => {
            try {
                const res = await fetch(`${NETWORK.apiUrl}/transactions/${txHash}`);
                if (!res.ok) return; // Wait for indexer to catch up
                const data = await res.json();

                if (data && data.status) {
                    if (data.status === 'success' || data.status === 'fail' || data.status === 'invalid') {
                        setStatus(data.status as TxStatus);
                        setLoading(false);
                        clearInterval(intervalId);
                    }
                }
            } catch (err) {
                console.warn('Error fetching tx status:', err);
            }
        };

        // Initial check and then poll every 3 seconds
        checkStatus();
        intervalId = setInterval(checkStatus, 3000);

        return () => clearInterval(intervalId);
    }, [txHash]);

    return { txHash, setTxHash, status, loading };
}
