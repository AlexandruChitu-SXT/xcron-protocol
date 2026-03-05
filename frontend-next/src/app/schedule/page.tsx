"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '@/hooks/useWallet';
import { useTxTracker } from '@/hooks/useTxTracker';
import { CONTRACTS } from '@/config';
import { TaskTelemetry } from '@/components/TaskTelemetry';

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
        description: 'Trigger an emergency swap through the XCron Vault when conditions are met. Protects your position by auto-sell via the configured DEX.',
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
        description: 'Automatically claim your staking rewards from the XCron Vault on a daily schedule. Rewards are sent straight to your wallet.',
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
        description: 'Schedule an automated NFT mint at a specific time. XCron calls the configured NFT collection contract to mint for you.',
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
        description: 'Declarative routing. Specify what you want to swap and the minimum acceptable return.',
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

type FlowStep = 'template' | 'contract' | 'endpoint' | 'deposit' | 'confirm';

function ScheduleForm() {
    const { wallet, setShowConnectModal, signAndSendTransaction, addToast } = useWallet();
    const { txHash, setTxHash, status: txStatus, loading: txLoading } = useTxTracker();
    const searchParams = useSearchParams();

    // Core state
    const [step, setStep] = useState<FlowStep>('template');
    const [template, setTemplate] = useState<TemplateType>('custom');
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Form data accumulated through the flow
    const [form, setForm] = useState<Partial<TemplateDefaults>>({});
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial check for query template
    useEffect(() => {
        const queryTemplate = searchParams.get('template') as TemplateType;
        if (queryTemplate && TEMPLATES[queryTemplate]) {
            handleTemplatePillClick(queryTemplate);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

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

    const handleBack = () => {
        if (step === 'template') return;
        // For pre-built templates (non-custom), contract & endpoint are pre-filled,
        // so going back from deposit should return to template selection directly.
        if (template !== 'custom') {
            if (step === 'deposit' || step === 'contract' || step === 'endpoint') {
                setStep('template');
                setTemplate('custom');
                setForm({});
                return;
            }
            if (step === 'confirm') { setStep('deposit'); return; }
        }
        // Custom template follows the full chain
        if (step === 'confirm') setStep('deposit');
        else if (step === 'deposit') setStep('endpoint');
        else if (step === 'endpoint') setStep('contract');
        else if (step === 'contract') setStep('template');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleNext();
        } else if (e.key === 'Escape') {
            handleBack();
        }
    };

    const handleTemplatePillClick = (key: TemplateType) => {
        setTemplate(key);
        setForm(TEMPLATES[key].defaults);
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
        <div className="w-full flex items-center justify-center min-h-[80vh] relative">
            <div className="w-full max-w-[700px] relative z-10 px-4">

                {/* Cinematic Title */}
                <div className="text-center mb-10 w-full animate-[fadeInUp_0.8s_ease_forwards]">
                    <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 tracking-tight break-words drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] relative z-10 w-[120%] -ml-[10%] mb-4">
                        {getPrompt()}
                    </h1>
                </div>

                {/* The Omnibox */}
                <div className={`relative w-full mx-auto transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${step === 'confirm' ? 'scale-105' : 'scale-100'}`}>

                    {/* Magical Glow Behind */}
                    <div className={`absolute -inset-2 bg-gradient-to-r from-cyan-500/50 via-purple-500/50 to-cyan-500/50 blur-xl -z-10 rounded-[40px] transition-opacity duration-500 animate-[glowPulse_4s_infinite_alternate] ${step === 'confirm' ? 'opacity-80' : 'opacity-40'}`} />

                    {/* The Input Container */}
                    <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-[30px] flex items-center justify-start p-4 md:px-6 md:py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] overflow-hidden">
                        <span className="text-cyan-400 mr-4 text-xl font-bold shrink-0">❯</span>

                        {step === 'confirm' ? (
                            <div className="flex-1 text-white text-lg md:text-2xl font-light flex justify-between items-center whitespace-nowrap overflow-hidden">
                                <span className="truncate">deploying task...</span>
                                <span className="text-sm text-white/50 ml-4 shrink-0 hidden sm:block">ESC to cancel</span>
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
                                className="flex-1 bg-transparent border-none outline-none text-white caret-white text-lg md:text-2xl font-light tracking-wide w-full placeholder:text-white/30"
                            />
                        )}

                        {/* Enter Hint */}
                        {step !== 'confirm' && inputValue && (
                            <div className="flex items-center gap-1.5 opacity-60 animate-[fadeIn_0.3s] ml-2 shrink-0">
                                <span className="text-xs text-white hidden sm:block">Press</span>
                                <kbd className="bg-white/10 px-2 py-1 rounded text-white text-xs font-mono">↵</kbd>
                            </div>
                        )}
                    </div>
                </div>

                {/* Error floating below */}
                {error && (
                    <div className="text-red-500 text-center mt-5 text-sm animate-[fadeInUp_0.3s]">
                        {error}
                    </div>
                )}

                {/* Telemetry / Tx Tracker */}
                {txHash && (
                    <div className="mt-10 animate-[fadeIn_0.5s]">
                        {txHash === 'pending-web-wallet' ? (
                            <div className="text-center text-green-400 font-medium">Sign transaction in Web Wallet...</div>
                        ) : (
                            <TaskTelemetry
                                txHash={txHash}
                                txStatus={(txStatus as 'idle' | 'pending' | 'success' | 'fail') || 'idle'}
                                txLoading={txLoading}
                            />
                        )}
                    </div>
                )}

                {/* Back button + selected template indicator */}
                {step !== 'template' && !txHash && (
                    <div className="mt-6 flex justify-center items-center gap-3 animate-[fadeIn_0.3s]">
                        <button
                            onClick={handleBack}
                            className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors duration-200 cursor-pointer group"
                        >
                            <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
                            <span>Back</span>
                        </button>
                        {template !== 'custom' && (
                            <span className="text-white/30 text-xs">│</span>
                        )}
                        {template !== 'custom' && (
                            <span className="text-cyan-400/60 text-xs">
                                ✧ {TEMPLATES[template].title}
                            </span>
                        )}
                    </div>
                )}

                {/* Contextual Helpers (Pills) only on Template step */}
                {step === 'template' && !txHash && (
                    <div className="mt-10 flex flex-wrap gap-2 md:gap-3 justify-center animate-[fadeInUp_1s_ease_forwards]">
                        {(Object.keys(TEMPLATES) as TemplateType[]).map(key => {
                            if (key === 'custom') return null;
                            const t = TEMPLATES[key];
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleTemplatePillClick(key)}
                                    className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 md:px-4 md:py-2 text-white/60 text-xs md:text-sm cursor-pointer transition-all duration-200 flex items-center gap-2 hover:bg-white/10 hover:text-white hover:border-white/20 whitespace-nowrap"
                                >
                                    <span className="text-cyan-400">✧</span> {t.title}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Breadcrumbs / Progress */}
                {step !== 'template' && !txHash && (
                    <div className="mt-8 flex justify-center gap-2 opacity-50">
                        {['contract', 'endpoint', 'deposit'].map((s, i) => {
                            const active = s === step;
                            const passed = ['contract', 'endpoint', 'deposit'].indexOf(step) > i;
                            return (
                                <div key={s} className={`h-1 rounded-full transition-all duration-300 ${active ? 'w-6' : 'w-2'} ${active || passed ? 'bg-white' : 'bg-white/20'}`} />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// NextJS Suspense Wrapper for useSearchParams
export default function SchedulePage() {
    return (
        <Suspense fallback={<div className="w-full flex justify-center py-20"><span className="w-8 h-8 rounded-full border-2 border-white/20 border-t-cyan-500 animate-spin" /></div>}>
            <ScheduleForm />
        </Suspense>
    );
}

// -- Hex encoding utilities --
function addressToHex(addr: string): string {
    try {
        return Address.newFromBech32(addr).toHex();
    } catch {
        throw new Error(`Invalid contract address. Must be a valid erd1... address.`);
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
