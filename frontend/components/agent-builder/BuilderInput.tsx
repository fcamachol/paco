"use client";

import { useState, useRef, useEffect } from "react";

const SUGGESTION_PILLS = [
  "¿Qué requisitos necesita?",
  "Agrega herramientas de consulta",
  "Crea el system prompt",
  "Prueba con un mensaje",
  "Finaliza el agente",
];

interface BuilderInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function BuilderInput({ onSend, disabled }: BuilderInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [value]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="border-t border-gray-800 bg-[#0d0d14]">
      {/* Suggestion pills */}
      {!disabled && (
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-none">
          {SUGGESTION_PILLS.map((pill) => (
            <button
              key={pill}
              onClick={() => onSend(pill)}
              className="whitespace-nowrap text-xs px-3 py-1.5 bg-[#1a1a24] border border-gray-700/50 rounded-full text-gray-400 hover:text-white hover:border-gray-600 transition-colors flex-shrink-0"
            >
              {pill}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="p-4 flex gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled ? "Procesando..." : "Escribe un mensaje..."
          }
          disabled={disabled}
          rows={1}
          className="flex-1 bg-[#1a1a24] border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="self-end p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
