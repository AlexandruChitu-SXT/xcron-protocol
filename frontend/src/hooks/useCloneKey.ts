import { useState, useCallback } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from './useWallet';
import { useContractQuery, bufferToBigInt, formatEgld } from './useContractQuery';
import {
    CONTRACTS,
    GAS_AUTHORIZE_CLONE_KEY,
    GAS_REVOKE_CLONE_KEY,
    GAS_FUND_CLONE_KEY,
} from '../config';

/* ──────────────── Types ──────────────── */

export interface CloneKeyInfo {
    mainAddress: string;
    spendLimit: string;     // raw denomination
    spentAmount: string;    // raw denomination
    expiryTimestamp: number; // unix seconds
    // Derived
    remainingBudget: string;
    remainingBudgetEgld: string;
    spendLimitEgld: string;
    spentAmountEgld: string;
    isExpired: boolean;
    expiryDate: string;
    ttlRemaining: string;
}

/* ──────────────── Constants ──────────────── */

const MAX_SPEND_LIMIT_EGLD = 2; // 2 EGLD
const MAX_CLONE_KEYS = 3;
const MAX_TTL_DAYS = 30;
const MIN_TTL_HOURS = 1;

/* ──────────────── Helpers ──────────────── */

function addressToHex(addr: string): string {
    return Address.newFromBech32(addr).toHex();
}

function hex64(n: number): string {
    return n.toString(16).padStart(16, '0');
}

function formatTtl(seconds: number): string {
    if (seconds <= 0) return 'Expired';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

/* ──────────────── Hook ──────────────── */

export function useCloneKey() {
    const { wallet, signAndSendTransaction, addToast } = useWallet();
    const { query } = useContractQuery();
    const [loading, setLoading] = useState(false);
    const [cloneKeys, setCloneKeys] = useState<CloneKeyInfo[]>([]);

    // ── Authorize a new Clone-Key ──
    const authorizeCloneKey = useCallback(async (
        cloneAddress: string,
        spendLimitEgld: number,
        ttlDays: number,
    ): Promise<string | null> => {
        if (!wallet.connected) {
            addToast('Connect your wallet first', 'error');
            return null;
        }
        if (spendLimitEgld <= 0 || spendLimitEgld > MAX_SPEND_LIMIT_EGLD) {
            addToast(`Spend limit must be between 0 and ${MAX_SPEND_LIMIT_EGLD} EGLD`, 'error');
            return null;
        }
        if (ttlDays < MIN_TTL_HOURS / 24 || ttlDays > MAX_TTL_DAYS) {
            addToast(`Validity must be between ${MIN_TTL_HOURS} hour and ${MAX_TTL_DAYS} days`, 'error');
            return null;
        }

        setLoading(true);
        try {
            const cloneAddrHex = addressToHex(cloneAddress);
            const ttlSeconds = Math.floor(ttlDays * 86400);
            const ttlHex = hex64(ttlSeconds);
            const depositWei = BigInt(Math.floor(spendLimitEgld * 1e18));

            const data = `authorizeCloneKey@${cloneAddrHex}@${ttlHex}`;

            const result = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                value: depositWei.toString(),
                data,
                gasLimit: GAS_AUTHORIZE_CLONE_KEY,
            });

            if (result && result !== 'pending-web-wallet') {
                addToast(`Clone-Key authorized! Budget: ${spendLimitEgld} EGLD`, 'success');
            }
            return result;
        } catch (err: any) {
            addToast(`Failed to authorize Clone-Key: ${err.message}`, 'error');
            return null;
        } finally {
            setLoading(false);
        }
    }, [wallet, signAndSendTransaction, addToast]);

    // ── Revoke a Clone-Key ──
    const revokeCloneKey = useCallback(async (
        cloneAddress: string,
    ): Promise<string | null> => {
        if (!wallet.connected) {
            addToast('Connect your wallet first', 'error');
            return null;
        }

        setLoading(true);
        try {
            const cloneAddrHex = addressToHex(cloneAddress);
            const data = `revokeCloneKey@${cloneAddrHex}`;

            const result = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                value: '0',
                data,
                gasLimit: GAS_REVOKE_CLONE_KEY,
            });

            if (result && result !== 'pending-web-wallet') {
                addToast('Clone-Key revoked. Unspent funds refunded.', 'success');
            }
            return result;
        } catch (err: any) {
            addToast(`Failed to revoke Clone-Key: ${err.message}`, 'error');
            return null;
        } finally {
            setLoading(false);
        }
    }, [wallet, signAndSendTransaction, addToast]);

    // ── Fund an existing Clone-Key ──
    const fundCloneKey = useCallback(async (
        cloneAddress: string,
        amountEgld: number,
    ): Promise<string | null> => {
        if (!wallet.connected) {
            addToast('Connect your wallet first', 'error');
            return null;
        }
        if (amountEgld <= 0) {
            addToast('Amount must be greater than 0', 'error');
            return null;
        }

        setLoading(true);
        try {
            const cloneAddrHex = addressToHex(cloneAddress);
            const depositWei = BigInt(Math.floor(amountEgld * 1e18));
            const data = `fundCloneKey@${cloneAddrHex}`;

            const result = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                value: depositWei.toString(),
                data,
                gasLimit: GAS_FUND_CLONE_KEY,
            });

            if (result && result !== 'pending-web-wallet') {
                addToast(`Added ${amountEgld} EGLD to Clone-Key budget`, 'success');
            }
            return result;
        } catch (err: any) {
            addToast(`Failed to fund Clone-Key: ${err.message}`, 'error');
            return null;
        } finally {
            setLoading(false);
        }
    }, [wallet, signAndSendTransaction, addToast]);

    // ── Query: get all Clone-Keys for connected wallet ──
    const fetchCloneKeys = useCallback(async (): Promise<CloneKeyInfo[]> => {
        if (!wallet.connected || !wallet.address) return [];

        setLoading(true);
        try {
            const walletHex = addressToHex(wallet.address);

            // Step 1: Get list of clone key addresses
            const addressBuffers = await query(
                CONTRACTS.scheduler,
                'getWalletCloneKeys',
                [walletHex],
            );

            if (!addressBuffers || addressBuffers.length === 0) {
                setCloneKeys([]);
                return [];
            }

            // Step 2: For each clone key, get its properties
            const keys: CloneKeyInfo[] = [];
            const now = Math.floor(Date.now() / 1000);

            for (const addrBuf of addressBuffers) {
                if (addrBuf.length === 0) continue;

                const cloneAddrHex = addrBuf.toString('hex');

                const propsBuffers = await query(
                    CONTRACTS.scheduler,
                    'getCloneKeyInfo',
                    [cloneAddrHex],
                );

                if (!propsBuffers || propsBuffers.length === 0) continue;

                // CloneKeyProperties is top-encoded as a struct:
                // - main_address (32 bytes)
                // - spend_limit (BigUint, nested)
                // - spent_amount (BigUint, nested)
                // - expiry_timestamp (u64, 8 bytes)
                const raw = propsBuffers[0];
                if (raw.length < 32 + 4) continue; // At minimum 32 (addr) + some data

                // Parse main_address (first 32 bytes)
                const mainAddrBytes = raw.subarray(0, 32);
                let mainAddress: string;
                try {
                    mainAddress = Address.newFromHex(mainAddrBytes.toString('hex')).toBech32();
                } catch {
                    mainAddress = '?';
                }

                // Parse nested BigUint fields: length_u32 + bytes
                let offset = 32;

                // spend_limit
                const spendLimitLen = raw.readUInt32BE(offset); offset += 4;
                const spendLimitBuf = raw.subarray(offset, offset + spendLimitLen); offset += spendLimitLen;
                const spendLimit = spendLimitBuf.length > 0 ? bufferToBigInt(Buffer.from(spendLimitBuf)) : '0';

                // spent_amount
                const spentAmountLen = raw.readUInt32BE(offset); offset += 4;
                const spentAmountBuf = raw.subarray(offset, offset + spentAmountLen); offset += spentAmountLen;
                const spentAmount = spentAmountBuf.length > 0 ? bufferToBigInt(Buffer.from(spentAmountBuf)) : '0';

                // expiry_timestamp (u64 = 8 bytes)
                const expiryBuf = raw.subarray(offset, offset + 8);
                const expiryTimestamp = expiryBuf.length >= 8
                    ? Number(BigInt('0x' + expiryBuf.toString('hex')))
                    : 0;

                const remaining = BigInt(spendLimit) - BigInt(spentAmount);
                const isExpired = now >= expiryTimestamp;
                const ttlSec = Math.max(0, expiryTimestamp - now);

                keys.push({
                    mainAddress,
                    spendLimit,
                    spentAmount,
                    expiryTimestamp,
                    remainingBudget: remaining.toString(),
                    remainingBudgetEgld: formatEgld(remaining.toString()),
                    spendLimitEgld: formatEgld(spendLimit),
                    spentAmountEgld: formatEgld(spentAmount),
                    isExpired,
                    expiryDate: new Date(expiryTimestamp * 1000).toLocaleDateString(),
                    ttlRemaining: formatTtl(ttlSec),
                });
            }

            setCloneKeys(keys);
            return keys;
        } catch (err) {
            console.error('Failed to fetch clone keys:', err);
            return [];
        } finally {
            setLoading(false);
        }
    }, [wallet, query]);

    return {
        // State
        loading,
        cloneKeys,
        // Actions
        authorizeCloneKey,
        revokeCloneKey,
        fundCloneKey,
        fetchCloneKeys,
        // Constants
        MAX_SPEND_LIMIT_EGLD,
        MAX_CLONE_KEYS,
        MAX_TTL_DAYS,
        MIN_TTL_HOURS,
    };
}
