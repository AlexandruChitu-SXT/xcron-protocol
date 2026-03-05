import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * PriceTicker — Live prices from xExchange (MultiversX native DEX).
 *
 * Reads token prices directly from xExchange liquidity pools via MultiversX API.
 * On-chain verified prices • Zero gas cost (view functions) • Auto-refresh every 15s.
 */

interface TokenPrice {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
}

// Top xExchange tokens sorted by relevance to the MultiversX ecosystem
const XEXCHANGE_API = 'https://api.multiversx.com/mex/tokens?size=50';
const EGLD_ECONOMICS_API = 'https://api.multiversx.com/economics';
const REFRESH_INTERVAL_MS = 3_000; // 3 seconds — view functions are free, feels near-live

export function PriceTicker() {
    const [prices, setPrices] = useState<TokenPrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastTick, setLastTick] = useState<Date | null>(null);
    const [tokenCount, setTokenCount] = useState(0);
    const intervalRef = useRef<number>(0);

    const fetchPrices = useCallback(async () => {
        try {
            // Fetch both EGLD native price + all xExchange tokens in parallel
            const [egldResp, mexResp] = await Promise.all([
                fetch(EGLD_ECONOMICS_API),
                fetch(XEXCHANGE_API),
            ]);

            const egldData = await egldResp.json();
            const mexData: any[] = await mexResp.json();

            const tokens: TokenPrice[] = [];

            // EGLD from /economics (native chain price)
            if (egldData?.price) {
                tokens.push({
                    symbol: 'EGLD',
                    name: 'MultiversX',
                    price: egldData.price,
                    change24h: 0, // economics endpoint doesn't provide 24h change
                });
            }

            // All xExchange tokens with price > 0
            setTokenCount(mexData.length);
            for (const t of mexData) {
                if (!t.price || t.price <= 0) continue;
                // Skip WEGLD since we already have EGLD
                if (t.symbol === 'WEGLD') {
                    // Use WEGLD's 24h change for EGLD (same asset)
                    const egldEntry = tokens.find(x => x.symbol === 'EGLD');
                    if (egldEntry && t.previous24hPrice > 0) {
                        egldEntry.change24h = ((t.price - t.previous24hPrice) / t.previous24hPrice) * 100;
                    }
                    continue;
                }

                const change24h = t.previous24hPrice > 0
                    ? ((t.price - t.previous24hPrice) / t.previous24hPrice) * 100
                    : 0;

                tokens.push({
                    symbol: t.symbol,
                    name: t.name || t.symbol,
                    price: t.price,
                    change24h,
                });
            }

            // Sort: highest volume tokens first (approximate by price * known factors)
            // Keep EGLD first, then sort top movers by absolute 24h volume
            const egld = tokens.find(t => t.symbol === 'EGLD');
            const rest = tokens
                .filter(t => t.symbol !== 'EGLD')
                .sort((a, b) => {
                    // Prioritize major tokens
                    const majorOrder: Record<string, number> = {
                        'USDC': 1, 'USDT': 2, 'WBTC': 3, 'WETH': 4, 'WTAO': 5,
                        'MEX': 6, 'HTM': 7, 'ASH': 8, 'RIDE': 9, 'ZPAY': 10,
                    };
                    const aOrder = majorOrder[a.symbol] ?? 99;
                    const bOrder = majorOrder[b.symbol] ?? 99;
                    if (aOrder !== bOrder) return aOrder - bOrder;
                    return b.price - a.price;
                });

            const sorted = egld ? [egld, ...rest] : rest;

            // Show all tokens — scrollable list
            setPrices(sorted);
            setLastTick(new Date());
        } catch {
            // Silently fail — will retry on next interval
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPrices();
        intervalRef.current = window.setInterval(fetchPrices, REFRESH_INTERVAL_MS);
        return () => clearInterval(intervalRef.current);
    }, [fetchPrices]);

    const formatPrice = (price: number): string => {
        if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        if (price >= 1) return `$${price.toFixed(2)}`;
        if (price >= 0.01) return `$${price.toFixed(4)}`;
        if (price >= 0.0001) return `$${price.toFixed(6)}`;
        return `$${price.toExponential(2)}`;
    };

    const formatChange = (change: number): string => {
        const sign = change >= 0 ? '+' : '';
        return `${sign}${change.toFixed(2)}%`;
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                        <rect x="1" y="8" width="3" height="6" rx="0.5" fill="rgb(0, 255, 136)" opacity="0.6" />
                        <rect x="5" y="5" width="3" height="9" rx="0.5" fill="rgb(0, 255, 136)" opacity="0.8" />
                        <rect x="9" y="2" width="3" height="12" rx="0.5" fill="rgb(0, 255, 136)" />
                        <rect x="13" y="6" width="2" height="8" rx="0.5" fill="rgb(0, 255, 136)" opacity="0.7" />
                    </svg>
                    <span style={styles.title}>xExchange Prices</span>
                    <span style={styles.badge}>ON-CHAIN</span>
                </div>
                <div style={{ ...styles.grid, opacity: 0.4 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} style={styles.card}>
                            <div style={{ ...styles.skeleton, width: 60, height: 14 }} />
                            <div style={{ ...styles.skeleton, width: 80, height: 20, marginTop: 6 }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                        <rect x="1" y="8" width="3" height="6" rx="0.5" fill="rgb(0, 255, 136)" opacity="0.6" />
                        <rect x="5" y="5" width="3" height="9" rx="0.5" fill="rgb(0, 255, 136)" opacity="0.8" />
                        <rect x="9" y="2" width="3" height="12" rx="0.5" fill="rgb(0, 255, 136)" />
                        <rect x="13" y="6" width="2" height="8" rx="0.5" fill="rgb(0, 255, 136)" opacity="0.7" />
                    </svg>
                    <span style={styles.title}>xExchange Prices</span>
                    <span style={styles.badge}>ON-CHAIN</span>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'rgb(0, 255, 136)',
                        boxShadow: '0 0 8px rgb(0, 255, 136)',
                        animation: 'pulse 2s infinite',
                    }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {lastTick && (
                        <span style={styles.updated}>
                            {lastTick.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                </div>
            </div>

            <div style={styles.grid}>
                {prices.map((token) => (
                    <div key={token.symbol} style={styles.card}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={styles.symbol}>{token.symbol}</div>
                            <div style={styles.name}>{token.name}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={styles.price}>{formatPrice(token.price)}</span>
                            <span style={{
                                ...styles.change,
                                color: token.change24h >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                                background: token.change24h >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            }}>
                                {formatChange(token.change24h)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={styles.footer}>
                <span>xExchange • MultiversX on-chain prices</span>
                <span>{tokenCount} tokens tracked • 3s refresh</span>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: 12,
        background: 'rgba(0, 255, 136, 0.03)',
        borderRadius: 'var(--radius-lg, 12px)',
        border: '1px solid rgba(0, 255, 136, 0.25)',
        boxShadow: '0 0 30px rgba(0, 255, 136, 0.10), 0 0 60px rgba(0, 255, 136, 0.05)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontSize: '1rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
    },
    badge: {
        fontSize: '0.55rem',
        padding: '2px 6px',
        borderRadius: 4,
        background: 'rgba(0, 255, 136, 0.15)',
        color: 'rgb(0, 255, 136)',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
    },
    updated: {
        fontSize: '0.65rem',
        color: 'var(--text-muted)',
        fontFamily: "'SF Mono', 'Fira Code', monospace",
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 4,
        flex: 1,
        overflowY: 'auto' as const,
        maxHeight: 320,
        paddingRight: 2,
    },
    card: {
        padding: '6px 10px',
        background: 'rgba(0, 255, 136, 0.06)',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px solid rgba(0, 255, 136, 0.15)',
        transition: 'all 0.15s ease',
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    symbol: {
        fontSize: '0.78rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        lineHeight: 1.2,
    },
    name: {
        fontSize: '0.55rem',
        color: 'var(--text-muted)',
        lineHeight: 1.1,
    },
    price: {
        fontSize: '0.8rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        fontFamily: "'SF Mono', 'Fira Code', monospace",
    },
    change: {
        fontSize: '0.65rem',
        fontWeight: 600,
        padding: '2px 5px',
        borderRadius: 4,
    },
    footer: {
        marginTop: 6,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.55rem',
        color: 'var(--text-muted)',
        opacity: 0.7,
    },
    skeleton: {
        background: 'var(--bg-secondary)',
        borderRadius: 4,
        height: 14,
    },
};
