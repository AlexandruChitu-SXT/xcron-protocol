import { QuickAction } from './ChatTypes';

export const PROTOCOLS: Record<string, {
  name: string;
  icon: string;
  color: string;
  contracts: Record<string, { address: string; endpoint: string; description: string }>;
}> = {
  hatom: {
    name: 'Hatom',
    icon: '️',
    color: '#00c48c',
    contracts: {
      'liquid-stake': {
        address: 'erd1qqqqqqqqqqqqqpgqfzydqmdw7m2vazsp6u5p95yxz76t2p9rd8ss0zg9ts',
        endpoint: 'delegate',
        description: 'Stake eGold using Hatom Liquid Stake',
      },
      'claim-rewards': {
        address: 'erd1qqqqqqqqqqqqqpgqfzydqmdw7m2vazsp6u5p95yxz76t2p9rd8ss0zg9ts',
        endpoint: 'claimRewards',
        description: 'Claim staking rewards from Hatom',
      },
    },
  },
  xexchange: {
    name: 'xExchange',
    icon: '⇄',
    color: '#23f7dd',
    contracts: {
      'auto-compound': {
        address: 'erd1qqqqqqqqqqqqqpgqa0fsfshnff4n76jhcye6k7uvd7qacsq42jpsp6shh2',
        endpoint: 'claimRewardsAndCompound',
        description: 'Auto-compound LP rewards on xExchange',
      },
      'claim-rewards': {
        address: 'erd1qqqqqqqqqqqqqpgqa0fsfshnff4n76jhcye6k7uvd7qacsq42jpsp6shh2',
        endpoint: 'claimRewards',
        description: 'Claim farming rewards from xExchange',
      },
    },
  },
  ashswap: {
    name: 'AshSwap',
    icon: '◈',
    color: '#ff6b35',
    contracts: {
      'claim-rewards': {
        address: 'erd1qqqqqqqqqqqqqpgq5774jcntdqkzv62tlvvhfn2y7eevnph0mvtsm73yxz',
        endpoint: 'claimRewards',
        description: 'Claim farming rewards from AshSwap',
      },
    },
  },
};

export const WELCOME_QUICK_ACTIONS: QuickAction[] = [
  { label: 'Auto-compound', value: 'auto-compound xExchange weekly', icon: '⇄' },
  { label: 'Claim rewards', value: 'claim Hatom rewards daily', icon: '️' },
  { label: 'Show stats', value: 'show stats', icon: '◎' },
  { label: 'My tasks', value: 'show my tasks', icon: '▤' },
];

export const PROTOCOL_QUICK_ACTIONS: QuickAction[] = [
  { label: 'Hatom', value: 'hatom', icon: '️' },
  { label: 'xExchange', value: 'xexchange', icon: '⇄' },
  { label: 'AshSwap', value: 'ashswap', icon: '◈' },
];

export const INTERVAL_QUICK_ACTIONS: QuickAction[] = [
  { label: 'Daily', value: 'daily', icon: '' },
  { label: 'Weekly', value: 'weekly', icon: '' },
  { label: 'Monthly', value: 'monthly', icon: '' },
];

export const AMOUNT_QUICK_ACTIONS: QuickAction[] = [
  { label: '0.01 EGLD', value: '0.01', icon: '◇' },
  { label: '0.05 EGLD', value: '0.05', icon: '◆' },
  { label: '0.1 EGLD', value: '0.1', icon: '⬡' },
];
