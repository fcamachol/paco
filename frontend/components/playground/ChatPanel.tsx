'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Square, Loader2, AlertCircle, Bot, User } from 'lucide-react';
import { ChatMessage } from './usePlayground';
import { StepTimeline } from './StepTimeline';

interface ChatPanelProps {
  messages: ChatMessage[];
  isRunning: boolean;
  onSend: (message: string) => void;
  onClear: () => void;
  onStop: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isRunning,
  onSend,
  onClear,
  onStop,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isRunning) {
      inputRef.current?.focus();
    }
  }, [isRunning]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-sm font-medium text-foreground">Chat</span>
        <button
          onClick={onClear}
          disabled={isRunning || messages.length === 0}
          className="p-1 text-foreground-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title="Clear conversation"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-foreground-muted mt-8">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Send a message to test the agent</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-coral-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-coral-500" />
              </div>
            )}
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-coral-500 text-white'
                    : msg.error
                    ? 'bg-error/10 text-error border border-error/30'
                    : 'bg-background-tertiary text-foreground'
                }`}
              >
                {msg.error ? (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
                    <span>{msg.error}</span>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>

              {/* Token/duration info for assistant messages */}
              {msg.role === 'assistant' && !msg.error && msg.tokens && (
                <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted">
                  <span>{msg.tokens.input + msg.tokens.output} tokens</span>
                  {msg.duration_ms && (
                    <span>{(msg.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>
              )}

              {/* Step timeline (collapsed by default) */}
              {msg.role === 'assistant' && msg.steps && msg.steps.length > 0 && (
                <StepTimeline steps={msg.steps} collapsed />
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-background-tertiary flex items-center justify-center">
                <User className="w-4 h-4 text-foreground-muted" />
              </div>
            )}
          </div>
        ))}

        {/* Thinking indicator */}
        {isRunning && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-coral-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-coral-500" />
            </div>
            <div className="bg-background-tertiary rounded-lg px-3 py-2 text-sm text-foreground-muted flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none rounded-lg border border-border bg-background-tertiary text-foreground placeholder:text-foreground-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coral-500 focus:border-transparent max-h-32"
            rows={1}
            disabled={isRunning}
          />
          {isRunning ? (
            <button
              onClick={onStop}
              className="p-2 rounded-lg bg-error text-white hover:bg-error/80 transition-colors"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
