import { devWarn } from '../utils/devLog';
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * PriceTicker — Real-time price dashboard via Binance WebSocket.
 * 
 * Uses wss://stream.binance.com for live streaming prices.
 * Initial load via REST, then real-time updates via WebSocket.
 */

interface TokenPrice {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
}

const BINANCE_TOKENS = [
    { symbol: 'EGLD', name: 'MultiversX', binance: 'EGLDUSDT', stream: 'egldusdt' },
    { symbol: 'BTC', name: 'Bitcoin', binance: 'BTCUSDT', stream: 'btcusdt' },
    { symbol: 'ETH', name: 'Ethereum', binance: 'ETHUSDT', stream: 'ethusdt' },
    { symbol: 'BNB', name: 'Binance', binance: 'BNBUSDT', stream: 'bnbusdt' },
    { symbol: 'SOL', name: 'Solana', binance: 'SOLUSDT', stream: 'solusdt' },
    { symbol: 'XRP', name: 'Ripple', binance: 'XRPUSDT', stream: 'xrpusdt' },
];

// Build combined stream URL
const STREAMS = BINANCE_TOKENS.map(t => `${t.stream}@ticker`).join('/');
const WS_URL = `wss://stream.binance.com:9443/stream?streams=${STREAMS}`;

export function PriceTicker() {
    const [prices, setPrices] = useState<Map<string, TokenPrice>>(new Map());
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [lastTick, setLastTick] = useState<Date | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectRef = useRef<number>(0);

    // Initial load via REST to get 24h change %
    const fetchInitial = useCallback(async () => {
        try {
            const symbols = BINANCE_TOKENS.map(t => `"${t.binance}"`).join(',');
            const resp = await fetch(
                `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols}]`
            );
            if (resp.ok) {
                const data = await resp.json();
                const map = new Map<string, TokenPrice>();
                for (const token of BINANCE_TOKENS) {
                    const ticker = data.find((t: any) => t.symbol === token.binance);
                    if (ticker) {
                        map.set(token.binance, {
                            symbol: token.symbol,
                            name: token.name,
                            price: parseFloat(ticker.lastPrice),
                            change24h: parseFloat(ticker.priceChangePercent),
                        });
                    }
                }
                setPrices(map);
                setLastTick(new Date());
            }
        } catch (err) {
            devWarn('PriceTicker REST fallback error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // WebSocket connection
    const connectWs = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        // Stop trying after 5 reconnects
        if (reconnectRef.current >= 5) return;

        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                reconnectRef.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    const d = msg.data;
                    if (!d || !d.s) return;

                    // d.s = symbol (e.g. EGLDUSDT), d.c = close/last price, d.P = 24h change %
                    const binanceSymbol = d.s;
                    const token = BINANCE_TOKENS.find(t => t.binance === binanceSymbol);
                    if (!token) return;

                    setPrices(prev => {
                        const next = new Map(prev);
                        next.set(binanceSymbol, {
                            symbol: token.symbol,
                            name: token.name,
                            price: parseFloat(d.c),
                            change24h: parseFloat(d.P) || prev.get(binanceSymbol)?.change24h || 0,
                        });
                        return next;
                    });
                    setLastTick(new Date());
                } catch { }
            };

            ws.onclose = () => {
                setConnected(false);
                // Auto-reconnect with backoff (max 5 attempts)
                if (reconnectRef.current < 5) {
                    const delay = Math.min(2000 * Math.pow(2, reconnectRef.current), 30000);
                    reconnectRef.current++;
                    setTimeout(connectWs, delay);
                }
            };

            ws.onerror = () => {
                // Silently close — onclose will handle reconnect
                try { ws.close(); } catch { }
            };
        } catch {
            // WebSocket constructor can throw if URL is invalid — silently ignore
        }
    }, []);

    useEffect(() => {
        fetchInitial();
        // Delay WebSocket connection slightly to avoid mount/unmount race
        const wsTimer = setTimeout(connectWs, 500);
        return () => {
            clearTimeout(wsTimer);
            try { wsRef.current?.close(); } catch { }
        };
    }, [fetchInitial, connectWs]);

    const priceList = BINANCE_TOKENS
        .map(t => prices.get(t.binance))
        .filter((p): p is TokenPrice => !!p);

    const formatPrice = (price: number): string => {
        if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        if (price >= 1) return `$${price.toFixed(2)}`;
        if (price >= 0.01) return `$${price.toFixed(4)}`;
        return `$${price.toFixed(6)}`;
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
                    <span style={styles.title}>Live Prices</span>
                    <span style={styles.badge}>REAL-TIME</span>
                </div>
                <div style={{ ...styles.grid, opacity: 0.4 }}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
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
                    <span style={styles.title}>Live Prices</span>
                    <span style={styles.badge}>REAL-TIME</span>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: connected ? 'rgb(0, 255, 136)' : 'rgb(239, 68, 68)',
                        boxShadow: connected ? '0 0 8px rgb(0, 255, 136)' : '0 0 8px rgb(239, 68, 68)',
                        animation: connected ? 'pulse 2s infinite' : 'none',
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
                {priceList.map((token) => (
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
                                background: token.change24h >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            }}>
                                {formatChange(token.change24h)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={styles.footer}>
                <span>Binance WebSocket • Real-time streaming</span>
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
        fontFamily: "'SF Mono', 'Fira Code', monospace",
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
        transition: 'all 0.15s ease',
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
