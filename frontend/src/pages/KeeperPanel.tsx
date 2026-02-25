import { devError, devWarn } from '../utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '../hooks/useWallet';
import { useContractQuery, bufferToNumber, formatEgld, bufferToBigInt } from '../hooks/useContractQuery';
import { CONTRACTS, NETWORK, GAS_REGISTER_KEEPER, GAS_CLAIM_REWARDS, GAS_REQUEST_UNSTAKE, GAS_WITHDRAW_STAKE } from '../config';

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
                        <h1>Keeper Panel</h1>
                        <p>Deposit EGLD, execute tasks, earn rewards</p>
                    </div>

                    <div className="stats-grid">
                        <div className="stat-card" style={{ background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.2)' }}>
                            <div className="stat-label" style={{ color: 'rgb(249,115,22)' }}>Active Keepers</div>
                            <div className="stat-value">{loading ? '—' : globalStats.totalKeepers}</div>
                        </div>
                        <div className="stat-card" style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.2)' }}>
                            <div className="stat-label" style={{ color: 'rgb(168,85,247)' }}>Min Deposit</div>
                            <div className="stat-value">{loading ? '—' : formatEgld(globalStats.minStake, 2)}</div>
                            <div className="stat-sub">EGLD required</div>
                        </div>
                    </div>

                    <div className="empty-state">
                        <div className="empty-icon">—</div>
                        <p>Connect your wallet to view your keeper status</p>
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
                    <h1>Keeper Panel</h1>
                    <p>Deposit EGLD, execute tasks, earn rewards</p>
                </div>

                <div className="stats-grid">
                    <div className="stat-card" style={{ background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.2)' }}>
                        <div className="stat-label" style={{ color: 'rgb(249,115,22)' }}>Active Keepers</div>
                        <div className="stat-value">{loading ? '—' : globalStats.totalKeepers}</div>
                    </div>
                    <div className="stat-card" style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.2)' }}>
                        <div className="stat-label" style={{ color: 'rgb(168,85,247)' }}>Min Deposit</div>
                        <div className="stat-value">{loading ? '—' : formatEgld(globalStats.minStake, 2)}</div>
                        <div className="stat-sub">EGLD required</div>
                    </div>
                    {stats?.isRegistered && (
                        <>
                            <div className="stat-card" style={{ background: 'rgba(132,204,22,0.08)', borderColor: 'rgba(132,204,22,0.2)' }}>
                                <div className="stat-label" style={{ color: 'rgb(132,204,22)' }}>Your Deposit</div>
                                <div className="stat-value">{formatEgld(stats.stake, 4)}</div>
                                <div className="stat-sub">EGLD deposited</div>
                            </div>
                            <div className="stat-card" style={{ background: 'rgba(236,72,153,0.08)', borderColor: 'rgba(236,72,153,0.2)' }}>
                                <div className="stat-label" style={{ color: 'rgb(236,72,153)' }}>Total Earned</div>
                                <div className="stat-value" style={{ color: 'var(--success)' }}>
                                    {formatEgld(stats.pendingRewards, 4)}
                                </div>
                                <div className="stat-sub">EGLD from executions</div>
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
                    <div className="grid-2">
                        <div className="card" style={{ background: 'rgba(20,184,166,0.06)', borderColor: 'rgba(20,184,166,0.2)' }}>
                            <div className="section-title">Performance</div>
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

                        <div className="card" style={{ background: 'rgba(14,165,233,0.06)', borderColor: 'rgba(14,165,233,0.2)' }}>
                            <div className="section-title">Rewards</div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
                                Claim your earned rewards from successful task executions.
                            </p>
                            <div style={{
                                background: 'var(--bg-glass)',
                                borderRadius: 'var(--radius-md)',
                                padding: 20,
                                textAlign: 'center',
                                marginBottom: 16,
                            }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                                    TOTAL EARNED FROM EXECUTIONS
                                </div>
                                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>
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

                        <div className="card" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
                            <div className="section-title">Unregister</div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
                                Leave the keeper network by requesting unstake. After the cooldown period, withdraw your full deposit.
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
                                    fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(234,179,8)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    <span>Cooldown in progress (~10 min). Your deposit is safe — you can withdraw once the cooldown period elapses.</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center', padding: 40, position: 'relative', overflow: 'hidden', background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.2)' }}>
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                            background: 'var(--gradient-main)'
                        }} />
                        <div className="section-title" style={{ justifyContent: 'center', fontSize: '1.2rem', marginBottom: 16 }}>
                            Become a Keeper
                        </div>
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

                {/* Keeper Bond Info Section — always visible */}
                <div style={{ maxWidth: 720, margin: '32px auto 0' }}>
                    <div className="section-title" style={{ justifyContent: 'center', marginBottom: 20 }}>
                        How the Keeper Bond Works
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                        {/* What is it */}
                        <div className="card" style={{ padding: 20, background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(59,130,246)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                </div>
                                <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Security Bond</strong>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>
                                The deposit acts as a <strong style={{ color: 'var(--text-primary)' }}>guarantee</strong> that you will execute tasks reliably. It protects task creators from unreliable keepers.
                            </p>
                        </div>

                        {/* Why required */}
                        <div className="card" style={{ padding: 20, background: 'rgba(234,179,8,0.06)', borderColor: 'rgba(234,179,8,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(234,179,8)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                </div>
                                <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Why It's Required</strong>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>
                                Without a bond, anyone could register as keeper and ignore tasks. The stake ensures <strong style={{ color: 'var(--text-primary)' }}>skin in the game</strong> — only committed operators join.
                            </p>
                        </div>

                        {/* What happens if you fail */}
                        <div className="card" style={{ padding: 20, background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(239,68,68)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                </div>
                                <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Slashing Penalties</strong>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>
                                If a keeper <strong style={{ color: 'rgb(239,68,68)' }}>fails to execute</strong> assigned tasks repeatedly, a portion of their bond is <strong style={{ color: 'rgb(239,68,68)' }}>slashed</strong> (deducted) as a penalty. Severe or repeated failures can result in deactivation.
                            </p>
                        </div>
                    </div>

                    {/* Detailed breakdown */}
                    <div className="card" style={{ marginTop: 16, padding: 20, background: 'rgba(20,184,166,0.05)', borderColor: 'rgba(20,184,166,0.15)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: '0.82rem' }}>
                            <div>
                                <div style={{ color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' }}>When You Perform Well</div>
                                <ul style={{ color: 'var(--text-secondary)', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                                    <li>Earn <strong style={{ color: 'var(--success)' }}>execution rewards</strong> for each completed task</li>
                                    <li>Your bond stays <strong style={{ color: 'var(--text-primary)' }}>100% intact</strong></li>
                                    <li>Higher success rate = more tasks assigned to you</li>
                                </ul>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' }}>When You Fail to Execute</div>
                                <ul style={{ color: 'var(--text-secondary)', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                                    <li><strong style={{ color: 'rgb(239,68,68)' }}>Partial slashing</strong> of your staked bond</li>
                                    <li>Task gets <strong style={{ color: 'var(--text-primary)' }}>reassigned</strong> to another keeper</li>
                                    <li>Repeated failures = <strong style={{ color: 'rgb(239,68,68)' }}>deactivation</strong> from the network</li>
                                </ul>
                            </div>
                            <div style={{
                                marginTop: 16, padding: '12px 16px', borderRadius: 'var(--radius-md)',
                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)',
                                fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                                <span>When you <strong style={{ color: 'var(--text-primary)' }}>unregister</strong> as keeper, your remaining bond is <strong style={{ color: 'var(--success)' }}>fully returned</strong> to your wallet.</span>
                            </div>
                        </div>
                    </div>

                    {/* Node Operator Guide */}
                    {stats?.isRegistered && (
                        <div className="card" style={{ marginTop: 16, padding: 20, background: 'rgba(14,165,233,0.06)', borderColor: 'rgba(14,165,233,0.2)' }}>
                            <div className="section-title" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="4 17 10 11 4 5"></polyline>
                                    <line x1="12" y1="19" x2="20" y2="19"></line>
                                </svg>
                                Node Operator Guide
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 16 }}>
                                You are registered on-chain, but to earn rewards, your Keeper Node must be actively running and listening for tasks. Follow these steps to deploy your node:
                            </p>

                            <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># 1. Clone the repository and enter the keeper directory</div>
                                <div style={{ color: '#38bdf8', marginBottom: 16 }}>git clone https://github.com/AlexandruChitu-SXT/xcron-protocol.git<br />cd xcron-protocol/keeper</div>

                                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># 2. Copy the example config and add your wallet PEM</div>
                                <div style={{ color: '#38bdf8', marginBottom: 16 }}>cp keeper-config.example.json keeper-config.json<br /># Edit keeper-config.json with your settings</div>

                                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}># 3. Start the node</div>
                                <div style={{ color: '#34d399' }}>npm install && npm start</div>
                            </div>

                            <div style={{
                                marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)',
                                fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(234,179,8)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                <span>Keep your node online 24/7. Tasks are assigned randomly to active keepers, and missing a task assignment will result in a slash.</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
