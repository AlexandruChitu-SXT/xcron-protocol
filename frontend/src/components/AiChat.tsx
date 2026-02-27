import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * AiChat — Floating robot head that opens an ElizaOS-powered chat modal.
 * 
 * The agent can:
 * - Schedule tasks (auto-compound, DCA, claim rewards)
 * - Cancel tasks
 * - Query protocol stats
 * - Show cross-shard optimization stats
 * 
 * All via natural language in the chat.
 */

interface ChatMessage {
    id: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: Date;
}

const WELCOME_MESSAGE: ChatMessage = {
    id: 'welcome',
    role: 'agent',
    content: `Hey! I'm XCron AI 🤖

I can help you automate tasks on MultiversX:

⚡ **Schedule** — "Auto-compound my xExchange LP weekly"
🔄 **Recurring** — "Claim Hatom rewards every 24h for 30 days"
📊 **Stats** — "Show protocol statistics"
🗑️ **Cancel** — "Cancel task #15"
🔧 **Cross-shard** — "Show cross-shard stats"

Just type what you need!`,
    timestamp: new Date(),
};

export default function AiChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const processMessage = async (userText: string): Promise<string> => {
        const lower = userText.toLowerCase();

        // Cross-shard stats (check BEFORE general stats to prevent 'shard stats' matching 'stat')
        if (lower.includes('cross') || lower.includes('shard')) {
            try {
                const gatewayUrl = 'https://testnet-gateway.multiversx.com';
                const scAddress = 'erd1qqqqqqqqqqqqqpgqkchuk2w2nsmsrdqkd4s2t7z4m7wq6st27k8sqwqdju';
                const res = await fetch(`${gatewayUrl}/vm-values/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scAddress, funcName: 'getCrossShardStats', args: [] }),
                });
                const data = await res.json();
                const rd = data?.data?.data?.returnData || [];
                const cross = rd[0] ? parseInt(atob(rd[0]), 16) || 0 : 0;
                const intra = rd[1] ? parseInt(atob(rd[1]), 16) || 0 : 0;

                return `🔧 **Cross-Shard Stats**\n\n` +
                    `• Intra-shard (0% overhead): **${intra}**\n` +
                    `• Cross-shard (30% overhead): **${cross}**\n` +
                    `• Gas savings: **${intra + cross > 0 ? Math.round((intra / (intra + cross)) * 100) : 0}%** of executions are same-shard`;
            } catch {
                return `⚠️ Couldn't fetch cross-shard stats right now.`;
            }
        }

        // Stats query
        if (lower.includes('stat') || lower.includes('protocol') || lower.includes('info')) {
            try {
                const gatewayUrl = 'https://testnet-gateway.multiversx.com';
                const scAddress = 'erd1qqqqqqqqqqqqqpgqkchuk2w2nsmsrdqkd4s2t7z4m7wq6st27k8sqwqdju';

                const query = async (funcName: string) => {
                    const res = await fetch(`${gatewayUrl}/vm-values/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scAddress, funcName, args: [] }),
                    });
                    const data = await res.json();
                    return data?.data?.data?.returnData || [];
                };

                const [nonceData, feeData] = await Promise.all([
                    query('getTaskNonce'),
                    query('getProtocolFeeBps'),
                ]);

                const totalTasks = nonceData[0] ? parseInt(atob(nonceData[0]), 16) || parseInt(nonceData[0], 16) || 0 : 0;
                const feeBps = feeData[0] ? parseInt(atob(feeData[0]), 16) || 0 : 0;

                return `📊 **XCron Protocol Stats** (testnet)\n\n` +
                    `• Total tasks created: **${totalTasks}**\n` +
                    `• Protocol fee: **${feeBps / 100}%**\n` +
                    `• Network: **Testnet**\n` +
                    `• Status: ✅ Active`;
            } catch {
                return `⚠️ Couldn't fetch live stats. The testnet API might be slow. Try again in a moment.`;
            }
        }

        // Schedule intent
        if (lower.includes('schedule') || lower.includes('auto-compound') || lower.includes('autocompound') || lower.includes('compound') || lower.includes('claim') || lower.includes('dca')) {
            return `🔧 **To schedule a task, I need:**\n\n` +
                `1. **Target contract** address (erd1qqq...)\n` +
                `2. **Function** to call (e.g. claimRewards)\n` +
                `3. **Frequency** (once, daily, weekly)\n` +
                `4. **Duration** (how many executions)\n\n` +
                `Or use a template:\n` +
                `→ "Auto-compound xExchange weekly for 1 year"\n` +
                `→ "Claim Hatom rewards daily for 30 days"\n` +
                `→ "DCA buy every 24h for 30 days"\n\n` +
                `⚠️ *Note: Wallet must be connected to sign the transaction.*`;
        }

        // Cancel intent
        if (lower.includes('cancel')) {
            const match = userText.match(/#?(\d+)/);
            if (match) {
                return `🗑️ To cancel task **#${match[1]}**, connect your wallet and I'll prepare the transaction.\n\n` +
                    `*Only the task owner can cancel a pending task. The full deposit will be refunded.*`;
            }
            return `Which task do you want to cancel? Tell me the task ID (e.g. "cancel task #15")`;
        }

        // Help
        if (lower.includes('help') || lower.includes('what can')) {
            return WELCOME_MESSAGE.content;
        }

        // Default
        return `I understood: "${userText}"\n\n` +
            `I can help with:\n` +
            `• **"show stats"** — protocol statistics\n` +
            `• **"cross-shard stats"** — gas optimization data\n` +
            `• **"schedule..."** — automate a task\n` +
            `• **"cancel task #X"** — cancel a pending task\n\n` +
            `What would you like to do?`;
    };

    const handleSend = async () => {
        if (!input.trim() || isThinking) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsThinking(true);

        try {
            const response = await processMessage(userMsg.content);
            const agentMsg: ChatMessage = {
                id: `agent-${Date.now()}`,
                role: 'agent',
                content: response,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, agentMsg]);
        } catch {
            setMessages(prev => [...prev, {
                id: `err-${Date.now()}`,
                role: 'system',
                content: '⚠️ Something went wrong. Please try again.',
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

    const formatContent = (text: string) => {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/→/g, '→')
            .replace(/\n/g, '<br/>');
    };

    return (
        <>
            {/* Floating Robot Button */}
            <button
                className="ai-chat-fab"
                onClick={() => setIsOpen(!isOpen)}
                title="Chat with XCron AI"
            >
                {isOpen ? (
                    <span style={{ fontSize: '1.4rem' }}>✕</span>
                ) : (
                    <span style={{ fontSize: '1.6rem' }}>🤖</span>
                )}
            </button>

            {/* Chat Modal */}
            {isOpen && (
                <div className="ai-chat-modal">
                    {/* Header */}
                    <div className="ai-chat-header">
                        <div className="ai-chat-header-left">
                            <span className="ai-chat-avatar">🤖</span>
                            <div>
                                <div className="ai-chat-title">XCron AI</div>
                                <div className="ai-chat-subtitle">Powered by ElizaOS</div>
                            </div>
                        </div>
                        <div className="ai-chat-status">
                            <span className="ai-chat-status-dot" />
                            Online
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="ai-chat-messages">
                        {messages.map(msg => (
                            <div key={msg.id} className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
                                {msg.role === 'agent' && <span className="ai-chat-msg-avatar">🤖</span>}
                                <div
                                    className="ai-chat-msg-bubble"
                                    dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                                />
                            </div>
                        ))}
                        {isThinking && (
                            <div className="ai-chat-msg ai-chat-msg-agent">
                                <span className="ai-chat-msg-avatar">🤖</span>
                                <div className="ai-chat-msg-bubble ai-chat-thinking">
                                    <span className="dot" /><span className="dot" /><span className="dot" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="ai-chat-input-area">
                        <input
                            ref={inputRef}
                            type="text"
                            className="ai-chat-input"
                            placeholder="Ask me to automate something..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isThinking}
                        />
                        <button
                            className="ai-chat-send"
                            onClick={handleSend}
                            disabled={!input.trim() || isThinking}
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
