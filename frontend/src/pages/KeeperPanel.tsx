import { devError, devWarn } from '../utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { useContractQuery, bufferToNumber, formatEgld, bufferToBigInt } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK, GAS_REGISTER_KEEPER, GAS_CLAIM_REWARDS, GAS_REQUEST_UNSTAKE, GAS_WITHDRAW_STAKE } from '../config';
import { TypewriterTitle } from '../components/TypewriterTitle';

interface KeeperStats {
    isRegistered: boolean;
    isActive: boolean;
    stake: string;
    totalExecs: number;
    successfulExecs: number;
    failedExecs: number;
    pendingRewards: string;
}

export function KeeperPanel() {
    const { wallet, setShowConnectModal, signAndSendTransaction, addToast } = useWallet();
    const { query } = useContractQuery();
    const [stats, setStats] = useState<KeeperStats | null>(null);
    const [globalStats, setGlobalStats] = useState({ totalKeepers: 0, minStake: '0' });
    const [loading, setLoading] = useState(true);
    const [stakeAmount, setStakeAmount] = useState('1');

    useEffect(() => {
        loadData();
    }, [wallet.connected]);

    async function loadData() {
        setLoading(true);
        try {
            const [keeperCountRes, minStakeRes] = await Promise.all([
                query(CONTRACTS.keeperRegistry, 'getActiveKeeperCount'),
                query(CONTRACTS.keeperRegistry, 'getMinStake'),
            ]);

            setGlobalStats({
                totalKeepers: keeperCountRes.length > 0 ? bufferToNumber(keeperCountRes[0]) : 0,
                minStake: minStakeRes.length > 0 ? bufferToBigInt(minStakeRes[0]) : '1000000000000000000',
            });

            if (wallet.connected) {
                try {
                    const addrHex = Address.newFromBech32(wallet.address).toHex();

                    // Query keeper info — may fail if contract view has struct mismatch
                    let keeperInfoParsed = false;
                    try {
                        const infoRes = await query(CONTRACTS.keeperRegistry, 'getKeeperInfo', [addrHex]);

                        if (infoRes.length > 0 && infoRes[0].length > 0) {
                            const data = infoRes[0];
                            let offset = 0;

                            // Stake (nested-encoded: 4-byte length + BigUint bytes)
                            if (offset + 4 <= data.length) {
                                const stakeLen = data.readUInt32BE(offset);
                                offset += 4;
                                if (offset + stakeLen <= data.length) {
                                    const stakeHex = data.subarray(offset, offset + stakeLen).toString('hex');
                                    const stake = stakeHex ? BigInt('0x' + stakeHex).toString() : '0';
                                    offset += stakeLen;

                                    const isActive = data[data.length - 25] === 1;
                                    offset += 1;

                                    const totalExecs = offset + 8 <= data.length ? Number(data.readBigUInt64BE(offset)) : 0;
                                    offset += 8;
                                    const successfulExecs = offset + 8 <= data.length ? Number(data.readBigUInt64BE(offset)) : 0;
                                    offset += 8;
                                    const failedExecs = offset + 8 <= data.length ? Number(data.readBigUInt64BE(offset)) : 0;

                                    setStats({
                                        isRegistered: true, isActive, stake, totalExecs, successfulExecs,
                                        failedExecs, pendingRewards: '0',
                                    });
                                    keeperInfoParsed = true;
                                }
                            }
                        }
                    } catch (err) {
                        devWarn('getKeeperInfo failed, trying fallback:', err);
                    }

                    // Fallback: check recent transactions for registerKeeper calls
                    if (!keeperInfoParsed) {
                        try {
                            const txRes = await fetch(
                                `${NETWORK.apiUrl}/accounts/${wallet.address}/transactions?receiver=${CONTRACTS.keeperRegistry}&function=registerKeeper&status=success&size=1`
                            );
                            const txData = await txRes.json();
                            if (txData.length > 0) {
                                const stakeTx = txData[0];
                                setStats({
                                    isRegistered: true, isActive: false,
                                    stake: stakeTx.value || '0',
                                    totalExecs: 0, successfulExecs: 0, failedExecs: 0,
                                    pendingRewards: '0',
                                });
                                keeperInfoParsed = true;
                            }
                        } catch (err) {
                            devWarn('Fallback keeper check failed:', err);
                        }
                    }

                    // Query pending rewards and real execution stats from on-chain transactions
                    if (keeperInfoParsed) {
                        try {
                            // Get real execution data: fetch this keeper's executeTask transactions
                            const txRes = await fetch(
                                `${NETWORK.apiUrl}/accounts/${wallet.address}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&size=50&fields=status,value,txHash`
                            );
                            const txData = await txRes.json();
                            if (Array.isArray(txData) && txData.length > 0) {
                                const successful = txData.filter((t: any) => t.status === 'success').length;
                                const failed = txData.filter((t: any) => t.status === 'fail').length;

                                // Calculate earned EGLD from SC results (transfers back to keeper)
                                let totalEarned = BigInt(0);
                                try {
                                    const detailedRes = await fetch(
                                        `${NETWORK.apiUrl}/accounts/${wallet.address}/transactions?receiver=${CONTRACTS.scheduler}&function=executeTask&status=success&size=50&withScResults=true`
                                    );
                                    const detailedTxs = await detailedRes.json();
                                    for (const tx of detailedTxs) {
                                        if (tx.results) {
                                            for (const r of tx.results) {
                                                if (r.receiver === wallet.address && r.value && BigInt(r.value) > 0) {
                                                    totalEarned += BigInt(r.value);
                                                }
                                            }
                                        }
                                    }
                                } catch { /* ignore detailed fetch errors */ }

                                setStats(prev => prev ? {
                                    ...prev,
                                    totalExecs: successful + failed,
                                    successfulExecs: successful,
                                    failedExecs: failed,
                                    pendingRewards: totalEarned.toString(),
                                } : prev);
                            }
                        } catch (err) {
                            devWarn('Real execution stats fetch failed:', err);
                        }
                    }

                    if (!keeperInfoParsed) {
                        setStats({
                            isRegistered: false, isActive: false, stake: '0', totalExecs: 0,
                            successfulExecs: 0, failedExecs: 0, pendingRewards: '0',
                        });
                    }
                } catch (err) {
                    devError('Failed to load keeper info:', err);
                    setStats(null);
                }
            }
        } catch (err) {
            devError('Failed to load keeper data:', err);
        } finally {
            setLoading(false);
        }
    }

    const handleRegister = async () => {
        const depositWei = BigInt(Math.floor(parseFloat(stakeAmount.replace(/,/g, '.')) * 1e18));
        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: depositWei.toString(),
            data: 'registerKeeper',
            gasLimit: GAS_REGISTER_KEEPER,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Registered as keeper! Refreshing data...', 'success');
            setTimeout(() => loadData(), 6000);
        }
    };

    const handleClaimRewards = async () => {
        const result = await signAndSendTransaction({
            receiver: CONTRACTS.rewards,
            value: '0',
            data: 'claimRewards',
            gasLimit: GAS_CLAIM_REWARDS,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Rewards claimed! Refreshing data...', 'success');
            setTimeout(() => loadData(), 6000);
        }
    };

    const handleRequestUnstake = async () => {
        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: 'requestUnstake',
            gasLimit: GAS_REQUEST_UNSTAKE,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Unstake requested! Cooldown period started.', 'success');
            setTimeout(() => loadData(), 6000);
        }
    };

    const handleWithdrawStake = async () => {
        const result = await signAndSendTransaction({
            receiver: CONTRACTS.keeperRegistry,
            value: '0',
            data: 'withdrawStake',
            gasLimit: GAS_WITHDRAW_STAKE,
        });
        if (result && result !== 'pending-web-wallet') {
            addToast('Deposit withdrawn successfully!', 'success');
            setTimeout(() => loadData(), 6000);
        }
    };

    if (!wallet.connected) {
        return (
            <div className="page">
                <div className="app-container">
                    <div className="page-header">
                        <TypewriterTitle as="h1" text="Keeper Panel" speed={70} />
                        <TypewriterTitle as="p" text="Deposit EGLD, execute tasks, earn rewards" speed={30} />
                    </div>

                    <div className="stats-grid">
                        <div className="stat-card" style={{ background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.2)', boxShadow: '0 0 25px rgba(249,115,22,0.2)' }}>
                            <div className="stat-label" style={{ color: 'rgb(249,115,22)' }}>Active Keepers</div>
                            <div className="stat-value">{loading ? '—' : globalStats.totalKeepers}</div>
                            <div className="stat-sub">In the network</div>
                        </div>
                        <div className="stat-card" style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.2)', boxShadow: '0 0 25px rgba(168,85,247,0.2)' }}>
                            <div className="stat-label" style={{ color: 'rgb(168,85,247)' }}>Min Deposit</div>
                            <div className="stat-value">{loading ? '—' : formatEgld(globalStats.minStake, 2) || '1.00'}</div>
                            <div className="stat-sub">EGLD required</div>
                        </div>
                        <div className="stat-card" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', boxShadow: '0 0 25px rgba(34,197,94,0.2)' }}>
                            <div className="stat-label" style={{ color: 'rgb(34,197,94)' }}>Protocol Fee</div>
                            <div className="stat-value">{loading ? '—' : `${(3000 / 100).toFixed(0)}%`}</div>
                            <div className="stat-sub">Keeper earns 70%</div>
                        </div>
                        <div className="stat-card" style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.2)', boxShadow: '0 0 25px rgba(6,182,212,0.2)' }}>
                            <div className="stat-label" style={{ color: 'rgb(6,182,212)' }}>Keeper Share</div>
                            <div className="stat-value" style={{ color: 'var(--success)' }}>70%</div>
                            <div className="stat-sub">Per execution reward</div>
                        </div>
                    </div>

                    {/* Keeper Leaderboard — real data from chain */}
                    <KeeperLeaderboard />

                    {/* Why Run a Keeper */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                        {[
                            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M16 8l-4 4-4-4" /><line x1="12" y1="12" x2="12" y2="16" /></svg>, title: 'Earn Passive Income', desc: 'Get paid for every task you execute. Higher reliability = more tasks assigned to you.', color: 'rgb(34,197,94)' },
                            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(59,130,246)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9,12 11,14 15,10" /></svg>, title: 'Fully Refundable Bond', desc: 'Your EGLD deposit is returned in full when you unregister. Zero risk to your capital.', color: 'rgb(59,130,246)' },
                            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(251,191,36)" strokeWidth="1.5" strokeLinecap="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>, title: 'Automated Execution', desc: 'The keeper bot runs autonomously. Set it up once and earn rewards 24/7.', color: 'rgb(251,191,36)' },
                            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(168,85,247)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" /></svg>, title: 'Decentralized Network', desc: 'Be part of the infrastructure powering DeFi automation on MultiversX.', color: 'rgb(168,85,247)' },
                        ].map(b => (
                            <div key={b.title} style={{
                                padding: 16, borderRadius: 'var(--radius-md)',
                                background: `${b.color}08`, border: `1px solid ${b.color}18`,
                            }}>
                                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, background: `${b.color}15` }}>{b.icon}</div>
                                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{b.title}</div>
                                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{b.desc}</div>
                            </div>
                        ))}
                    </div>

                    {/* Connect CTA */}
                    <div style={{ textAlign: 'center', marginTop: 24, padding: '24px 0' }}>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', marginBottom: 10 }}>Ready to Earn?</h3>
                        <p style={{ maxWidth: 420, margin: '0 auto 18px', fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            Connect your wallet, deposit EGLD, and start earning execution rewards immediately.
                        </p>
                        <button className="btn btn-connect" onClick={() => setShowConnectModal(true)}>
                            Connect Wallet
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="app-container">
                <div className="page-header">
                    <TypewriterTitle as="h1" text="Keeper Panel" speed={70} />
                    <TypewriterTitle as="p" text="Deposit EGLD, execute tasks, earn rewards" speed={30} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, margin: '12px 0 28px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center', padding: '10px 32px' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgb(249,115,22)', marginBottom: 2 }}>Active Keepers</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{loading ? '—' : globalStats.totalKeepers}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>In the network</div>
                    </div>
                    <div style={{ width: 1, height: 36, background: 'var(--border-primary)' }} />
                    <div style={{ textAlign: 'center', padding: '10px 32px' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgb(168,85,247)', marginBottom: 2 }}>Min Deposit</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{loading ? '—' : formatEgld(globalStats.minStake, 2)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>EGLD required</div>
                    </div>
                    {stats?.isRegistered && (
                        <>
                            <div style={{ width: 1, height: 36, background: 'var(--border-primary)' }} />
                            <div style={{ textAlign: 'center', padding: '10px 32px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgb(132,204,22)', marginBottom: 2 }}>Your Deposit</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatEgld(stats.stake, 4)}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>EGLD deposited</div>
                            </div>
                            <div style={{ width: 1, height: 36, background: 'var(--border-primary)' }} />
                            <div style={{ textAlign: 'center', padding: '10px 32px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgb(236,72,153)', marginBottom: 2 }}>Total Earned</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)' }}>{formatEgld(stats.pendingRewards, 4)}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>EGLD from executions</div>
                            </div>
                        </>
                    )}
                </div>

                {loading ? (
                    <div className="empty-state">
                        <span className="loading-spinner" style={{ width: 32, height: 32 }} />
                        <p style={{ marginTop: 16 }}>Loading keeper data...</p>
                    </div>
                ) : stats?.isRegistered ? (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
                            <div>
                                <TypewriterTitle text="Performance" className="section-title" />
                                <div className="activity-feed">
                                    <div className="activity-item">
                                        <span className="activity-text">
                                            <strong style={{ color: 'var(--text-primary)' }}>Status</strong>
                                        </span>
                                        <span className={`badge ${stats.isActive ? 'badge-completed' : 'badge-failed'}`}>
                                            {stats.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div className="activity-item">
                                        <span className="activity-text">Total Executions</span>
                                        <span style={{ fontWeight: 700 }}>{stats.totalExecs}</span>
                                    </div>
                                    <div className="activity-item">
                                        <span className="activity-text">Successful</span>
                                        <span style={{ fontWeight: 700, color: 'var(--success)' }}>{stats.successfulExecs}</span>
                                    </div>
                                    <div className="activity-item">
                                        <span className="activity-text">Failed</span>
                                        <span style={{ fontWeight: 700, color: 'var(--error)' }}>{stats.failedExecs}</span>
                                    </div>
                                    <div className="activity-item">
                                        <span className="activity-text">Success Rate</span>
                                        <span style={{ fontWeight: 700 }}>
                                            {stats.totalExecs > 0
                                                ? `${((stats.successfulExecs / stats.totalExecs) * 100).toFixed(1)}%`
                                                : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <TypewriterTitle text="Rewards" className="section-title" />
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: 12 }}>
                                    Claim your earned rewards from successful task executions.
                                </p>
                                <div style={{ textAlign: 'center', marginBottom: 12, padding: '12px 0' }}>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                                        TOTAL EARNED FROM EXECUTIONS
                                    </div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success)' }}>
                                        {formatEgld(stats.pendingRewards, 4)} EGLD
                                    </div>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%' }}
                                    onClick={handleClaimRewards}
                                    disabled={stats.pendingRewards === '0'}
                                >
                                    Claim Rewards
                                </button>
                            </div>

                            <div>
                                <TypewriterTitle text="Unregister" className="section-title" />
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: 12 }}>
                                    Leave the keeper network. After cooldown, withdraw your full deposit.
                                </p>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        className="btn"
                                        style={{
                                            flex: 1,
                                            background: stats.isActive ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.05)',
                                            border: '1px solid rgba(239,68,68,0.3)',
                                            color: stats.isActive ? 'rgb(239,68,68)' : 'var(--text-muted)',
                                        }}
                                        onClick={handleRequestUnstake}
                                        disabled={!stats.isActive}
                                    >
                                        {stats.isActive ? 'Request Unstake' : 'Unstake Requested'}
                                    </button>
                                    <button
                                        className="btn"
                                        style={{
                                            flex: 1,
                                            background: !stats.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.05)',
                                            border: '1px solid rgba(34,197,94,0.3)',
                                            color: !stats.isActive ? 'rgb(34,197,94)' : 'var(--text-muted)',
                                        }}
                                        onClick={handleWithdrawStake}
                                        disabled={stats.isActive}
                                    >
                                        Withdraw Deposit
                                    </button>
                                </div>
                                {!stats.isActive && (
                                    <div style={{
                                        marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                        background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)',
                                        fontSize: '0.92rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(234,179,8)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                        <span>Cooldown in progress (~10 min). Your deposit is safe — you can withdraw once the cooldown period elapses.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center', padding: 40, position: 'relative', overflow: 'hidden', background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.2)' }}>
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                            background: 'var(--gradient-main)'
                        }} />
                        <TypewriterTitle text="Become a Keeper" className="section-title" style={{ justifyContent: 'center', fontSize: '1.2rem', marginBottom: 16 }} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 32, lineHeight: 1.6 }}>
                            Join the decentralized network of executors. Deposit EGLD as a security bond to start
                            processing tasks and earning automated rewards.
                        </p>

                        <div className="form-group" style={{ textAlign: 'left', background: 'var(--bg-glass)', padding: 20, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                            <label style={{ marginBottom: 12 }}>Deposit Amount</label>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={stakeAmount}
                                        onChange={(e) => setStakeAmount(e.target.value.replace(/,/g, '.'))}
                                        style={{ fontSize: '1.1rem', fontWeight: 600 }}
                                    />
                                    <span style={{ position: 'absolute', right: 12, top: 14, color: 'var(--text-muted)', fontWeight: 600 }}>EGLD</span>
                                </div>
                                <button className="btn btn-primary" style={{ padding: '0 24px' }} onClick={handleRegister}>
                                    Deposit & Join
                                </button>
                            </div>
                            <div className="form-hint" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                                Minimum required: {formatEgld(globalStats.minStake, 2)} EGLD
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── Keeper Bond Info ─── */}
                <div style={{ margin: '32px 0 0' }}>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-primary)', margin: '0 0 28px' }} />

                    <h2 style={{ color: '#f1f5f9', fontSize: '1.3rem', fontWeight: 700, textAlign: 'center', marginBottom: 24, letterSpacing: '-0.01em' }}>
                        How the Keeper Bond Works
                    </h2>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
                        <div>
                            <h3 style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Security Bond</h3>
                            <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
                                The deposit acts as a <strong style={{ color: '#fff' }}>guarantee</strong> that you will execute tasks reliably. It protects task creators from unreliable keepers.
                            </p>
                        </div>
                        <div>
                            <h3 style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Why It's Required</h3>
                            <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
                                Without a bond, anyone could register as keeper and ignore tasks. The stake ensures <strong style={{ color: '#fff' }}>skin in the game</strong> — only committed operators join.
                            </p>
                        </div>
                        <div>
                            <h3 style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Slashing Penalties</h3>
                            <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
                                If a keeper <strong style={{ color: '#f87171' }}>fails to execute</strong> assigned tasks repeatedly, a portion of their bond is <strong style={{ color: '#f87171' }}>slashed</strong> as a penalty. Repeated failures can result in deactivation.
                            </p>
                        </div>
                    </div>

                    {/* ─── Perform Well vs Fail ─── */}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-primary)', margin: '28px 0' }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                        <div>
                            <h3 style={{ color: '#4ade80', fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                                ✦ When You Perform Well
                            </h3>
                            <ul style={{ color: '#e2e8f0', margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: '0.95rem' }}>
                                <li>Earn <strong style={{ color: '#4ade80' }}>execution rewards</strong> for each completed task</li>
                                <li>Your bond stays <strong style={{ color: '#fff' }}>100% intact</strong></li>
                                <li>Higher success rate = more tasks assigned to you</li>
                            </ul>
                        </div>
                        <div>
                            <h3 style={{ color: '#f87171', fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                                ✦ When You Fail to Execute
                            </h3>
                            <ul style={{ color: '#e2e8f0', margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: '0.95rem' }}>
                                <li><strong style={{ color: '#f87171' }}>Partial slashing</strong> of your staked bond</li>
                                <li>Task gets <strong style={{ color: '#fff' }}>reassigned</strong> to another keeper</li>
                                <li>Repeated failures = <strong style={{ color: '#f87171' }}>deactivation</strong> from the network</li>
                            </ul>
                        </div>
                    </div>

                    <p style={{ marginTop: 16, fontSize: '0.95rem', color: '#e2e8f0', textAlign: 'center' }}>
                        ✓ When you <strong style={{ color: '#fff' }}>unregister</strong>, your remaining bond is <strong style={{ color: '#4ade80' }}>fully returned</strong> to your wallet.
                    </p>

                    {/* ─── Node Operator Guide ─── */}
                    {stats?.isRegistered && (
                        <>
                            <hr style={{ border: 'none', borderTop: '1px solid var(--border-primary)', margin: '28px 0' }} />

                            <h2 style={{ color: '#f1f5f9', fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Node Operator Guide</h2>
                            <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: 16 }}>
                                You are registered on-chain. To earn rewards, your Keeper Node must be actively running and listening for tasks:
                            </p>

                            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem', lineHeight: 2, color: '#e2e8f0' }}>
                                <div style={{ color: '#94a3b8' }}># 1. Clone & enter keeper directory</div>
                                <div style={{ color: '#38bdf8', fontWeight: 600 }}>git clone https://github.com/AlexandruChitu-SXT/xcron-protocol.git && cd xcron-protocol/keeper</div>
                                <div style={{ color: '#94a3b8', marginTop: 6 }}># 2. Configure</div>
                                <div style={{ color: '#38bdf8', fontWeight: 600 }}>cp keeper-config.example.json keeper-config.json</div>
                                <div style={{ color: '#94a3b8', marginTop: 6 }}># 3. Start</div>
                                <div style={{ color: '#4ade80', fontWeight: 600 }}>npm install && npm start</div>
                            </div>

                            <p style={{ marginTop: 12, fontSize: '0.88rem', color: '#fbbf24' }}>
                                ⚠ Keep your node online 24/7. Missing a task assignment will result in a slash.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Keeper Leaderboard — Real Chain Data ── */
function KeeperLeaderboard() {
    const [keepers, setKeepers] = useState<{ addr: string; execs: number }[]>([]);

    useEffect(() => {
        async function fetchKeepers() {
            try {
                const res = await fetch(
                    `${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions?size=100&status=success&function=executeTask`
                );
                const txs = await res.json();
                const counts: Record<string, number> = {};
                for (const tx of txs) {
                    const sender = tx.sender || '';
                    counts[sender] = (counts[sender] || 0) + 1;
                }
                const sorted = Object.entries(counts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([addr, execs]) => ({ addr, execs }));
                setKeepers(sorted);
            } catch { /* silent */ }
        }
        fetchKeepers();
    }, []);

    return (
        <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden', background: 'rgba(249,115,22,0.04)', borderColor: 'rgba(249,115,22,0.15)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(251,191,36)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" /></svg>
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Keeper Leaderboard</span>
            </div>
            {keepers.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    No executions recorded yet
                </div>
            ) : (
                keepers.map((k, i) => (
                    <div key={k.addr} style={{
                        display: 'grid', gridTemplateColumns: '40px 1fr 100px',
                        alignItems: 'center', padding: '8px 16px', gap: 8,
                        borderBottom: i < keepers.length - 1 ? '1px solid var(--border-primary)' : 'none',
                        background: i === 0 ? 'rgba(251,191,36,0.04)' : 'transparent',
                    }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {i < 3 ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke={i === 0 ? 'rgb(251,191,36)' : i === 1 ? 'rgb(192,192,210)' : 'rgb(205,127,50)'} strokeWidth="2" fill={i === 0 ? 'rgba(251,191,36,0.15)' : i === 1 ? 'rgba(192,192,210,0.12)' : 'rgba(205,127,50,0.12)'} />
                                    <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="800" fill={i === 0 ? 'rgb(251,191,36)' : i === 1 ? 'rgb(192,192,210)' : 'rgb(205,127,50)'}>{i + 1}</text>
                                </svg>
                            ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>#{i + 1}</span>
                            )}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--accent-light)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {k.addr.slice(0, 10)}...{k.addr.slice(-6)}
                        </span>
                        <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', textAlign: 'right', fontWeight: 600 }}>{k.execs} tx</span>
                    </div>
                ))
            )}
        </div>
    );
}
