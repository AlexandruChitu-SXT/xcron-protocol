import { useEffect, useState } from 'react';
import { useContractQuery, bufferToNumber } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK } from '../config';

interface TaskTelemetryProps {
    txHash: string | null;
    txStatus: 'idle' | 'pending' | 'success' | 'fail';
    txLoading: boolean;
}

export function TaskTelemetry({ txHash, txStatus, txLoading }: TaskTelemetryProps) {
    const [keeperStatus, setKeeperStatus] = useState<'waiting' | 'listening' | 'executed'>('waiting');
    const { query } = useContractQuery();

    // Poll the SC to check if the task was actually executed on-chain
    useEffect(() => {
        let interval: NodeJS.Timeout;
        let cancelled = false;

        if (txStatus === 'success') {
            setKeeperStatus('listening');

            // Poll every 6 seconds to check if task count increased (real on-chain data)
            let initialCount: number | null = null;

            interval = setInterval(async () => {
                if (cancelled) return;
                try {
                    const stats = await query(CONTRACTS.scheduler, 'getProtocolStats');
                    if (stats.length >= 2) {
                        const tasksExecuted = bufferToNumber(stats[1]);
                        if (initialCount === null) {
                            initialCount = tasksExecuted;
                        } else if (tasksExecuted > initialCount) {
                            // Task count actually increased on-chain
                            setKeeperStatus('executed');
                        }
                    }
                } catch {
                    // Ignore poll errors — keep waiting
                }
            }, 6000);
        } else {
            setKeeperStatus('waiting');
        }

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [txStatus, query]);

    const steps = [
        {
            id: 'broadcast',
            title: 'Transaction Broadcasted',
            desc: txHash ? 'Signed and submitted to mempool' : 'Waiting for wallet signature...',
            active: !!txHash,
            completed: txStatus === 'success' || txStatus === 'fail',
            error: txStatus === 'fail',
        },
        {
            id: 'finalize',
            title: 'Block Finalized',
            desc: txStatus === 'success' ? `Persisted on ${NETWORK.name.charAt(0).toUpperCase() + NETWORK.name.slice(1)}` : 'Awaiting blockchain consensus...',
            active: txStatus === 'pending' || txStatus === 'success',
            completed: txStatus === 'success',
            error: txStatus === 'fail',
        },
        {
            id: 'listening',
            title: 'Keepers Listening',
            desc: keeperStatus === 'listening' ? 'Decentralized bots are verifying trigger conditions' : 'Waiting for network sync...',
            active: keeperStatus === 'listening' || keeperStatus === 'executed',
            completed: keeperStatus === 'executed',
        },
        {
            id: 'executed',
            title: 'Task Executed',
            desc: keeperStatus === 'executed' ? 'Automation successful!' : 'Pending trigger condition...',
            active: keeperStatus === 'executed',
            completed: keeperStatus === 'executed',
        },
    ];

    if (!txHash) return null; // Only show telemetry once a transaction is initiated

    return (
        <div className="card" style={{ background: 'var(--bg-glass)', borderColor: 'var(--border-primary)', overflow: 'hidden', padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)', background: 'linear-gradient(to right, rgba(20,184,166,0.1), transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: txStatus === 'fail' ? 'var(--error)' : keeperStatus === 'executed' ? 'var(--success)' : 'var(--accent)', boxShadow: `0 0 10px ${txStatus === 'fail' ? 'var(--error)' : 'var(--accent)'}`, animation: (txLoading || keeperStatus === 'listening') ? 'pulse 2s infinite' : 'none' }} />
                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Live Telemetry</h3>
                    {txHash !== 'pending-web-wallet' && (
                        <a href={`${NETWORK.explorerUrl}/transactions/${txHash}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>
                            {txHash.slice(0, 8)}...{txHash.slice(-6)} ↗
                        </a>
                    )}
                </div>
            </div>

            <div style={{ padding: '24px 20px' }}>
                <div className="telemetry-timeline">
                    {steps.map((step, index) => {
                        const isLast = index === steps.length - 1;
                        const isPending = step.active && !step.completed && !step.error;

                        let dotColor = 'var(--text-muted)';
                        let lineColor = 'var(--border-primary)';

                        if (step.error) {
                            dotColor = 'var(--error)';
                            lineColor = 'var(--error)';
                        } else if (step.completed) {
                            dotColor = 'var(--success)';
                            lineColor = 'var(--success)';
                        } else if (step.active) {
                            dotColor = 'var(--accent)';
                        }

                        return (
                            <div key={step.id} style={{ display: 'flex', gap: 16, marginBottom: isLast ? 0 : 24, position: 'relative' }}>
                                {/* Timeline connecting line */}
                                {!isLast && (
                                    <div style={{
                                        position: 'absolute', left: 11, top: 24, bottom: -24, width: 2,
                                        background: lineColor, opacity: step.completed ? 0.5 : 0.2,
                                        transition: 'background 0.3s'
                                    }} />
                                )}

                                {/* Dot / Icon */}
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-card)',
                                    border: `2px solid ${dotColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    zIndex: 2, transition: 'all 0.3s',
                                    boxShadow: isPending ? `0 0 12px ${dotColor}40` : 'none'
                                }}>
                                    {step.completed && !step.error && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    )}
                                    {isPending && (
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, animation: 'pulse 1.5s infinite' }} />
                                    )}
                                    {step.error && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    )}
                                </div>

                                {/* Text Content */}
                                <div style={{ flex: 1, paddingBottom: isLast ? 0 : 4, opacity: step.active ? 1 : 0.5, transition: 'opacity 0.3s' }}>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: step.error ? 'var(--error)' : 'var(--text-primary)', marginBottom: 4 }}>
                                        {step.title}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                        {step.desc}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {keeperStatus === 'executed' && (
                <div style={{ padding: '12px 20px', background: 'rgba(34,197,94,0.1)', borderTop: '1px solid rgba(34,197,94,0.2)', color: 'var(--success)', fontSize: '0.85rem', textAlign: 'center', fontWeight: 500 }}>
                    Automation Flow Completed Successfully
                </div>
            )}
        </div>
    );
}
