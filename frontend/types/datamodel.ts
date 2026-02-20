'use client';

// ============================================
// PACO Component System - Claude Agent SDK Aligned
// ============================================
// This file defines types aligned with Claude Agent SDK concepts while
// maintaining backward compatibility with the AutoGen Studio builder.
// Future cleanup will remove AutoGen-specific patterns.

// Component type discriminator
// PACO types: agent, mcp-server, tool, knowledge, logic, workflow
// Legacy types (kept for builder compatibility): team, model, termination, workbench
export type ComponentTypes =
  | 'agent'
  | 'mcp-server'
  | 'tool'
  | 'knowledge'
  | 'logic'
  | 'workflow'
  // Legacy AutoGen types (for builder compatibility)
  | 'team'
  | 'model'
  | 'termination'
  | 'workbench';

// Base component wrapper
// Uses component_type for backward compatibility with store.tsx
export interface Component<T extends ComponentConfig> {
  // Legacy fields (store.tsx compatibility)
  provider: string;
  component_type: ComponentTypes;
  version?: number;
  component_version?: number;
  label?: string;
  description?: string;
  config: T;
}

// ============================================
// Agent Configuration (Claude Agent SDK aligned)
// ============================================

export type ClaudeModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'claude-haiku-3-20240307';

export interface AgentConfig {
  name: string;
  description?: string;
  // PACO fields (Claude Agent SDK)
  systemPrompt?: string;
  model?: ClaudeModel | string; // Allow string for multi-provider model IDs
  temperature?: number;
  maxTokens?: number;
  // Advanced parameters (Phase 3)
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  tools?: string[];
  mcpServers?: string[];
  // Per-agent environment variables (API keys, secrets)
  envVars?: Record<string, string>;
  // Legacy AutoGen fields (for store.tsx compatibility)
  system_message?: string;
  model_client?: Component<ModelConfig>;
  workbench?: Component<WorkbenchConfig>[] | Component<WorkbenchConfig>;
}

// Legacy assistant/user proxy configs (aliases for compatibility)
export interface AssistantAgentConfig extends AgentConfig {
  system_message: string;
  model_client: Component<ModelConfig>;
  workbench?: Component<WorkbenchConfig>[] | Component<WorkbenchConfig>;
}

export interface UserProxyAgentConfig extends AgentConfig {}

export interface WebSurferAgentConfig extends AgentConfig {
  model_client: Component<ModelConfig>;
}

// ============================================
// MCP Server Configuration
// ============================================

export type McpServerType = 'stdio' | 'sse' | 'http';

export interface McpServerConfig {
  name?: string;
  serverType?: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabledTools?: string[];
  serverId?: string; // Link to PACO McpServer registry (for tool fetching)
  // Legacy fields for store.tsx compatibility
  server_params?: {
    type: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };
}

// ============================================
// Tool Configuration (Built-in Claude tools)
// ============================================

export type BuiltInToolName = 'computer' | 'bash' | 'file_editor' | 'web_search' | 'mcp';

export interface ToolConfig {
  name: string;
  description?: string;
  toolType?: BuiltInToolName;
  enabled?: boolean;
  settings?: Record<string, unknown>;
}

// ============================================
// Knowledge Base Configuration
// ============================================

export type KnowledgeSourceType = 'document' | 'url' | 'database';

export interface KnowledgeConfig {
  name: string;
  sourceType: KnowledgeSourceType;
  sources: string[];
  chunkSize?: number;
  overlapSize?: number;
}

// ============================================
// Logic Node Configuration
// ============================================

export type LogicType = 'condition' | 'loop' | 'parallel' | 'approval';

export interface LogicConfig {
  name: string;
  logicType: LogicType;
  condition?: string;
  maxIterations?: number;
}

// ============================================
// Workflow Configuration
// ============================================

export interface WorkflowConfig {
  name?: string;
  description?: string;
  version?: string;
  agents?: string[];
  entryPoint?: string;
}

// ============================================
// Legacy Types (AutoGen compatibility)
// ============================================

// Model configuration (AutoGen style - not used in PACO)
export interface ModelConfig {
  model: string;
  api_key?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
}

// Termination configuration (AutoGen style - not used in PACO)
export interface TerminationConfig {
  [key: string]: unknown;
}

// Legacy workbench config
export interface WorkbenchConfig {
  name?: string;
  serverType?: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabledTools?: string[];
  // For StaticWorkbench compatibility
  tools?: Component<ToolConfig>[];
  // For McpWorkbench compatibility
  server_params?: {
    type: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };
}

export interface StaticWorkbenchConfig extends WorkbenchConfig {
  tools: Component<ToolConfig>[];
}

export interface McpWorkbenchConfig extends WorkbenchConfig {
  server_params: {
    type: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };
}

// Team configurations from AutoGen Studio
export interface TeamConfig {
  participants?: Component<AgentConfig>[];
  model_client?: Component<ModelConfig>;
  termination_condition?: Component<TerminationConfig>;
  selector_prompt?: string;
  // PACO workflow fields
  name?: string;
  description?: string;
  version?: string;
  agents?: string[];
  entryPoint?: string;
}

export interface SelectorTeamConfig extends TeamConfig {
  selector_prompt: string;
  model_client?: Component<ModelConfig>;
}

export interface SwarmTeamConfig extends TeamConfig {}

// ============================================
// Team and Gallery types for builder
// ============================================

export interface Team {
  id?: number;
  name?: string;
  component: Component<TeamConfig>;
  created_at?: string;
  updated_at?: string;
}

export interface Gallery {
  id?: number;
  name?: string;
  config: {
    components: {
      agents: Component<AgentConfig>[];
      models: Component<ModelConfig>[];
      tools: Component<ToolConfig>[];
      terminations: Component<TerminationConfig>[];
      workbenches?: Component<WorkbenchConfig>[];
    };
  };
}

// Session type for test runner
export interface Session {
  id?: number;
  name?: string;
  team_id?: number;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// Union of all config types
// ============================================

export type ComponentConfig =
  | AgentConfig
  | AssistantAgentConfig
  | McpServerConfig
  | ToolConfig
  | KnowledgeConfig
  | LogicConfig
  | WorkflowConfig
  | ModelConfig
  | TerminationConfig
  | TeamConfig
  | WorkbenchConfig
  | StaticWorkbenchConfig
  | McpWorkbenchConfig;

// ============================================
// Canvas Node/Edge Types (PACO style)
// ============================================

export interface PacoNodeData {
  component: Component<ComponentConfig>;
  isUserPositioned?: boolean;
}

export interface PacoEdgeData {
  connectionType: 'tool' | 'mcp' | 'knowledge' | 'flow';
}
