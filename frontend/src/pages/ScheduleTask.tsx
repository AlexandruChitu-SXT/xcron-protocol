import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { useTxTracker } from '../hooks/useTxTracker';
import { CONTRACTS, GAS_SCHEDULE_TASK } from '../config';
import { TaskTelemetry } from '../components/TaskTelemetry';
import { TypewriterTitle } from '../components/TypewriterTitle';

type TemplateType = 'quicktest' | 'compound' | 'dca' | 'stoploss' | 'claim' | 'nftmint' | 'custom';

interface TemplateDefaults {
    targetContract: string;
    targetEndpoint: string;
    triggerType: 'once' | 'recurring';
    targetRound: string;
    interval: string;
    deposit: string;
    maxGas: string;
    maxRetries: string;
    ttlRounds: string;
}

const TEMPLATES: Record<TemplateType, { title: string; description: string; category: string; defaults: TemplateDefaults }> = {
    quicktest: {
        title: 'Quick Test',
        description: 'Try XCron in seconds. Schedules a simple ping to our test contract to verify the system works.',
        category: 'Demo',
        defaults: {
            targetContract: CONTRACTS.ping,
            targetEndpoint: 'ping',
            triggerType: 'once' as const,
            targetRound: 'next',
            interval: '',
            deposit: '0.1',
            maxGas: '10000000',
            maxRetries: '3',
            ttlRounds: '600',
        },
    },
    compound: {
        title: 'Auto-Compound',
        description: 'Automatically re-stake your staking rewards. Your EGLD is deposited into the XCron Vault, which delegates to a staking provider and auto-compounds via reDelegateRewards.',
        category: 'DeFi',
        defaults: {
            targetContract: CONTRACTS.vault,
            targetEndpoint: 'compound',
            triggerType: 'recurring' as const,
            targetRound: '0',
            interval: '120',
            deposit: '0.1',
            maxGas: '30000000',
            maxRetries: '3',
            ttlRounds: '600',
        },
    },
    dca: {
        title: 'DCA (Dollar Cost Average)',
        description: 'Execute periodic swaps through the XCron Vault. Deposit EGLD and the vault swaps a portion at fixed intervals via the configured DEX pair.',
        category: 'DeFi',
        defaults: {
            targetContract: CONTRACTS.vault,
            targetEndpoint: 'swap',
            triggerType: 'recurring' as const,
            targetRound: '0',
            interval: '180',
            deposit: '0.1',
            maxGas: '30000000',
            maxRetries: '3',
            ttlRounds: '600',
        },
    },
    stoploss: {
        title: 'Stop-Loss',
        description: 'Trigger an emergency swap through the XCron Vault when conditions are met. Protects your position by auto-selling via the configured DEX pair.',
        category: 'DeFi',
        defaults: {
            targetContract: CONTRACTS.vault,
            targetEndpoint: 'emergencySwap',
            triggerType: 'once' as const,
            targetRound: 'next',
            interval: '',
            deposit: '0.01',
            maxGas: '30000000',
            maxRetries: '5',
            ttlRounds: '600',
        },
    },
    claim: {
        title: 'Claim Rewards',
        description: 'Automatically claim your staking rewards from the XCron Vault on a daily schedule. Rewards are sent directly to your wallet.',
        category: 'DeFi',
        defaults: {
            targetContract: CONTRACTS.vault,
            targetEndpoint: 'claimRewards',
            triggerType: 'recurring' as const,
            targetRound: '0',
            interval: '120',
            deposit: '0.1',
            maxGas: '30000000',
            maxRetries: '3',
            ttlRounds: '600',
        },
    },
    nftmint: {
        title: 'NFT Mint',
        description: 'Schedule an automated NFT mint at a specific time. XCron calls the configured NFT collection contract to mint for you automatically.',
        category: 'NFT',
        defaults: {
            targetContract: CONTRACTS.vault,
            targetEndpoint: 'mint',
            triggerType: 'once' as const,
            targetRound: 'next',
            interval: '',
            deposit: '0.01',
            maxGas: '30000000',
            maxRetries: '1',
            ttlRounds: '600',
        },
    },
    custom: {
        title: 'Custom Automation',
        description: 'Full flexibility. Call any smart contract endpoint on any schedule.',
        category: 'Dev',
        defaults: {
            targetContract: '',
            targetEndpoint: '',
            triggerType: 'once' as const,
            targetRound: '',
            interval: '',
            deposit: '0.005',
            maxGas: '10000000',
            maxRetries: '3',
            ttlRounds: '3600',
        },
    },
};

// Modern SVG icons for each template
const TemplateIcon = ({ type, color, size = 20 }: { type: TemplateType; color: string; size?: number }) => {
    const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (type) {
        case 'quicktest': return (<svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>);
        case 'compound': return (<svg {...props}><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /><circle cx="12" cy="12" r="6" /><path d="M12 9v3l2 1" /></svg>);
        case 'dca': return (<svg {...props}><polyline points="22,7 13.5,15.5 8.5,10.5 2,17" /><polyline points="16,7 22,7 22,13" /></svg>);
        case 'stoploss': return (<svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>);
        case 'claim': return (<svg {...props}><circle cx="12" cy="12" r="10" /><path d="M16 8l-4 4-4-4" /><line x1="12" y1="12" x2="12" y2="16" /></svg>);
        case 'nftmint': return (<svg {...props}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18" /><circle cx="8" cy="15" r="2" /><path d="M14 13l3 4h-6l3-4z" /></svg>);
        case 'custom': return (<svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>);
    }
};

const TEMPLATE_KEYS: TemplateType[] = ['quicktest', 'custom', 'compound', 'dca', 'stoploss', 'claim', 'nftmint'];

const TEMPLATE_COLORS: Record<TemplateType, string> = {
    quicktest: 'rgb(0,255,136)',
    custom: 'rgb(139,92,246)',
    compound: 'rgb(34,197,94)',
    dca: 'rgb(59,130,246)',
    stoploss: 'rgb(239,68,68)',
    claim: 'rgb(251,191,36)',
    nftmint: 'rgb(168,85,247)',
};

const TEMPLATE_LABELS: Record<TemplateType, { contract: string; endpoint: string }> = {
    quicktest: { contract: 'Test Contract (pre-filled)', endpoint: 'Function to Call' },
    custom: { contract: 'Target Contract', endpoint: 'Endpoint Function' },
    compound: { contract: 'Farm / Staking Contract', endpoint: 'Function to Call' },
    dca: { contract: 'DEX Contract (e.g. xExchange)', endpoint: 'Swap Function' },
    stoploss: { contract: 'DEX Contract', endpoint: 'Swap Function' },
    claim: { contract: 'Staking / Farm Contract', endpoint: 'Claim Function' },
    nftmint: { contract: 'NFT Collection Contract', endpoint: 'Mint Function' },
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

    const initialTemplate = (searchParams.get('template') as TemplateType) || 'custom';
    const [template, setTemplate] = useState<TemplateType>(
        TEMPLATE_KEYS.includes(initialTemplate) ? initialTemplate : 'custom'
    );

    const [form, setForm] = useState({ ...TEMPLATES[template].defaults });
    const [argsList, setArgsList] = useState<{ type: 'string' | 'number' | 'address', value: string }[]>([]);

    const { txHash, setTxHash, status: txStatus, loading: txLoading } = useTxTracker();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // Human-friendly time state (in seconds)
    const [delaySeconds, setDelaySeconds] = useState(0);
    const [intervalSeconds, setIntervalSeconds] = useState(
        parseInt(TEMPLATES[initialTemplate].defaults.interval || '0') * SECONDS_PER_ROUND
    );
    const [remainingExecs, setRemainingExecs] = useState(10);
    const [requireXwapSafe, setRequireXwapSafe] = useState(false);


    useEffect(() => {
        const tmplDefaults = TEMPLATES[template].defaults;
        setForm({ ...tmplDefaults });
        setArgsList([]);
        setTxHash('');
        setError('');
        setDelaySeconds(0);
        setIntervalSeconds(parseInt(tmplDefaults.interval || '0') * SECONDS_PER_ROUND);
        setRemainingExecs(10);
        setRequireXwapSafe(false);
    }, [template]);

    const update = (field: string, value: string) => {
        setForm((prev: TemplateDefaults) => ({ ...prev, [field]: value }));
        setError('');
        setTxHash(null);
    };

    // Normalize commas to dots for decimal inputs
    const updateDecimal = (field: string, value: string) => {
        update(field, value.replace(/,/g, '.'));
    };

    const addArgument = () => {
        setArgsList([...argsList, { type: 'string', value: '' }]);
    };

    const updateArgument = (index: number, field: 'type' | 'value', val: string) => {
        const newArgs = [...argsList];
        newArgs[index] = { ...newArgs[index], [field]: val };
        setArgsList(newArgs);
    };

    const removeArgument = (index: number) => {
        setArgsList(argsList.filter((_, i) => i !== index));
    };

    const encodeArguments = (): string => {
        if (argsList.length === 0) return '00000000'; // Empty vec length

        let encoded = numToHex8(argsList.length); // u32 length of args vector (not true u32 but 1 byte hack for small args)
        // Wait, for safety we should encode u32 properly.
        encoded = argsList.length.toString(16).padStart(8, '0');

        for (const arg of argsList) {
            let argHex = '';
            if (arg.type === 'string') {
                argHex = stringToHex(arg.value);
            } else if (arg.type === 'number') {
                argHex = parseInt(arg.value).toString(16);
                if (argHex.length % 2 !== 0) argHex = '0' + argHex;
            } else if (arg.type === 'address') {
                argHex = addressToHex(arg.value);
            }

            // Append length of this specific argument as u32
            const argLenBase = (argHex.length / 2).toString(16).padStart(8, '0');
            encoded += argLenBase + argHex;
        }

        return encoded;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wallet.connected) {
            setShowConnectModal(true);
            return;
        }

        setLoading(true);
        setError('');

        // Custom validation (replaces native browser tooltips)
        if (!form.targetContract.trim()) {
            setError('Target contract address is required');
            setLoading(false);
            return;
        }
        if (!form.targetEndpoint.trim()) {
            setError('Endpoint name is required');
            setLoading(false);
            return;
        }
        if (!form.deposit || parseFloat(form.deposit.replace(/,/g, '.')) <= 0) {
            setError('EGLD deposit must be greater than 0');
            setLoading(false);
            return;
        }

        try {
            const targetAddrHex = addressToHex(form.targetContract);
            const endpointHex = stringToHex(form.targetEndpoint);

            // Encode custom arguments securely
            const encodedArgsList = encodeArguments();

            // Supernova: Time-based scheduling using Unix Timestamp (seconds)
            const currentTimestamp = Math.floor(Date.now() / 1000);
            let targetTime = currentTimestamp + delaySeconds;
            // Safety: never send NaN or negative values
            if (!Number.isFinite(targetTime) || targetTime < 0) targetTime = 0;

            let triggerHex: string;
            if (form.triggerType === 'once') {
                triggerHex = '00' + hex64(targetTime);
            } else {
                triggerHex = '01' + hex64(targetTime)
                    + hex64(intervalSeconds)
                    + hex64(remainingExecs);
            }

            const maxGasHex = hex64(parseInt(form.maxGas));
            const depositWei = BigInt(Math.floor(parseFloat(form.deposit.replace(/,/g, '.')) * 1e18));
            const maxRetriesHex = numToHex8(parseInt(form.maxRetries));
            // Convert legacy ttlRounds from template to seconds
            // NOTE: SECONDS_PER_ROUND = 6 currently, will be ~0.6 after Supernova
            const ttlSeconds = parseInt(form.ttlRounds || '1000') * SECONDS_PER_ROUND;
            const ttlHex = hex64(ttlSeconds);
            const requireXwapHex = requireXwapSafe ? '01' : '';

            const data = `scheduleTask@${targetAddrHex}@${endpointHex}@${encodedArgsList}@${triggerHex}@${maxGasHex}@${maxRetriesHex}@${ttlHex}@${requireXwapHex}`;

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
            <div className="app-container" style={{ maxWidth: '100%', padding: '0 16px' }}>
                <div className="page-header" style={{ marginBottom: 28 }}>
                    <TypewriterTitle as="h1" text="Schedule a Task" speed={70} />
                    <TypewriterTitle as="p" text="Choose a template or build your own — XCron can automate any smart contract call" speed={25} />
                </div>

                {/* How It Works — compact inline */}
                <div style={{ display: 'flex', gap: 24, marginBottom: 28, padding: '10px 24px', borderRadius: 6, background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.12)', justifyContent: 'center' }}>
                    {[
                        { num: '1', label: 'Schedule', desc: 'Define what to call & when', color: 'rgb(251,191,36)' },
                        { num: '2', label: 'Deposit', desc: 'EGLD covers keeper gas', color: 'var(--accent-light)' },
                        { num: '3', label: 'Execute', desc: 'Keepers auto-call your target', color: 'rgb(34,197,94)' },
                    ].map(s => (
                        <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 28, height: 28, borderRadius: '50%', background: `${s.color}22`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', fontWeight: 700, flexShrink: 0 }}>{s.num}</span>
                            <span style={{ fontSize: '1.05rem', color: '#ffffff' }}><strong style={{ color: 'var(--text-primary)' }}>{s.label}</strong> — {s.desc}</span>
                        </div>
                    ))}
                </div>

                {/* 3-Column Layout: Templates | Form | Templates */}
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 220px', gap: 12, alignItems: 'start', marginBottom: 60 }}>
                    {/* Left sidebar — templates 1-4 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'start' }}>
                        {(['quicktest', 'custom', 'compound', 'dca'] as TemplateType[]).map((key) => (
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

                    {/* Center — Form */}
                    <div style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>

                        {/* Compact form card */}
                        <div className="card" style={{
                            background: 'transparent',
                            backdropFilter: 'none',
                            WebkitBackdropFilter: 'none',
                            borderColor: 'rgba(250,128,114,0.50)',
                            borderWidth: 1,
                            maxWidth: 'none',
                            padding: 12,
                            boxShadow: '0 0 20px rgba(250,128,114,0.15), 0 0 40px rgba(250,128,114,0.08)',
                            fontSize: '0.88rem',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            {/* Top shimmer accent line */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                                background: 'linear-gradient(90deg, transparent, rgba(250,128,114,0.5), rgba(255,160,122,0.4), transparent)',
                            }} />
                            {/* Template Info */}
                            <div className="template-info" style={{ marginBottom: 3, fontSize: '0.78rem' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TemplateIcon type={template} color={color} size={10} /> <strong>{tmpl.title}</strong></span> — {tmpl.description}
                            </div>

                            <form onSubmit={handleSubmit} noValidate>
                                {/* Target — inline for custom */}
                                <div className="form-section" style={{ marginBottom: 4 }}>
                                    <div style={{ display: template === 'custom' ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                                        </div>

                                        {template === 'custom' && (
                                            <>
                                                {/* Popular Protocols — compact inline helper */}
                                                <div style={{
                                                    marginTop: 2, marginBottom: 4, padding: '4px 8px',
                                                    background: 'rgba(6,182,212,0.04)', borderRadius: 6,
                                                    border: '1px solid rgba(6,182,212,0.10)',
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Protocols</span>
                                                        {[
                                                            { name: 'xExchange', endpoints: ['claimRewards', 'swapTokensFixedInput', 'addLiquidity'], color: '#22c55e' },
                                                            { name: 'Hatom', endpoints: ['claimRewards', 'supply', 'withdraw'], color: '#6366f1' },
                                                            { name: 'AshSwap', endpoints: ['exchange', 'addLiquidity'], color: '#f43f5e' },
                                                            { name: 'OneDex', endpoints: ['swap', 'addLiquidity', 'removeLiquidity'], color: '#f59e0b' },
                                                            { name: 'JewelSwap', endpoints: ['claimRewards', 'stake'], color: '#06b6d4' },
                                                        ].map((proto) => (
                                                            <div key={proto.name} style={{ position: 'relative' }}>
                                                                <details style={{ position: 'relative' }}>
                                                                    <summary style={{
                                                                        cursor: 'pointer', padding: '3px 8px',
                                                                        borderRadius: 4, fontSize: '0.82rem', fontWeight: 600,
                                                                        background: `${proto.color}12`, color: proto.color,
                                                                        border: `1px solid ${proto.color}25`,
                                                                        listStyle: 'none', userSelect: 'none',
                                                                        transition: 'all 0.15s',
                                                                    }}>
                                                                        {proto.name}
                                                                    </summary>
                                                                    <div style={{
                                                                        position: 'absolute', top: 'calc(100% + 3px)', left: 0,
                                                                        zIndex: 30, minWidth: 170,
                                                                        background: 'var(--bg-secondary)', borderRadius: 6,
                                                                        border: '1px solid var(--border-primary)',
                                                                        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
                                                                        overflow: 'hidden',
                                                                    }}>
                                                                        {proto.endpoints.map((ep) => (
                                                                            <div
                                                                                key={ep}
                                                                                onClick={() => {
                                                                                    update('targetEndpoint', ep);
                                                                                    const details = document.querySelectorAll('.form-section details[open]');
                                                                                    details.forEach(d => (d as HTMLDetailsElement).open = false);
                                                                                    addToast(`Endpoint: ${ep} — now paste the ${proto.name} address above`, 'info');
                                                                                }}
                                                                                style={{
                                                                                    padding: '6px 10px', cursor: 'pointer',
                                                                                    fontSize: '0.72rem', fontFamily: 'monospace',
                                                                                    color: 'var(--text-secondary)',
                                                                                    transition: 'background 0.15s',
                                                                                }}
                                                                                onMouseEnter={(e) => {
                                                                                    e.currentTarget.style.background = `${proto.color}15`;
                                                                                    e.currentTarget.style.color = proto.color;
                                                                                }}
                                                                                onMouseLeave={(e) => {
                                                                                    e.currentTarget.style.background = 'transparent';
                                                                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                                                                }}
                                                                            >
                                                                                {ep}()
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </details>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

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

                                                <div className="form-group" style={{ marginTop: 6 }}>
                                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>Function Arguments</span>
                                                        <button type="button" onClick={addArgument} className="btn-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                            + Add Argument
                                                        </button>
                                                    </label>

                                                    {argsList.length === 0 ? (
                                                        <div style={{ textAlign: 'center', padding: '6px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-primary)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                            No arguments required for this function.
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                            {argsList.map((arg, idx) => (
                                                                <div key={idx} style={{ display: 'flex', gap: 8 }}>
                                                                    <select
                                                                        value={arg.type}
                                                                        onChange={(e) => updateArgument(idx, 'type', e.target.value)}
                                                                        style={{ width: '100px', padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', outline: 'none' }}
                                                                    >
                                                                        <option value="string">String</option>
                                                                        <option value="number">Number</option>
                                                                        <option value="address">Address</option>
                                                                    </select>
                                                                    <input
                                                                        type="text"
                                                                        placeholder={arg.type === 'number' ? 'e.g. 1000' : arg.type === 'address' ? 'erd1...' : 'text'}
                                                                        value={arg.value}
                                                                        onChange={(e) => updateArgument(idx, 'value', e.target.value)}
                                                                        required
                                                                        style={{ flex: 1, fontFamily: 'monospace', padding: '8px', borderRadius: 'var(--radius-sm)' }}
                                                                    />
                                                                    <button type="button" onClick={() => removeArgument(idx)} style={{ background: 'rgba(239,68,68,0.1)', color: 'rgb(239,68,68)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', width: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>{/* end inline grid */}
                                </div>

                                {/* Schedule + Budget — side by side */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 8 }}>

                                    {/* Section: Schedule */}
                                    <div className="form-section" style={{ marginBottom: 0, padding: 8, background: 'rgba(250,128,114,0.10)', border: '1px solid rgba(250,128,114,0.35)', borderRadius: 'var(--radius-md)', boxShadow: '0 0 12px rgba(250,128,114,0.08)' }}>
                                        <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Schedule</div>

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
                                                {delaySeconds === 0 ? 'A keeper will execute the task as soon as possible' : `The task will become executable at the specific exact time after ~${formatDuration(delaySeconds)}`}
                                            </small>
                                        </div>

                                        {form.triggerType === 'recurring' && (
                                            <>
                                                <div className="form-group" style={{ marginTop: 12 }}>
                                                    <label>Repeat Every</label>
                                                    <CustomDropdown
                                                        value={intervalSeconds}
                                                        onChange={(val) => setIntervalSeconds(val)}
                                                        options={INTERVAL_PRESETS.map((p) => ({ value: p.seconds, label: p.label }))}
                                                    />
                                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                        The task will re-execute exactly every {formatDuration(intervalSeconds)}
                                                    </small>
                                                </div>
                                                <div className="form-group" style={{ marginTop: 12 }}>
                                                    <label>Repeat Count</label>
                                                    <CustomDropdown
                                                        value={remainingExecs}
                                                        onChange={(val) => setRemainingExecs(val)}
                                                        options={[
                                                            { value: 3, label: '3 times' },
                                                            { value: 5, label: '5 times' },
                                                            { value: 10, label: '10 times' },
                                                            { value: 25, label: '25 times' },
                                                            { value: 50, label: '50 times' },
                                                            { value: 100, label: '100 times' },
                                                        ]}
                                                    />
                                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                        How many times the task will execute before stopping. More repetitions need a larger deposit.
                                                    </small>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Section: Budget */}
                                    <div className="form-section" style={{ marginBottom: 0, padding: 8, background: 'rgba(250,128,114,0.10)', border: '1px solid rgba(250,128,114,0.35)', borderRadius: 'var(--radius-md)', boxShadow: '0 0 12px rgba(250,128,114,0.08)' }}>
                                        <div className="section-title" style={{ fontSize: '0.75rem', marginBottom: 4 }}>Budget</div>

                                        <div className="form-group">
                                            <label>EGLD to Deposit</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0.005"
                                                    value={form.deposit}
                                                    onChange={(e) => updateDecimal('deposit', e.target.value)}
                                                    required
                                                    style={{ paddingRight: 60 }}
                                                />
                                                <span style={{ position: 'absolute', right: 12, top: 12, color: 'var(--text-muted)', fontSize: '0.85rem' }}>EGLD</span>
                                            </div>
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                                                Budget for keeper gas costs.
                                                {form.triggerType === 'recurring'
                                                    ? ' More deposit = more executions.'
                                                    : ' 0.005 EGLD is usually enough.'}
                                                {' '}Unused deposit is refundable.
                                            </small>
                                        </div>

                                        {template === 'custom' && (
                                            <details style={{ marginTop: 8 }}>
                                                <summary style={{
                                                    cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)',
                                                    padding: '6px 0', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6
                                                }}>
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                                                    Advanced Settings
                                                </summary>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                                                    <div className="form-group">
                                                        <label style={{ fontSize: '0.78rem' }}>Gas Limit</label>
                                                        <input
                                                            type="number"
                                                            value={form.maxGas}
                                                            onChange={(e) => update('maxGas', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label style={{ fontSize: '0.78rem' }}>Max Retries</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="10"
                                                            value={form.maxRetries}
                                                            onChange={(e) => update('maxRetries', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </details>
                                        )}
                                    </div>

                                </div>{/* end grid Schedule+Budget */}

                                {/* Extras — Keeper Advanced Features */}
                                <details style={{ marginBottom: 4 }}>
                                    <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)', padding: '4px 0', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                                        Advanced Keeper Features
                                    </summary>

                                    {/* Price Condition — Real keeper feature */}
                                    <div className="form-section" style={{ marginBottom: 4, padding: 8, background: 'rgba(6,182,212,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(6,182,212,0.20)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-8.36l5.67-5.67" /></svg>
                                                    Price Condition
                                                </span>
                                                <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(6,182,212,0.15)', color: 'rgb(6,182,212)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Keeper</span>
                                            </div>
                                        </div>
                                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'block', marginTop: 6, lineHeight: 1.5 }}>
                                            The keeper checks <strong>EGLD price in real-time</strong> via MultiversX API before executing any task.
                                            Configure via keeper env vars: <code style={{ background: 'rgba(6,182,212,0.12)', padding: '1px 4px', borderRadius: 3, fontSize: '0.72rem' }}>XCRON_PRICE_ENABLED=true</code>{' '}
                                            <code style={{ background: 'rgba(6,182,212,0.12)', padding: '1px 4px', borderRadius: 3, fontSize: '0.72rem' }}>XCRON_PRICE_THRESHOLD=50</code>{' '}
                                            <code style={{ background: 'rgba(6,182,212,0.12)', padding: '1px 4px', borderRadius: 3, fontSize: '0.72rem' }}>XCRON_PRICE_CONDITION=above</code>
                                        </small>
                                        <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(6,182,212,0.08)', fontSize: '0.75rem', color: 'rgb(6,182,212)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
                                            The keeper will skip execution if the price condition is not met — 0 gas wasted.
                                        </div>
                                    </div>

                                    {/* AI-Optimized — Real keeper feature */}
                                    <div className="form-section" style={{ marginBottom: 4, padding: 8, background: 'rgba(168,85,247,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(168,85,247,0.20)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
                                                    AI-Optimized Execution
                                                </span>
                                                <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: 'rgb(168,85,247)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Keeper</span>
                                            </div>
                                        </div>
                                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'block', marginTop: 6, lineHeight: 1.5 }}>
                                            The keeper analyzes <strong>network conditions</strong> (round time, congestion) and delays execution when gas is expensive.
                                            Auto-executes after 5 delays (anti-starvation). Prefers off-peak hours (UTC 02:00-06:00).
                                            Enable: <code style={{ background: 'rgba(168,85,247,0.12)', padding: '1px 4px', borderRadius: 3, fontSize: '0.72rem' }}>XCRON_AI_OPTIMIZED=true</code>
                                        </small>
                                        <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(168,85,247,0.08)', fontSize: '0.75rem', color: 'rgb(168,85,247)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M7 5H3" /><path d="M21 17v4" /><path d="M23 19h-4" /></svg>
                                            Saves gas by executing at optimal network moments — no extra cost for users.
                                        </div>
                                    </div>

                                    {/* XWAP Volatility Gate — Real Contract Feature */}
                                    <div className="form-section" style={{ marginBottom: 4, padding: 8, background: 'rgba(251,191,36,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(251,191,36,0.20)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setRequireXwapSafe(!requireXwapSafe)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                                    Volatility Protection
                                                </span>
                                                <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(251,191,36,0.15)', color: 'rgb(251,191,36)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>On-Chain</span>
                                            </div>
                                            <div style={{
                                                width: 36, height: 20, borderRadius: 10, background: requireXwapSafe ? 'rgb(251,191,36)' : 'var(--bg-card)',
                                                border: `1px solid ${requireXwapSafe ? 'rgb(251,191,36)' : 'var(--border-primary)'}`,
                                                position: 'relative', transition: 'all 0.2s',
                                            }}>
                                                <div style={{
                                                    width: 14, height: 14, borderRadius: 7, background: '#fff',
                                                    position: 'absolute', top: 2, left: requireXwapSafe ? 18 : 2, transition: 'all 0.2s',
                                                }} />
                                            </div>
                                        </div>
                                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'block', marginTop: 6, lineHeight: 1.5 }}>
                                            The task will <strong>pause execution</strong> during severe market volatility. Evaluated natively on-chain via the <strong>XWAP Oracle</strong>.
                                            Recommended for DeFi swaps and liquidations to prevent high slippage or sandwich attacks.
                                        </small>
                                    </div>
                                </details>

                                {/* Task Chaining hint */}
                                <div style={{
                                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                                    background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                                    marginBottom: 8, fontSize: '0.72rem', color: 'rgba(34,197,94,0.85)',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                                    <span>
                                        <strong>Task Chaining:</strong> After creating multiple tasks, link them in{' '}
                                        <a href="/tasks" style={{ color: 'rgb(34,197,94)', textDecoration: 'underline' }}>My Tasks</a>
                                        {' '}so they execute sequentially — Step B only runs if Step A succeeds.
                                    </span>
                                </div>

                                {error && (
                                    <div className="toast-error" style={{ position: 'relative', marginBottom: 16, padding: 12, borderRadius: 8 }}>
                                        {error}
                                    </div>
                                )}

                                <button className="btn btn-primary" style={{ width: '100%', padding: 6, fontSize: '0.72rem' }} disabled={loading}>
                                    {loading ? <span className="loading-spinner" /> : wallet.connected ? `Schedule ${tmpl.title}` : 'Connect Wallet to Schedule'}
                                </button>
                            </form>

                            {/* Template About — collapsible */}
                            {template !== 'custom' && template !== 'quicktest' && (
                                <details style={{ marginTop: 12 }}>
                                    <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: color, fontWeight: 600, padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                                        About {tmpl.title}
                                    </summary>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, padding: '8px 0' }}>
                                        {template === 'compound' && 'Auto-compounding reinvests your staking/farm rewards automatically. At 20% APR, daily compounding yields ~22% APY.'}
                                        {template === 'dca' && 'Dollar Cost Averaging buys tokens at regular intervals regardless of price, removing the stress of timing the market.'}
                                        {template === 'stoploss' && 'Stop-Loss monitors your position and triggers a sell when the price drops below your threshold — even while you sleep.'}
                                        {template === 'claim' && 'Automatically claims your accumulated staking or farming rewards on a schedule. Set and forget.'}
                                        {template === 'nftmint' && 'Schedule a mint transaction to fire at the exact block of an NFT launch. Never miss a drop.'}
                                    </div>
                                </details>
                            )}
                        </div>

                        {/* Telemetry — only after submission */}
                        {txHash === 'pending-web-wallet' && (
                            <div className="card" style={{ borderColor: 'rgba(34, 197, 94, 0.3)', marginTop: 16 }}>
                                <div className="section-title" style={{ color: 'var(--success)' }}>Web Wallet Opened</div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Complete the transaction in the MultiversX Web Wallet tab.
                                </p>
                            </div>
                        )}

                        {txHash && txHash !== 'pending-web-wallet' && (
                            <div style={{ marginTop: 16 }}>
                                <TaskTelemetry
                                    txHash={txHash}
                                    txStatus={(txStatus as 'idle' | 'pending' | 'success' | 'fail') || 'idle'}
                                    txLoading={txLoading}
                                />
                            </div>
                        )}

                    </div>

                    {/* Right sidebar — templates 5-7 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'start' }}>
                        {(['stoploss', 'claim', 'nftmint'] as TemplateType[]).map((key) => (
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
        throw new Error(`Invalid contract address: "${addr}". Must be a valid erd1... address.`);
    }
}

function stringToHex(str: string): string {
    return Buffer.from(str, 'utf-8').toString('hex');
}

function hex64(n: number): string {
    return n.toString(16).padStart(16, '0');
}

function numToHex8(n: number): string {
    return n.toString(16).padStart(2, '0');
}
