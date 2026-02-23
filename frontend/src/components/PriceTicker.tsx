import { useState, useEffect } from 'react';

/**
 * PriceTicker — Live price dashboard via Binance API.
 * No CoinGecko, no rate limits. Auto-refreshes every 30 seconds.
 */

interface TokenPrice {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
}

// All tokens from Binance only
const BINANCE_TOKENS = [
    { symbol: 'EGLD', name: 'MultiversX', binance: 'EGLDUSDT' },
    { symbol: 'BTC', name: 'Bitcoin', binance: 'BTCUSDT' },
    { symbol: 'ETH', name: 'Ethereum', binance: 'ETHUSDT' },
    { symbol: 'BNB', name: 'Binance', binance: 'BNBUSDT' },
    { symbol: 'SOL', name: 'Solana', binance: 'SOLUSDT' },
    { symbol: 'XRP', name: 'Ripple', binance: 'XRPUSDT' },
];

export function PriceTicker() {
    const [prices, setPrices] = useState<TokenPrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [error, setError] = useState('');

    const fetchPrices = async () => {
        try {
            const results: TokenPrice[] = [];

            // Binance batch — fast, reliable, no rate limits
            const binanceSymbols = BINANCE_TOKENS.map(t => `"${t.binance}"`).join(',');
            const binanceResp = await fetch(
                `https://api.binance.com/api/v3/ticker/24hr?symbols=[${binanceSymbols}]`
            );
            if (binanceResp.ok) {
                const binanceData = await binanceResp.json();
                for (const token of BINANCE_TOKENS) {
                    const ticker = binanceData.find((t: any) => t.symbol === token.binance);
                    if (ticker) {
                        results.push({
                            symbol: token.symbol,
                            name: token.name,
                            price: parseFloat(ticker.lastPrice),
                            change24h: parseFloat(ticker.priceChangePercent),
                        });
                    }
                }
            }

            if (results.length > 0) {
                setPrices(results);
                setLastUpdate(new Date());
                setError('');
            } else {
                setError('Price feed unavailable');
            }
        } catch (err: any) {
            setError('Price feed unavailable');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPrices();
        const interval = setInterval(fetchPrices, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatPrice = (price: number): string => {
        if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        if (price >= 1) return `$${price.toFixed(2)}`;
        if (price >= 0.01) return `$${price.toFixed(4)}`;
        return `$${price.toFixed(6)}`;
    };

    const formatChange = (change: number): string => {
        const sign = change >= 0 ? '+' : '';
        return `${sign}${change.toFixed(1)}%`;
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.title}>📊 Live Prices</span>
                    <span style={styles.badge}>ECOSYSTEM</span>
                </div>
                <div style={{ ...styles.grid, opacity: 0.4 }}>
                    {[1, 2, 3, 4].map(i => (
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
                    <span style={styles.title}>📊 Live Prices</span>
                    <span style={styles.badge}>ECOSYSTEM</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {error && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{error}</span>}
                    {lastUpdate && (
                        <span style={styles.updated}>
                            Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <div
                        onClick={fetchPrices}
                        style={styles.refreshBtn}
                        title="Refresh prices"
                    >
                        ↻
                    </div>
                </div>
            </div>

            <div style={styles.grid}>
                {prices.map((token) => (
                    <div key={token.symbol} style={styles.card}>
                        <div style={styles.cardTop}>
                            <div style={styles.symbol}>{token.symbol}</div>
                            <div style={styles.name}>{token.name}</div>
                        </div>
                        <div style={styles.cardBottom}>
                            <span style={styles.price}>{formatPrice(token.price)}</span>
                            <span style={{
                                ...styles.change,
                                color: token.change24h >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                                background: token.change24h >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            }}>
                                {formatChange(token.change24h)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={styles.footer}>
                <span>Powered by Binance • Auto-refresh 30s</span>
                <span>Used by XCron Keeper for hybrid price checks</span>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: 20,
        background: 'rgba(0, 255, 136, 0.03)',
        borderRadius: 'var(--radius-lg, 12px)',
        border: '1px solid rgba(0, 255, 136, 0.25)',
        boxShadow: '0 0 30px rgba(0, 255, 136, 0.10), 0 0 60px rgba(0, 255, 136, 0.05)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
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
    },
    refreshBtn: {
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: '0.85rem',
        transition: 'all 0.2s',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10,
    },
    card: {
        padding: '12px 14px',
        background: 'rgba(0, 255, 136, 0.06)',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px solid rgba(0, 255, 136, 0.15)',
        transition: 'border-color 0.2s, transform 0.15s',
        cursor: 'default',
    },
    cardTop: {
        marginBottom: 8,
    },
    symbol: {
        fontSize: '0.85rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        lineHeight: 1.3,
    },
    name: {
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        lineHeight: 1.2,
    },
    cardBottom: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    price: {
        fontSize: '0.9rem',
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
        marginTop: 12,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        opacity: 0.7,
    },
    skeleton: {
        background: 'var(--bg-secondary)',
        borderRadius: 4,
        height: 14,
    },
};
