import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { CONTRACTS } from '../config';
import { TypewriterTitle } from '../components/TypewriterTitle';
import { Address } from '@multiversx/sdk-core';

// Arbitrary gas limits for these owner interactions
const GAS_STAKING_OPS = 20_000_000;

function bigIntToHex(b: bigint): string {
    let hex = b.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    return hex;
}

export function AdminPanel() {
    const { wallet, signAndSendTransaction, addToast } = useWallet();

    // Form states
    const [providerAddress, setProviderAddress] = useState('');
    const [delegateAmount, setDelegateAmount] = useState('1');
    const [undelegateAmount, setUndelegateAmount] = useState('1');
    const [sweepKeeperAddr, setSweepKeeperAddr] = useState('');

    const handleSetProvider = async () => {
        if (!providerAddress) return addToast('Please enter a provider address', 'error');

        let providerHex = '';
        try {
            providerHex = Address.newFromBech32(providerAddress).toHex();
        } catch {
            return addToast('Invalid MultiversX address', 'error');
        }

        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: `setStakingProvider@${providerHex}`,
            gasLimit: GAS_STAKING_OPS,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Staking provider updated!', 'success');
        }
    };

    const handleDelegate = async () => {
        const depositWei = BigInt(Math.floor(parseFloat(delegateAmount.replace(/,/g, '.')) * 1e18));
        const amountHex = bigIntToHex(depositWei);

        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: `delegateStake@${amountHex}`,
            gasLimit: GAS_STAKING_OPS * 2,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Successfully delegated idle stake!', 'success');
        }
    };

    const handleUndelegate = async () => {
        const amountWei = BigInt(Math.floor(parseFloat(undelegateAmount.replace(/,/g, '.')) * 1e18));
        const amountHex = bigIntToHex(amountWei);

        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: `unDelegateStake@${amountHex}`,
            gasLimit: GAS_STAKING_OPS * 2,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Unstake requested from provider!', 'success');
        }
    };

    const handleClaimRewards = async () => {
        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: 'claimProviderRewards',
            gasLimit: GAS_STAKING_OPS * 2,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Provider rewards successfully claimed to Treasury!', 'success');
        }
    };

    const handleWithdrawStake = async () => {
        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: 'withdrawProviderStake',
            gasLimit: GAS_STAKING_OPS,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Unbonded provider stake withdrawn back to Registry!', 'success');
        }
    };

    const handleSweepDebt = async () => {
        if (!sweepKeeperAddr) return addToast('Please enter a keeper address', 'error');
        let keeperHex = '';
        try {
            keeperHex = Address.newFromBech32(sweepKeeperAddr).toHex();
        } catch {
            return addToast('Invalid keeper address', 'error');
        }

        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: `sweepSlashedDebt@${keeperHex}`,
            gasLimit: GAS_STAKING_OPS,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Slashed debt successfully swept to Treasury!', 'success');
        }
    };

    if (!wallet.connected) {
        return (
            <div className="page">
                <div className="app-container" style={{ textAlign: 'center', margin: '60px auto' }}>
                    <TypewriterTitle text="Admin Access Required" className="section-title" />
                    <p style={{ color: 'var(--text-muted)' }}>Please connect the Protocol Owner wallet to view this panel.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="app-container">
                <div className="page-header">
                    <TypewriterTitle as="h1" text="Protocol Admin" speed={70} />
                    <TypewriterTitle as="p" text="Manage Keeper Registry Staking V5 configurations & delegations" speed={30} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, margin: '24px 0 60px' }}>

                    {/* Setup & Config */}
                    <div className="card" style={{ background: 'var(--bg-glass)', borderColor: 'var(--border-primary)' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: 16, color: 'var(--accent-light)' }}>Staking V5 Config</h2>

                        <div className="form-group">
                            <label>Staking Provider Address</label>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <input
                                    type="text"
                                    placeholder="erd1qqqq..."
                                    value={providerAddress}
                                    onChange={(e) => setProviderAddress(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn-primary" onClick={handleSetProvider}>
                                    Apply
                                </button>
                            </div>
                            <div className="form-hint">Address of the target MultiversX Staking Provider Smart Contract.</div>
                        </div>

                        <div className="form-group" style={{ marginTop: 24 }}>
                            <label>Treasury Yield Management</label>
                            <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={handleClaimRewards}>
                                Claim Provider Rewards
                            </button>
                            <div className="form-hint" style={{ marginTop: -4 }}>Instantly claims native EGLD Staking V5 yield and sends it directly to the XCron Treasury.</div>
                        </div>
                    </div>

                    {/* Capital Operations */}
                    <div className="card" style={{ background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.2)' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: 16, color: 'rgb(251,191,36)' }}>Capital Operations</h2>

                        <div className="form-group">
                            <label>Delegate Idle Stake</label>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={delegateAmount}
                                    onChange={(e) => setDelegateAmount(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                                <span style={{ position: 'absolute', right: 140, top: 40, color: 'var(--text-muted)' }}>EGLD</span>
                                <button className="btn" style={{ background: 'rgb(34,197,94)', color: '#fff', border: 'none' }} onClick={handleDelegate}>
                                    Delegate
                                </button>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: 20 }}>
                            <label>Request Unstake (Undelegate)</label>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={undelegateAmount}
                                    onChange={(e) => setUndelegateAmount(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                                <span style={{ position: 'absolute', right: 140, top: 122, color: 'var(--text-muted)' }}>EGLD</span>
                                <button className="btn btn-danger" onClick={handleUndelegate}>
                                    Request Unbond
                                </button>
                            </div>
                            <div className="form-hint" style={{ marginTop: 12, color: 'rgb(249,115,22)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                <span>Unbonding takes exactly 10 Epochs (Days) in the MultiversX Network natively.</span>
                            </div>
                            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={handleWithdrawStake}>
                                Withdraw Unbonded Stake (After 10 Days)
                            </button>
                        </div>
                    </div>

                    {/* Slashing Operations */}
                    <div className="card" style={{ gridColumn: '1 / -1', background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: 16, color: 'rgb(239,68,68)' }}>Slashing Management</h2>
                        <div className="form-group">
                            <label>Sweep Slashed Debt (Post-Unbonding)</label>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <input
                                    type="text"
                                    placeholder="Keeper erd1..."
                                    value={sweepKeeperAddr}
                                    onChange={(e) => setSweepKeeperAddr(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn-danger" onClick={handleSweepDebt}>
                                    Sweep to Treasury
                                </button>
                            </div>
                            <div className="form-hint">
                                If a Keeper was slashed but their EGLD was locked in delegation, the system will confiscate the debt amount once the 10-day provider unbonding period concludes. Enter the slashed keeper's address here to execute the sweep.
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
