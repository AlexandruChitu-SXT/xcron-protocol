import { QuickAction } from './ChatTypes';
import { PROTOCOLS } from './ChatProtocols';

export const numToHex = (n: number): string => {
  const hex = n.toString(16);
  return hex.length % 2 === 0 ? hex : '0' + hex;
};

export const detectProtocol = (text: string): string | null => {
  const t = text.toLowerCase();
  if (t.includes('hatom')) return 'hatom';
  if (t.includes('xexchange') || t.includes('exchange') || t.includes('compound')) return 'xexchange';
  if (t.includes('ashswap') || t.includes('ash')) return 'ashswap';
  return null;
};

export const detectAction = (text: string): string | null => {
  const t = text.toLowerCase();
  if (t.includes('compound') || t.includes('auto-compound') || t.includes('autocompound')) return 'auto-compound';
  if (t.includes('stake') || t.includes('liquid')) return 'liquid-stake';
  if (t.includes('claim')) return 'claim-rewards';
  return null;
};

export const detectInterval = (text: string): { seconds: number; label: string } | null => {
  const t = text.toLowerCase();
  if (t.includes('hour') || t.includes('24h')) return { seconds: 86400, label: 'every 24h' };
  if (t.includes('daily')) return { seconds: 86400, label: 'daily' };
  if (t.includes('week')) return { seconds: 604800, label: 'weekly' };
  if (t.includes('month')) return { seconds: 2592000, label: 'monthly' };
  return null;
};

export const detectAmount = (text: string): string | null => {
  const match = text.match(/([\d.]+)\s*(egld|xegld|e?gold)/i);
  if (match) return match[1];
  const justNumber = text.match(/^([\d.]+)$/);
  if (justNumber) return justNumber[1];
  return null;
};

export const getVoiceSupport = (): boolean => {
  return typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
};
