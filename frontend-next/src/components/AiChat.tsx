import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { CONTRACTS, NETWORK, GAS_SCHEDULE_TASK, GAS_CANCEL_TASK, EXPLORER_TX } from '../config';
import { Address } from '@multiversx/sdk-core';
import { serializeQuantumTaskHex } from '../utils/quantumAbi';

// Importaciones del módulo modular /chat/
import { ChatMessage, ActionCard, QuickAction, ConversationState, CronMemory } from './chat/ChatTypes';
import { SECURITY, ChatRateLimiter, sanitizeInput, validateFunctionArgs, sanitizeExplorerHash, validateMemory } from './chat/ChatSecurity';
import { playSound } from './chat/ChatSound';
import { PROTOCOLS, WELCOME_QUICK_ACTIONS, PROTOCOL_QUICK_ACTIONS, INTERVAL_QUICK_ACTIONS, AMOUNT_QUICK_ACTIONS } from './chat/ChatProtocols';
import { callGroq, callGemini, DEFI_INTENTS } from './chat/ChatServices';
import { numToHex, detectProtocol, detectAction, detectInterval, detectAmount } from './chat/ChatUtils';
import { useVoiceRecorder } from './chat/useVoiceRecorder';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatInput } from './chat/ChatInput';

const rateLimiter = new ChatRateLimiter();

const MEMORY_KEY = 'xcron-ai-memory';

const loadMemory = (): CronMemory => {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Security: validate memory integrity
      if (!validateMemory(parsed)) {
        console.warn(' Corrupted memory detected, resetting');
        localStorage.removeItem(MEMORY_KEY);
        return { lastWallet: null, lastProtocol: null, lastAction: null, totalInteractions: 0, lastVisit: new Date().toISOString(), favoriteProtocol: null, txHistory: [] };
      }
      const mem = parsed as unknown as CronMemory;
      // Limit tx history size
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
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamedContent, setStreamedContent] = useState('');
  const [memory] = useState<CronMemory>(loadMemory);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const { isListening, isTranscribing, voiceSupported, handleVoiceToggle } = useVoiceRecorder({
    onTranscriptionStart: () => {
      setInput('Transcribiendo...');
    },
    onTranscriptionSuccess: (text) => {
      setInput('');
      handleSendDirect(text);
    },
    onTranscriptionError: (errorMsg) => {
      setInput('');
      setMessages(prev => [...prev, {
        id: `voice-${Date.now()}`, role: 'bot' as const,
        content: errorMsg,
        timestamp: new Date(),
      }]);
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Build personalized welcome ──
  const getWelcomeMessage = useCallback((): string => {
    const mem = memory;
    if (mem.totalInteractions > 0 && mem.lastProtocol) {
      const proto = PROTOCOLS[mem.lastProtocol];
      return `Welcome back! \n\nLast time you used ${proto?.name || mem.lastProtocol}. Want me to do something similar? Or try something new — just ask.`;
    }
    if (!wallet.connected) {
      return `Hey! I'm XCron AI \n\nConnect your wallet and I'll help you automate anything on MultiversX — no contract addresses needed.`;
    }
    return `Hey! I'm XCron AI \n\nI automate DeFi on MultiversX. Just tell me what you need naturally. I know Hatom, xExchange, and AshSwap.`;
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
          console.log(' Routing to Gemini (DeFi intent detected)');
          return await callGemini(text, history);
        } else {
          try {
            console.log(' Routing to Groq (fast conversational)');
            const reply = await callGroq(text, history);
            return { reply };
          } catch (groqErr) {
            console.warn(' Groq failed, falling back to Gemini:', groqErr);
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
    // Security: validate function call arguments before executing
    const validation = validateFunctionArgs(action.name, action.args);
    if (!validation.valid) {
      console.warn(' Invalid function call args:', validation.reason);
      return {
        reply: ` Security check: ${validation.reason}. Please try again with valid parameters.`,
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
          protocol: 'XCron', icon: '', color: '#c084fc',
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
            reply: (llmReply || "Here's how the protocol is doing:") + `\n\n• Total tasks: ${tasks}\n• Network: ${NETWORK.name}\n• Status: Active \n• Scheduler: ${CONTRACTS.scheduler.slice(0, 16)}...`,
            newState: EMPTY_STATE,
            quickActions: [
              { label: 'Schedule task', value: 'schedule a new task', icon: '' },
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
          protocol: 'XCron', icon: '', color: '#c084fc',
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
        return { reply: `• Total tasks: ${tasks}\n• Network: ${NETWORK.name}\n• Status: Active `, newState: EMPTY_STATE, quickActions: [{ label: t('Schedule task', 'Programar tarea'), value: 'schedule a new task', icon: '' }] };
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
              `️ ${amount} EGLD is very small — gas fees would eat most of the rewards. I'd recommend at least 0.1 EGLD for auto-compound to be worthwhile. Want to proceed anyway?`,
              `️ ${amount} EGLD es muy poco — las comisiones de gas consumirían la mayoría de las recompensas. Recomiendo al menos 0.1 EGLD para que el auto-compound sea rentable. ¿Quieres continuar de todos modos?`
            ), newState: s, quickActions: AMOUNT_QUICK_ACTIONS
          };
        }
        if (amountNum < 0.1) {
          s.amount = amount; s.awaitingField = null;
          return {
            ...executeSchedule(s), reply: t(
              ` Heads up: with ${amount} EGLD, auto-compound gains will be modest after gas. But let's set it up!`,
              ` Aviso: con ${amount} EGLD, las ganancias del auto-compound serán modestas después del gas. ¡Pero vamos a configurarlo!`
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
        1, // TimeRecurring
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
      // Security: sanitize explorer hash
      const hash = sanitizeExplorerHash(rawHash);
      if (!hash) {
        console.warn(' Invalid explorer hash blocked:', rawHash);
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


  // ── Text-to-Speech for bot replies ──
  const speakText = useCallback((text: string) => {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    // Clean text for speech (remove markdown and symbols)
    const clean = text
      .replace(/[*_~`#]/g, '')
      .replace(/[•→⇄️◈◎▤◇◆⬡⟐]/g, '')
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

    // Security: sanitize input
    const userText = sanitizeInput(input);
    if (!userText) return;

    // Security: rate limiting
    if (!rateLimiter.canSend()) {
      const remaining = rateLimiter.getMessagesRemaining();
      setMessages(prev => [...prev, {
        id: `sec-${Date.now()}`, role: 'bot' as const,
        content: ` Rate limit reached (${SECURITY.MAX_MESSAGES_PER_MINUTE} msgs/min). Wait a moment. ${remaining} messages remaining.`,
        timestamp: new Date(),
      }]);
      return;
    }

    // Server-Side Security: Prompt injection detection is now handled by the API route.

    // Record rate limit
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
        // Read reply aloud if TTS is enabled
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

  return (
    <div className="w-full flex flex-col bg-black/40 rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(34,211,238,0.15)] overflow-hidden backdrop-blur-xl">
      {/* ── Chat Messages (only visible if interacted) ── */}
      {messages.length > 0 && (
        <ChatMessageList
          messages={messages}
          streamingMsgId={streamingMsgId}
          streamedContent={streamedContent}
          isThinking={isThinking}
          onQuickActionClick={handleQuickAction}
          walletConnected={wallet.connected}
          setShowConnectModal={setShowConnectModal}
          ttsEnabled={ttsEnabled}
          setTtsEnabled={setTtsEnabled}
          messagesEndRef={messagesEndRef}
        />
      )}

      <ChatInput
        input={input}
        setInput={setInput}
        isThinking={isThinking}
        isListening={isListening}
        isTranscribing={isTranscribing}
        voiceSupported={voiceSupported}
        walletConnected={wallet.connected}
        handleVoiceToggle={handleVoiceToggle}
        handleSend={handleSend}
        handleKeyDown={handleKeyDown}
        inputRef={inputRef}
        hasMessages={messages.length > 0}
      />
    </div>
  );
}
