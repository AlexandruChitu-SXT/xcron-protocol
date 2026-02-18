import { useState, useCallback } from 'react';
import { NETWORK } from '../config';

/**
 * Hook for read-only smart contract queries.
 * Uses the MultiversX API directly to avoid SDK version mismatches.
 */
export function useContractQuery() {
    const [loading, setLoading] = useState(false);

    const query = useCallback(async (
        contractAddr: string,
        funcName: string,
        args: string[] = []
    ): Promise<Buffer[]> => {
        setLoading(true);
        try {
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
                throw new Error(`Query failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.returnCode !== 'ok') {
                console.warn(`Query ${funcName} returned: ${data.returnCode} - ${data.returnMessage}`);
                return [];
            }

            // returnData is base64 encoded
            return (data.returnData || []).map((b64: string) => {
                if (!b64 || b64 === '') return Buffer.alloc(0);
                return Buffer.from(b64, 'base64');
            });
        } catch (err) {
            console.error(`Query ${funcName} error:`, err);
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
