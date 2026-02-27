import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { CONTRACTS, NETWORK, GAS_SCHEDULE_TASK, GAS_CANCEL_TASK, EXPLORER_TX } from '../config';

/* ═══════════════════════════════════════════════════════════════
   XCron AI — Phase 1 Upgrade
   
   New features:
   1. Quick action buttons (clickeable chips)
   2. Streaming text effect (typed char by char)
   3. Tx status tracking (Pending → Confirmed → Success)
   4. Memory system (localStorage)
   5. Sound feedback
   ═══════════════════════════════════════════════════════════════ */

// ── Known Protocols on MultiversX ──
const PROTOCOLS: Record<string, {
    name: string;
    icon: string;
    color: string;
    contracts: Record<string, { address: string; endpoint: string; description: string }>;
}> = {
    hatom: {
        name: 'Hatom',
        icon: '🟢',
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
        icon: '🔄',
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
        icon: '🔥',
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

// ── Message types ──
interface ChatMessage {
    id: string;
    role: 'user' | 'bot';
    content: string;
    timestamp: Date;
    action?: ActionCard;
    quickActions?: QuickAction[];
    isStreaming?: boolean;
}

interface ActionCard {
    protocol: string;
    icon: string;
    color: string;
    description: string;
    details: { label: string; value: string }[];
    status: 'pending' | 'signing' | 'confirmed' | 'success' | 'failed';
    txHash?: string;
}

interface QuickAction {
    label: string;
    value: string;
    icon?: string;
}

// ── Conversation state for multi-turn ──
interface ConversationState {
    intent: string | null;
    protocol: string | null;
    action: string | null;
    amount: string | null;
    interval: string | null;
    executions: number | null;
    awaitingField: string | null;
}

// ── Memory system ──
interface CronMemory {
    lastWallet: string | null;
    lastProtocol: string | null;
    lastAction: string | null;
    totalInteractions: number;
    lastVisit: string;
    favoriteProtocol: string | null;
    txHistory: { hash: string; action: string; timestamp: string }[];
}

const MEMORY_KEY = 'xcron-ai-memory';

const loadMemory = (): CronMemory => {
    try {
        const raw = localStorage.getItem(MEMORY_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    return {
        lastWallet: null, lastProtocol: null, lastAction: null,
        totalInteractions: 0, lastVisit: new Date().toISOString(),
        favoriteProtocol: null, txHistory: [],
    };
};

const saveMemory = (mem: CronMemory) => {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(mem)); } catch { /* noop */ }
};

// ── Sound system ──
const playSound = (type: 'send' | 'receive' | 'success' | 'error') => {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.08;

        switch (type) {
            case 'send':
                osc.frequency.value = 800;
                osc.type = 'sine';
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
                osc.start(); osc.stop(ctx.currentTime + 0.1);
                break;
            case 'receive':
                osc.frequency.value = 600;
                osc.type = 'sine';
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.start(); osc.stop(ctx.currentTime + 0.15);
                break;
            case 'success':
                osc.frequency.value = 523;
                osc.type = 'sine';
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start();
                setTimeout(() => {
                    const o2 = ctx.createOscillator();
                    const g2 = ctx.createGain();
                    o2.connect(g2); g2.connect(ctx.destination);
                    g2.gain.value = 0.08;
                    o2.frequency.value = 659;
                    o2.type = 'sine';
                    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                    o2.start(); o2.stop(ctx.currentTime + 0.5);
                }, 150);
                osc.stop(ctx.currentTime + 0.3);
                break;
            case 'error':
                osc.frequency.value = 200;
                osc.type = 'square';
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                osc.start(); osc.stop(ctx.currentTime + 0.2);
                break;
        }
    } catch { /* AudioContext not available */ }
};

const EMPTY_STATE: ConversationState = {
    intent: null, protocol: null, action: null,
    amount: null, interval: null, executions: null,
    awaitingField: null,
};

// ── Quick action presets ──
const WELCOME_QUICK_ACTIONS: QuickAction[] = [
    { label: 'Auto-compound', value: 'auto-compound xExchange weekly', icon: '🔄' },
    { label: 'Claim rewards', value: 'claim Hatom rewards daily', icon: '🟢' },
    { label: 'Show stats', value: 'show stats', icon: '📊' },
    { label: 'My tasks', value: 'show my tasks', icon: '📋' },
];

const PROTOCOL_QUICK_ACTIONS: QuickAction[] = [
    { label: 'Hatom', value: 'hatom', icon: '🟢' },
    { label: 'xExchange', value: 'xexchange', icon: '🔄' },
    { label: 'AshSwap', value: 'ashswap', icon: '🔥' },
];

const INTERVAL_QUICK_ACTIONS: QuickAction[] = [
    { label: 'Daily', value: 'daily', icon: '📅' },
    { label: 'Weekly', value: 'weekly', icon: '🗓️' },
    { label: 'Monthly', value: 'monthly', icon: '📆' },
];

const AMOUNT_QUICK_ACTIONS: QuickAction[] = [
    { label: '0.01 EGLD', value: '0.01', icon: '💎' },
    { label: '0.05 EGLD', value: '0.05', icon: '💎' },
    { label: '0.1 EGLD', value: '0.1', icon: '💎' },
];

export default function AiChat() {
    const { wallet, signAndSendTransaction, setShowConnectModal } = useWallet();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [convo, setConvo] = useState<ConversationState>(EMPTY_STATE);
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
    const [streamedContent, setStreamedContent] = useState('');
    const [memory] = useState<CronMemory>(loadMemory);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Build personalized welcome ──
    const getWelcomeMessage = useCallback((): string => {
        const mem = memory;
        if (mem.totalInteractions > 0 && mem.lastProtocol) {
            const proto = PROTOCOLS[mem.lastProtocol];
            return `Welcome back! 👋\n\nLast time you used ${proto?.name || mem.lastProtocol}. Want me to do something similar? Or try something new — just ask.`;
        }
        if (!wallet.connected) {
            return `Hey! I'm XCron AI 🤖\n\nConnect your wallet and I'll help you automate anything on MultiversX — no contract addresses needed.`;
        }
        return `Hey! I'm XCron AI 🤖\n\nI automate DeFi on MultiversX. Just tell me what you need naturally. I know Hatom, xExchange, and AshSwap.`;
    }, [memory, wallet.connected]);

    // Send welcome on first open
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{
                id: 'welcome',
                role: 'bot',
                content: getWelcomeMessage(),
                timestamp: new Date(),
                quickActions: wallet.connected ? WELCOME_QUICK_ACTIONS : undefined,
            }]);
        }
    }, [isOpen, messages.length, wallet.connected, getWelcomeMessage]);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, streamedContent, scrollToBottom]);
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

    // ── Streaming text engine ──
    const streamText = useCallback((msgId: string, fullText: string, onComplete: () => void) => {
        setStreamingMsgId(msgId);
        setStreamedContent('');
        let i = 0;
        const speed = Math.max(12, Math.min(30, 1200 / fullText.length)); // adaptive speed
        const timer = setInterval(() => {
            i++;
            if (i >= fullText.length) {
                clearInterval(timer);
                setStreamedContent(fullText);
                setStreamingMsgId(null);
                onComplete();
            } else {
                setStreamedContent(fullText.substring(0, i));
            }
        }, speed);
        return () => clearInterval(timer);
    }, []);

    // ── TX status tracker ──
    const trackTxStatus = useCallback(async (txHash: string, msgId: string) => {
        const maxAttempts = 20;
        let attempt = 0;
        const poll = async () => {
            attempt++;
            if (attempt > maxAttempts) return;
            try {
                const res = await fetch(`${NETWORK.apiUrl}/transactions/${txHash}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === 'success') {
                        setMessages(prev => prev.map(m =>
                            m.id === msgId && m.action ? { ...m, action: { ...m.action, status: 'success' as const } } : m
                        ));
                        playSound('success');
                        // Save to memory
                        const mem = loadMemory();
                        mem.txHistory.unshift({ hash: txHash, action: 'schedule', timestamp: new Date().toISOString() });
                        if (mem.txHistory.length > 10) mem.txHistory = mem.txHistory.slice(0, 10);
                        saveMemory(mem);
                        return;
                    } else if (data.status === 'fail' || data.status === 'invalid') {
                        setMessages(prev => prev.map(m =>
                            m.id === msgId && m.action ? { ...m, action: { ...m.action, status: 'failed' as const } } : m
                        ));
                        playSound('error');
                        return;
                    }
                    // Still pending — update to confirmed if we found it
                    setMessages(prev => prev.map(m =>
                        m.id === msgId && m.action && m.action.status === 'pending'
                            ? { ...m, action: { ...m.action, status: 'confirmed' as const } }
                            : m
                    ));
                }
            } catch { /* retry */ }
            setTimeout(poll, 3000);
        };
        setTimeout(poll, 2000);
    }, []);

    // ── Parse natural language ──
    const detectProtocol = (text: string): string | null => {
        const t = text.toLowerCase();
        if (t.includes('hatom')) return 'hatom';
        if (t.includes('xexchange') || t.includes('exchange') || t.includes('compound')) return 'xexchange';
        if (t.includes('ashswap') || t.includes('ash')) return 'ashswap';
        return null;
    };

    const detectAction = (text: string): string | null => {
        const t = text.toLowerCase();
        if (t.includes('compound') || t.includes('auto-compound') || t.includes('autocompound')) return 'auto-compound';
        if (t.includes('stake') || t.includes('liquid')) return 'liquid-stake';
        if (t.includes('claim')) return 'claim-rewards';
        return null;
    };

    const detectInterval = (text: string): { seconds: number; label: string } | null => {
        const t = text.toLowerCase();
        if (t.includes('hour') || t.includes('24h')) return { seconds: 86400, label: 'every 24h' };
        if (t.includes('daily')) return { seconds: 86400, label: 'daily' };
        if (t.includes('week')) return { seconds: 604800, label: 'weekly' };
        if (t.includes('month')) return { seconds: 2592000, label: 'monthly' };
        return null;
    };

    const detectDuration = (text: string): number | null => {
        const match = text.match(/(\d+)\s*(day|week|month|year|time|execution)/i);
        if (!match) return null;
        const n = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit.startsWith('year')) return n * 52;
        if (unit.startsWith('month')) return n * 4;
        if (unit.startsWith('week')) return n;
        return n;
    };

    const detectAmount = (text: string): string | null => {
        const match = text.match(/([\d.]+)\s*(egld|xegld|e?gold)/i);
        if (match) return match[1];
        const justNumber = text.match(/^([\d.]+)$/);
        if (justNumber) return justNumber[1];
        return null;
    };

    const numToHex = (n: number): string => {
        const hex = n.toString(16);
        return hex.length % 2 === 0 ? hex : '0' + hex;
    };

    // ── Process message with conversation context ──
    const processMessage = async (text: string, state: ConversationState): Promise<{
        reply: string;
        newState: ConversationState;
        action?: ActionCard;
        quickActions?: QuickAction[];
    }> => {
        const lower = text.toLowerCase();
        let s = { ...state };

        // ── Cancel intent ──
        if (lower.includes('cancel')) {
            const match = text.match(/#?(\d+)/);
            if (match) {
                if (!wallet.connected) {
                    return { reply: `Connect your wallet first, and I'll cancel task #${match[1]} for you.`, newState: EMPTY_STATE };
                }
                const cancelAction: ActionCard = {
                    protocol: 'XCron', icon: '⏱️', color: '#009b77',
                    description: `Cancel Task #${match[1]}`,
                    details: [{ label: 'Task ID', value: `#${match[1]}` }],
                    status: 'signing',
                };
                try {
                    const txHash = await signAndSendTransaction({
                        receiver: CONTRACTS.scheduler,
                        data: `cancelTask@${numToHex(parseInt(match[1]))}`,
                        value: '0', gasLimit: GAS_CANCEL_TASK,
                    });
                    if (txHash) {
                        cancelAction.status = 'pending';
                        cancelAction.txHash = txHash;
                        return { reply: 'Cancellation submitted — tracking confirmation...', newState: EMPTY_STATE, action: cancelAction };
                    } else {
                        cancelAction.status = 'failed';
                        return { reply: 'Transaction was rejected.', newState: EMPTY_STATE, action: cancelAction };
                    }
                } catch {
                    cancelAction.status = 'failed';
                    return { reply: 'Something went wrong with the cancellation.', newState: EMPTY_STATE, action: cancelAction };
                }
            }
            return { reply: 'Which task do you want to cancel? Give me the number.', newState: { ...EMPTY_STATE, intent: 'cancel', awaitingField: 'taskId' } };
        }

        // ── Tx history ──
        if (lower.includes('history') || lower.includes('historial') || (lower.includes('my') && lower.includes('task'))) {
            const mem = loadMemory();
            if (mem.txHistory.length === 0) {
                return { reply: "No transactions yet. Let's schedule your first automation!", newState: EMPTY_STATE, quickActions: WELCOME_QUICK_ACTIONS };
            }
            const list = mem.txHistory.slice(0, 5).map((tx) => {
                const date = new Date(tx.timestamp).toLocaleDateString();
                return `• ${date} — ${tx.action} → ${tx.hash.slice(0, 12)}...`;
            }).join('\n');
            return { reply: `Your recent transactions:\n\n${list}`, newState: EMPTY_STATE };
        }

        // ── Stats query ──
        if (lower.includes('stat') || (lower.includes('protocol') && !lower.includes('schedule'))) {
            try {
                const res = await fetch(`${NETWORK.gatewayUrl}/vm-values/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scAddress: CONTRACTS.scheduler, funcName: 'getTaskNonce', args: [] }),
                });
                const data = await res.json();
                const rd = data?.data?.data?.returnData || [];
                const tasks = rd[0] ? parseInt(atob(rd[0]), 16) || 0 : 0;
                return {
                    reply: `Here's how the protocol is doing:\n\n• Total tasks: ${tasks}\n• Network: ${NETWORK.name}\n• Status: Active ✅\n• Scheduler: ${CONTRACTS.scheduler.slice(0, 16)}...`,
                    newState: EMPTY_STATE,
                    quickActions: [
                        { label: 'Schedule task', value: 'schedule a new task', icon: '📋' },
                        { label: 'Cross-shard', value: 'cross-shard stats', icon: '🔗' },
                    ],
                };
            } catch {
                return { reply: "Couldn't reach the network right now. Try again in a sec.", newState: EMPTY_STATE };
            }
        }

        // ── Cross-shard query ──
        if (lower.includes('cross') || (lower.includes('shard') && !lower.includes('schedule'))) {
            try {
                const res = await fetch(`${NETWORK.gatewayUrl}/vm-values/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scAddress: CONTRACTS.scheduler, funcName: 'getCrossShardStats', args: [] }),
                });
                const data = await res.json();
                const rd = data?.data?.data?.returnData || [];
                const cross = rd[0] ? parseInt(atob(rd[0]), 16) || 0 : 0;
                const intra = rd[1] ? parseInt(atob(rd[1]), 16) || 0 : 0;
                const total = cross + intra;
                return {
                    reply: `Cross-shard optimization:\n\n• Same-shard (0% overhead): ${intra}\n• Cross-shard (30% overhead): ${cross}\n• Savings rate: ${total > 0 ? Math.round((intra / total) * 100) : 0}%`,
                    newState: EMPTY_STATE,
                };
            } catch {
                return { reply: "Can't fetch cross-shard data right now.", newState: EMPTY_STATE };
            }
        }

        // ── Awaiting follow-up answers ──
        if (s.awaitingField === 'taskId') {
            const match = text.match(/(\d+)/);
            if (match) return processMessage(`cancel task #${match[1]}`, EMPTY_STATE);
            return { reply: "I need a task number. Like #15 or just 15.", newState: s };
        }

        if (s.awaitingField === 'amount') {
            const amount = detectAmount(text);
            if (amount) {
                s.amount = amount;
                s.awaitingField = null;
                return executeSchedule(s);
            }
            return { reply: "How much EGLD?", newState: s, quickActions: AMOUNT_QUICK_ACTIONS };
        }

        if (s.awaitingField === 'interval') {
            const interval = detectInterval(text);
            if (interval) {
                s.interval = JSON.stringify(interval);
                s.awaitingField = 'amount';
                return { reply: `Got it, ${interval.label}. How much EGLD to deposit?`, newState: s, quickActions: AMOUNT_QUICK_ACTIONS };
            }
            return { reply: "How often? Pick one:", newState: s, quickActions: INTERVAL_QUICK_ACTIONS };
        }

        // ── Schedule intent ──
        const protocol = detectProtocol(text);
        const action = detectAction(text);
        const interval = detectInterval(text);
        const duration = detectDuration(text);
        const amount = detectAmount(text);

        if (protocol || action || lower.includes('schedule') || lower.includes('automat') || lower.includes('recurring') || lower.includes('dca')) {
            s.intent = 'schedule';
            if (protocol) s.protocol = protocol;
            if (action) s.action = action;
            if (interval) s.interval = JSON.stringify(interval);
            if (duration) s.executions = duration;
            if (amount) s.amount = amount;

            if (s.protocol && !s.action) {
                if (lower.includes('compound')) s.action = 'auto-compound';
                else if (lower.includes('stake') || lower.includes('liquid')) s.action = 'liquid-stake';
                else s.action = 'claim-rewards';
            }
            if (s.action === 'auto-compound' && !s.protocol) s.protocol = 'xexchange';
            if (!s.executions && duration) s.executions = duration;
            if (!s.executions && s.interval) s.executions = 52;

            if (!s.protocol) {
                s.awaitingField = 'protocol';
                return { reply: "Which protocol?", newState: s, quickActions: PROTOCOL_QUICK_ACTIONS };
            }
            if (!s.interval && s.intent === 'schedule') {
                s.awaitingField = 'interval';
                const proto = PROTOCOLS[s.protocol];
                return { reply: `Great choice with ${proto?.name}! How often?`, newState: s, quickActions: INTERVAL_QUICK_ACTIONS };
            }
            if (!s.amount) {
                s.awaitingField = 'amount';
                return { reply: `Almost there! How much EGLD to deposit?`, newState: s, quickActions: AMOUNT_QUICK_ACTIONS };
            }
            return executeSchedule(s);
        }

        // ── Protocol selection in follow-up ──
        if (s.awaitingField === 'protocol') {
            const p = detectProtocol(text);
            if (p) {
                s.protocol = p;
                if (!s.action) s.action = 'claim-rewards';
                s.awaitingField = 'interval';
                return { reply: `${PROTOCOLS[p].name} it is. How often?`, newState: s, quickActions: INTERVAL_QUICK_ACTIONS };
            }
            return { reply: "Which one?", newState: s, quickActions: PROTOCOL_QUICK_ACTIONS };
        }

        // ── Help ──
        if (lower.includes('help') || lower.includes('what can') || lower.includes('hola') || lower.includes('hello') || lower.includes('hi')) {
            return {
                reply: `I'm XCron AI! I automate DeFi on MultiversX.\n\nJust tell me what you need naturally — no contract addresses required.`,
                newState: EMPTY_STATE,
                quickActions: WELCOME_QUICK_ACTIONS,
            };
        }

        // ── Default ──
        return {
            reply: `I can help you automate DeFi tasks. Try tapping one of these:`,
            newState: EMPTY_STATE,
            quickActions: WELCOME_QUICK_ACTIONS,
        };
    };

    // ── Execute the schedule ──
    const executeSchedule = async (s: ConversationState): Promise<{
        reply: string; newState: ConversationState; action?: ActionCard; quickActions?: QuickAction[];
    }> => {
        if (!wallet.connected) {
            return { reply: "Connect your wallet first — I'll prepare everything.", newState: s };
        }
        const proto = PROTOCOLS[s.protocol!];
        const actionData = proto?.contracts[s.action!];
        if (!proto || !actionData) {
            return { reply: "I don't know that combination yet.", newState: EMPTY_STATE, quickActions: WELCOME_QUICK_ACTIONS };
        }
        const intervalData = s.interval ? JSON.parse(s.interval) : { seconds: 604800, label: 'weekly' };
        const card: ActionCard = {
            protocol: proto.name, icon: proto.icon, color: proto.color,
            description: actionData.description,
            details: [
                { label: 'Frequency', value: intervalData.label },
                { label: 'Executions', value: String(s.executions || 52) },
                { label: 'Deposit', value: `${s.amount} EGLD` },
            ],
            status: 'signing',
        };

        // Save to memory
        const mem = loadMemory();
        mem.lastProtocol = s.protocol;
        mem.lastAction = s.action;
        mem.lastWallet = wallet.address || null;
        mem.totalInteractions++;
        mem.lastVisit = new Date().toISOString();
        // Count favorite
        if (!mem.favoriteProtocol) mem.favoriteProtocol = s.protocol;
        saveMemory(mem);

        try {
            const value = BigInt(Math.floor(parseFloat(s.amount!) * 1e18)).toString();
            const endpointHex = Array.from(new TextEncoder().encode(actionData.endpoint)).map(b => b.toString(16).padStart(2, '0')).join('');
            const targetHex = Array.from(new TextEncoder().encode(actionData.address)).map(b => b.toString(16).padStart(2, '0')).join('');

            const txHash = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                data: `scheduleTask@${targetHex}@${endpointHex}@${numToHex(intervalData.seconds)}@${numToHex(15000000)}@${numToHex(3600)}`,
                value, gasLimit: GAS_SCHEDULE_TASK,
            });
            if (txHash) {
                card.status = 'pending';
                card.txHash = txHash;
                return {
                    reply: 'Transaction sent! Tracking confirmation...',
                    newState: EMPTY_STATE,
                    action: card,
                    quickActions: [{ label: 'View on Explorer', value: `explorer:${txHash}`, icon: '🔍' }],
                };
            } else {
                card.status = 'failed';
                return { reply: 'Transaction was rejected.', newState: EMPTY_STATE, action: card };
            }
        } catch {
            card.status = 'failed';
            return { reply: 'Something went wrong. Try again?', newState: EMPTY_STATE, action: card };
        }
    };

    // ── Quick action handler ──
    const handleQuickAction = (qa: QuickAction) => {
        if (qa.value.startsWith('explorer:')) {
            const hash = qa.value.replace('explorer:', '');
            window.open(EXPLORER_TX(hash), '_blank');
            return;
        }
        setInput(qa.value);
        // Trigger send immediately
        setTimeout(() => {
            const fakeEvent = { key: 'Enter', shiftKey: false, preventDefault: () => { } } as React.KeyboardEvent;
            handleKeyDown(fakeEvent);
        }, 50);
    };

    // ── Send handler ──
    const handleSend = async () => {
        if (!input.trim() || isThinking) return;
        const userText = input.trim();

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: 'user',
            content: userText,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsThinking(true);
        playSound('send');

        try {
            const { reply, newState, action, quickActions } = await processMessage(userText, convo);
            setConvo(newState);

            const botMsgId = `b-${Date.now()}`;
            const botMsg: ChatMessage = {
                id: botMsgId,
                role: 'bot',
                content: reply,
                timestamp: new Date(),
                action,
                quickActions,
                isStreaming: true,
            };

            setMessages(prev => [...prev, botMsg]);
            setIsThinking(false);
            playSound('receive');

            // Stream the text
            streamText(botMsgId, reply, () => {
                setMessages(prev => prev.map(m =>
                    m.id === botMsgId ? { ...m, isStreaming: false } : m
                ));
            });

            // Start TX tracking if we have a hash
            if (action?.txHash && action.status === 'pending') {
                trackTxStatus(action.txHash, botMsgId);
            }
        } catch {
            setMessages(prev => [...prev, {
                id: `e-${Date.now()}`,
                role: 'bot',
                content: "Oops, something broke. Try again.",
                timestamp: new Date(),
            }]);
            setIsThinking(false);
            playSound('error');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Render helper: get displayed text (streaming or full) ──
    const getDisplayText = (msg: ChatMessage): string => {
        if (msg.id === streamingMsgId) return streamedContent;
        return msg.content;
    };

    return (
        <>
            {/* ── Floating Cron Button ── */}
            <button
                className="cron-fab"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Chat with XCron AI"
            >
                {isOpen ? '✕' : <span className="cron-fab-text">X<span>AI</span></span>}
            </button>

            {/* ── Chat Panel ── */}
            {isOpen && (
                <div className="cron-chat">
                    {/* Header */}
                    <div className="cron-header">
                        <div className="cron-header-info">
                            <span className="cron-header-icon">X<span>AI</span></span>
                            <div>
                                <div className="cron-header-name">XCron AI</div>
                                <div className="cron-header-sub">
                                    {wallet.connected
                                        ? <><span className="cron-online" />Connected</>
                                        : <span className="cron-connect-link" onClick={() => setShowConnectModal(true)}>Connect wallet →</span>
                                    }
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="cron-messages">
                        {messages.map(msg => (
                            <div key={msg.id} className={`cron-msg cron-msg-${msg.role}`}>
                                <div className="cron-bubble">
                                    {getDisplayText(msg).split('\n').map((line, i, arr) => (
                                        <span key={i}>
                                            {line.startsWith('•') ? (
                                                <span className="cron-bullet">{line}</span>
                                            ) : line}
                                            {i < arr.length - 1 && <br />}
                                        </span>
                                    ))}
                                    {msg.id === streamingMsgId && (
                                        <span className="cron-cursor" />
                                    )}
                                </div>

                                {/* Action Card with live status */}
                                {msg.action && (
                                    <div className="cron-action-card" style={{ borderColor: msg.action.color + '44' }}>
                                        <div className="cron-action-header">I executed this Action:</div>
                                        <div className="cron-action-body">
                                            <span className="cron-action-icon">{msg.action.icon}</span>
                                            <div>
                                                <div className="cron-action-desc">{msg.action.description}</div>
                                                {msg.action.details.map((d, i) => (
                                                    <div key={i} className="cron-action-detail">• {d.label}: {d.value}</div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className={`cron-action-status cron-action-${msg.action.status}`}>
                                            {msg.action.status === 'success' && '✓ Successfully processed'}
                                            {msg.action.status === 'confirmed' && '🔄 Confirmed — awaiting execution...'}
                                            {msg.action.status === 'pending' && (
                                                <>⏳ Pending on-chain...
                                                    <span className="cron-status-spinner" />
                                                </>
                                            )}
                                            {msg.action.status === 'signing' && '🖊️ Awaiting signature...'}
                                            {msg.action.status === 'failed' && '✗ Transaction failed'}
                                        </div>
                                        {msg.action.txHash && (
                                            <a
                                                className="cron-action-explorer"
                                                href={EXPLORER_TX(msg.action.txHash)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                View on Explorer →
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* Quick Action Chips */}
                                {msg.quickActions && !msg.isStreaming && msg.role === 'bot' && (
                                    <div className="cron-quick-actions">
                                        {msg.quickActions.map((qa, i) => (
                                            <button
                                                key={i}
                                                className="cron-chip"
                                                onClick={() => handleQuickAction(qa)}
                                            >
                                                {qa.icon && <span className="cron-chip-icon">{qa.icon}</span>}
                                                {qa.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {isThinking && (
                            <div className="cron-msg cron-msg-bot">
                                <div className="cron-bubble cron-dots">
                                    <span /><span /><span />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="cron-input-bar">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder={wallet.connected ? "Tell me what to automate..." : "Connect wallet to start"}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isThinking}
                        />
                        <button onClick={handleSend} disabled={!input.trim() || isThinking}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
