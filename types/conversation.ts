export type MessageRole = 'user' | 'assistant' | 'system'
export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error'
export type ConversationStatus = 'active' | 'resolved' | 'escalated' | 'abandoned'

export interface Conversation {
  id: string
  agentId: string
  status: ConversationStatus
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  resolvedAt?: Date
  escalatedAt?: Date
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: Date
}

export interface ToolCall {
  id: string
  conversationId: string
  messageId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput?: Record<string, unknown>
  status: ToolCallStatus
  durationMs?: number
  createdAt: Date
}

// Streaming event types (from SDK)
export type StreamEventType =
  | 'message_start'
  | 'text_delta'
  | 'text_stop'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'message_end'
  | 'error'

export interface StreamEvent {
  type: StreamEventType
  data: TextDeltaEvent | ToolCallEvent | ThinkingEvent | MessageEndEvent | ErrorEvent
}

export interface TextDeltaEvent {
  text: string
}

export interface ToolCallEvent {
  toolName: string
  toolInput: Record<string, unknown>
  callId: string
}

export interface ToolResultEvent {
  callId: string
  result: Record<string, unknown>
  durationMs: number
}

export interface ThinkingEvent {
  text: string
}

export interface MessageEndEvent {
  messageId: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export interface ErrorEvent {
  code: string
  message: string
}

// Debug state for playground
export interface DebugState {
  intent?: string
  category?: string
  fields: Record<string, unknown>
  toolCalls: ToolCall[]
  tokens: { input: number; output: number }
  cost: number
  latencyMs: number
  turns: number
}
