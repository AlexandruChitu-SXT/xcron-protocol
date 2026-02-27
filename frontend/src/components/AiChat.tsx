import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { CONTRACTS, NETWORK, GAS_SCHEDULE_TASK, GAS_CANCEL_TASK } from '../config';

/* ═══════════════════════════════════════════════════════════════
   Cron the Bot — JoAi-style AI chat for XCron Protocol
   
   Features:
   - Natural language → transaction (no contract pasting)
   - Protocol knowledge (xExchange, Hatom, AshSwap)
   - Action cards with branding on execution
   - Multi-turn conversation with context memory
   - Wallet integration for signing
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
}

interface ActionCard {
    protocol: string;
    icon: string;
    color: string;
    description: string;
    details: { label: string; value: string }[];
    status: 'pending' | 'signing' | 'success' | 'failed';
    txHash?: string;
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

const EMPTY_STATE: ConversationState = {
    intent: null, protocol: null, action: null,
    amount: null, interval: null, executions: null,
    awaitingField: null,
};

export default function AiChat() {
    const { wallet, signAndSendTransaction, setShowConnectModal } = useWallet();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [convo, setConvo] = useState<ConversationState>(EMPTY_STATE);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Send welcome on first open
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{
                id: 'welcome',
                role: 'bot',
                content: wallet.connected
                    ? `Hey! I'm Cron the Bot 🤖\n\nI can automate tasks on MultiversX for you. Just tell me what you need:\n\n• "Auto-compound xExchange weekly"\n• "Claim Hatom rewards every 24h"\n• "Show protocol stats"\n• "Cancel task #15"`
                    : `Hey! I'm Cron the Bot 🤖\n\nConnect your wallet first and I'll help you automate anything on MultiversX.`,
                timestamp: new Date(),
            }]);
        }
    }, [isOpen, messages.length, wallet.connected]);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

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
    const processMessage = async (text: string, state: ConversationState): Promise<{ reply: string; newState: ConversationState; action?: ActionCard }> => {
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
                    protocol: 'XCron',
                    icon: '⏱️',
                    color: '#009b77',
                    description: `Cancel Task #${match[1]}`,
                    details: [{ label: 'Task ID', value: `#${match[1]}` }],
                    status: 'signing',
                };

                try {
                    const txHash = await signAndSendTransaction({
                        receiver: CONTRACTS.scheduler,
                        data: `cancelTask@${numToHex(parseInt(match[1]))}`,
                        value: '0',
                        gasLimit: GAS_CANCEL_TASK,
                    });
                    if (txHash) {
                        cancelAction.status = 'success';
                        cancelAction.txHash = txHash;
                        return { reply: 'Cancelled successfully.', newState: EMPTY_STATE, action: cancelAction };
                    } else {
                        cancelAction.status = 'failed';
                        return { reply: 'Transaction was rejected or failed.', newState: EMPTY_STATE, action: cancelAction };
                    }
                } catch {
                    cancelAction.status = 'failed';
                    return { reply: 'Something went wrong with the cancellation.', newState: EMPTY_STATE, action: cancelAction };
                }
            }
            return { reply: 'Which task do you want to cancel? Give me the task number.', newState: { ...EMPTY_STATE, intent: 'cancel', awaitingField: 'taskId' } };
        }

        // ── Stats query ──
        if (lower.includes('stat') || lower.includes('protocol') && !lower.includes('schedule')) {
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
                    newState: EMPTY_STATE
                };
            } catch {
                return { reply: "Couldn't reach the network right now. Try again in a sec.", newState: EMPTY_STATE };
            }
        }

        // ── Cross-shard query ──
        if (lower.includes('cross') || lower.includes('shard') && !lower.includes('schedule')) {
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
                    reply: `Cross-shard optimization stats:\n\n• Same-shard (0% gas overhead): ${intra}\n• Cross-shard (30% overhead): ${cross}\n• Gas savings rate: ${total > 0 ? Math.round((intra / total) * 100) : 0}%`,
                    newState: EMPTY_STATE
                };
            } catch {
                return { reply: "Can't fetch cross-shard data right now.", newState: EMPTY_STATE };
            }
        }

        // ── Awaiting follow-up answers ──
        if (s.awaitingField === 'taskId') {
            const match = text.match(/(\d+)/);
            if (match) {
                // Recurse with cancel intent
                return processMessage(`cancel task #${match[1]}`, EMPTY_STATE);
            }
            return { reply: "I need a task number. Like #15 or just 15.", newState: s };
        }

        if (s.awaitingField === 'amount') {
            const amount = detectAmount(text);
            if (amount) {
                s.amount = amount;
                s.awaitingField = null;
                return executeSchedule(s);
            }
            return { reply: "How much EGLD do you want to deposit for this task?", newState: s };
        }

        if (s.awaitingField === 'interval') {
            const interval = detectInterval(text);
            if (interval) {
                s.interval = JSON.stringify(interval);
                s.awaitingField = 'amount';
                return { reply: `Got it, ${interval.label}. How much EGLD do you want to deposit?`, newState: s };
            }
            return { reply: "How often? Daily, weekly, or monthly?", newState: s };
        }

        // ── Schedule intent detection ──
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

            // Infer action from protocol if not explicit
            if (s.protocol && !s.action) {
                if (lower.includes('compound')) s.action = 'auto-compound';
                else if (lower.includes('stake') || lower.includes('liquid')) s.action = 'liquid-stake';
                else s.action = 'claim-rewards';
            }

            // Infer protocol from action
            if (s.action === 'auto-compound' && !s.protocol) s.protocol = 'xexchange';

            // Default executions from duration context
            if (!s.executions && duration) s.executions = duration;
            if (!s.executions && s.interval) s.executions = 52; // default 1 year

            // Ask for missing fields
            if (!s.protocol) {
                s.awaitingField = 'protocol';
                return { reply: "Which protocol? I know Hatom, xExchange, and AshSwap.", newState: s };
            }

            if (!s.interval && s.intent === 'schedule') {
                s.awaitingField = 'interval';
                const proto = PROTOCOLS[s.protocol];
                return { reply: `Great choice with ${proto?.name}! How often should I run it? Daily, weekly, or monthly?`, newState: s };
            }

            if (!s.amount) {
                s.awaitingField = 'amount';
                return { reply: `Almost there! How much EGLD do you want to deposit for this automation?`, newState: s };
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
                return { reply: `${PROTOCOLS[p].name} it is. How often? Daily, weekly, or monthly?`, newState: s };
            }
            return { reply: "I didn't catch that. Which protocol — Hatom, xExchange, or AshSwap?", newState: s };
        }

        // ── Help ──
        if (lower.includes('help') || lower.includes('what can') || lower.includes('hola') || lower.includes('hello') || lower.includes('hi')) {
            return {
                reply: `I'm Cron the Bot! Here's what I can do:\n\n• "Auto-compound xExchange weekly"\n• "Claim Hatom rewards daily"\n• "Show stats"\n• "Cancel task #15"\n\nJust tell me what you need, naturally.`,
                newState: EMPTY_STATE
            };
        }

        // ── Default ──
        return {
            reply: `I can help you automate DeFi on MultiversX.\n\nTry something like "auto-compound xExchange weekly" or "show stats".`,
            newState: EMPTY_STATE
        };
    };

    // ── Execute the schedule after all params collected ──
    const executeSchedule = async (s: ConversationState): Promise<{ reply: string; newState: ConversationState; action?: ActionCard }> => {
        if (!wallet.connected) {
            return {
                reply: "You need to connect your wallet first. I'll prepare the transaction once you're connected.",
                newState: s,
            };
        }

        const proto = PROTOCOLS[s.protocol!];
        const actionData = proto?.contracts[s.action!];
        if (!proto || !actionData) {
            return {
                reply: "I don't know that combination yet. Try 'auto-compound xExchange' or 'claim Hatom rewards'.",
                newState: EMPTY_STATE,
            };
        }

        const intervalData = s.interval ? JSON.parse(s.interval) : { seconds: 604800, label: 'weekly' };

        const card: ActionCard = {
            protocol: proto.name,
            icon: proto.icon,
            color: proto.color,
            description: actionData.description,
            details: [
                { label: 'Frequency', value: intervalData.label },
                { label: 'Executions', value: String(s.executions || 52) },
                { label: 'Deposit', value: `${s.amount} EGLD` },
            ],
            status: 'signing',
        };

        try {
            const value = BigInt(Math.floor(parseFloat(s.amount!) * 1e18)).toString();
            const endpointHex = Array.from(new TextEncoder().encode(actionData.endpoint)).map(b => b.toString(16).padStart(2, '0')).join('');
            const targetHex = Array.from(new TextEncoder().encode(actionData.address)).map(b => b.toString(16).padStart(2, '0')).join('');

            const txHash = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                data: `scheduleTask@${targetHex}@${endpointHex}@${numToHex(intervalData.seconds)}@${numToHex(15000000)}@${numToHex(3600)}`,
                value,
                gasLimit: GAS_SCHEDULE_TASK,
            });

            if (txHash) {
                card.status = 'success';
                card.txHash = txHash;
                return { reply: 'Task scheduled successfully!', newState: EMPTY_STATE, action: card };
            } else {
                card.status = 'failed';
                return { reply: 'Transaction was rejected.', newState: EMPTY_STATE, action: card };
            }
        } catch {
            card.status = 'failed';
            return { reply: 'Something went wrong. Try again?', newState: EMPTY_STATE, action: card };
        }
    };

    // ── Send handler ──
    const handleSend = async () => {
        if (!input.trim() || isThinking) return;

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        const userText = input.trim();
        setInput('');
        setIsThinking(true);

        try {
            const { reply, newState, action } = await processMessage(userText, convo);
            setConvo(newState);

            const botMsg: ChatMessage = {
                id: `b-${Date.now()}`,
                role: 'bot',
                content: reply,
                timestamp: new Date(),
                action,
            };
            setMessages(prev => [...prev, botMsg]);
        } catch {
            setMessages(prev => [...prev, {
                id: `e-${Date.now()}`,
                role: 'bot',
                content: "Oops, something broke. Try again.",
                timestamp: new Date(),
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* ── Floating Cron Button ── */}
            <button
                className="cron-fab"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Chat with Cron the Bot"
            >
                {isOpen ? '✕' : '⏱️'}
            </button>

            {/* ── Chat Panel ── */}
            {isOpen && (
                <div className="cron-chat">
                    {/* Header */}
                    <div className="cron-header">
                        <div className="cron-header-info">
                            <span className="cron-header-icon">⏱️</span>
                            <div>
                                <div className="cron-header-name">Cron the Bot</div>
                                <div className="cron-header-sub">
                                    {wallet.connected
                                        ? <><span className="cron-online" />Connected</>
                                        : <span className="cron-connect-link" onClick={() => { setShowConnectModal(true); }}>Connect wallet →</span>
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
                                    {msg.content.split('\n').map((line, i) => (
                                        <span key={i}>
                                            {line.startsWith('•') ? (
                                                <span className="cron-bullet">{line}</span>
                                            ) : line}
                                            {i < msg.content.split('\n').length - 1 && <br />}
                                        </span>
                                    ))}
                                </div>
                                {/* Action Card */}
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
                                            {msg.action.status === 'success' ? '✓ Successfully processed' :
                                                msg.action.status === 'failed' ? '✗ Transaction failed' :
                                                    msg.action.status === 'signing' ? '⏳ Awaiting signature...' :
                                                        '⏳ Processing...'}
                                        </div>
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
