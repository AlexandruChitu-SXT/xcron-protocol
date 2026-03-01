import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useCloneKey } from '../hooks/useCloneKey';
import type { CloneKeyInfo } from '../hooks/useCloneKey';
import { TypewriterTitle } from './TypewriterTitle';

/* ──────────────── Styles ──────────────── */

const ACCENT = 'rgb(250,128,114)';       // Salmon — XCron brand
const ACCENT_GLOW = 'rgba(250,128,114,0.15)';
const ACCENT_DIM = 'rgba(250,128,114,0.08)';
const GREEN = 'rgb(34,197,94)';
const RED = 'rgb(239,68,68)';
const YELLOW = 'rgb(251,191,36)';

const cardStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${ACCENT}50`,
    borderRadius: 'var(--radius-lg, 12px)',
    padding: '20px',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: `0 0 20px ${ACCENT_GLOW}, 0 0 40px ${ACCENT_DIM}`,
};

const shimmerLine: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    background: `linear-gradient(90deg, transparent, ${ACCENT}80, rgba(255,160,122,0.4), transparent)`,
};

const badgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', borderRadius: 20,
    background: `${color}15`, color,
    fontSize: '0.72rem', fontWeight: 600,
    border: `1px solid ${color}30`,
});

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    borderRadius: 'var(--radius-md, 8px)',
    background: 'var(--bg-secondary, #1a1a2e)',
    color: 'var(--text-primary, #fff)',
    border: '1px solid var(--border-primary, #333)',
    fontSize: '0.88rem', outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'monospace',
};

const btnPrimary: React.CSSProperties = {
    padding: '10px 20px', borderRadius: 'var(--radius-md, 8px)',
    background: `linear-gradient(135deg, ${ACCENT}, rgb(255,160,122))`,
    color: '#0a0a0f', fontWeight: 700, fontSize: '0.88rem',
    border: 'none', cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: `0 4px 15px ${ACCENT_GLOW}`,
};

const btnDanger: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 'var(--radius-md, 8px)',
    background: 'rgba(239,68,68,0.1)',
    color: RED, fontWeight: 600, fontSize: '0.78rem',
    border: `1px solid rgba(239,68,68,0.25)`,
    cursor: 'pointer', transition: 'background 0.15s',
};

/* ──────────────── Component ──────────────── */

export function CloneKeyManager() {
    const { wallet } = useWallet();
    const {
        loading, cloneKeys,
        authorizeCloneKey, revokeCloneKey, fundCloneKey, fetchCloneKeys,
        MAX_SPEND_LIMIT_EGLD, MAX_CLONE_KEYS, MAX_TTL_DAYS,
    } = useCloneKey();

    // Form state
    const [cloneAddress, setCloneAddress] = useState('');
    const [spendLimit, setSpendLimit] = useState('0.5');
    const [ttlDays, setTtlDays] = useState('7');
    const [fundAmount, setFundAmount] = useState('0.1');
    const [fundingKey, setFundingKey] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);

    // Fetch on mount & when wallet changes
    useEffect(() => {
        if (wallet.connected) {
            fetchCloneKeys();
        }
    }, [wallet.connected, wallet.address]);

    const handleAuthorize = async () => {
        if (!cloneAddress.trim()) return;
        const result = await authorizeCloneKey(
            cloneAddress.trim(),
            parseFloat(spendLimit.replace(/,/g, '.')) || 0,
            parseFloat(ttlDays.replace(/,/g, '.')) || 0,
        );
        if (result) {
            setCloneAddress('');
            setSpendLimit('0.5');
            setTtlDays('7');
            setShowForm(false);
            setTimeout(() => fetchCloneKeys(), 3000);
        }
    };

    const handleRevoke = async (addr: string) => {
        const result = await revokeCloneKey(addr);
        if (result) {
            setTimeout(() => fetchCloneKeys(), 3000);
        }
    };

    const handleFund = async (addr: string) => {
        const amount = parseFloat(fundAmount.replace(/,/g, '.')) || 0;
        if (amount <= 0) return;
        const result = await fundCloneKey(addr, amount);
        if (result) {
            setFundingKey(null);
            setFundAmount('0.1');
            setTimeout(() => fetchCloneKeys(), 3000);
        }
    };

    if (!wallet.connected) {
        return (
            <div className="page">
                <div className="app-container">
                    {/* Header */}
                    <div style={{ marginBottom: 20 }}>
                        <TypewriterTitle as="h2" text="Clone-Keys" speed={60} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 4 }}>
                            Burner wallets with spending limits — your main wallet stays safe
                        </p>
                    </div>

                    {/* Explanation */}
                    <div style={{
                        marginBottom: 24, lineHeight: 1.7,
                        fontSize: '0.82rem', color: 'var(--text-secondary)',
                        maxWidth: 720,
                    }}>
                        <p style={{ marginBottom: 12 }}>
                            <strong style={{ color: 'var(--text-primary)' }}>What is a Clone-Key?</strong>{' '}
                            It's a secondary wallet (burner) that you authorize to act on your behalf with a limited budget.
                            Your main wallet is never exposed to the keeper or any external agent — it only signs the initial authorization.
                        </p>
                        <p style={{ marginBottom: 12 }}>
                            <strong style={{ color: 'var(--text-primary)' }}>How does it work?</strong>{' '}
                            1) Create a new wallet (burner) and copy its address.{' '}
                            2) Authorize it here with an EGLD spending limit and an expiration date.{' '}
                            3) The keeper uses that Clone-Key to execute your automated tasks. If the budget runs out or it expires, it stops automatically.
                        </p>
                        <p style={{ marginBottom: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-secondary)' }}>Benefits:</strong>{' '}
                            Your main wallet is never at risk • You control exactly how much it can spend • Revoke instantly and get your funds back • Auto-expires if you forget about it.
                        </p>
                    </div>

                    {/* Connect prompt */}
                    <div style={cardStyle}>
                        <div style={shimmerLine} />
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.6 }}>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Connect your wallet to manage Clone-Keys
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="app-container">
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                        <TypewriterTitle as="h2" text="Clone-Keys" speed={60} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 4 }}>
                            Burner wallets with spending limits — your main wallet stays safe
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={badgeStyle('var(--text-muted)')}>
                            {cloneKeys.length}/{MAX_CLONE_KEYS} keys
                        </span>
                        {cloneKeys.length < MAX_CLONE_KEYS && (
                            <button
                                onClick={() => setShowForm(!showForm)}
                                style={{
                                    ...btnPrimary,
                                    padding: '8px 16px',
                                    fontSize: '0.82rem',
                                    opacity: loading ? 0.5 : 1,
                                }}
                                disabled={loading}
                            >
                                {showForm ? '✕ Cancel' : '+ New Clone-Key'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Explanation */}
                <div style={{
                    marginBottom: 24, lineHeight: 1.7,
                    fontSize: '0.82rem', color: 'var(--text-secondary)',
                    maxWidth: 720,
                }}>
                    <p style={{ marginBottom: 12 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>What is a Clone-Key?</strong>{' '}
                        It's a secondary wallet (burner) that you authorize to act on your behalf with a limited budget.
                        Your main wallet is never exposed to the keeper or any external agent — it only signs the initial authorization.
                    </p>
                    <p style={{ marginBottom: 12 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>How does it work?</strong>{' '}
                        1) Create a new wallet (burner) and copy its address.{' '}
                        2) Authorize it here with an EGLD spending limit and an expiration date.{' '}
                        3) The keeper uses that Clone-Key to execute your automated tasks. If the budget runs out or it expires, it stops automatically.
                    </p>
                    <p style={{ marginBottom: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>Benefits:</strong>{' '}
                        Your main wallet is never at risk • You control exactly how much it can spend • Revoke instantly and get your funds back • Auto-expires if you forget about it.
                    </p>
                </div>

                {/* Create Form */}
                {showForm && (
                    <div style={{ ...cardStyle, marginBottom: 20 }}>
                        <div style={shimmerLine} />
                        <h3 style={{ fontSize: '0.95rem', marginBottom: 16, color: ACCENT }}>
                            Authorize New Clone-Key
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    Clone-Key Address
                                </label>
                                <input
                                    type="text"
                                    placeholder="erd1... (your burner wallet)"
                                    value={cloneAddress}
                                    onChange={(e) => setCloneAddress(e.target.value)}
                                    style={{ ...inputStyle, gridColumn: '1 / -1' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    Spend Limit (EGLD)
                                </label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={`Max ${MAX_SPEND_LIMIT_EGLD}`}
                                    value={spendLimit}
                                    onChange={(e) => setSpendLimit(e.target.value.replace(/,/g, '.'))}
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Validity (days) — max {MAX_TTL_DAYS}
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[1, 7, 14, 30].map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setTtlDays(d.toString())}
                                        style={{
                                            padding: '6px 14px', borderRadius: 6,
                                            background: ttlDays === d.toString() ? `${ACCENT}20` : 'var(--bg-secondary)',
                                            color: ttlDays === d.toString() ? ACCENT : 'var(--text-secondary)',
                                            border: `1px solid ${ttlDays === d.toString() ? `${ACCENT}50` : 'var(--border-primary)'}`,
                                            cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {d}d
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Summary */}
                        <div style={{
                            padding: '12px 16px', borderRadius: 8,
                            background: 'rgba(6,182,212,0.05)',
                            border: '1px solid rgba(6,182,212,0.12)',
                            marginBottom: 16, fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                        }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Summary:</strong>{' '}
                            Authorize a Clone-Key with <strong style={{ color: GREEN }}>{spendLimit || '0'} EGLD</strong> budget,
                            valid for <strong>{ttlDays || '0'} days</strong>.
                            Your EGLD is deposited into the contract and refundable on revoke.
                        </div>

                        <button
                            onClick={handleAuthorize}
                            disabled={loading || !cloneAddress.trim()}
                            style={{
                                ...btnPrimary,
                                width: '100%',
                                opacity: (loading || !cloneAddress.trim()) ? 0.5 : 1,
                            }}
                        >
                            {loading ? 'Authorizing...' : `Authorize Clone-Key (${spendLimit} EGLD)`}
                        </button>
                    </div>
                )}

                {/* Clone-Key List */}
                {cloneKeys.length === 0 && !showForm ? (
                    <div style={cardStyle}>
                        <div style={shimmerLine} />
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.4 }}>
                                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                            </svg>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 8 }}>
                                No Clone-Keys yet
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                Create a burner wallet and authorize it to automate tasks
                                without exposing your main wallet.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {cloneKeys.map((ck, idx) => (
                            <CloneKeyCard
                                key={idx}
                                ck={ck}
                                loading={loading}
                                fundingKey={fundingKey}
                                fundAmount={fundAmount}
                                onRevoke={handleRevoke}
                                onStartFund={(addr) => { setFundingKey(addr); setFundAmount('0.1'); }}
                                onCancelFund={() => setFundingKey(null)}
                                onFund={handleFund}
                                onFundAmountChange={setFundAmount}
                            />
                        ))}
                    </div>
                )}

                {/* Security Notice */}
                <div style={{
                    marginTop: 20, padding: '12px 16px', borderRadius: 8,
                    background: 'rgba(34,197,94,0.05)',
                    border: '1px solid rgba(34,197,94,0.12)',
                    fontSize: '0.75rem', color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <div>
                        <strong style={{ color: GREEN }}>Security:</strong> Your main wallet only signs to authorize/revoke.
                        Clone-Keys can only spend within their assigned budget. Revoke anytime for instant refund.
                        Max {MAX_SPEND_LIMIT_EGLD} EGLD per key, auto-expires after {MAX_TTL_DAYS} days.
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ──────────────── Clone-Key Card ──────────────── */

function CloneKeyCard({ ck, loading, fundingKey, fundAmount, onRevoke, onStartFund, onCancelFund, onFund, onFundAmountChange }: {
    ck: CloneKeyInfo;
    loading: boolean;
    fundingKey: string | null;
    fundAmount: string;
    onRevoke: (addr: string) => void;
    onStartFund: (addr: string) => void;
    onCancelFund: () => void;
    onFund: (addr: string) => void;
    onFundAmountChange: (val: string) => void;
}) {
    const statusColor = ck.isExpired ? RED : GREEN;
    const statusLabel = ck.isExpired ? 'Expired' : 'Active';

    // Budget bar
    const spendLimitBig = BigInt(ck.spendLimit || '0');
    const spentBig = BigInt(ck.spentAmount || '0');
    const pct = spendLimitBig > 0n
        ? Number((spentBig * 100n) / spendLimitBig)
        : 0;
    const barColor = pct > 80 ? RED : pct > 50 ? YELLOW : GREEN;

    return (
        <div style={cardStyle}>
            <div style={shimmerLine} />

            {/* Header Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                    <code style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        {ck.mainAddress.slice(0, 14)}...{ck.mainAddress.slice(-6)}
                    </code>
                    <span style={badgeStyle(statusColor)}>{statusLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {!ck.isExpired && (
                        <button
                            onClick={() => onStartFund(ck.mainAddress)}
                            style={{
                                padding: '5px 12px', borderRadius: 6,
                                background: `${GREEN}10`, color: GREEN,
                                border: `1px solid ${GREEN}25`,
                                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                            }}
                        >
                            + Fund
                        </button>
                    )}
                    <button
                        onClick={() => onRevoke(ck.mainAddress)}
                        disabled={loading}
                        style={{ ...btnDanger, opacity: loading ? 0.5 : 1 }}
                    >
                        Revoke
                    </button>
                </div>
            </div>

            {/* Budget Bar */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Budget Used</span>
                    <span style={{ color: barColor, fontWeight: 600 }}>{ck.spentAmountEgld} / {ck.spendLimitEgld} EGLD</span>
                </div>
                <div style={{
                    height: 6, borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${Math.min(pct, 100)}%`,
                        background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
                        transition: 'width 0.5s ease',
                    }} />
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Remaining
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: GREEN }}>
                        {ck.remainingBudgetEgld} EGLD
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Expires
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: ck.isExpired ? RED : 'var(--text-primary)' }}>
                        {ck.expiryDate}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Time Left
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: ck.isExpired ? RED : YELLOW }}>
                        {ck.ttlRemaining}
                    </div>
                </div>
            </div>

            {/* Fund Form (inline) */}
            {fundingKey === ck.mainAddress && !ck.isExpired && (
                <div style={{
                    marginTop: 12, padding: '12px 16px', borderRadius: 8,
                    background: `${GREEN}08`, border: `1px solid ${GREEN}20`,
                    display: 'flex', gap: 10, alignItems: 'center',
                }}>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={fundAmount}
                        onChange={(e) => onFundAmountChange(e.target.value.replace(/,/g, '.'))}
                        style={{ ...inputStyle, width: '100px', padding: '8px 10px', fontSize: '0.82rem' }}
                        placeholder="EGLD"
                    />
                    <button onClick={() => onFund(ck.mainAddress)} disabled={loading}
                        style={{ ...btnPrimary, padding: '8px 16px', fontSize: '0.78rem' }}>
                        Add Funds
                    </button>
                    <button onClick={onCancelFund}
                        style={{ ...btnDanger, padding: '6px 12px' }}>
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}
