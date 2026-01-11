export type AgentStatus = 'active' | 'inactive' | 'beta' | 'error'
export type ModelId = 'claude-sonnet-4-20250514' | 'claude-haiku-4-20250414' | 'claude-opus-4-20250514'

export interface Agent {
  id: string
  name: string
  description: string
  status: AgentStatus
  model: ModelId
  systemPrompt: string
  temperature: number
  maxTurns: number
  createdAt: Date
  updatedAt: Date
}

export interface AgentConfig {
  id: string
  agentId: string
  escalationRules: EscalationRule[]
  workflowId?: string
}

export interface Tool {
  id: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  connectorId: string
  enabled: boolean
}

export interface AgentTool {
  agentId: string
  toolId: string
  enabled: boolean
}

export interface EscalationRule {
  id: string
  type: 'sentiment' | 'keyword' | 'retry_limit' | 'user_request' | 'timeout'
  condition: string
  action: 'transfer_human' | 'transfer_agent' | 'notify' | 'log'
  destination?: string
  priority: number
}

export interface Connector {
  id: string
  name: string
  type: 'rest' | 'soap' | 'database' | 'webhook'
  status: 'connected' | 'disconnected' | 'pending' | 'error'
  endpoint: string
  config: Record<string, unknown>
  createdAt: Date
}

// API request/response types
export interface CreateAgentInput {
  name: string
  description: string
  model: ModelId
  systemPrompt?: string
  temperature?: number
  maxTurns?: number
}

export interface UpdateAgentInput {
  name?: string
  description?: string
  status?: AgentStatus
  model?: ModelId
  systemPrompt?: string
  temperature?: number
  maxTurns?: number
}
