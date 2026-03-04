import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { useTxTracker } from '../hooks/useTxTracker';
import { CONTRACTS, GAS_SCHEDULE_TASK } from '../config';
import { TaskTelemetry } from '../components/TaskTelemetry';
import { TypewriterTitle } from '../components/TypewriterTitle';

type TemplateType = 'quicktest' | 'compound' | 'dca' | 'stoploss' | 'claim' | 'nftmint' | 'custom' | 'smartintent';

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
    smartintent: {
        title: 'Smart Swap Intent',
        description: 'Declarative routing. Specify what you want to swap and the minimum acceptable return. Solvers do the complex routing for you securely.',
        category: 'Vanguard V2',
        defaults: {
            targetContract: '',
            targetEndpoint: 'solveIntent',
            triggerType: 'once' as const,
            targetRound: '',
            interval: '',
            deposit: '0.005',
            maxGas: '60000000',
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
        case 'smartintent': return (<svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
    }
};

const TEMPLATE_KEYS: TemplateType[] = ['quicktest', 'smartintent', 'custom', 'compound', 'dca', 'stoploss', 'claim', 'nftmint'];

const TEMPLATE_COLORS: Record<TemplateType, string> = {
    quicktest: 'rgb(0,255,136)',
    custom: 'rgb(139,92,246)',
    compound: 'rgb(34,197,94)',
    dca: 'rgb(59,130,246)',
    stoploss: 'rgb(239,68,68)',
    claim: 'rgb(251,191,36)',
    nftmint: 'rgb(168,85,247)',
    smartintent: 'rgb(255,42,128)',
};

const TEMPLATE_LABELS: Record<TemplateType, { contract: string; endpoint: string }> = {
    quicktest: { contract: 'Test Contract (pre-filled)', endpoint: 'Function to Call' },
    custom: { contract: 'Target Contract', endpoint: 'Endpoint Function' },
    compound: { contract: 'Farm / Staking Contract', endpoint: 'Function to Call' },
    dca: { contract: 'DEX Contract (e.g. xExchange)', endpoint: 'Swap Function' },
    stoploss: { contract: 'DEX Contract', endpoint: 'Swap Function' },
    claim: { contract: 'Staking / Farm Contract', endpoint: 'Claim Function' },
    nftmint: { contract: 'NFT Collection Contract', endpoint: 'Mint Function' },
    smartintent: { contract: 'Intent Target (Auto)', endpoint: 'Intent Action (Auto)' },
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


// The different stages of the Omnibox flow
type FlowStep = 'template' | 'contract' | 'endpoint' | 'deposit' | 'confirm';

export function ScheduleTask() {
    const { wallet, setShowConnectModal, signAndSendTransaction, addToast } = useWallet();
    const { txHash, setTxHash, status: txStatus, loading: txLoading } = useTxTracker();

    // Core state
    const [step, setStep] = useState<FlowStep>('template');
    const [template, setTemplate] = useState<TemplateType>('custom');
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Form data accumulated through the flow
    const [form, setForm] = useState<Partial<TemplateDefaults>>({});

    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus input on step change
    useEffect(() => {
        if (inputRef && inputRef.current) {
            inputRef.current.focus();
        }
        setInputValue('');
        setError('');
    }, [step]);

    const handleNext = () => {
        if (!inputValue.trim() && step !== 'template') return;

        setError('');

        switch (step) {
            case 'template':
                setStep('contract');
                break;
            case 'contract':
                if (inputValue.length < 62 || !inputValue.startsWith('erd1')) {
                    setError('Invalid MultiversX contract address.');
                    return;
                }
                setForm(prev => ({ ...prev, targetContract: inputValue }));
                setStep('endpoint');
                break;
            case 'endpoint':
                setForm(prev => ({ ...prev, targetEndpoint: inputValue }));
                setStep('deposit');
                break;
            case 'deposit':
                const depositVal = parseFloat(inputValue.replace(/,/g, '.'));
                if (isNaN(depositVal) || depositVal <= 0) {
                    setError('Enter a valid EGLD amount (e.g. 0.05)');
                    return;
                }
                setForm(prev => ({
                    ...prev,
                    deposit: inputValue.replace(/,/g, '.'),
                    // Default scheduling options to speed up Omnibox demo:
                    triggerType: 'once',
                    maxGas: '10000000',
                    maxRetries: '3',
                    ttlRounds: '1000'
                }));
                setStep('confirm');
                break;
            case 'confirm':
                handleSubmit();
                break;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleNext();
        } else if (e.key === 'Escape') {
            // Go back
            if (step === 'contract') setStep('template');
            if (step === 'endpoint') setStep('contract');
            if (step === 'deposit') setStep('endpoint');
            if (step === 'confirm') setStep('deposit');
        }
    };

    const handleTemplatePillClick = (key: TemplateType) => {
        setTemplate(key);
        setForm(TEMPLATES[key].defaults);
        // Pre-filled templates go straight to deposit
        if (key !== 'custom') {
            setStep('deposit');
        } else {
            setStep('contract');
        }
    };

    const handleSubmit = async () => {
        if (!wallet.connected) {
            setShowConnectModal(true);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const targetAddrHex = addressToHex(form.targetContract || '');
            const endpointHex = stringToHex(form.targetEndpoint || '');
            const encodedArgsList = '00000000'; // No args in minimalist flow for now

            const currentTimestamp = Math.floor(Date.now() / 1000);
            const triggerHex = '00' + hex64(currentTimestamp);

            const maxGasHex = hex64(parseInt(form.maxGas || '10000000'));
            const depositWei = BigInt(Math.floor(parseFloat(form.deposit || '0') * 1e18));
            const maxRetriesHex = numToHex8(parseInt(form.maxRetries || '3'));
            const ttlSeconds = parseInt(form.ttlRounds || '1000') * 6;
            const ttlHex = hex64(ttlSeconds);
            const requireXwapHex = '';

            const data = `scheduleTask@${targetAddrHex}@${endpointHex}@${encodedArgsList}@${triggerHex}@${maxGasHex}@${maxRetriesHex}@${ttlHex}@${requireXwapHex}`;

            const result = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                value: depositWei.toString(),
                data,
                gasLimit: 50000000,
            });

            if (result) {
                setTxHash(result);
                if (result !== 'pending-web-wallet') {
                    addToast('Task scheduled! Check explorer for confirmation.', 'success');
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to schedule task');
            setStep('template');
        } finally {
            setLoading(false);
        }
    };

    const getPrompt = () => {
        switch (step) {
            case 'template': return 'What do you want to automate?';
            case 'contract': return 'Enter the smart contract address';
            case 'endpoint': return 'What function should the keeper call?';
            case 'deposit': return 'How much EGLD to deposit for gas?';
            case 'confirm': return 'Press Enter to deploy to Vanguard Network';
            default: return '';
        }
    };

    const getPlaceholder = () => {
        switch (step) {
            case 'template': return 'Type "swap", "claim", or select below...';
            case 'contract': return 'erd1...';
            case 'endpoint': return 'e.g., claimRewards';
            case 'deposit': return '0.05';
            case 'confirm': return '';
            default: return '';
        }
    };

    return (
        <div className="page" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80vh',
            background: 'radial-gradient(ellipse at center, rgba(14,165,233,0.03) 0%, transparent 70%)'
        }}>

            <div style={{ width: '100%', maxWidth: 700, position: 'relative', zIndex: 10 }}>

                {/* Cinematic Title */}
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <h1 style={{
                        fontSize: '1.8rem',
                        fontWeight: 300,
                        color: '#fff',
                        letterSpacing: '-0.5px',
                        animation: 'fadeInUp 0.8s ease forwards'
                    }}>
                        {getPrompt()}
                    </h1>
                </div>

                {/* The Omnibox */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    transform: step === 'confirm' ? 'scale(1.02)' : 'scale(1)',
                    transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>

                    {/* Magical Glow Behind */}
                    <div style={{
                        position: 'absolute',
                        top: -10, left: -10, right: -10, bottom: -10,
                        background: 'linear-gradient(90deg, rgba(6,182,212,0.5), rgba(168,85,247,0.5), rgba(6,182,212,0.5))',
                        filter: 'blur(20px)',
                        opacity: step === 'confirm' ? 0.8 : 0.4,
                        zIndex: -1,
                        borderRadius: 40,
                        transition: 'opacity 0.5s ease',
                        animation: 'glowPulse 4s infinite alternate'
                    }} />

                    {/* The Input Container */}
                    <div style={{
                        background: 'rgba(5, 10, 20, 0.95)', // Made slightly darker to pop the text
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.2)', // Slightly brighter border
                        borderRadius: 30,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        padding: '16px 24px', // Increased padding for a larger click area
                        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.15)',
                    }}>
                        <span style={{ color: 'var(--accent-light)', marginRight: 16, fontSize: '1.2rem', fontWeight: 600 }}>❯</span>

                        {step === 'confirm' ? (
                            <div style={{ flex: 1, color: '#ffffff', fontSize: '1.4rem', fontWeight: 300, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>deploying task...</span>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>ESC to cancel</span>
                            </div>
                        ) : (
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={getPlaceholder()}
                                disabled={loading}
                                style={{
                                    flex: 1,
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    color: '#ffffff', // Ensures user typing is bright white
                                    caretColor: '#ffffff', // Ensures the blinking cursor is white
                                    fontSize: '1.4rem',
                                    fontWeight: 300,
                                    letterSpacing: '0.5px',
                                    width: '100%',
                                }}
                            />
                        )}

                        {/* Enter Hint */}
                        {step !== 'confirm' && inputValue && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6, animation: 'fadeIn 0.3s' }}>
                                <span style={{ fontSize: '0.8rem', color: '#fff' }}>Press</span>
                                <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 4, color: '#fff', fontSize: '0.75rem', fontFamily: 'monospace' }}>↵</kbd>
                            </div>
                        )}
                    </div>
                </div>

                {/* Error floating below */}
                {error && (
                    <div style={{ color: '#ef4444', textAlign: 'center', marginTop: 20, fontSize: '0.9rem', animation: 'fadeInUp 0.3s' }}>
                        {error}
                    </div>
                )}

                {/* Telemetry / Tx Tracker */}
                {txHash && (
                    <div style={{ marginTop: 40, animation: 'fadeIn 0.5s' }}>
                        {txHash === 'pending-web-wallet' ? (
                            <div style={{ textAlign: 'center', color: 'var(--success)' }}>Sign transaction in Web Wallet...</div>
                        ) : (
                            <TaskTelemetry
                                txHash={txHash}
                                txStatus={(txStatus as 'idle' | 'pending' | 'success' | 'fail') || 'idle'}
                                txLoading={txLoading}
                            />
                        )}
                    </div>
                )}

                {/* Contextual Helpers (Pills) only on Template step */}
                {step === 'template' && !txHash && (
                    <div style={{
                        marginTop: 40,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                        justifyContent: 'center',
                        animation: 'fadeInUp 1s ease forwards',
                        opacity: 0
                    }}>
                        {(Object.keys(TEMPLATES) as TemplateType[]).map(key => {
                            if (key === 'custom') return null;
                            const t = TEMPLATES[key];
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleTemplatePillClick(key)}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 20,
                                        padding: '8px 16px',
                                        color: 'var(--text-secondary)',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                        e.currentTarget.style.color = '#fff';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}
                                >
                                    <span style={{ color: 'var(--accent-light)' }}>✧</span> {t.title}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Breadcrumbs / Progress */}
                {step !== 'template' && !txHash && (
                    <div style={{
                        marginTop: 30,
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 8,
                        opacity: 0.5
                    }}>
                        {['contract', 'endpoint', 'deposit'].map((s, i) => {
                            const active = s === step;
                            const passed = ['contract', 'endpoint', 'deposit'].indexOf(step) > i;
                            return (
                                <div key={s} style={{
                                    width: active ? 24 : 8,
                                    height: 4,
                                    borderRadius: 2,
                                    background: active || passed ? '#fff' : 'rgba(255,255,255,0.2)',
                                    transition: 'all 0.3s'
                                }} />
                            );
                        })}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes glowPulse {
                    0% { filter: blur(20px) brightness(1); }
                    100% { filter: blur(25px) brightness(1.3); }
                }
            `}</style>
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
