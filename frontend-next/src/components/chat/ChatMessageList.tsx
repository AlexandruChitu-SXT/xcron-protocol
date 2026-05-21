import React from 'react';
import { ChatMessage, QuickAction } from './ChatTypes';
import { EXPLORER_TX } from '../../config';

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingMsgId: string | null;
  streamedContent: string;
  isThinking: boolean;
  onQuickActionClick: (qa: QuickAction) => void;
  walletConnected: boolean;
  setShowConnectModal: (show: boolean) => void;
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
  messagesEndRef: React.RefObject<any>;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  streamingMsgId,
  streamedContent,
  isThinking,
  onQuickActionClick,
  walletConnected,
  setShowConnectModal,
  ttsEnabled,
  setTtsEnabled,
  messagesEndRef,
}) => {
  const getDisplayText = (msg: ChatMessage): string => {
    if (msg.id === streamingMsgId) return streamedContent;
    return msg.content;
  };

  return (
    <div className="max-h-[400px] overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar">
      {/* Header inline */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl"></span>
          <div>
            <div className="text-white font-bold tracking-wide">XCron AI Agent</div>
            <div className="text-xs text-white/50 flex items-center gap-2">
              {walletConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>{' '}
                  Connected
                </>
              ) : (
                <button
                  className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  onClick={() => setShowConnectModal(true)}
                >
                  Connect wallet →
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          className={`p-2 rounded-full transition-colors ${
            ttsEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-white/40 hover:bg-white/10'
          }`}
          onClick={() => setTtsEnabled(!ttsEnabled)}
          title={ttsEnabled ? 'Disable voice replies' : 'Enable voice replies'}
        >
          {ttsEnabled ? '🔊' : '🔇'}
        </button>
      </div>

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col max-w-[85%] ${
            msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
          }`}
        >
          <div
            className={`p-4 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-br-sm'
                : 'bg-white/5 border border-white/10 text-white/90 rounded-bl-sm'
            }`}
          >
            {getDisplayText(msg)
              .split('\n')
              .map((line, i, arr) => (
                <span key={i}>
                  {line.startsWith('•') ? (
                    <span className="text-cyan-300 font-bold mr-1">{line}</span>
                  ) : (
                    line
                  )}
                  {i < arr.length - 1 && <br />}
                </span>
              ))}
            {msg.id === streamingMsgId && (
              <span className="inline-block w-1 h-3 bg-cyan-400 ml-1 animate-pulse" />
            )}
          </div>

          {/* Action Card with live status */}
          {msg.action && (
            <div
              className="mt-2 p-4 rounded-xl border bg-black/60 w-full"
              style={{ borderColor: msg.action.color + '44' }}
            >
              <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">
                I executed this Action:
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{msg.action.icon}</span>
                <div>
                  <div className="text-white font-bold">{msg.action.description}</div>
                  {msg.action.details.map((d, i) => (
                    <div key={i} className="text-xs text-white/60 mt-1">
                      • {d.label}: <span className="text-white">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 text-xs font-mono font-bold flex items-center justify-between">
                <span
                  className={
                    msg.action.status === 'success'
                      ? 'text-green-400'
                      : msg.action.status === 'failed'
                      ? 'text-red-400'
                      : msg.action.status === 'pending'
                      ? 'text-yellow-400 animate-pulse'
                      : msg.action.status === 'confirmed'
                      ? 'text-cyan-400'
                      : 'text-purple-400'
                  }
                >
                  {msg.action.status === 'success' && ' Successfully processed'}
                  {msg.action.status === 'confirmed' && '⟳ Confirmed — awaiting execution...'}
                  {msg.action.status === 'pending' && ' Pending on-chain...'}
                  {msg.action.status === 'signing' && '️ Awaiting signature...'}
                  {msg.action.status === 'failed' && ' Transaction failed'}
                </span>
                {msg.action.txHash && (
                  <a
                    className="text-cyan-400 hover:text-cyan-300 underline"
                    href={EXPLORER_TX(msg.action.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Tx ↗
                  </a>
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
                  onClick={() => onQuickActionClick(qa)}
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
            <span
              className="w-2 h-2 rounded-full bg-cyan-400/50 animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-2 h-2 rounded-full bg-cyan-400/50 animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-2 h-2 rounded-full bg-cyan-400/50 animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
