import { useState, useEffect } from 'react';

/**
 * PriceTicker — Live price dashboard for MultiversX ecosystem tokens.
 * 
 * Fetches real prices from CoinGecko (free API, no key needed).
 * Auto-refreshes every 30 seconds.
 */

interface TokenPrice {
    id: string;
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    icon: string;
}

const ECOSYSTEM_TOKENS = [
    { id: 'elrond-erd-2', symbol: 'EGLD', name: 'MultiversX', icon: '⬡' },
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
    { id: 'utrust', symbol: 'UTK', name: 'xMoney', icon: '◈' },
    { id: 'hatom', symbol: 'HTM', name: 'Hatom', icon: '🔬' },
    { id: 'ash-token', symbol: 'ASH', name: 'AshSwap', icon: '🔥' },
    { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', icon: '💲' },
    { id: 'tether', symbol: 'USDT', name: 'Tether', icon: '💵' },
];

const COINGECKO_IDS = ECOSYSTEM_TOKENS.map(t => t.id).join(',');

export function PriceTicker() {
    const [prices, setPrices] = useState<TokenPrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [error, setError] = useState('');

    const fetchPrices = async () => {
        try {
            const resp = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd&include_24hr_change=true`
            );
            if (!resp.ok) throw new Error('API error');
            const data = await resp.json();

            const updated: TokenPrice[] = ECOSYSTEM_TOKENS.map(token => ({
                ...token,
                price: data[token.id]?.usd ?? 0,
                change24h: data[token.id]?.usd_24h_change ?? 0,
            })).filter(t => t.price > 0);

            setPrices(updated);
            setLastUpdate(new Date());
            setError('');
        } catch (err: any) {
            setError('Price feed unavailable');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPrices();
        const interval = setInterval(fetchPrices, 30000); // 30s refresh
        return () => clearInterval(interval);
    }, []);

    const formatPrice = (price: number): string => {
        if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        if (price >= 1) return `$${price.toFixed(2)}`;
        return `$${price.toFixed(4)}`;
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
                            <span style={styles.icon}>{token.icon}</span>
                            <div>
                                <div style={styles.symbol}>{token.symbol}</div>
                                <div style={styles.name}>{token.name}</div>
                            </div>
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
                <span>Powered by CoinGecko • Auto-refresh 30s</span>
                <span>Used by XCron Keeper for hybrid price checks</span>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: 20,
        background: 'var(--bg-glass)',
        borderRadius: 'var(--radius-lg, 12px)',
        border: '1px solid var(--border-primary)',
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
        background: 'rgba(6,182,212,0.12)',
        color: 'rgb(6,182,212)',
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
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px solid var(--border-primary)',
        transition: 'border-color 0.2s, transform 0.15s',
        cursor: 'default',
    },
    cardTop: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    icon: {
        fontSize: '1.1rem',
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    symbol: {
        fontSize: '0.8rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        lineHeight: 1.2,
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
