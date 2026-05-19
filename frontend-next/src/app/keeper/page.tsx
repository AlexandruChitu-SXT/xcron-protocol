"use client";

import { devError, devWarn } from '@/utils/devLog';
import { useEffect, useState } from 'react';
import { Address } from '@multiversx/sdk-core';
import { useWallet } from '@/hooks/useWallet';
import { useContractQuery, bufferToNumber, formatEgld, bufferToBigInt, shortenAddress } from '@/hooks/useContractQuery';
import { CONTRACTS, NETWORK, GAS_REGISTER_KEEPER, GAS_CLAIM_REWARDS, GAS_REQUEST_UNSTAKE, GAS_WITHDRAW_STAKE } from '@/config';
import { TypewriterTitle } from '@/components/TypewriterTitle';

interface KeeperStats {
  isRegistered: boolean;
  isActive: boolean;
  stake: string;
  totalExecs: number;
  successfulExecs: number;
  failedExecs: number;
  pendingRewards: string;
}

export default function KeeperPanel() {
  const { wallet, setShowConnectModal, signAndSendTransaction, addToast } = useWallet();
  const { query } = useContractQuery();
  const [stats, setStats] = useState<KeeperStats | null>(null);
  const [globalStats, setGlobalStats] = useState({ totalKeepers: 0, minStake: '0', protocolFeeBps: 3000 });
  const [loading, setLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState('1');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected]);

  async function loadData() {
    setLoading(true);
    try {
      const [keeperCountRes, minStakeRes, feeRes] = await Promise.all([
        query(CONTRACTS.keeperRegistry, 'getActiveKeeperCount'),
        query(CONTRACTS.keeperRegistry, 'getMinStake'),
        query(CONTRACTS.scheduler, 'getProtocolFeeBps'),
      ]);

      setGlobalStats({
        totalKeepers: keeperCountRes.length > 0 ? bufferToNumber(keeperCountRes[0]) : 0,
        minStake: minStakeRes.length > 0 ? bufferToBigInt(minStakeRes[0]) : '1000000000000000000',
        protocolFeeBps: feeRes.length > 0 ? bufferToNumber(feeRes[0]) : 3000,
      });

      if (wallet.connected && !wallet.isDemo) {
        try {
          const addrHex = Address.newFromBech32(wallet.address).toHex();

          let keeperInfoParsed = false;
          try {
            const infoRes = await query(CONTRACTS.keeperRegistry, 'getKeeperInfo', [addrHex]);

            if (infoRes.length > 0 && infoRes[0].length > 0) {
              const data = infoRes[0];
              let offset = 0;

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

          if (keeperInfoParsed) {
            try {
              const txRes = await fetch(
                `${NETWORK.apiUrl}/accounts/${wallet.address}/transactions?receiver=${CONTRACTS.scheduler}&function=executeQuantumTask&size=50&fields=status,value,txHash`
              );
              const txData = await txRes.json();
              if (Array.isArray(txData) && txData.length > 0) {
                const successful = txData.filter((t: any) => t.status === 'success').length;
                const failed = txData.filter((t: any) => t.status === 'fail').length;

                let totalEarned = BigInt(0);
                try {
                  const detailedRes = await fetch(
                    `${NETWORK.apiUrl}/accounts/${wallet.address}/transactions?receiver=${CONTRACTS.scheduler}&function=executeQuantumTask&status=success&size=50&withScResults=true`
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
                } catch { /* ignore */ }

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
      <div className="w-full">
        <div className="mb-10 text-center sm:text-left">
          <TypewriterTitle as="h1" text="Keeper Panel" speed={70} className="text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] relative z-10" />
          <TypewriterTitle as="p" text="Deposit EGLD, execute tasks, earn rewards" speed={30} className="text-white/60" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
          <div className="p-5 md:p-6 rounded-2xl bg-orange-500/10 border border-orange-500/20 shadow-[0_0_25px_rgba(249,115,22,0.1)]">
            <div className="text-orange-500 text-xs font-bold uppercase tracking-wider mb-2">Active Keepers</div>
            <div className="text-3xl font-light text-white mb-1">{loading ? '—' : globalStats.totalKeepers}</div>
            <div className="text-sm text-white/50">In the network</div>
          </div>
          <div className="p-5 md:p-6 rounded-2xl bg-purple-500/10 border border-purple-500/20 shadow-[0_0_25px_rgba(168,85,247,0.1)]">
            <div className="text-purple-500 text-xs font-bold uppercase tracking-wider mb-2">Min Deposit</div>
            <div className="text-3xl font-light text-white mb-1">{loading ? '—' : formatEgld(globalStats.minStake, 2) || '1.00'}</div>
            <div className="text-sm text-white/50">EGLD required</div>
          </div>
          <div className="p-5 md:p-6 rounded-2xl bg-green-500/10 border border-green-500/20 shadow-[0_0_25px_rgba(34,197,94,0.1)]">
            <div className="text-green-500 text-xs font-bold uppercase tracking-wider mb-2">Protocol Fee</div>
            <div className="text-3xl font-light text-white mb-1">{loading ? '—' : `${(globalStats.protocolFeeBps / 100).toFixed(0)}%`}</div>
            <div className="text-sm text-white/50">Keeper earns {100 - globalStats.protocolFeeBps / 100}%</div>
          </div>
          <div className="p-5 md:p-6 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 shadow-[0_0_25px_rgba(6,182,212,0.1)]">
            <div className="text-cyan-500 text-xs font-bold uppercase tracking-wider mb-2">Keeper Share</div>
            <div className="text-3xl font-light text-green-400 mb-1">{100 - globalStats.protocolFeeBps / 100}%</div>
            <div className="text-sm text-white/50">Per execution reward</div>
          </div>
        </div>

        <div className="w-full max-w-4xl mx-auto">
          <KeeperLeaderboard />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 max-w-4xl mx-auto">
          {[
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M16 8l-4 4-4-4" /><line x1="12" y1="12" x2="12" y2="16" /></svg>, title: 'Earn Passive Income', desc: 'Get paid for every task you execute. Higher reliability = more tasks assigned to you.', color: 'text-green-500', bg: 'bg-green-500/5', border: 'border-green-500/10' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9,12 11,14 15,10" /></svg>, title: 'Fully Refundable Bond', desc: 'Your EGLD deposit is returned in full when you unregister. Zero risk to your capital.', color: 'text-blue-500', bg: 'bg-blue-500/5', border: 'border-blue-500/10' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>, title: 'Automated Execution', desc: 'The keeper bot runs autonomously. Set it up once and earn rewards 24/7.', color: 'text-yellow-500', bg: 'bg-yellow-500/5', border: 'border-yellow-500/10' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" /></svg>, title: 'Decentralized Network', desc: 'Be part of the infrastructure powering DeFi automation on MultiversX.', color: 'text-purple-500', bg: 'bg-purple-500/5', border: 'border-purple-500/10' },
          ].map(b => (
            <div key={b.title} className={`p-5 rounded-2xl ${b.bg} border ${b.border}`}>
              <div className={`mb-3 flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-black/20 ${b.color}`}>{b.icon}</div>
              <div className="font-bold text-white mb-1.5">{b.title}</div>
              <div className="text-sm text-white/60 leading-relaxed">{b.desc}</div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12 py-12 max-w-2xl mx-auto">
          <h3 className="text-2xl text-white mb-3 font-light">Ready to Earn?</h3>
          <p className="text-white/60 mb-8 max-w-md mx-auto">
            Connect your wallet, deposit EGLD, and start earning execution rewards immediately.
          </p>
          <button className="btn btn-connect px-8 py-3.5 text-base" onClick={() => setShowConnectModal(true)}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-10 text-center sm:text-left">
        <TypewriterTitle as="h1" text="Keeper Panel" speed={70} className="text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 drop-shadow-[0_2px_15px_rgba(34,211,238,0.25)] relative z-10" />
        <TypewriterTitle as="p" text="Deposit EGLD, execute tasks, earn rewards" speed={30} className="text-white/60" />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-0 my-8">
        <div className="text-center px-6 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-1">Active Keepers</div>
          <div className="text-2xl md:text-3xl font-light text-white">{loading ? '—' : globalStats.totalKeepers}</div>
          <div className="text-xs text-white/40">In the network</div>
        </div>
        <div className="w-px h-10 bg-white/10 hidden sm:block" />
        <div className="text-center px-6 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-500 mb-1">Min Deposit</div>
          <div className="text-2xl md:text-3xl font-light text-white">{loading ? '—' : formatEgld(globalStats.minStake, 2)}</div>
          <div className="text-xs text-white/40">EGLD required</div>
        </div>
        {stats?.isRegistered && (
          <>
            <div className="w-px h-10 bg-white/10 hidden sm:block" />
            <div className="text-center px-6 py-3 border-t border-white/10 sm:border-none mt-2 sm:mt-0 w-full sm:w-auto">
              <div className="text-[10px] font-bold uppercase tracking-wider text-lime-500 mb-1">Your Deposit</div>
              <div className="text-2xl md:text-3xl font-light text-white">{formatEgld(stats.stake, 4)}</div>
              <div className="text-xs text-white/40">EGLD deposited</div>
            </div>
            <div className="w-px h-10 bg-white/10 hidden lg:block" />
            <div className="text-center px-6 py-3 border-t border-white/10 sm:border-none mt-2 sm:mt-0 w-full sm:w-auto">
              <div className="text-[10px] font-bold uppercase tracking-wider text-pink-500 mb-1">Total Earned</div>
              <div className="text-2xl md:text-3xl font-light text-green-400">{formatEgld(stats.pendingRewards, 4)}</div>
              <div className="text-xs text-white/40">EGLD from executions</div>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-white/50">
          <span className="inline-block w-8 h-8 border-2 border-white/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
          <p>Loading keeper data...</p>
        </div>
      ) : stats?.isRegistered ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10">
          {/* Performance */}
          <div className="rounded-2xl border border-white/10 p-6 flex flex-col">
            <TypewriterTitle text="Performance" className="text-lg font-bold text-white mb-6 uppercase tracking-widest text-[12px] opacity-70" />
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-white/60">Status</span>
                <span className={`px-2.5 py-1 rounded text-xs font-bold ${stats.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                  {stats.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-white/60">Total Executions</span>
                <span className="font-bold text-white">{stats.totalExecs}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-white/60">Successful</span>
                <span className="font-bold text-green-400">{stats.successfulExecs}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/5">
                <span className="text-white/60">Failed</span>
                <span className="font-bold text-red-500">{stats.failedExecs}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-white/60">Success Rate</span>
                <span className="font-bold text-white">
                  {stats.totalExecs > 0 ? `${((stats.successfulExecs / stats.totalExecs) * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Rewards */}
          <div className="rounded-2xl border border-white/10 p-6 flex flex-col">
            <TypewriterTitle text="Rewards" className="text-lg font-bold text-white mb-4 uppercase tracking-widest text-[12px] opacity-70" />
            <p className="text-white/50 text-sm mb-6 flex-1">
              Claim your earned rewards from successful task executions into your wallet.
            </p>
            <div className="text-center mb-6 py-4 bg-white/5 rounded-xl border border-white/5">
              <div className="text-[10px] text-white/40 font-bold tracking-wider mb-1">TOTAL EARNED FROM EXECUTIONS</div>
              <div className="text-3xl font-light text-green-400">
                {formatEgld(stats.pendingRewards, 4)} <span className="text-lg text-green-400/70">EGLD</span>
              </div>
            </div>
            <button
              className="w-full btn btn-primary py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleClaimRewards}
              disabled={stats.pendingRewards === '0'}
            >
              Claim Rewards
            </button>
          </div>

          {/* Unregister */}
          <div className="rounded-2xl border border-white/10 p-6 flex flex-col">
            <TypewriterTitle text="Unregister" className="text-lg font-bold text-white mb-4 uppercase tracking-widest text-[12px] opacity-70" />
            <p className="text-white/50 text-sm mb-6 flex-1">
              Leave the keeper network. After cooldown, withdraw your full security deposit.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${stats.isActive ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-red-500/5 border-red-500/10 text-white/30 cursor-not-allowed'}`}
                onClick={handleRequestUnstake}
                disabled={!stats.isActive}
              >
                {stats.isActive ? 'Request Unstake' : 'Unstake Requested'}
              </button>
              <button
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${!stats.isActive ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20' : 'bg-green-500/5 border-green-500/10 text-white/30 cursor-not-allowed'}`}
                onClick={handleWithdrawStake}
                disabled={stats.isActive}
              >
                Withdraw Deposit
              </button>
            </div>
            {!stats.isActive && (
              <div className="mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex gap-3 items-start">
                <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(234,179,8)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <span className="text-xs text-yellow-500/80 leading-relaxed">Cooldown in progress (~10 min). Your deposit is safe — you can withdraw once the cooldown period elapses.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-xl mx-auto mt-10 p-8 md:p-12 rounded-3xl bg-yellow-500/5 border border-yellow-500/20 shadow-[0_0_40px_rgba(234,179,8,0.05)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-yellow-500 to-amber-500" />

          <div className="text-center mb-8">
            <TypewriterTitle text="Become a Keeper" className="text-2xl font-light text-white mb-4" />
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              Join the decentralized network of executors. Deposit EGLD as a security bond to start
              processing tasks and earning automated rewards.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-3">Deposit Amount</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value.replace(/,/g, '.'))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-medium text-lg outline-none focus:border-yellow-500/50 transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-bold text-sm">EGLD</span>
              </div>
              <button className="bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all active:scale-95" onClick={handleRegister}>
                Deposit & Join
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-yellow-500/70">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
              Minimum required: {formatEgld(globalStats.minStake, 2)} EGLD
            </div>
          </div>
        </div>
      )}

      {/* Keeper Bond Info */}
      <div className="mt-16 pt-12 border-t border-white/5">
        <h2 className="text-2xl font-light text-center text-white mb-10 tracking-tight">How the Keeper Bond Works</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div>
            <h3 className="text-lg text-white font-medium mb-3">Security Bond</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              The deposit acts as a <strong className="text-white/80 font-medium">guarantee</strong> that you will execute tasks reliably. It protects task creators from unreliable keepers.
            </p>
          </div>
          <div>
            <h3 className="text-lg text-white font-medium mb-3">Why It's Required</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              Without a bond, anyone could register as keeper and ignore tasks. The stake ensures <strong className="text-white/80 font-medium">skin in the game</strong> — only committed operators join.
            </p>
          </div>
          <div>
            <h3 className="text-lg text-white font-medium mb-3">Slashing Penalties</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              If a keeper <strong className="text-red-400 font-medium">fails to execute</strong> assigned tasks repeatedly, a portion of their bond is <strong className="text-red-400 font-medium">slashed</strong> as a penalty.
            </p>
          </div>
        </div>

        <div className="my-12 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/5 rounded-3xl p-1">
          <div className="rounded-[22px] p-6 lg:p-8">
            <h3 className="text-green-400 text-xs font-bold uppercase tracking-widest mb-4"> When You Perform Well</h3>
            <ul className="text-white/60 text-sm space-y-3">
              <li className="flex gap-3"><span className="text-green-400 shrink-0"></span>Earn execution rewards for each completed task</li>
              <li className="flex gap-3"><span className="text-green-400 shrink-0"></span>Your bond stays 100% intact</li>
              <li className="flex gap-3"><span className="text-green-400 shrink-0"></span>Higher success rate = more assigned tasks</li>
            </ul>
          </div>
          <div className="rounded-[22px] p-6 lg:p-8">
            <h3 className="text-red-400 text-xs font-bold uppercase tracking-widest mb-4"> When You Fail to Execute</h3>
            <ul className="text-white/60 text-sm space-y-3">
              <li className="flex gap-3"><span className="text-red-400 shrink-0"></span>Partial slashing of your staked bond</li>
              <li className="flex gap-3"><span className="text-red-400 shrink-0"></span>Task gets reassigned to another keeper</li>
              <li className="flex gap-3"><span className="text-red-400 shrink-0"></span>Repeated failures = deactivation from the network</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-white/50 text-sm">
           When you <strong className="text-white/80">unregister</strong>, your remaining bond is <strong className="text-green-400">fully returned</strong> to your wallet.
        </p>

        {stats?.isRegistered && (
          <div className="max-w-3xl mx-auto mt-16 p-8 rounded-3xl bg-blue-900/10 border border-blue-500/20 relative overflow-hidden">
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-blue-500/20 blur-3xl rounded-full" />

            <h2 className="text-xl text-white font-medium mb-3 relative z-10">Node Operator CLI Guide</h2>
            <p className="text-white/60 text-sm mb-6 relative z-10">
              You are registered on-[chain]. To earn rewards, your Keeper Node must be actively running and listening for tasks.
            </p>

            <div className="border border-white/5 rounded-xl p-5 font-mono text-xs text-white/70 space-y-2 relative z-10">
              <div className="text-white/40"># 1. Clone & enter keeper directory</div>
              <div className="text-cyan-400 select-all">git clone https://github.com/AlexandruChitu-SXT/xcron-protocol.git && cd xcron-protocol/keeper</div>

              <div className="text-white/40 mt-4"># 2. Configure</div>
              <div className="text-cyan-400 select-all">cp keeper-config.example.json keeper-config.json</div>

              <div className="text-white/40 mt-4"># 3. Start Node</div>
              <div className="text-green-400 select-all">npm install && npm start</div>
            </div>

            <div className="mt-6 flex gap-3 p-4 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-400 text-sm relative z-10">
              <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
              <span>Keep your node online 24/7. Missing a task assignment will result in a slash.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KeeperLeaderboard() {
  const [keepers, setKeepers] = useState<{ addr: string; execs: number }[]>([]);

  useEffect(() => {
    async function fetchKeepers() {
      try {
        const res = await fetch(
          `${NETWORK.apiUrl}/accounts/${CONTRACTS.scheduler}/transactions?size=100&status=success&function=executeQuantumTask`
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
    <div className="border border-white/10 rounded-2xl overflow-hidden mt-8 mb-12">
      <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(251,191,36)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" /></svg>
        <span className="font-bold text-white tracking-wide">Keeper Leaderboard</span>
      </div>

      {keepers.length === 0 ? (
        <div className="px-6 py-10 text-center text-white/40 text-sm">
          No executions recorded yet in current epoch.
        </div>
      ) : (
        <div className="flex flex-col">
          {keepers.map((k, i) => (
            <div key={k.addr} className={`grid grid-cols-[40px_1fr_100px] items-center px-6 py-3 gap-3 hover:bg-white/5 transition-colors ${i < keepers.length - 1 ? 'border-b border-white/5' : ''} ${i === 0 ? 'bg-yellow-500/5' : ''}`}>
              <div className="flex items-center justify-center font-bold">
                {i < 3 ? (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${i === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50' : i === 1 ? 'bg-gray-300/20 text-gray-300 border border-gray-300/50' : 'bg-orange-400/20 text-orange-400 border border-orange-400/50'}`}>
                    {i + 1}
                  </div>
                ) : (
                  <span className="text-white/30 text-sm">#{i + 1}</span>
                )}
              </div>
              <div className="font-mono text-sm text-cyan-400/80 truncate">
                {shortenAddress(k.addr)}
              </div>
              <div className="text-right text-sm font-semibold text-white/70">
                {k.execs} <span className="text-white/30 font-normal">tx</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
