"use client";

import { useEffect, useRef } from "react";
import { useBuilderStore, ChatMessage, ToolCallInfo } from "./store";

function ToolCallCard({ toolCall }: { toolCall: ToolCallInfo }) {
  const toolDisplayNames: Record<string, string> = {
    search_existing_skills: "Buscando skills",
    search_existing_tools: "Buscando herramientas",
    search_existing_agents: "Buscando agentes",
    create_agent_draft: "Creando agente",
    update_agent_config: "Actualizando configuración",
    create_skill: "Creando skill",
    attach_skill_to_agent: "Vinculando skill",
    create_tool_definition: "Registrando herramienta",
    create_mcp_server: "Registrando servidor MCP",
    assign_tool_to_agent: "Asignando herramienta",
    set_process_flow: "Definiendo flujo",
    set_knowledge_base: "Agregando conocimiento",
    test_agent_message: "Probando agente",
    finalize_agent: "Finalizando agente",
  };

  const displayName = toolDisplayNames[toolCall.tool_name] || toolCall.tool_name;
  const hasResult = toolCall.result !== undefined;
  const hasError = !!toolCall.error;
  const isSuccess = hasResult && !hasError && toolCall.result?.success;

  return (
    <div className="my-2 border border-gray-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#12121a]">
        <div
          className={`w-2 h-2 rounded-full ${
            hasError
              ? "bg-red-500"
              : isSuccess
              ? "bg-green-500"
              : hasResult
              ? "bg-yellow-500"
              : "bg-blue-500 animate-pulse"
          }`}
        />
        <span className="text-xs font-medium text-gray-300">{displayName}</span>
        {!hasResult && !hasError && (
          <div className="ml-auto">
            <div className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      {(hasResult || hasError) && (
        <details className="text-xs">
          <summary className="px-3 py-1.5 text-gray-500 cursor-pointer hover:text-gray-400">
            {hasError ? "Error" : "Resultado"}
          </summary>
          <pre className="px-3 py-2 text-gray-500 overflow-x-auto max-h-32 overflow-y-auto bg-[#0a0a0f]">
            {hasError
              ? toolCall.error
              : JSON.stringify(toolCall.result, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] ${
          isUser
            ? "bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-br-md"
            : "bg-transparent"
        } px-4 py-3`}
      >
        {/* Text content */}
        <div
          className={`text-sm leading-relaxed whitespace-pre-wrap ${
            isUser ? "text-blue-100" : "text-gray-200"
          }`}
        >
          {message.content}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2">
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={`${tc.tool_use_id}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex justify-start mb-4">
        <div className="px-4 py-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
            <div
              className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.15s" }}
            />
            <div
              className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.3s" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] px-4 py-3">
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-200">
          {content}
          <span className="inline-block w-0.5 h-4 bg-blue-400 animate-pulse ml-0.5" />
        </div>
      </div>
    </div>
  );
}

export function BuilderChat() {
  const { messages, isStreaming, streamingContent } = useBuilderStore();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      {messages.length === 0 && !isStreaming && (
        <div className="flex items-center justify-center h-full text-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-4">🏗️</div>
            <p className="text-sm">Iniciando sesión de construcción...</p>
          </div>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && <StreamingBubble content={streamingContent} />}

      <div ref={endRef} />
    </div>
  );
}
