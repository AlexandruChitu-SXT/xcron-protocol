import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { CONTRACTS, NETWORK, GAS_SCHEDULE_TASK, GAS_CANCEL_TASK, EXPLORER_TX } from '../config';
import { Address } from '@multiversx/sdk-core';
import { serializeQuantumTaskHex } from '../utils/quantumAbi';

/* ═══════════════════════════════════════════════════════════════
   XCron AI — Security Hardened Chat Interface
   
   Security features:
   1. Rate limiting (15 msgs/min per session)
   2. Input sanitization (XSS, HTML, script injection)
   3. Input length limits (500 chars max)
   4. Prompt injection detection & blocking
   5. Function call argument validation (whitelist)
   6. Explorer hash sanitization
   7. Memory integrity validation
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════
// 🔒 SECURITY MODULE — XCron AI Hardening
// ═══════════════════════════════════════════════════════════════

const SECURITY = {
    MAX_INPUT_LENGTH: 500,
    MAX_MESSAGES_PER_MINUTE: 15,
    RATE_LIMIT_WINDOW_MS: 60_000,
    COOLDOWN_MS: 2_000,
    MAX_HISTORY_ITEMS: 50,
    MAX_MEMORY_SIZE_BYTES: 50_000,
    VALID_PROTOCOLS: ['hatom', 'xexchange', 'ashswap'] as const,
    VALID_ACTIONS: ['auto-compound', 'claim-rewards', 'liquid-stake', 'swap'] as const,
    VALID_INTERVALS: ['daily', 'weekly', 'monthly'] as const,
    MAX_EGLD_AMOUNT: 1000,
    MIN_EGLD_AMOUNT: 0.001,
    // 🔒 Voice security
    MAX_VOICE_DURATION_MS: 15_000,
} as const;

// ── Rate Limiter ──
class ChatRateLimiter {
    private timestamps: number[] = [];

    canSend(): boolean {
        const now = Date.now();
        // Clean old entries outside the window
        this.timestamps = this.timestamps.filter(t => now - t < SECURITY.RATE_LIMIT_WINDOW_MS);
        return this.timestamps.length < SECURITY.MAX_MESSAGES_PER_MINUTE;
    }

    record(): void {
        this.timestamps.push(Date.now());
    }

    getRemainingCooldown(): number {
        if (this.timestamps.length === 0) return 0;
        const last = this.timestamps[this.timestamps.length - 1];
        const elapsed = Date.now() - last;
        return Math.max(0, SECURITY.COOLDOWN_MS - elapsed);
    }

    getMessagesRemaining(): number {
        const now = Date.now();
        const recent = this.timestamps.filter(t => now - t < SECURITY.RATE_LIMIT_WINDOW_MS);
        return Math.max(0, SECURITY.MAX_MESSAGES_PER_MINUTE - recent.length);
    }
}

const rateLimiter = new ChatRateLimiter();

// ── Input Sanitizer ──
const sanitizeInput = (input: string): string => {
    let clean = input;

    // 1. Strip HTML tags
    clean = clean.replace(/<[^>]*>/g, '');

    // 2. Remove script injection patterns
    clean = clean.replace(/javascript\s*:/gi, '');
    clean = clean.replace(/on\w+\s*=/gi, '');
    clean = clean.replace(/data\s*:\s*text\/html/gi, '');

    // 3. Remove null bytes and control characters (except newlines)
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 4. Normalize unicode to prevent homograph attacks
    clean = clean.normalize('NFC');

    // 5. Enforce max length
    clean = clean.slice(0, SECURITY.MAX_INPUT_LENGTH);

    // 6. Trim whitespace
    clean = clean.trim();

    return clean;
};

// Prompt injection detection has been moved securely to the server side

// ── Function Call Argument Validator ──
const validateFunctionArgs = (name: string, args: Record<string, string>): { valid: boolean; reason?: string } => {
    switch (name) {
        case 'schedule_task': {
            const { protocol, action, interval, amount } = args;

            // Validate protocol against whitelist
            if (protocol && !(SECURITY.VALID_PROTOCOLS as readonly string[]).includes(protocol.toLowerCase())) {
                return { valid: false, reason: `Unknown protocol: ${protocol}` };
            }

            // Validate action against whitelist
            if (action && !(SECURITY.VALID_ACTIONS as readonly string[]).includes(action.toLowerCase())) {
                return { valid: false, reason: `Unknown action: ${action}` };
            }

            // Validate interval against whitelist
            if (interval && !(SECURITY.VALID_INTERVALS as readonly string[]).includes(interval.toLowerCase())) {
                return { valid: false, reason: `Invalid interval: ${interval}` };
            }

            // Validate amount is a safe number
            if (amount) {
                const num = parseFloat(amount);
                if (isNaN(num) || num < SECURITY.MIN_EGLD_AMOUNT || num > SECURITY.MAX_EGLD_AMOUNT) {
                    return { valid: false, reason: `Amount must be between ${SECURITY.MIN_EGLD_AMOUNT} and ${SECURITY.MAX_EGLD_AMOUNT} EGLD` };
                }
                // Check for scientific notation abuse
                if (/[eE]/.test(amount) || amount.includes('Infinity') || amount.includes('NaN')) {
                    return { valid: false, reason: 'Invalid amount format' };
                }
            }
            return { valid: true };
        }

        case 'cancel_task': {
            const { taskId } = args;
            if (taskId) {
                const id = parseInt(taskId);
                if (isNaN(id) || id < 0 || id > 1_000_000 || String(id) !== taskId.trim()) {
                    return { valid: false, reason: 'Invalid task ID' };
                }
            }
            return { valid: true };
        }

        case 'show_stats':
        case 'show_tasks':
        case 'show_cross_shard':
            return { valid: true }; // No args to validate

        default:
            return { valid: false, reason: `Unknown function: ${name}` };
    }
};

// ── Explorer Hash Sanitizer ──
const sanitizeExplorerHash = (hash: string): string | null => {
    // MultiversX tx hashes are 64-char hex strings
    const cleaned = hash.replace(/[^a-fA-F0-9]/g, '');
    if (cleaned.length !== 64) return null;
    return cleaned;
};

// ── Memory Integrity Validator ──
const validateMemory = (data: unknown): data is Record<string, unknown> => {
    if (!data || typeof data !== 'object') return false;
    const str = JSON.stringify(data);
    // Reject oversized memory (prevents localStorage bombing)
    if (str.length > SECURITY.MAX_MEMORY_SIZE_BYTES) return false;
    // Reject if contains script or HTML
    if (/<script|javascript:|on\w+=/i.test(str)) return false;
    return true;
};

// ── Known Protocols on MultiversX ──
const PROTOCOLS: Record<string, {
    name: string;
    icon: string;
    color: string;
    contracts: Record<string, { address: string; endpoint: string; description: string }>;
}> = {
    hatom: {
        name: 'Hatom',
        icon: '⚛️',
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
        if (raw) {
            const parsed = JSON.parse(raw);
            // 🔒 Security: validate memory integrity
            if (!validateMemory(parsed)) {
                console.warn('🔒 Corrupted memory detected, resetting');
                localStorage.removeItem(MEMORY_KEY);
                return { lastWallet: null, lastProtocol: null, lastAction: null, totalInteractions: 0, lastVisit: new Date().toISOString(), favoriteProtocol: null, txHistory: [] };
            }
            const mem = parsed as unknown as CronMemory;
            // 🔒 Limit tx history size
            if (mem.txHistory && mem.txHistory.length > SECURITY.MAX_HISTORY_ITEMS) {
                mem.txHistory = mem.txHistory.slice(-SECURITY.MAX_HISTORY_ITEMS);
            }
            return mem;
        }
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
    { label: 'Auto-compound', value: 'auto-compound xExchange weekly', icon: '⇄' },
    { label: 'Claim rewards', value: 'claim Hatom rewards daily', icon: '⚛️' },
    { label: 'Show stats', value: 'show stats', icon: '◎' },
    { label: 'My tasks', value: 'show my tasks', icon: '▤' },
];

const PROTOCOL_QUICK_ACTIONS: QuickAction[] = [
    { label: 'Hatom', value: 'hatom', icon: '⚛️' },
    { label: 'xExchange', value: 'xexchange', icon: '⇄' },
    { label: 'AshSwap', value: 'ashswap', icon: '◈' },
];

const INTERVAL_QUICK_ACTIONS: QuickAction[] = [
    { label: 'Daily', value: 'daily', icon: '⏳' },
    { label: 'Weekly', value: 'weekly', icon: '⏳' },
    { label: 'Monthly', value: 'monthly', icon: '⏳' },
];

const AMOUNT_QUICK_ACTIONS: QuickAction[] = [
    { label: '0.01 EGLD', value: '0.01', icon: '◇' },
    { label: '0.05 EGLD', value: '0.05', icon: '◆' },
    { label: '0.1 EGLD', value: '0.1', icon: '⬡' },
];

// ── Voice support detection (MediaRecorder) ──
const getVoiceSupport = () => {
    return typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
};

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
    // 🎤 Voice state
    const [isListening, setIsListening] = useState(false);
    const [voiceSupported] = useState(getVoiceSupport);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
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

    // ── Streaming text engine (word-by-word for smooth flow) ──
    const streamText = useCallback((msgId: string, fullText: string, onComplete: () => void) => {
        setStreamingMsgId(msgId);
        setStreamedContent('');
        // Split into words, keeping spaces/newlines attached
        const words = fullText.match(/\S+\s*/g) || [fullText];
        let wordIndex = 0;
        // Speed: ~30-50ms per word = fast but readable typing effect
        const speed = Math.max(15, Math.min(40, 2000 / words.length));
        const timer = setInterval(() => {
            wordIndex++;
            if (wordIndex >= words.length) {
                clearInterval(timer);
                setStreamedContent(fullText);
                setStreamingMsgId(null);
                onComplete();
            } else {
                setStreamedContent(words.slice(0, wordIndex).join(''));
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

    // ── Helper functions ──
    const numToHex = (n: number): string => {
        const hex = n.toString(16);
        return hex.length % 2 === 0 ? hex : '0' + hex;
    };

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

    const detectAmount = (text: string): string | null => {
        const match = text.match(/([\d.]+)\s*(egld|xegld|e?gold)/i);
        if (match) return match[1];
        const justNumber = text.match(/^([\d.]+)$/);
        if (justNumber) return justNumber[1];
        return null;
    };

    // ── DeFi intent detection for LLM routing ──
    const DEFI_INTENTS = /\b(schedule|auto[- ]?compound|claim|stake|swap|cancel|hatom|xexchange|ashswap|stats|tasks|show|defi|egld|yield|farm|apy|compound|deposit|withdraw|borrow|lend|keeper|cron|shard|slashing)\b/i;

    // ── Call Groq (fast conversational LLM) via SECURE SERVER ──
    const callGroq = async (text: string, history: { role: string; content: string }[]): Promise<string> => {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine: 'groq', text, history }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Server error: ${res.status}`);
        }
        const data = await res.json();
        return data.reply || '';
    };

    // ── Call Gemini (deep thinking + function calling) via SECURE SERVER ──
    const callGemini = async (text: string, history: { role: string; content: string }[]): Promise<{
        reply: string; action?: { name: string; args: Record<string, string> };
    }> => {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine: 'gemini', text, history }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Server error: ${res.status}`);
        }
        const data = await res.json();
        return { reply: data.reply || '', action: data.action };
    };

    // ── Call LLM backend (multi-provider routing) ──
    const callLLM = async (text: string): Promise<{
        reply: string;
        newState: ConversationState;
        action?: ActionCard;
        quickActions?: QuickAction[];
    }> => {
        // Build conversation history for LLM context (last 20 messages)
        const history = messages.slice(-20).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            content: m.content,
        }));
        history.push({ role: 'user', content: text });

        try {
            let data: { reply: string; action?: { name: string; args: Record<string, string> }; quickActions?: QuickAction[] };

            const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const needsFunctionCalling = DEFI_INTENTS.test(text);
            const hasClientKey = !!process.env.NEXT_PUBLIC_GEMINI_API_KEY;

            // ── Try server first in production, then fall back to client-side LLMs ──
            const callClientSideLLM = async () => {
                if (needsFunctionCalling) {
                    console.log('🧠 Routing to Gemini (DeFi intent detected)');
                    return await callGemini(text, history);
                } else {
                    try {
                        console.log('⚡ Routing to Groq (fast conversational)');
                        const reply = await callGroq(text, history);
                        return { reply };
                    } catch (groqErr) {
                        console.warn('⚡ Groq failed, falling back to Gemini:', groqErr);
                        return await callGemini(text, history);
                    }
                }
            };

            if (isDev || hasClientKey) {
                // ── Dev or has client key: use client-side LLMs directly ──
                data = await callClientSideLLM();
            } else {
                // ── Production without client key: try server, then offline ──
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: history }),
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    if (errData.fallback) return processMessageLocal(text, convo);
                    throw new Error(errData.message || 'API error');
                }
                data = await res.json();
            }

            // Handle function calls from LLM
            if (data.action) {
                return await handleLLMAction(data.action, data.reply);
            }

            return {
                reply: data.reply || "I'm here — what would you like to automate?",
                newState: EMPTY_STATE,
                quickActions: data.quickActions || WELCOME_QUICK_ACTIONS,
            };
        } catch (err) {
            console.warn('LLM call failed, falling back to local:', err);
            return processMessageLocal(text, convo);
        }
    };

    // ── Handle LLM function call results ──
    const handleLLMAction = async (
        action: { name: string; args: Record<string, string> },
        llmReply: string
    ): Promise<{
        reply: string; newState: ConversationState; action?: ActionCard; quickActions?: QuickAction[];
    }> => {
        // 🔒 Security: validate function call arguments before executing
        const validation = validateFunctionArgs(action.name, action.args);
        if (!validation.valid) {
            console.warn('🔒 Invalid function call args:', validation.reason);
            return {
                reply: `🔒 Security check: ${validation.reason}. Please try again with valid parameters.`,
                newState: EMPTY_STATE,
                quickActions: WELCOME_QUICK_ACTIONS,
            };
        }

        switch (action.name) {
            case 'schedule_task': {
                const { protocol, action: act, interval, amount } = action.args;
                if (!protocol || !act || !interval || !amount) {
                    // LLM detected intent but not all params — ask for what's missing
                    return {
                        reply: llmReply || "Almost there! Tell me the missing details.",
                        newState: EMPTY_STATE,
                        quickActions: !protocol ? PROTOCOL_QUICK_ACTIONS
                            : !interval ? INTERVAL_QUICK_ACTIONS
                                : !amount ? AMOUNT_QUICK_ACTIONS
                                    : WELCOME_QUICK_ACTIONS,
                    };
                }
                // Map interval string to seconds
                const intervalMap: Record<string, { seconds: number; label: string }> = {
                    daily: { seconds: 86400, label: 'daily' },
                    weekly: { seconds: 604800, label: 'weekly' },
                    monthly: { seconds: 2592000, label: 'monthly' },
                };
                const s: ConversationState = {
                    intent: 'schedule',
                    protocol,
                    action: act,
                    interval: JSON.stringify(intervalMap[interval] || intervalMap.weekly),
                    amount,
                    executions: 52,
                    awaitingField: null,
                };
                return executeSchedule(s);
            }
            case 'cancel_task': {
                const taskId = action.args.taskId;
                if (!taskId) {
                    return { reply: llmReply || "Which task number should I cancel?", newState: EMPTY_STATE };
                }
                if (!wallet.connected) {
                    return { reply: "Connect your wallet first, then I'll cancel it.", newState: EMPTY_STATE };
                }
                const cancelCard: ActionCard = {
                    protocol: 'XCron', icon: '✦', color: '#c084fc',
                    description: `Cancel Task #${taskId}`,
                    details: [{ label: 'Task ID', value: `#${taskId}` }],
                    status: 'signing',
                };
                try {
                    const txHash = await signAndSendTransaction({
                        receiver: CONTRACTS.scheduler,
                        data: `cancelTask@${numToHex(parseInt(taskId))}`,
                        value: '0', gasLimit: GAS_CANCEL_TASK,
                    });
                    if (txHash) {
                        cancelCard.status = 'pending';
                        cancelCard.txHash = txHash;
                        return { reply: 'Cancellation submitted!', newState: EMPTY_STATE, action: cancelCard };
                    }
                    cancelCard.status = 'failed';
                    return { reply: 'Transaction was rejected.', newState: EMPTY_STATE, action: cancelCard };
                } catch {
                    cancelCard.status = 'failed';
                    return { reply: 'Cancellation failed. Try again?', newState: EMPTY_STATE, action: cancelCard };
                }
            }
            case 'show_stats': {
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
                        reply: (llmReply || "Here's how the protocol is doing:") + `\n\n• Total tasks: ${tasks}\n• Network: ${NETWORK.name}\n• Status: Active ✅\n• Scheduler: ${CONTRACTS.scheduler.slice(0, 16)}...`,
                        newState: EMPTY_STATE,
                        quickActions: [
                            { label: 'Schedule task', value: 'schedule a new task', icon: '⚡' },
                            { label: 'Cross-shard', value: 'cross-shard stats', icon: '⟐' },
                        ],
                    };
                } catch {
                    return { reply: "Can't reach the network right now.", newState: EMPTY_STATE };
                }
            }
            case 'show_tasks': {
                const mem = loadMemory();
                if (mem.txHistory.length === 0) {
                    return { reply: llmReply || "No transactions yet. Let's schedule your first automation!", newState: EMPTY_STATE, quickActions: WELCOME_QUICK_ACTIONS };
                }
                const list = mem.txHistory.slice(0, 5).map(tx => {
                    const date = new Date(tx.timestamp).toLocaleDateString();
                    return `• ${date} — ${tx.action} → ${tx.hash.slice(0, 12)}...`;
                }).join('\n');
                return { reply: (llmReply || "Your recent transactions:") + `\n\n${list}`, newState: EMPTY_STATE };
            }
            case 'show_cross_shard': {
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
                        reply: (llmReply || "Cross-shard optimization:") + `\n\n• Same-shard (0% overhead): ${intra}\n• Cross-shard (30% overhead): ${cross}\n• Savings rate: ${total > 0 ? Math.round((intra / total) * 100) : 0}%`,
                        newState: EMPTY_STATE,
                    };
                } catch {
                    return { reply: "Can't fetch cross-shard data right now.", newState: EMPTY_STATE };
                }
            }
            default:
                return { reply: llmReply || "I'm not sure how to do that yet.", newState: EMPTY_STATE, quickActions: WELCOME_QUICK_ACTIONS };
        }
    };

    // ── Local fallback parser (used when API is unavailable) ──
    const processMessageLocal = async (text: string, state: ConversationState): Promise<{
        reply: string; newState: ConversationState; action?: ActionCard; quickActions?: QuickAction[];
    }> => {
        const lower = text.toLowerCase();
        const s = { ...state };

        // ── Language detection (check full conversation context) ──
        const recentUserTexts = messages.filter(m => m.role === 'user').slice(-3).map(m => m.content).join(' ') + ' ' + text;
        const esWords = /\b(quiero|programar|cada|horas|días|semanal|mensual|cuánto|cuanto|cancelar|mostrar|tareas|hola|puedes|protocolo|reclamar)\b/i;
        const isES = esWords.test(recentUserTexts);

        // ── Bilingual response helper ──
        const t = (en: string, es: string) => isES ? es : en;

        // Cancel
        if (lower.includes('cancel') || lower.includes('cancelar')) {
            const match = text.match(/#?(\d+)/);
            if (match) {
                if (!wallet.connected) return { reply: t('Connect your wallet first.', 'Conecta tu wallet primero.'), newState: EMPTY_STATE };
                const cancelAction: ActionCard = {
                    protocol: 'XCron', icon: '✦', color: '#c084fc',
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
                    if (txHash) { cancelAction.status = 'pending'; cancelAction.txHash = txHash; return { reply: t('Cancellation submitted.', 'Cancelación enviada.'), newState: EMPTY_STATE, action: cancelAction }; }
                    cancelAction.status = 'failed'; return { reply: t('Transaction rejected.', 'Transacción rechazada.'), newState: EMPTY_STATE, action: cancelAction };
                } catch { cancelAction.status = 'failed'; return { reply: t('Cancellation failed.', 'Error al cancelar.'), newState: EMPTY_STATE, action: cancelAction }; }
            }
            return { reply: t('Which task? Use: cancel #ID', '¿Cuál tarea? Usa: cancelar #ID'), newState: EMPTY_STATE };
        }

        // Stats
        if (lower.includes('stat') || lower.includes('stats') || lower.includes('estadísticas') || lower.includes('status')) {
            try {
                // Assuming fetchProtocolStats is defined elsewhere or this is a placeholder for the original fetch logic
                // For now, re-using the original fetch logic
                const res = await fetch(`${NETWORK.gatewayUrl}/vm-values/query`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scAddress: CONTRACTS.scheduler, funcName: 'getTaskNonce', args: [] }),
                });
                const data = await res.json();
                const rd = data?.data?.data?.returnData || [];
                const tasks = rd[0] ? parseInt(atob(rd[0]), 16) || 0 : 0;
                // const { totalTasks, activeTasks, tasks } = await fetchProtocolStats(); // Original diff line
                // void totalTasks; void activeTasks; // Original diff line
                return { reply: `• Total tasks: ${tasks}\n• Network: ${NETWORK.name}\n• Status: Active ✅`, newState: EMPTY_STATE, quickActions: [{ label: t('Schedule task', 'Programar tarea'), value: 'schedule a new task', icon: '⚡' }] };
            } catch { return { reply: t("Can't reach network.", "No puedo conectar a la red."), newState: EMPTY_STATE }; }
        }

        // History
        if (lower.includes('history') || lower.includes('my task') || lower.includes('mis tarea') || lower.includes('historial')) {
            const mem = loadMemory();
            if (mem.txHistory.length === 0) return { reply: t("No transactions yet.", "Aún no hay transacciones."), newState: EMPTY_STATE, quickActions: WELCOME_QUICK_ACTIONS };
            const list = mem.txHistory.slice(0, 5).map(tx => `• ${new Date(tx.timestamp).toLocaleDateString()} — ${tx.action} → ${tx.hash.slice(0, 12)}...`).join('\n');
            return { reply: `${t('Recent:', 'Recientes:')}\n\n${list}`, newState: EMPTY_STATE };
        }

        // Schedule (multi-turn)
        if (s.awaitingField === 'amount') {
            const amount = detectAmount(text); if (amount) {
                const amountNum = parseFloat(amount);
                // Smart amount advice — warn if too small for gas costs
                if (amountNum < 0.05) {
                    return {
                        reply: t(
                            `⚠️ ${amount} EGLD is very small — gas fees would eat most of the rewards. I'd recommend at least 0.1 EGLD for auto-compound to be worthwhile. Want to proceed anyway?`,
                            `⚠️ ${amount} EGLD es muy poco — las comisiones de gas consumirían la mayoría de las recompensas. Recomiendo al menos 0.1 EGLD para que el auto-compound sea rentable. ¿Quieres continuar de todos modos?`
                        ), newState: s, quickActions: AMOUNT_QUICK_ACTIONS
                    };
                }
                if (amountNum < 0.1) {
                    s.amount = amount; s.awaitingField = null;
                    return {
                        ...executeSchedule(s), reply: t(
                            `⚡ Heads up: with ${amount} EGLD, auto-compound gains will be modest after gas. But let's set it up!`,
                            `⚡ Aviso: con ${amount} EGLD, las ganancias del auto-compound serán modestas después del gas. ¡Pero vamos a configurarlo!`
                        )
                    };
                }
                s.amount = amount; s.awaitingField = null; return executeSchedule(s);
            }
            return { reply: t("How much EGLD?", "¿Cuánto EGLD?"), newState: s, quickActions: AMOUNT_QUICK_ACTIONS };
        }
        if (s.awaitingField === 'interval') {
            const interval = detectInterval(text); if (interval) { s.interval = JSON.stringify(interval); s.awaitingField = 'amount'; return { reply: `${interval.label}. ${t('How much EGLD?', '¿Cuánto EGLD?')}`, newState: s, quickActions: AMOUNT_QUICK_ACTIONS }; }
            return { reply: t("How often?", "¿Cada cuánto?"), newState: s, quickActions: INTERVAL_QUICK_ACTIONS };
        }
        if (s.awaitingField === 'protocol') {
            const p = detectProtocol(text); if (p) { s.protocol = p; if (!s.action) s.action = 'claim-rewards'; s.awaitingField = 'interval'; return { reply: `${PROTOCOLS[p].name}. ${t('How often?', '¿Cada cuánto?')}`, newState: s, quickActions: INTERVAL_QUICK_ACTIONS }; }
            return { reply: t("Which protocol?", "¿Qué protocolo?"), newState: s, quickActions: PROTOCOL_QUICK_ACTIONS };
        }

        const protocol = detectProtocol(text); const action = detectAction(text); const interval = detectInterval(text); const amount = detectAmount(text);
        if (protocol || action || lower.includes('schedule') || lower.includes('automat') || lower.includes('programar')) {
            s.intent = 'schedule'; if (protocol) s.protocol = protocol; if (action) s.action = action; if (interval) s.interval = JSON.stringify(interval); if (amount) s.amount = amount;
            if (s.protocol && !s.action) s.action = lower.includes('compound') ? 'auto-compound' : 'claim-rewards';
            if (s.action === 'auto-compound' && !s.protocol) s.protocol = 'xexchange';
            if (!s.executions) s.executions = 52;
            if (!s.protocol) { s.awaitingField = 'protocol'; return { reply: t("Which protocol?", "¿Qué protocolo?"), newState: s, quickActions: PROTOCOL_QUICK_ACTIONS }; }
            if (!s.interval) { s.awaitingField = 'interval'; return { reply: t('How often?', '¿Cada cuánto?'), newState: s, quickActions: INTERVAL_QUICK_ACTIONS }; }
            if (!s.amount) { s.awaitingField = 'amount'; return { reply: t('How much EGLD?', '¿Cuánto EGLD?'), newState: s, quickActions: AMOUNT_QUICK_ACTIONS }; }
            return executeSchedule(s);
        }

        // Default — local mode, no LLM
        return {
            reply: t(
                `I'm in offline mode. I can still schedule tasks, show stats, or cancel tasks. Try one of these:`,
                `Estoy en modo offline. Puedo programar tareas, mostrar estadísticas o cancelar tareas. Prueba una de estas:`
            ), newState: EMPTY_STATE, quickActions: WELCOME_QUICK_ACTIONS
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
            const ownerHex = Address.newFromBech32(wallet.address).toHex();
            
            // Randomly generate a taskId for frontend submission (or use API nonce in production)
            const taskId = Math.floor(Math.random() * 100000000);
            
            // For recurring tasks, triggerType = 1 (TimeRecurring), triggerData = time (8 bytes) + interval (8 bytes)
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const triggerDataHex = currentTimestamp.toString(16).padStart(16, '0') + intervalData.seconds.toString(16).padStart(16, '0');

            const taskHex = serializeQuantumTaskHex(
                taskId,
                ownerHex,
                targetHex,
                endpointHex,
                [], // args
                1,  // TimeRecurring
                triggerDataHex,
                15000000 // maxGas
            );

            const txHash = await signAndSendTransaction({
                receiver: CONTRACTS.scheduler,
                data: `scheduleQuantumTask@${taskHex}`,
                value, gasLimit: GAS_SCHEDULE_TASK,
            });
            if (txHash) {
                card.status = 'pending';
                card.txHash = txHash;
                return {
                    reply: 'Transaction sent! Tracking confirmation...',
                    newState: EMPTY_STATE,
                    action: card,
                    quickActions: [{ label: 'View on Explorer', value: `explorer:${txHash}`, icon: '↗' }],
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
            const rawHash = qa.value.replace('explorer:', '');
            // 🔒 Security: sanitize explorer hash
            const hash = sanitizeExplorerHash(rawHash);
            if (!hash) {
                console.warn('🔒 Invalid explorer hash blocked:', rawHash);
                return;
            }
            window.open(EXPLORER_TX(hash), '_blank', 'noopener,noreferrer');
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
    // ── 🎤 Voice Input Handler (MediaRecorder + Gemini transcription) ──
    const handleVoiceToggle = useCallback(async () => {
        if (!voiceSupported) return;

        if (isListening) {
            // Stop recording
            mediaRecorderRef.current?.stop();
            setIsListening(false);
            if (voiceTimeoutRef.current) {
                clearTimeout(voiceTimeoutRef.current);
                voiceTimeoutRef.current = null;
            }
            return;
        }

        // Request microphone access
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            mediaStreamRef.current = stream;

            // Choose best supported format
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4';

            const recorder = new MediaRecorder(stream, { mimeType });
            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                // Stop all tracks
                stream.getTracks().forEach(t => t.stop());
                mediaStreamRef.current = null;

                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                audioChunksRef.current = [];

                if (audioBlob.size < 100) {
                    // Too short — no audio captured
                    return;
                }

                // Convert to base64 and send to Gemini for transcription
                setIsTranscribing(true);
                setInput('Transcribiendo...');
                try {
                    const reader = new FileReader();
                    const base64 = await new Promise<string>((resolve, reject) => {
                        reader.onload = () => {
                            const result = reader.result as string;
                            const base64Data = result.split(',')[1];
                            resolve(base64Data);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(audioBlob);
                    });

                    // Call Gemini directly from frontend (same pattern as chat fallback)
                    let transcribedText = '';
                    const clientKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

                    if (clientKey) {
                        // Direct client-side call to Gemini multimodal API
                        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clientKey}`;
                        const geminiRes = await fetch(geminiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [
                                        { inlineData: { mimeType, data: base64 } },
                                        { text: 'Transcribe this audio exactly as spoken. Return ONLY the transcribed text, nothing else. If silent, return empty string.' },
                                    ],
                                }],
                                generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
                            }),
                        });
                        if (geminiRes.ok) {
                            const data = await geminiRes.json();
                            transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                        } else {
                            throw new Error(`Gemini API: ${geminiRes.status}`);
                        }
                    } else {
                        // Fallback: try server endpoint
                        const response = await fetch('/api/transcribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ audio: base64, mimeType }),
                        });
                        if (!response.ok) throw new Error(`Server: ${response.status}`);
                        const { text } = await response.json();
                        transcribedText = text || '';
                    }

                    if (transcribedText && transcribedText.trim()) {
                        // Send directly — avoid setInput + click race condition
                        setInput('');
                        handleSendDirect(transcribedText.trim());
                    } else {
                        setInput('');
                        setMessages(prev => [...prev, {
                            id: `voice-${Date.now()}`, role: 'bot' as const,
                            content: '🎤 No speech detected. Click the mic and speak clearly.',
                            timestamp: new Date(),
                        }]);
                    }
                } catch (err) {
                    console.error('🎤 Transcription error:', err);
                    setInput('');
                    setMessages(prev => [...prev, {
                        id: `voice-${Date.now()}`, role: 'bot' as const,
                        content: '🎤 Could not transcribe audio. Please try again.',
                        timestamp: new Date(),
                    }]);
                } finally {
                    setIsTranscribing(false);
                }
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsListening(true);
            playSound('send');

            // 🔒 Security: max 30 seconds recording (anti-DoS)
            voiceTimeoutRef.current = setTimeout(() => {
                recorder.stop();
                setIsListening(false);
                voiceTimeoutRef.current = null;
            }, SECURITY.MAX_VOICE_DURATION_MS);

        } catch (err) {
            console.error('🎤 Microphone error:', err);
            setIsListening(false);
            const errMsg = (err as Error).message || '';
            setMessages(prev => [...prev, {
                id: `voice-${Date.now()}`, role: 'bot' as const,
                content: errMsg.includes('Permission')
                    ? '🎤 Microphone access denied. Please allow mic permissions in your browser settings.'
                    : '🎤 Could not access microphone. Please check your device.',
                timestamp: new Date(),
            }]);
        }
    }, [voiceSupported, isListening]);

    // ── 🔊 Text-to-Speech for bot replies ──
    const speakText = useCallback((text: string) => {
        if (!ttsEnabled || !('speechSynthesis' in window)) return;
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        // Clean text for speech (remove markdown and symbols)
        const clean = text
            .replace(/[*_~`#]/g, '')
            .replace(/[•→⚡⇄⚛️◈◎▤◇◆⬡✅❌🔒⏳✦⟐]/g, '')
            .replace(/\n+/g, '. ')
            .trim();
        if (!clean) return;
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        // Try to match language
        const isSpanish = /[áéíóúñ¿¡]/.test(clean) || /\b(que|de|en|el|la|los|las|es|por)\b/i.test(clean);
        utterance.lang = isSpanish ? 'es-ES' : 'en-US';
        window.speechSynthesis.speak(utterance);
    }, [ttsEnabled]);

    // ── Direct send (for voice input — avoids setInput race conditions) ──
    const handleSendDirect = async (text: string) => {
        if (!text.trim() || isThinking) return;
        const userText = sanitizeInput(text);
        if (!userText) return;
        if (!rateLimiter.canSend()) return;
        rateLimiter.record();
        const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: userText, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsThinking(true);
        playSound('send');
        try {
            const { reply, newState, action, quickActions } = await callLLM(userText);
            setConvo(newState);
            const botMsgId = `b-${Date.now()}`;
            const botMsg: ChatMessage = { id: botMsgId, role: 'bot', content: reply, timestamp: new Date(), action, quickActions, isStreaming: true };
            setMessages(prev => [...prev, botMsg]);
            setIsThinking(false);
            playSound('receive');
            streamText(botMsgId, reply, () => {
                setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false } : m));
                speakText(reply);
            });
            if (action?.txHash && action.status === 'pending') trackTxStatus(action.txHash, botMsgId);
        } catch {
            setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'bot', content: "Oops, something broke. Try again.", timestamp: new Date() }]);
            setIsThinking(false);
            playSound('error');
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isThinking) return;

        // 🔒 Security: sanitize input
        const userText = sanitizeInput(input);
        if (!userText) return;

        // 🔒 Security: rate limiting
        if (!rateLimiter.canSend()) {
            const remaining = rateLimiter.getMessagesRemaining();
            setMessages(prev => [...prev, {
                id: `sec-${Date.now()}`, role: 'bot' as const,
                content: `🔒 Rate limit reached (${SECURITY.MAX_MESSAGES_PER_MINUTE} msgs/min). Wait a moment. ${remaining} messages remaining.`,
                timestamp: new Date(),
            }]);
            return;
        }

        // 🔒 Server-Side Security: Prompt injection detection is now handled by the API route.

        // 🔒 Record rate limit
        rateLimiter.record();

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
            const { reply, newState, action, quickActions } = await callLLM(userText);
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
                // 🔊 Read reply aloud if TTS is enabled
                speakText(reply);
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
        <div className="w-full flex flex-col bg-black/40 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(34,211,238,0.15)] overflow-hidden backdrop-blur-xl">
            {/* ── Chat Messages (only visible if interacted) ── */}
            {messages.length > 0 && (
                <div className="max-h-[400px] overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar">
                    {/* Header inline */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-2">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🤖</span>
                            <div>
                                <div className="text-white font-bold tracking-wide">XCron AI Agent</div>
                                <div className="text-xs text-white/50 flex items-center gap-2">
                                    {wallet.connected 
                                        ? <><span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span> Connected</>
                                        : <button className="text-cyan-400 hover:text-cyan-300 transition-colors" onClick={() => setShowConnectModal(true)}>Connect wallet →</button>
                                    }
                                </div>
                            </div>
                        </div>
                        <button
                            className={`p-2 rounded-full transition-colors ${ttsEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                            onClick={() => setTtsEnabled(!ttsEnabled)}
                            title={ttsEnabled ? 'Disable voice replies' : 'Enable voice replies'}
                        >
                            {ttsEnabled ? '🔊' : '🔇'}
                        </button>
                    </div>

                    {messages.map(msg => (
                        <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                            <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                                msg.role === 'user' 
                                    ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-br-sm'
                                    : 'bg-white/5 border border-white/10 text-white/90 rounded-bl-sm'
                            }`}>
                                {getDisplayText(msg).split('\n').map((line, i, arr) => (
                                    <span key={i}>
                                        {line.startsWith('•') ? <span className="text-cyan-300 font-bold mr-1">{line}</span> : line}
                                        {i < arr.length - 1 && <br />}
                                    </span>
                                ))}
                                {msg.id === streamingMsgId && <span className="inline-block w-1 h-3 bg-cyan-400 ml-1 animate-pulse" />}
                            </div>

                            {/* Action Card with live status */}
                            {msg.action && (
                                <div className="mt-2 p-4 rounded-xl border bg-black/60 w-full" style={{ borderColor: msg.action.color + '44' }}>
                                    <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">I executed this Action:</div>
                                    <div className="flex items-start gap-3">
                                        <span className="text-2xl">{msg.action.icon}</span>
                                        <div>
                                            <div className="text-white font-bold">{msg.action.description}</div>
                                            {msg.action.details.map((d, i) => (
                                                <div key={i} className="text-xs text-white/60 mt-1">• {d.label}: <span className="text-white">{d.value}</span></div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className={`mt-3 pt-3 border-t border-white/10 text-xs font-mono font-bold flex items-center justify-between`}>
                                        <span className={
                                            msg.action.status === 'success' ? 'text-green-400' :
                                            msg.action.status === 'failed' ? 'text-red-400' :
                                            msg.action.status === 'pending' ? 'text-yellow-400 animate-pulse' :
                                            msg.action.status === 'confirmed' ? 'text-cyan-400' : 'text-purple-400'
                                        }>
                                            {msg.action.status === 'success' && '✓ Successfully processed'}
                                            {msg.action.status === 'confirmed' && '⟳ Confirmed — awaiting execution...'}
                                            {msg.action.status === 'pending' && '⏳ Pending on-chain...'}
                                            {msg.action.status === 'signing' && '🖊️ Awaiting signature...'}
                                            {msg.action.status === 'failed' && '✗ Transaction failed'}
                                        </span>
                                        {msg.action.txHash && (
                                            <a className="text-cyan-400 hover:text-cyan-300 underline" href={EXPLORER_TX(msg.action.txHash)} target="_blank" rel="noopener noreferrer">View Tx ↗</a>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Quick Action Chips */}
                            {msg.quickActions && !msg.isStreaming && msg.role === 'bot' && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {msg.quickActions.map((qa, i) => (
                                        <button
                                            key={i}
                                            className="px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5"
                                            onClick={() => handleQuickAction(qa)}
                                        >
                                            {qa.icon && <span>{qa.icon}</span>}
                                            {qa.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {isThinking && (
                        <div className="flex self-start p-4 rounded-2xl bg-white/5 border border-white/10 rounded-bl-sm">
                            <div className="flex gap-1.5 items-center">
                                <span className="w-2 h-2 rounded-full bg-cyan-400/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 rounded-full bg-cyan-400/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 rounded-full bg-cyan-400/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* ── Input Bar (The Pill) ── */}
            <div className={`flex items-center p-2 bg-black/60 ${messages.length > 0 ? 'border-t border-white/10' : ''}`}>
                {isListening && (
                    <div className="absolute -top-8 left-4 text-xs font-bold text-red-400 animate-pulse flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span> Listening...
                    </div>
                )}
                <div className="pl-4 pr-2 text-xl opacity-50">⚡</div>
                <input
                    ref={inputRef}
                    className="flex-1 bg-transparent border-none text-white focus:outline-none px-2 py-3 text-sm md:text-base placeholder:text-white/30"
                    type="text"
                    maxLength={SECURITY.MAX_INPUT_LENGTH}
                    placeholder={isTranscribing ? 'Transcribing...' : isListening ? '🔴 Recording... tap 🎤 to stop' : (wallet.connected ? 'Ask XCron AI to automate your on-chain actions...' : 'Connect wallet to start')}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isThinking || isListening || isTranscribing}
                />
                
                <div className="flex items-center gap-1 pr-1">
                    {voiceSupported && (
                        <button
                            className={`p-3 rounded-full transition-colors ${isListening ? 'bg-red-500/20 text-red-400' : 'bg-transparent text-white/40 hover:bg-white/10 hover:text-white'}`}
                            onClick={handleVoiceToggle}
                            disabled={isThinking || isTranscribing}
                            title={isListening ? 'Stop recording' : 'Voice input'}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                        </button>
                    )}
                    <button 
                        className="p-3 rounded-full bg-cyan-500 text-black hover:bg-cyan-400 transition-colors disabled:opacity-30 disabled:hover:bg-cyan-500"
                        onClick={handleSend} 
                        disabled={!input.trim() || isThinking}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
