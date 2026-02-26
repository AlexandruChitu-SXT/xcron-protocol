import { devWarn } from '../utils/devLog';
import { useState, useCallback } from 'react';
import { NETWORK } from '../config';

// Backoff cache: remember failed 400 queries for 60s to stop browser console spam
const failedQueryCache = new Map<string, number>(); // key → timestamp of last 400
const BACKOFF_MS = 60_000; // don't retry failed queries for 60 seconds

/**
 * Hook for read-only smart contract queries.
 * Uses the MultiversX API directly to avoid SDK version mismatches.
 */
export function useContractQuery() {
    const [loading, setLoading] = useState(false);

    const query = useCallback(async (
        contractAddr: string,
        funcName: string,
        args: string[] = [],
        _retryCount = 0
    ): Promise<Buffer[]> => {
        setLoading(true);
        try {
            // Check backoff cache — skip fetch entirely if this query recently returned 400
            const cacheKey = `${contractAddr}:${funcName}`;
            const lastFail = failedQueryCache.get(cacheKey);
            if (lastFail && Date.now() - lastFail < BACKOFF_MS) {
                setLoading(false);
                return [];
            }

            const response = await fetch(`${NETWORK.apiUrl}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scAddress: contractAddr,
                    funcName: funcName,
                    args: args,
                }),
            });

            if (!response.ok) {
                // 400 = bad request — cache it and return silently (no retry)
                if (response.status === 400) {
                    failedQueryCache.set(cacheKey, Date.now());
                    setLoading(false);
                    return [];
                }
                // 5xx or other — retry once
                if (_retryCount < 1) {
                    setLoading(false);
                    await new Promise(r => setTimeout(r, 3000));
                    return query(contractAddr, funcName, args, _retryCount + 1);
                }
                throw new Error(`Query failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.returnCode !== 'ok') {
                devWarn(`Query ${funcName} returned: ${data.returnCode} - ${data.returnMessage}`);
                return [];
            }

            // returnData is base64 encoded
            return (data.returnData || []).map((b64: string) => {
                if (!b64 || b64 === '') return Buffer.alloc(0);
                return Buffer.from(b64, 'base64');
            });
        } catch (err) {
            // Only log on final failure (after retry)
            if (_retryCount >= 1) {
                devWarn(`Query ${funcName} failed after retry:`, err);
            }
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    return { query, loading };
}

/**
 * Utility: decode a Buffer to number.
 */
export function bufferToNumber(buf: Buffer): number {
    if (buf.length === 0) return 0;
    return parseInt(buf.toString('hex'), 16);
}

/**
 * Utility: decode a Buffer to BigInt string.
 */
export function bufferToBigInt(buf: Buffer): string {
    if (buf.length === 0) return '0';
    return BigInt('0x' + buf.toString('hex')).toString();
}

/**
 * Utility: format EGLD from denomination.
 */
export function formatEgld(value: string, decimals: number = 4): string {
    const val = BigInt(value);
    const whole = val / BigInt(1e18);
    const frac = val % BigInt(1e18);
    const fracStr = frac.toString().padStart(18, '0').slice(0, decimals);
    return `${whole}.${fracStr}`;
}

/**
 * Utility: shorten an address for display.
 */
export function shortenAddress(addr: string): string {
    if (addr.length < 20) return addr;
    return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}
