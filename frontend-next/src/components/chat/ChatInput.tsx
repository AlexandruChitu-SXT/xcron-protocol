import React from 'react';
import { SECURITY } from './ChatSecurity';

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  isThinking: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  voiceSupported: boolean;
  walletConnected: boolean;
  handleVoiceToggle: () => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<any>;
  hasMessages: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  isThinking,
  isListening,
  isTranscribing,
  voiceSupported,
  walletConnected,
  handleVoiceToggle,
  handleSend,
  handleKeyDown,
  inputRef,
  hasMessages,
}) => {
  return (
    <div className={`flex items-center p-2 bg-black/60 relative ${hasMessages ? 'border-t border-white/10' : ''}`}>
      {isListening && (
        <div className="absolute -top-8 left-4 text-xs font-bold text-red-400 animate-pulse flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500"></span> Listening...
        </div>
      )}
      <div className="pl-4 pr-2 text-xl opacity-50"></div>
      <input
        ref={inputRef}
        className="flex-1 bg-transparent border-none text-white focus:outline-none px-2 py-3 text-sm md:text-base placeholder:text-white/30"
        type="text"
        maxLength={SECURITY.MAX_INPUT_LENGTH}
        placeholder={
          isTranscribing
            ? 'Transcribing...'
            : isListening
            ? ' Recording... tap to stop'
            : walletConnected
            ? 'Ask XCron AI to automate your on-chain actions...'
            : 'Connect wallet to start'
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isThinking || isListening || isTranscribing}
      />

      <div className="flex items-center gap-1 pr-1">
        {voiceSupported && (
          <button
            className={`p-3 rounded-full transition-colors ${
              isListening
                ? 'bg-red-500/20 text-red-400'
                : 'bg-transparent text-white/40 hover:bg-white/10 hover:text-white'
            }`}
            onClick={handleVoiceToggle}
            disabled={isThinking || isTranscribing}
            title={isListening ? 'Stop recording' : 'Voice input'}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
