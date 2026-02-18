import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { CONTRACTS, GAS_SCHEDULE_TASK, EXPLORER_TX } from '../config';

type TemplateType = 'compound' | 'dca' | 'stoploss' | 'claim' | 'nftmint' | 'custom';

const TEMPLATES: Record<TemplateType, { title: string; description: string; category: string; defaults: any }> = {
    compound: {
        title: 'Auto-Compound',
        description: 'Automatically claim and reinvest your farm or staking rewards. Maximizes APY through the power of compound interest.',
        category: 'DeFi',
        defaults: {
            targetContract: '',
            targetEndpoint: 'claimRewards',
            triggerType: 'recurring' as const,
            targetRound: '0',
            interval: '14400',
            deposit: '0.1',
            maxGas: '15000000',
            maxRetries: '3',
            ttlRounds: '100000',
        },
    },
    dca: {
        title: 'DCA (Dollar Cost Average)',
        description: 'Buy tokens on a recurring schedule. Removes emotion from investing and builds positions over time.',
        category: 'DeFi',
        defaults: {
            targetContract: '',
            targetEndpoint: 'swap',
            triggerType: 'recurring' as const,
            targetRound: '0',
            interval: '100800',
            deposit: '0.5',
            maxGas: '20000000',
            maxRetries: '3',
            ttlRounds: '500000',
        },
    },
    stoploss: {
        title: 'Stop-Loss',
        description: 'Automatically sell a token when the price drops below your threshold. Protect your portfolio from sudden crashes.',
        category: 'DeFi',
        defaults: {
            targetContract: '',
            targetEndpoint: 'swap',
            triggerType: 'recurring' as const,
            targetRound: '0',
            interval: '600',
            deposit: '0.2',
            maxGas: '20000000',
            maxRetries: '5',
            ttlRounds: '50000',
        },
    },
    claim: {
        title: 'Claim Rewards',
        description: 'Automatically claim staking or farm rewards on a schedule. No need to log in every day — your rewards arrive automatically.',
        category: 'DeFi',
        defaults: {
            targetContract: '',
            targetEndpoint: 'claimRewards',
            triggerType: 'recurring' as const,
            targetRound: '0',
            interval: '14400',
            deposit: '0.1',
            maxGas: '10000000',
            maxRetries: '3',
            ttlRounds: '100000',
        },
    },
    nftmint: {
        title: 'NFT Auto-Mint',
        description: 'Schedule a mint transaction at the exact drop time. Never miss a launch again — your mint fires automatically.',
        category: 'NFT',
        defaults: {
            targetContract: '',
            targetEndpoint: 'mint',
            triggerType: 'once' as const,
            targetRound: '',
            interval: '',
            deposit: '0.2',
            maxGas: '20000000',
            maxRetries: '1',
            ttlRounds: '100',
        },
    },
    custom: {
        title: 'Custom Automation',
        description: 'Full flexibility. Call any smart contract function on any schedule. For developers and power users.',
        category: 'Dev',
        defaults: {
            targetContract: '',
            targetEndpoint: '',
            triggerType: 'once' as const,
            targetRound: '',
            interval: '',
            deposit: '0.1',
            maxGas: '10000000',
            maxRetries: '3',
            ttlRounds: '1000',
        },
    },
};

// Modern SVG icons for each template
const TemplateIcon = ({ type, color, size = 20 }: { type: TemplateType; color: string; size?: number }) => {
    const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (type) {
        case 'compound': return (<svg {...props}><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /><circle cx="12" cy="12" r="6" /><path d="M12 9v3l2 1" /></svg>);
        case 'dca': return (<svg {...props}><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" /><polyline points="16,7 22,7 22,13" /></svg>);
        case 'stoploss': return (<svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>);
        case 'claim': return (<svg {...props}><circle cx="12" cy="12" r="10" /><path d="M16 8l-4 4-4-4" /><line x1="12" y1="12" x2="12" y2="16" /></svg>);
        case 'nftmint': return (<svg {...props}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18" /><circle cx="8" cy="15" r="2" /><path d="M14 13l3 4h-6l3-4z" /></svg>);
        case 'custom': return (<svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>);
    }
};

const TEMPLATE_KEYS: TemplateType[] = ['compound', 'dca', 'stoploss', 'claim', 'nftmint', 'custom'];

const TEMPLATE_COLORS: Record<TemplateType, string> = {
    compound: 'rgb(34,197,94)',
    dca: 'rgb(59,130,246)',
    stoploss: 'rgb(239,68,68)',
    claim: 'rgb(251,191,36)',
    nftmint: 'rgb(168,85,247)',
    custom: 'rgb(139,92,246)',
};

const TEMPLATE_LABELS: Record<TemplateType, { contract: string; endpoint: string }> = {
    compound: { contract: 'Farm / Staking Contract', endpoint: 'Function to Call' },
    dca: { contract: 'DEX Contract (e.g. xExchange)', endpoint: 'Swap Function' },
    stoploss: { contract: 'DEX Contract', endpoint: 'Swap Function' },
    claim: { contract: 'Staking / Farm Contract', endpoint: 'Claim Function' },
    nftmint: { contract: 'NFT Collection Contract', endpoint: 'Mint Function' },
    custom: { contract: 'Target Contract', endpoint: 'Endpoint Function' },
};

// Custom styled dropdown (replaces native <select>)
function CustomDropdown({ options, value, onChange }: {
    options: { value: number; label: string }[];
    value: number;
    onChange: (val: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selected = options.find(o => o.value === value);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                    border: `1px solid ${open ? 'var(--accent)' : 'var(--border-primary)'}`,
                    fontSize: '0.9rem', cursor: 'pointer', userSelect: 'none',
                    transition: 'border-color 0.2s',
                }}
            >
                {selected?.label || '—'}
            </div>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    maxHeight: 240, overflowY: 'auto',
                }}>
                    {options.map((opt) => (
                        <div
                            key={opt.value}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            style={{
                                padding: '10px 14px', cursor: 'pointer', fontSize: '0.88rem',
                                color: opt.value === value ? 'var(--accent-light)' : 'var(--text-secondary)',
                                background: opt.value === value ? 'rgba(6,182,212,0.08)' : 'transparent',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(6,182,212,0.12)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = opt.value === value ? 'rgba(6,182,212,0.08)' : 'transparent')}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Time unit helpers — round duration is a network parameter
const SECONDS_PER_ROUND = 6; // devnet default, adjustable for production
const INTERVAL_PRESETS = [
    { label: '10 minutes', seconds: 600 },
    { label: '30 minutes', seconds: 1800 },
    { label: '1 hour', seconds: 3600 },
    { label: '6 hours', seconds: 21600 },
    { label: '12 hours', seconds: 43200 },
    { label: '24 hours', seconds: 86400 },
    { label: '7 days', seconds: 604800 },
];

function secondsToRounds(seconds: number): number {
    return Math.max(1, Math.round(seconds / SECONDS_PER_ROUND));
}

function formatDuration(seconds: number): string {
    if (seconds < 3600) {
        const m = Math.round(seconds / 60);
        return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
    }
    if (seconds < 86400) {
        const h = Math.round(seconds / 3600);
        return `${h} ${h === 1 ? 'hour' : 'hours'}`;
    }
    const d = Math.round(seconds / 86400);
    return `${d} ${d === 1 ? 'day' : 'days'}`;
}

export function ScheduleTask() {
    const { wallet, setShowConnectModal, signAndSendTransaction, addToast } = useWallet();
    const [searchParams] = useSearchParams();

    const initialTemplate = (searchParams.get('template') as TemplateType) || 'compound';
    const [template, setTemplate] = useState<TemplateType>(
        TEMPLATE_KEYS.includes(initialTemplate) ? initialTemplate : 'compound'
    );

    const [form, setForm] = useState({ ...TEMPLATES[template].defaults });
    const [txHash, setTxHash] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // Human-friendly time state (in seconds)
    const [delaySeconds, setDelaySeconds] = useState(0);
    const [intervalSeconds, setIntervalSeconds] = useState(
        parseInt(TEMPLATES[initialTemplate].defaults.interval || '0') * SECONDS_PER_ROUND
    );

    useEffect(() => {
        const tmplDefaults = TEMPLATES[template].defaults;
        setForm({ ...tmplDefaults });
        setTxHash('');
        setError('');
        setDelaySeconds(0);
        setIntervalSeconds(parseInt(tmplDefaults.interval || '0') * SECONDS_PER_ROUND);
    }, [template]);

    const update = (field: string, value: string) => {
        setForm((prev: any) => ({ ...prev, [field]: value }));
        setError('');
        setTxHash('');
    };

    // Normalize commas to dots for decimal inputs
    const updateDecimal = (field: string, value: string) => {
        update(field, value.replace(/,/g, '.'));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wallet.connected) {
            setShowConnectModal(true);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const targetAddrHex = addressToHex(form.targetContract);
            const endpointHex = stringToHex(form.targetEndpoint);
            const emptyVec = '00000000';

            let triggerHex: string;
            const delayRounds = secondsToRounds(delaySeconds);
            if (form.triggerType === 'once') {
                triggerHex = '00' + roundToHex(delayRounds);
            } else {
                const intervalRounds = secondsToRounds(intervalSeconds);
                triggerHex = '01' + roundToHex(delayRounds)
                    + roundToHex(intervalRounds)
                    + roundToHex(10);
            }

            const maxGasHex = roundToHex(parseInt(form.maxGas));
            const depositWei = BigInt(Math.floor(parseFloat(form.deposit.replace(/,/g, '.')) * 1e18));
            const maxRetriesHex = numToHex8(parseInt(form.maxRetries));
            const ttlHex = roundToHex(parseInt(form.ttlRounds));

            const data = `scheduleTask@${targetAddrHex}@${endpointHex}@${emptyVec}@${triggerHex}@${maxGasHex}@${maxRetriesHex}@${ttlHex}`;

            const result = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                value: depositWei.toString(),
                data,
                gasLimit: GAS_SCHEDULE_TASK,
            });

            if (result) {
                setTxHash(result);
                if (result !== 'pending-web-wallet') {
                    addToast('Task scheduled! Check explorer for confirmation.', 'success');
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to schedule task');
            addToast(`Schedule failed: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const tmpl = TEMPLATES[template];
    const labels = TEMPLATE_LABELS[template];
    const color = TEMPLATE_COLORS[template];

    return (
        <div className="page">
            <div className="app-container">
                <div className="page-header">
                    <h1>Schedule a Task</h1>
                    <p>Choose a template or build your own — XCron can automate any smart contract call</p>
                </div>

                {/* Template Selector */}
                <div className="template-selector-6">
                    {TEMPLATE_KEYS.map((key) => (
                        <div
                            key={key}
                            className={`template-card ${template === key ? 'active' : ''}`}
                            onClick={() => setTemplate(key)}
                        >
                            <div className="tc-icon" style={{ background: `${TEMPLATE_COLORS[key]}20` }}>
                                <TemplateIcon type={key} color={TEMPLATE_COLORS[key]} />
                            </div>
                            <h4>{TEMPLATES[key].title}</h4>
                            <span className="tc-badge" style={{ color: TEMPLATE_COLORS[key] }}>{TEMPLATES[key].category}</span>
                        </div>
                    ))}
                </div>

                <div className="grid-2">
                    {/* Form */}
                    <div className="card" style={{ background: `${color}08`, borderColor: `${color}33` }}>
                        {/* Template Info */}
                        <div className="template-info">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TemplateIcon type={template} color={color} size={16} /> <strong>{tmpl.title}</strong></span> — {tmpl.description}
                        </div>

                        <form onSubmit={handleSubmit}>
                            {/* Section: Target Details */}
                            <div className="form-section" style={{ marginBottom: 24 }}>
                                <div className="section-title" style={{ fontSize: '0.9rem', marginBottom: 12 }}>Target Details</div>

                                <div className="form-group">
                                    <label>{labels.contract}</label>
                                    <input
                                        type="text"
                                        placeholder="erd1qqq..."
                                        value={form.targetContract}
                                        onChange={(e) => update('targetContract', e.target.value)}
                                        required
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                    {template !== 'custom' && (
                                        <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                            Paste the address of the contract you want XCron to interact with
                                        </small>
                                    )}
                                </div>

                                {template === 'custom' && (
                                    <div className="form-group">
                                        <label>{labels.endpoint}</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. claimRewards"
                                            value={form.targetEndpoint}
                                            onChange={(e) => update('targetEndpoint', e.target.value)}
                                            required
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                        <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                            The smart contract function name to call (e.g. claimRewards, swap, mint)
                                        </small>
                                    </div>
                                )}
                            </div>

                            {/* Section: Schedule */}
                            <div className="form-section" style={{ marginBottom: 24, padding: 20, background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)' }}>
                                <div className="section-title" style={{ fontSize: '0.9rem', marginBottom: 12 }}>Schedule</div>

                                <div className="form-group">
                                    <label>Trigger Type</label>
                                    <div className="segmented-control">
                                        <div
                                            className={`segmented-item ${form.triggerType === 'once' ? 'active' : ''}`}
                                            onClick={() => update('triggerType', 'once')}
                                        >
                                            One-time
                                        </div>
                                        <div
                                            className={`segmented-item ${form.triggerType === 'recurring' ? 'active' : ''}`}
                                            onClick={() => update('triggerType', 'recurring')}
                                        >
                                            Recurring
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>{form.triggerType === 'once' ? 'Execute After' : 'Start After'}</label>
                                    <CustomDropdown
                                        value={delaySeconds}
                                        onChange={(val) => setDelaySeconds(val)}
                                        options={[
                                            { value: 0, label: 'Immediately (as soon as possible)' },
                                            { value: 600, label: '10 minutes' },
                                            { value: 1800, label: '30 minutes' },
                                            { value: 3600, label: '1 hour' },
                                            { value: 21600, label: '6 hours' },
                                            { value: 86400, label: '24 hours' },
                                        ]}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                        {delaySeconds === 0 ? 'A keeper will execute the task on the very next available round' : `The task will become executable after ~${formatDuration(delaySeconds)}`}
                                    </small>
                                </div>

                                {form.triggerType === 'recurring' && (
                                    <div className="form-group" style={{ marginTop: 12 }}>
                                        <label>Repeat Every</label>
                                        <CustomDropdown
                                            value={intervalSeconds}
                                            onChange={(val) => setIntervalSeconds(val)}
                                            options={INTERVAL_PRESETS.map((p) => ({ value: p.seconds, label: p.label }))}
                                        />
                                        <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                            The task will re-execute every {formatDuration(intervalSeconds)} ({secondsToRounds(intervalSeconds).toLocaleString()} rounds)
                                        </small>
                                    </div>
                                )}
                            </div>

                            {/* Section: Budget */}
                            <div className="form-section" style={{ marginBottom: 24 }}>
                                <div className="section-title" style={{ fontSize: '0.9rem', marginBottom: 12 }}>Budget</div>

                                <div className="form-group">
                                    <label>EGLD to Deposit</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0.1"
                                            value={form.deposit}
                                            onChange={(e) => updateDecimal('deposit', e.target.value)}
                                            required
                                            style={{ paddingRight: 60 }}
                                        />
                                        <span style={{ position: 'absolute', right: 12, top: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>EGLD</span>
                                    </div>
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                                        This is the budget that pays keepers for executing your task.
                                        {form.triggerType === 'recurring'
                                            ? ' For recurring tasks, a larger deposit allows more executions before running out.'
                                            : ' For a single execution, 0.1 EGLD is usually enough.'}
                                        {' '}Any unused deposit is refunded when you cancel the task.
                                    </small>
                                </div>

                                {template === 'custom' && (
                                    <div className="grid-2" style={{ gap: 12 }}>
                                        <div className="form-group">
                                            <label>Max Gas</label>
                                            <input
                                                type="number"
                                                value={form.maxGas}
                                                onChange={(e) => update('maxGas', e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Max Retries</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="10"
                                                value={form.maxRetries}
                                                onChange={(e) => update('maxRetries', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="toast-error" style={{ position: 'relative', marginBottom: 16, padding: 12, borderRadius: 8 }}>
                                    {error}
                                </div>
                            )}

                            <button className="btn btn-primary" style={{ width: '100%', padding: 16, fontSize: '1rem' }} disabled={loading}>
                                {loading ? <span className="loading-spinner" /> : wallet.connected ? `Schedule ${tmpl.title}` : 'Connect Wallet to Schedule'}
                            </button>
                        </form>
                    </div>

                    {/* Preview / Help */}
                    <div>
                        <div className="card" style={{ marginBottom: 16, background: 'rgba(6,182,212,0.06)', borderColor: 'rgba(6,182,212,0.2)' }}>
                            <div className="section-title">How It Works</div>
                            <div className="activity-feed">
                                <div className="activity-item">
                                    <span className="activity-dot pending" />
                                    <span className="activity-text">
                                        <strong style={{ color: 'var(--text-primary)' }}>1. Schedule</strong> — You define what to call and when
                                    </span>
                                </div>
                                <div className="activity-item">
                                    <span className="activity-dot" style={{ background: 'var(--accent)' }} />
                                    <span className="activity-text">
                                        <strong style={{ color: 'var(--text-primary)' }}>2. Deposit</strong> — EGLD covers keeper gas costs
                                    </span>
                                </div>
                                <div className="activity-item">
                                    <span className="activity-dot success" />
                                    <span className="activity-text">
                                        <strong style={{ color: 'var(--text-primary)' }}>3. Execute</strong> — Keepers automatically call your target
                                    </span>
                                </div>
                            </div>
                        </div>

                        {template !== 'custom' && (
                            <div className="card" style={{ marginBottom: 16, background: `${color}0a`, borderColor: `${color}26` }}>
                                <div className="section-title" style={{ color }}>
                                    About {tmpl.title}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    {template === 'compound' && (
                                        <>
                                            <p style={{ marginBottom: 8 }}>Auto-compounding reinvests your staking or farm rewards automatically, turning simple interest into compound interest.</p>
                                            <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Example:</strong> At 20% APR, daily compounding yields ~22% APY — that extra 2% is free money.</p>
                                            <p>The default interval of 14,400 rounds ≈ 24 hours on MultiversX.</p>
                                        </>
                                    )}
                                    {template === 'dca' && (
                                        <>
                                            <p style={{ marginBottom: 8 }}>Dollar Cost Averaging buys a fixed amount of tokens at regular intervals, regardless of price.</p>
                                            <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Why?</strong> Removes the stress of timing the market. Over time, you average out price volatility.</p>
                                            <p>The default interval of 100,800 rounds ≈ 7 days on MultiversX.</p>
                                        </>
                                    )}
                                    {template === 'stoploss' && (
                                        <>
                                            <p style={{ marginBottom: 8 }}>Stop-Loss monitors your position and triggers a sell when the price drops below your threshold.</p>
                                            <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Protection:</strong> Limits your downside risk automatically, even while you sleep.</p>
                                            <p>The default interval of 600 rounds ≈ 1 hour for fast price monitoring.</p>
                                        </>
                                    )}
                                    {template === 'claim' && (
                                        <>
                                            <p style={{ marginBottom: 8 }}>Automatically claims your accumulated staking or farming rewards on a schedule.</p>
                                            <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Set and forget:</strong> No need to log in daily — your rewards are claimed and sent to your wallet automatically.</p>
                                            <p>The default interval of 14,400 rounds ≈ 24 hours on MultiversX.</p>
                                        </>
                                    )}
                                    {template === 'nftmint' && (
                                        <>
                                            <p style={{ marginBottom: 8 }}>Schedule a mint transaction to fire at the exact block of an NFT launch.</p>
                                            <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Never miss a drop:</strong> Set the target round to the launch block and XCron mints for you instantly.</p>
                                            <p>Default is one-time execution — set the exact round for the mint.</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {txHash === 'pending-web-wallet' && (
                            <div className="card" style={{ borderColor: 'rgba(34, 197, 94, 0.3)' }}>
                                <div className="section-title" style={{ color: 'var(--success)' }}>
                                    Web Wallet Opened
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Complete the transaction in the MultiversX Web Wallet tab. Once confirmed, your task will appear in "My Tasks".
                                </p>
                            </div>
                        )}

                        {txHash && txHash !== 'pending-web-wallet' && (
                            <div className="card" style={{ borderColor: 'rgba(34, 197, 94, 0.3)' }}>
                                <div className="section-title" style={{ color: 'var(--success)' }}>
                                    Task Scheduled!
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 12 }}>
                                    Your task has been submitted to the blockchain.
                                </p>
                                <a
                                    href={EXPLORER_TX(txHash)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-secondary btn-sm"
                                >
                                    View on Explorer →
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// -- Hex encoding utilities --

function addressToHex(addr: string): string {
    try {
        return Address.newFromBech32(addr).toHex();
    } catch {
        return addr;
    }
}

function stringToHex(str: string): string {
    return Buffer.from(str, 'utf-8').toString('hex');
}

function roundToHex(n: number): string {
    return n.toString(16).padStart(16, '0');
}

function numToHex8(n: number): string {
    return n.toString(16).padStart(2, '0');
}
