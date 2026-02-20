/**
 * Intermediate Representation (IR) Types for Code Generation
 *
 * The IR serves as a language-agnostic abstraction between the React Flow canvas state
 * and generated code. This separation ensures clean code generation and enables
 * adding new target languages without modifying canvas logic.
 */

/**
 * Agent IR - Configuration for the main Claude agent
 */
export interface AgentIR {
  name: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}

/**
 * MCP Server IR - Configuration for connected MCP servers
 */
export interface McpServerIR {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabledTools: string[];
}

/**
 * Knowledge Source IR - Configuration for knowledge base connections
 */
export interface KnowledgeSourceIR {
  name: string;
  type: 'document' | 'url' | 'database';
  sources: string[];
}

/**
 * Permission modes for generated agents
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * Workflow IR - Complete workflow representation for code generation
 *
 * This is the main type that captures all agent configuration from the canvas
 * in a language-agnostic format suitable for generating Python or TypeScript code.
 */
export interface WorkflowIR {
  /** Workflow name */
  name: string;

  /** Optional workflow description */
  description?: string;

  /** Agent configuration */
  agent: AgentIR;

  /** Connected MCP servers with their configurations */
  mcpServers: McpServerIR[];

  /** Built-in tools enabled from agent config */
  allowedTools: string[];

  /** Knowledge sources connected to the agent */
  knowledgeSources: KnowledgeSourceIR[];

  /** Permission mode for the generated agent */
  permissionMode: PermissionMode;
}
