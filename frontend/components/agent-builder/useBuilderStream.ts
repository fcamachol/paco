/**
 * Agent Builder SSE Streaming Hook
 *
 * Handles sending messages and parsing SSE events from the builder backend.
 */

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useBuilderStore } from "./store";

interface SSEEvent {
  type: string;
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, any>;
  tool_use_id?: string;
  result?: Record<string, any>;
  error?: string;
  input_tokens?: number;
  output_tokens?: number;
  [key: string]: any;
}

export function useBuilderStream() {
  const {
    sessionId,
    isStreaming,
    addUserMessage,
    startStreaming,
    appendStreamContent,
    addToolCall,
    updateToolCallResult,
    finishStreaming,
    setArtifacts,
    pulseTab,
  } = useBuilderStore();

  const sendMessage = useCallback(
    async (message: string) => {
      if (!sessionId || isStreaming) return;

      addUserMessage(message);
      startStreaming();

      try {
        const response = await api.sendBuilderMessage(sessionId, message);

        if (!response.ok) {
          const error = await response.text();
          appendStreamContent(`Error: ${error}`);
          finishStreaming();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          finishStreaming();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event: SSEEvent = JSON.parse(jsonStr);
              handleEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }

        // Process remaining buffer
        if (buffer.startsWith("data: ")) {
          try {
            const event: SSEEvent = JSON.parse(buffer.slice(6).trim());
            handleEvent(event);
          } catch {
            // Skip
          }
        }

        finishStreaming();

        // Refresh artifacts after streaming completes
        try {
          const artifacts = await api.getBuilderArtifacts(sessionId);
          setArtifacts(artifacts);
        } catch {
          // Non-critical
        }
      } catch (err: any) {
        appendStreamContent(`\n\nError: ${err.message || "Connection failed"}`);
        finishStreaming();
      }
    },
    [sessionId, isStreaming]
  );

  function handleEvent(event: SSEEvent) {
    switch (event.type) {
      case "message_delta":
        if (event.text) {
          appendStreamContent(event.text);
        }
        break;

      case "tool_call":
        addToolCall({
          tool_name: event.tool_name || "",
          tool_input: event.tool_input || {},
          tool_use_id: event.tool_use_id || "",
        });
        break;

      case "tool_result":
        updateToolCallResult(
          event.tool_use_id || "",
          event.result,
          event.error
        );

        // Pulse the appropriate artifact tab
        const toolName = event.tool_name || "";
        if (toolName.includes("agent")) pulseTab("agent");
        else if (toolName.includes("tool")) pulseTab("tools");
        else if (toolName.includes("skill")) pulseTab("skills");
        else if (toolName.includes("prompt") || toolName.includes("config"))
          pulseTab("prompt");
        else if (toolName.includes("flow") || toolName.includes("process"))
          pulseTab("flow");
        else if (toolName.includes("knowledge")) pulseTab("knowledge");
        else if (toolName.includes("test")) pulseTab("test");
        break;

      case "error":
        appendStreamContent(`\n\nError: ${event.error || "Unknown error"}`);
        break;

      case "done":
        // Token counts handled by session refresh
        break;
    }
  }

  return { sendMessage, isStreaming };
}
