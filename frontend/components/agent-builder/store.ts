/**
 * Agent Builder Zustand Store
 *
 * Manages chat messages, artifacts, session state, and UI state.
 */

import { create } from "zustand";
import { BuilderArtifacts, BuilderSession } from "@/lib/api";

export type MessageRole = "user" | "assistant";

export interface ToolCallInfo {
  tool_name: string;
  tool_input: Record<string, any>;
  tool_use_id: string;
  result?: Record<string, any>;
  error?: string;
  duration_ms?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: number;
}

export type ArtifactTab =
  | "agent"
  | "tools"
  | "skills"
  | "prompt"
  | "flow"
  | "knowledge"
  | "test";

export type BuilderPhase =
  | "understand"
  | "design"
  | "build"
  | "test"
  | "deploy";

interface BuilderState {
  // Session
  sessionId: string | null;
  session: BuilderSession | null;
  phase: BuilderPhase;

  // Messages
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;

  // Artifacts
  artifacts: BuilderArtifacts | null;
  activeTab: ArtifactTab;
  tabPulse: ArtifactTab | null;

  // UI
  showArtifactPanel: boolean;
  showSidebar: boolean;

  // Actions
  setSession: (session: BuilderSession) => void;
  setSessionId: (id: string | null) => void;
  setPhase: (phase: BuilderPhase) => void;
  addUserMessage: (content: string) => void;
  startStreaming: () => void;
  appendStreamContent: (text: string) => void;
  addToolCall: (toolCall: ToolCallInfo) => void;
  updateToolCallResult: (
    toolUseId: string,
    result?: Record<string, any>,
    error?: string
  ) => void;
  finishStreaming: () => void;
  setArtifacts: (artifacts: BuilderArtifacts) => void;
  setActiveTab: (tab: ArtifactTab) => void;
  pulseTab: (tab: ArtifactTab) => void;
  toggleArtifactPanel: () => void;
  toggleSidebar: () => void;
  reset: () => void;
}

let messageCounter = 0;
function nextId() {
  return `msg-${++messageCounter}-${Date.now()}`;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  // Initial state
  sessionId: null,
  session: null,
  phase: "understand",
  messages: [],
  isStreaming: false,
  streamingContent: "",
  artifacts: null,
  activeTab: "agent",
  tabPulse: null,
  showArtifactPanel: true,
  showSidebar: true,

  // Actions
  setSession: (session) => set({ session, phase: session.phase as BuilderPhase }),
  setSessionId: (id) => set({ sessionId: id }),
  setPhase: (phase) => set({ phase }),

  addUserMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: nextId(),
          role: "user" as const,
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  startStreaming: () =>
    set({
      isStreaming: true,
      streamingContent: "",
    }),

  appendStreamContent: (text) =>
    set((state) => ({
      streamingContent: state.streamingContent + text,
    })),

  addToolCall: (toolCall) => {
    const state = get();
    // Find last assistant message or create one
    const msgs = [...state.messages];
    const lastMsg = msgs[msgs.length - 1];

    if (lastMsg && lastMsg.role === "assistant") {
      lastMsg.toolCalls = [...(lastMsg.toolCalls || []), toolCall];
      set({ messages: [...msgs] });
    }
  },

  updateToolCallResult: (toolUseId, result, error) => {
    const state = get();
    const msgs = [...state.messages];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (msg.toolCalls) {
        const tc = msg.toolCalls.find((t) => t.tool_use_id === toolUseId);
        if (tc) {
          tc.result = result;
          tc.error = error;
          set({ messages: [...msgs] });
          return;
        }
      }
    }
  },

  finishStreaming: () => {
    const state = get();
    const content = state.streamingContent;
    if (content) {
      set((state) => ({
        isStreaming: false,
        streamingContent: "",
        messages: [
          ...state.messages,
          {
            id: nextId(),
            role: "assistant" as const,
            content,
            timestamp: Date.now(),
          },
        ],
      }));
    } else {
      set({ isStreaming: false, streamingContent: "" });
    }
  },

  setArtifacts: (artifacts) => set({ artifacts }),

  setActiveTab: (tab) => set({ activeTab: tab, tabPulse: null }),

  pulseTab: (tab) => {
    set({ tabPulse: tab });
    setTimeout(() => {
      const current = get().tabPulse;
      if (current === tab) {
        set({ tabPulse: null });
      }
    }, 2000);
  },

  toggleArtifactPanel: () =>
    set((state) => ({ showArtifactPanel: !state.showArtifactPanel })),

  toggleSidebar: () =>
    set((state) => ({ showSidebar: !state.showSidebar })),

  reset: () =>
    set({
      sessionId: null,
      session: null,
      phase: "understand",
      messages: [],
      isStreaming: false,
      streamingContent: "",
      artifacts: null,
      activeTab: "agent",
      tabPulse: null,
    }),
}));
