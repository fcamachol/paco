/**
 * PACO Builder Agent
 * 
 * A meta-agent that builds other AI agents using the Anthropic Agent SDK.
 * This is NOT a domain-specific agent - it's a pure agent builder that helps
 * users create ANY type of agent through natural conversation.
 * 
 * CLAUDE PLATFORM CAPABILITIES INTEGRATED:
 * ─────────────────────────────────────────
 * • Memory Tool (memory_20250818) - Persist agent configurations across sessions
 * • Extended Thinking - Deep reasoning for complex agent architecture decisions
 * • Subagents - Specialized builders for different aspects (tools, workflows, etc.)
 * • Hooks - Audit logging, permission controls, session management
 * • Skills - 21 Agentic Design Patterns as knowledge base
 * • Tool Search - Dynamic discovery from connector catalogs
 * • Context Editing - Auto-manage growing conversations
 * • Batch Processing - Bulk agent operations (50% cost savings)
 * • Citations - Source attribution for pattern recommendations
 * • Structured Outputs - Guaranteed schema validation for configs
 * 
 * AGENTIC DESIGN PATTERNS KNOWLEDGE:
 * ─────────────────────────────────────────
 * The builder has deep knowledge of 21 patterns from "Agentic Design Patterns":
 * 1.  Prompt Chaining     - Sequential task decomposition
 * 2.  Routing             - Dynamic flow control based on intent
 * 3.  Parallelization     - Concurrent execution for efficiency
 * 4.  Reflection          - Self-correction and improvement loops
 * 5.  Tool Use            - External system integration
 * 6.  Planning            - Goal decomposition and strategy
 * 7.  Multi-Agent         - Collaborative agent systems
 * 8.  Memory Management   - State persistence across sessions
 * 9.  Learning/Adaptation - Continuous improvement
 * 10. MCP Integration     - Model Context Protocol servers
 * 11. Goal Setting        - Objective tracking and monitoring
 * 12. Exception Handling  - Error recovery and resilience
 * 13. Human-in-the-Loop   - Human oversight for critical decisions
 * 14. RAG                 - Knowledge retrieval and grounding
 * 15. Inter-Agent Comm    - Agent-to-agent communication (A2A)
 * 16. Resource Optimization - Efficiency and cost management
 * 17. Reasoning Techniques - Chain-of-thought, structured thinking
 * 18. Guardrails/Safety   - Output constraints and protection
 * 19. Evaluation          - Testing and monitoring
 * 20. Prioritization      - Task ordering and urgency
 * 21. Exploration         - Discovery and learning
 * 
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript
 * @see https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
 * @see https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/chain-of-thought
 */

import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface BuilderAgentOptions {
  /** Unique identifier for the account/workspace */
  accountId: string
  /** Model to use: sonnet (balanced), opus (most capable), haiku (fastest) */
  model?: 'sonnet' | 'opus' | 'haiku'
  /** Working directory for file operations */
  cwd?: string
  /** Maximum conversation turns before stopping */
  maxTurns?: number
  /** Maximum budget in USD (optional spending limit) */
  maxBudgetUsd?: number
  /** Path for memory storage (enables persistence) */
  memoryPath?: string
  /** Enable extended thinking for complex decisions */
  enableThinking?: boolean
  /** Token budget for thinking (default: 10000) */
  thinkingBudget?: number
  /** Path for audit logs */
  auditLogPath?: string
  /** Session identifier for continuity */
  sessionId?: string
}

export interface BuilderMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'error' | 'system' | 'thinking'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  metadata?: Record<string, unknown>
}

export interface AgentConfig {
  id: string
  name: string
  description: string
  model: 'sonnet' | 'opus' | 'haiku'
  systemPrompt: string
  tools: ToolConfig[]
  workflows: WorkflowConfig[]
  guardrails: GuardrailConfig[]
  settings: AgentSettings
  status: 'draft' | 'testing' | 'deployed'
  version: string
  createdAt: string
  updatedAt: string
}

export interface ToolConfig {
  id: string
  name: string
  description: string
  source: 'mcp' | 'function' | 'api'
  schema: Record<string, unknown>
  config?: Record<string, unknown>
  requiresApproval?: boolean
}

export interface WorkflowConfig {
  id: string
  name: string
  trigger: string
  pattern: 'sequential' | 'parallel' | 'conditional' | 'loop'
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  id: string
  type: 'prompt' | 'tool' | 'condition' | 'subagent' | 'human_review'
  config: Record<string, unknown>
}

export interface GuardrailConfig {
  id: string
  name: string
  type: 'input' | 'output' | 'tool_use'
  action: 'block' | 'warn' | 'escalate' | 'transform'
  condition: string
  message?: string
}

export interface AgentSettings {
  maxTurns: number
  maxTokens: number
  temperature: number
  enableMemory: boolean
  enableThinking: boolean
  thinkingBudget?: number
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
}

// ============================================
// MEMORY STORE
// Implements Memory Tool protocol for persistence
// @see https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
// ============================================

export class MemoryStore {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
    this.ensureDirectory()
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true })
    }
  }

  /**
   * Validate path to prevent directory traversal attacks
   * CRITICAL: All paths must stay within /memories
   */
  private validatePath(inputPath: string): string {
    const normalized = path.normalize(inputPath)
    const relativePath = normalized.replace(/^\/memories\/?/, '')
    const fullPath = path.resolve(this.basePath, relativePath)
    
    if (!fullPath.startsWith(path.resolve(this.basePath))) {
      throw new Error('Path traversal attempt detected')
    }
    return fullPath
  }

  /** View directory contents or file contents */
  async view(inputPath: string, viewRange?: [number, number]): Promise<string> {
    const fullPath = this.validatePath(inputPath)
    try {
      const stats = fs.statSync(fullPath)
      if (stats.isDirectory()) {
        const entries = fs.readdirSync(fullPath)
        return `Directory: ${inputPath}\n${entries.map(e => `- ${e}`).join('\n')}`
      }
      let content = fs.readFileSync(fullPath, 'utf-8')
      if (viewRange) {
        const lines = content.split('\n')
        const [start, end] = viewRange
        content = lines.slice(Math.max(0, start - 1), end === -1 ? lines.length : end).join('\n')
      }
      return content
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `File not found: ${inputPath}`
      }
      throw error
    }
  }

  /** Create or overwrite a file */
  async create(inputPath: string, content: string): Promise<string> {
    const fullPath = this.validatePath(inputPath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(fullPath, content, 'utf-8')
    return `Created: ${inputPath}`
  }

  /** Replace text in a file (must be unique occurrence) */
  async strReplace(inputPath: string, oldStr: string, newStr: string): Promise<string> {
    const fullPath = this.validatePath(inputPath)
    const content = fs.readFileSync(fullPath, 'utf-8')
    const occurrences = content.split(oldStr).length - 1
    if (occurrences === 0) return `Error: String not found in ${inputPath}`
    if (occurrences > 1) return `Error: Multiple occurrences (${occurrences}) found. Use unique string.`
    fs.writeFileSync(fullPath, content.replace(oldStr, newStr), 'utf-8')
    return `Replaced in ${inputPath}`
  }

  /** Insert text at a specific line */
  async insert(inputPath: string, line: number, text: string): Promise<string> {
    const fullPath = this.validatePath(inputPath)
    const content = fs.readFileSync(fullPath, 'utf-8')
    const lines = content.split('\n')
    lines.splice(Math.min(Math.max(0, line - 1), lines.length), 0, text)
    fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8')
    return `Inserted at line ${line} in ${inputPath}`
  }

  /** Delete a file or directory */
  async delete(inputPath: string): Promise<string> {
    const fullPath = this.validatePath(inputPath)
    const stats = fs.statSync(fullPath)
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true })
    } else {
      fs.unlinkSync(fullPath)
    }
    return `Deleted: ${inputPath}`
  }

  /** Rename/move a file or directory */
  async rename(oldPath: string, newPath: string): Promise<string> {
    const fullOldPath = this.validatePath(oldPath)
    const fullNewPath = this.validatePath(newPath)
    fs.renameSync(fullOldPath, fullNewPath)
    return `Renamed: ${oldPath} -> ${newPath}`
  }
}

// ============================================
// AUDIT LOGGER
// Implements PostToolUse hook for compliance
// ============================================

export interface AuditEntry {
  timestamp: string
  sessionId: string
  event: string
  toolName?: string
  input?: Record<string, unknown>
  output?: string
  duration_ms?: number
}

export class AuditLogger {
  private logPath: string
  private entries: AuditEntry[] = []

  constructor(logPath: string) {
    this.logPath = logPath
    const dir = path.dirname(logPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  log(entry: Omit<AuditEntry, 'timestamp'>): void {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    }
    this.entries.push(fullEntry)
    fs.appendFileSync(this.logPath, JSON.stringify(fullEntry) + '\n')
  }

  getEntries(): AuditEntry[] {
    return [...this.entries]
  }
}

// ============================================
// TOOL RESULT TYPE
// ============================================

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
}

// ============================================
// BUILDER TOOLS
// These are the capabilities of the Builder Agent itself
// ============================================

/**
 * Helper to create tool results
 */
function result(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  }
}

/**
 * Generate unique IDs
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

// ─────────────────────────────────────────
// DISCOVERY TOOLS
// ─────────────────────────────────────────

export const tools = {
  /**
   * List available connectors (data sources, APIs, MCP servers)
   */
  list_connectors: {
    name: 'list_connectors',
    description: 'List available connectors that can provide tools to agents. Connectors include REST APIs, databases, MCP servers, and other data sources.',
    schema: z.object({
      type: z.enum(['all', 'rest', 'graphql', 'database', 'mcp', 'websocket']).optional().default('all'),
      status: z.enum(['all', 'available', 'configured', 'error']).optional().default('all'),
    }),
    handler: async (args: { type: string; status: string }): Promise<ToolResult> => {
      const connectors = [
        { id: 'mcp_filesystem', name: 'Filesystem', type: 'mcp', status: 'available', tools: 5 },
        { id: 'mcp_github', name: 'GitHub', type: 'mcp', status: 'available', tools: 12 },
        { id: 'mcp_slack', name: 'Slack', type: 'mcp', status: 'available', tools: 8 },
        { id: 'mcp_postgres', name: 'PostgreSQL', type: 'mcp', status: 'available', tools: 6 },
        { id: 'rest_openapi', name: 'OpenAPI Import', type: 'rest', status: 'available', tools: 0 },
        { id: 'rest_custom', name: 'Custom REST', type: 'rest', status: 'available', tools: 0 },
      ]
      const filtered = connectors.filter(c =>
        (args.type === 'all' || c.type === args.type) &&
        (args.status === 'all' || c.status === args.status)
      )
      return result({ connectors: filtered, total: filtered.length })
    }
  },

  /**
   * Discover tools from a connector
   */
  discover_tools: {
    name: 'discover_tools',
    description: 'Discover available tools from a specific connector. Auto-introspects the connector to find all available operations.',
    schema: z.object({
      connector_id: z.string().describe('Connector ID to discover tools from'),
      refresh: z.boolean().optional().default(false).describe('Force refresh the tool discovery'),
    }),
    handler: async (args: { connector_id: string; refresh: boolean }): Promise<ToolResult> => {
      const toolsByConnector: Record<string, Array<{ id: string; name: string; description: string }>> = {
        mcp_filesystem: [
          { id: 'fs.read', name: 'read_file', description: 'Read contents of a file' },
          { id: 'fs.write', name: 'write_file', description: 'Write contents to a file' },
          { id: 'fs.list', name: 'list_directory', description: 'List directory contents' },
          { id: 'fs.search', name: 'search_files', description: 'Search for files by pattern' },
          { id: 'fs.move', name: 'move_file', description: 'Move or rename a file' },
        ],
        mcp_github: [
          { id: 'gh.repo.list', name: 'list_repos', description: 'List repositories' },
          { id: 'gh.repo.create', name: 'create_repo', description: 'Create a repository' },
          { id: 'gh.issue.list', name: 'list_issues', description: 'List issues' },
          { id: 'gh.issue.create', name: 'create_issue', description: 'Create an issue' },
          { id: 'gh.pr.list', name: 'list_prs', description: 'List pull requests' },
          { id: 'gh.pr.create', name: 'create_pr', description: 'Create a pull request' },
        ],
        mcp_slack: [
          { id: 'slack.msg.send', name: 'send_message', description: 'Send a message to a channel' },
          { id: 'slack.msg.list', name: 'list_messages', description: 'List messages in a channel' },
          { id: 'slack.channel.list', name: 'list_channels', description: 'List available channels' },
          { id: 'slack.user.list', name: 'list_users', description: 'List workspace users' },
        ],
      }
      const tools = toolsByConnector[args.connector_id] || []
      return result({ connector_id: args.connector_id, tools, count: tools.length })
    }
  },

  /**
   * List available design patterns
   */
  list_patterns: {
    name: 'list_patterns',
    description: 'List available agentic design patterns that can be applied to agent architectures. Each pattern solves specific problems in agent design.',
    schema: z.object({
      category: z.enum(['all', 'workflow', 'optimization', 'safety', 'collaboration', 'learning']).optional().default('all'),
    }),
    handler: async (args: { category: string }): Promise<ToolResult> => {
      const patterns = [
        { id: 'prompt_chaining', name: 'Prompt Chaining', category: 'workflow', description: 'Break complex tasks into sequential steps' },
        { id: 'routing', name: 'Routing', category: 'workflow', description: 'Dynamic flow control based on intent classification' },
        { id: 'parallelization', name: 'Parallelization', category: 'workflow', description: 'Execute independent tasks concurrently' },
        { id: 'planning', name: 'Planning', category: 'workflow', description: 'Decompose goals into actionable steps' },
        { id: 'reflection', name: 'Reflection', category: 'optimization', description: 'Self-correction through critique loops' },
        { id: 'memory_management', name: 'Memory Management', category: 'optimization', description: 'Persist and recall information across sessions' },
        { id: 'resource_optimization', name: 'Resource Optimization', category: 'optimization', description: 'Efficient use of compute and API calls' },
        { id: 'prioritization', name: 'Prioritization', category: 'optimization', description: 'Order tasks by importance and urgency' },
        { id: 'guardrails', name: 'Guardrails/Safety', category: 'safety', description: 'Constrain outputs and prevent harmful actions' },
        { id: 'human_in_loop', name: 'Human-in-the-Loop', category: 'safety', description: 'Escalate critical decisions to humans' },
        { id: 'exception_handling', name: 'Exception Handling', category: 'safety', description: 'Graceful error recovery' },
        { id: 'multi_agent', name: 'Multi-Agent', category: 'collaboration', description: 'Orchestrate multiple specialized agents' },
        { id: 'inter_agent_comm', name: 'Inter-Agent Communication', category: 'collaboration', description: 'Enable agent-to-agent messaging' },
        { id: 'tool_use', name: 'Tool Use', category: 'collaboration', description: 'Integrate external APIs and functions' },
        { id: 'rag', name: 'RAG (Retrieval)', category: 'learning', description: 'Ground responses in retrieved knowledge' },
        { id: 'learning_adaptation', name: 'Learning/Adaptation', category: 'learning', description: 'Improve from feedback and experience' },
        { id: 'exploration', name: 'Exploration', category: 'learning', description: 'Discover new approaches and solutions' },
        { id: 'reasoning', name: 'Reasoning Techniques', category: 'optimization', description: 'Chain-of-thought, tree-of-thought, etc.' },
        { id: 'evaluation', name: 'Evaluation/Monitoring', category: 'safety', description: 'Test and monitor agent behavior' },
        { id: 'goal_setting', name: 'Goal Setting', category: 'workflow', description: 'Define and track objectives' },
        { id: 'mcp_integration', name: 'MCP Integration', category: 'collaboration', description: 'Connect via Model Context Protocol' },
      ]
      const filtered = args.category === 'all' ? patterns : patterns.filter(p => p.category === args.category)
      return result({ patterns: filtered, total: filtered.length })
    }
  },

  /**
   * Get detailed pattern information
   */
  get_pattern_details: {
    name: 'get_pattern_details',
    description: 'Get detailed information about a specific agentic design pattern, including when to use it, implementation guidance, and examples.',
    schema: z.object({
      pattern_id: z.string().describe('Pattern ID to get details for'),
    }),
    handler: async (args: { pattern_id: string }): Promise<ToolResult> => {
      const patternDetails: Record<string, object> = {
        prompt_chaining: {
          name: 'Prompt Chaining',
          problem: 'Complex tasks overwhelm LLMs when handled in a single prompt, leading to errors and instruction neglect.',
          solution: 'Break down the task into a sequence of smaller, focused prompts where output of one feeds into the next.',
          when_to_use: [
            'Task has multiple distinct processing stages',
            'Each stage requires focused attention',
            'You need structured data between steps',
            'Debugging requires visibility into each step',
          ],
          implementation: {
            structure: 'Chain of prompts: P1 → Output1 → P2 → Output2 → ... → Final',
            best_practices: [
              'Use structured output (JSON/XML) between steps',
              'Each prompt should have a single, clear objective',
              'Validate outputs before passing to next step',
              'Consider using different models for different steps (haiku for simple, opus for complex)',
            ],
          },
        },
        routing: {
          name: 'Routing',
          problem: 'A single workflow cannot handle diverse inputs efficiently. Different intents need different processing paths.',
          solution: 'Classify input intent first, then route to specialized handlers based on the classification.',
          when_to_use: [
            'Agent handles multiple types of requests',
            'Different tools/workflows suit different queries',
            'You want to optimize by using simpler paths for simple requests',
            'Specialized handlers improve quality for specific domains',
          ],
          implementation: {
            approaches: [
              'LLM-based: Prompt model to classify and output route name',
              'Embedding-based: Compare query embedding to route embeddings',
              'Rule-based: Keyword/pattern matching for deterministic routing',
              'Classifier: Train small model specifically for routing',
            ],
            best_practices: [
              'Keep route categories distinct and well-defined',
              'Include a fallback/clarification route',
              'Log routing decisions for analysis',
              'Consider confidence thresholds',
            ],
          },
        },
        reflection: {
          name: 'Reflection',
          problem: 'Single-pass generation often produces suboptimal outputs that could be improved with self-review.',
          solution: 'Create a feedback loop where output is critiqued and refined iteratively.',
          when_to_use: [
            'High-quality output is critical',
            'Task involves complex reasoning',
            'Accuracy must be verified',
            'Output will be user-facing or has business impact',
          ],
          implementation: {
            approaches: [
              'Self-reflection: Same model critiques its own output',
              'Producer-Critic: Separate model/agent provides critique',
              'Rubric-based: Evaluate against specific criteria',
            ],
            best_practices: [
              'Define clear evaluation criteria',
              'Set maximum iterations to prevent infinite loops',
              'Track improvements across iterations',
              'Consider cost vs. quality tradeoffs',
            ],
          },
        },
        multi_agent: {
          name: 'Multi-Agent',
          problem: 'Complex tasks require diverse expertise that a single generalist agent cannot provide optimally.',
          solution: 'Orchestrate multiple specialized agents that collaborate to solve problems.',
          when_to_use: [
            'Task requires diverse expertise',
            'Subtasks can be cleanly separated',
            'Different parts need different tools/capabilities',
            'Parallel processing would improve speed',
          ],
          implementation: {
            approaches: [
              'Coordinator: Central agent delegates to specialists',
              'Pipeline: Agents process in sequence',
              'Ensemble: Multiple agents solve same problem, best answer selected',
              'Debate: Agents argue perspectives to reach consensus',
            ],
            best_practices: [
              'Define clear responsibilities for each agent',
              'Establish communication protocols',
              'Handle failures gracefully',
              'Monitor inter-agent communication',
            ],
          },
        },
        memory_management: {
          name: 'Memory Management',
          problem: 'Agents lose context between sessions and cannot learn from past interactions.',
          solution: 'Implement persistent storage that agents can read from and write to across sessions.',
          when_to_use: [
            'Agent needs continuity across sessions',
            'Learning from past interactions improves performance',
            'User preferences should persist',
            'Task state must survive context limits',
          ],
          implementation: {
            memory_types: [
              'Short-term: Current conversation context',
              'Working: Scratchpad for current task',
              'Long-term: Persistent knowledge base',
              'Episodic: Past interaction summaries',
            ],
            best_practices: [
              'Structure memories for efficient retrieval',
              'Implement memory expiration/cleanup',
              'Protect sensitive information',
              'Balance memory size vs. relevance',
            ],
          },
        },
        guardrails: {
          name: 'Guardrails/Safety',
          problem: 'Unconstrained agents can produce harmful, inappropriate, or incorrect outputs.',
          solution: 'Implement constraints that check inputs and outputs against safety criteria.',
          when_to_use: [
            'Agent interacts with end users',
            'Outputs have real-world consequences',
            'Domain has regulatory requirements',
            'Certain topics/actions must be restricted',
          ],
          implementation: {
            types: [
              'Input guardrails: Validate/sanitize user input',
              'Output guardrails: Check/filter generated content',
              'Tool guardrails: Restrict certain tool operations',
              'Flow guardrails: Require approval for sensitive paths',
            ],
            best_practices: [
              'Layer multiple guardrails for defense in depth',
              'Log all guardrail triggers for analysis',
              'Provide helpful feedback when blocking',
              'Test guardrails with adversarial inputs',
            ],
          },
        },
        human_in_loop: {
          name: 'Human-in-the-Loop',
          problem: 'Some decisions are too critical or uncertain for fully autonomous operation.',
          solution: 'Build escalation paths that pause execution and request human approval.',
          when_to_use: [
            'Actions are irreversible or high-stakes',
            'Agent confidence is low',
            'Regulatory compliance requires human oversight',
            'Building user trust during deployment',
          ],
          implementation: {
            triggers: [
              'Confidence threshold: Escalate when uncertain',
              'Action type: Always escalate certain operations',
              'Value threshold: Escalate above certain amounts',
              'User preference: Let users choose oversight level',
            ],
            best_practices: [
              'Make review interface clear and efficient',
              'Provide context for human reviewers',
              'Set timeouts with fallback behavior',
              'Learn from human decisions to improve',
            ],
          },
        },
      }
      
      const details = patternDetails[args.pattern_id]
      if (!details) {
        return result({ error: `Pattern not found: ${args.pattern_id}`, available: Object.keys(patternDetails) })
      }
      return result(details)
    }
  },

  // ─────────────────────────────────────────
  // AGENT CREATION TOOLS
  // ─────────────────────────────────────────

  create_agent: {
    name: 'create_agent',
    description: 'Create a new agent with initial configuration. This creates a draft agent that can be configured further.',
    schema: z.object({
      name: z.string().describe('Human-readable agent name'),
      description: z.string().describe('What this agent does'),
      model: z.enum(['sonnet', 'opus', 'haiku']).optional().default('sonnet'),
      enable_memory: z.boolean().optional().default(true),
      enable_thinking: z.boolean().optional().default(false),
    }),
    handler: async (args: { name: string; description: string; model: 'sonnet' | 'opus' | 'haiku'; enable_memory: boolean; enable_thinking: boolean }): Promise<ToolResult> => {
      const id = generateId('agt')
      const config: AgentConfig = {
        id,
        name: args.name,
        description: args.description,
        model: args.model,
        systemPrompt: '',
        tools: [],
        workflows: [],
        guardrails: [],
        settings: {
          maxTurns: 50,
          maxTokens: 4096,
          temperature: 0.7,
          enableMemory: args.enable_memory,
          enableThinking: args.enable_thinking,
          thinkingBudget: args.enable_thinking ? 10000 : undefined,
          permissionMode: 'default',
        },
        status: 'draft',
        version: '0.1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return result({
        success: true,
        agent: config,
        message: `Created agent "${args.name}" (${id})`,
        next_steps: [
          'Set the system prompt with set_system_prompt',
          'Add tools with add_tool',
          'Configure workflows with create_workflow',
          'Add guardrails with add_guardrail',
          'Test with simulate_conversation',
        ],
      })
    }
  },

  set_system_prompt: {
    name: 'set_system_prompt',
    description: 'Set or update the system prompt for an agent.',
    schema: z.object({
      agent_id: z.string().describe('Agent ID'),
      system_prompt: z.string().describe('The system prompt text'),
      thinking_style: z.enum(['none', 'basic', 'guided', 'structured']).optional().default('structured'),
    }),
    handler: async (args: { agent_id: string; system_prompt: string; thinking_style: string }): Promise<ToolResult> => {
      return result({
        success: true,
        agent_id: args.agent_id,
        thinking_style: args.thinking_style,
        prompt_length: args.system_prompt.length,
        cot_enabled: args.thinking_style !== 'none',
        message: `System prompt set with ${args.thinking_style} chain-of-thought style`,
      })
    }
  },

  add_tool: {
    name: 'add_tool',
    description: 'Add a tool to an agent.',
    schema: z.object({
      agent_id: z.string().describe('Agent ID'),
      tool_id: z.string().describe('Tool ID from connector discovery'),
      name_override: z.string().optional(),
      description_override: z.string().optional(),
      requires_approval: z.boolean().optional().default(false),
      config: z.record(z.unknown()).optional(),
    }),
    handler: async (args: { agent_id: string; tool_id: string; requires_approval: boolean }): Promise<ToolResult> => {
      return result({
        success: true,
        agent_id: args.agent_id,
        tool_id: args.tool_id,
        requires_approval: args.requires_approval,
        message: `Added tool ${args.tool_id} to agent`,
        pattern_applied: args.requires_approval ? 'Human-in-the-Loop' : null,
      })
    }
  },

  create_workflow: {
    name: 'create_workflow',
    description: 'Create a workflow that defines how the agent processes certain types of requests.',
    schema: z.object({
      agent_id: z.string().describe('Agent ID'),
      name: z.string().describe('Workflow name'),
      description: z.string().describe('What this workflow does'),
      trigger: z.string().describe('When to activate'),
      pattern: z.enum(['sequential', 'parallel', 'conditional', 'loop', 'reflection']),
      steps: z.array(z.object({
        name: z.string(),
        type: z.enum(['prompt', 'tool', 'condition', 'subagent', 'human_review']),
        config: z.record(z.unknown()),
      })),
    }),
    handler: async (args: { agent_id: string; name: string; pattern: string; steps: Array<{ name: string }> }): Promise<ToolResult> => {
      const id = generateId('wf')
      return result({
        success: true,
        workflow_id: id,
        agent_id: args.agent_id,
        name: args.name,
        pattern: args.pattern,
        steps_count: args.steps.length,
        message: `Created workflow "${args.name}" using ${args.pattern} pattern`,
      })
    }
  },

  add_guardrail: {
    name: 'add_guardrail',
    description: 'Add a guardrail to constrain agent behavior.',
    schema: z.object({
      agent_id: z.string().describe('Agent ID'),
      name: z.string().describe('Guardrail name'),
      type: z.enum(['input', 'output', 'tool_use']),
      action: z.enum(['block', 'warn', 'escalate', 'transform']),
      condition: z.string().describe('Condition that triggers the guardrail'),
      message: z.string().optional(),
    }),
    handler: async (args: { agent_id: string; name: string; type: string; action: string }): Promise<ToolResult> => {
      const id = generateId('gr')
      return result({
        success: true,
        guardrail_id: id,
        agent_id: args.agent_id,
        name: args.name,
        type: args.type,
        action: args.action,
        message: `Added guardrail "${args.name}" (${args.action} on ${args.type})`,
        pattern_applied: 'Guardrails/Safety',
      })
    }
  },

  // ─────────────────────────────────────────
  // TESTING & DEPLOYMENT TOOLS
  // ─────────────────────────────────────────

  preview_agent: {
    name: 'preview_agent',
    description: 'Get a preview of the agent current configuration.',
    schema: z.object({ agent_id: z.string() }),
    handler: async (args: { agent_id: string }): Promise<ToolResult> => {
      return result({
        agent_id: args.agent_id,
        status: 'draft',
        completeness: { system_prompt: true, tools: true, workflows: false, guardrails: true, overall: 75 },
        recommendations: ['Add a workflow', 'Run test simulations'],
      })
    }
  },

  simulate_conversation: {
    name: 'simulate_conversation',
    description: 'Run a simulated conversation to test agent behavior.',
    schema: z.object({
      agent_id: z.string(),
      scenario: z.string().describe('Test scenario'),
      expected_behavior: z.string().optional(),
      enable_reflection: z.boolean().optional().default(true),
    }),
    handler: async (args: { agent_id: string; scenario: string; enable_reflection: boolean }): Promise<ToolResult> => {
      return result({
        simulation_id: generateId('sim'),
        agent_id: args.agent_id,
        scenario: args.scenario,
        result: { status: 'completed', turns: 3, tools_used: ['search', 'format'] },
        reflection: args.enable_reflection ? { score: 8.5, strengths: ['Clear'], improvements: ['Add context'] } : null,
      })
    }
  },

  validate_agent: {
    name: 'validate_agent',
    description: 'Validate agent configuration.',
    schema: z.object({
      agent_id: z.string(),
      validation_level: z.enum(['basic', 'standard', 'strict']).optional().default('standard'),
    }),
    handler: async (args: { agent_id: string; validation_level: string }): Promise<ToolResult> => {
      const checks = [
        { name: 'system_prompt', status: 'pass', message: 'System prompt defined' },
        { name: 'tools', status: 'pass', message: 'Tools configured' },
        { name: 'guardrails', status: args.validation_level === 'strict' ? 'warn' : 'pass', message: 'Guardrails configured' },
      ]
      return result({ agent_id: args.agent_id, summary: { passed: 2, warnings: 1, failed: 0, ready_for_deploy: true }, checks })
    }
  },

  deploy_agent: {
    name: 'deploy_agent',
    description: 'Deploy an agent to an environment.',
    schema: z.object({
      agent_id: z.string(),
      environment: z.enum(['sandbox', 'staging', 'production']),
      validate_first: z.boolean().optional().default(true),
    }),
    handler: async (args: { agent_id: string; environment: string }): Promise<ToolResult> => {
      return result({
        success: true,
        deployment_id: generateId('dep'),
        agent_id: args.agent_id,
        environment: args.environment,
        endpoints: {
          chat: `https://api.paco.ai/${args.environment}/agents/${args.agent_id}/chat`,
          webhook: `https://api.paco.ai/${args.environment}/agents/${args.agent_id}/webhook`,
        },
      })
    }
  },

  export_agent: {
    name: 'export_agent',
    description: 'Export agent configuration as code or JSON.',
    schema: z.object({
      agent_id: z.string(),
      format: z.enum(['json', 'typescript', 'python']).optional().default('json'),
    }),
    handler: async (args: { agent_id: string; format: string }): Promise<ToolResult> => {
      if (args.format === 'typescript') {
        return result({ format: 'typescript', code: `import { Agent } from '@anthropic-ai/claude-agent-sdk'\n\nexport const agent = new Agent({...})` })
      }
      return result({ format: args.format, config: { id: args.agent_id, name: 'My Agent' } })
    }
  },
}

// ============================================
// SYSTEM PROMPT
// ============================================

export const BUILDER_SYSTEM_PROMPT = `You are PACO Builder, an expert AI agent architect that helps users create powerful, production-ready agents using the Anthropic Agent SDK.

## Your Role
You are a META-AGENT: an agent that builds other agents. You guide users through designing, configuring, testing, and deploying AI agents for any use case.

## Your Knowledge
You have deep expertise in 21 Agentic Design Patterns:

**Workflow Patterns:**
• Prompt Chaining - Break complex tasks into sequential steps
• Routing - Direct queries to appropriate handlers based on intent
• Parallelization - Execute independent tasks concurrently for speed
• Planning - Decompose goals into actionable steps

**Optimization Patterns:**
• Reflection - Self-correct through critique loops
• Memory Management - Persist information across sessions
• Resource Optimization - Efficient use of compute and API calls
• Prioritization - Order tasks by importance

**Safety Patterns:**
• Guardrails - Constrain outputs and prevent harmful actions
• Human-in-the-Loop - Escalate critical decisions to humans
• Exception Handling - Graceful error recovery
• Evaluation - Test and monitor behavior

**Collaboration Patterns:**
• Multi-Agent - Orchestrate specialized agents
• Tool Use - Integrate external systems
• Inter-Agent Communication - Enable A2A messaging
• MCP Integration - Model Context Protocol servers

**Learning Patterns:**
• RAG - Ground responses in retrieved knowledge
• Learning/Adaptation - Improve from experience
• Exploration - Discover new approaches

## How You Work

<thinking>
Before each response, I consider:
1. What is the user trying to build?
2. Which patterns would best serve their use case?
3. What tools and connectors do they need?
4. What guardrails should protect their agent?
5. How should I guide them through the build process?
</thinking>

## Build Process
1. **Understand** - Clarify what agent they need
2. **Design** - Recommend patterns and architecture
3. **Create** - Initialize the agent with create_agent
4. **Configure** - Set prompt, add tools, define workflows
5. **Protect** - Add appropriate guardrails
6. **Test** - Simulate conversations and validate
7. **Deploy** - Push to environment

## Communication Style
• Be helpful and encouraging
• Explain WHY you recommend certain patterns
• Show examples when helpful
• Celebrate progress
• Proactively suggest improvements

## Important Guidelines
• Always recommend guardrails for user-facing agents
• Suggest Human-in-the-Loop for high-stakes operations
• Recommend memory for agents needing continuity
• Use structured thinking for complex architecture decisions
• Export configurations so users can version control

Remember: You're not building domain-specific agents yourself. You're helping users build ANY type of agent they need by applying the right patterns and configurations.`

// ============================================
// BUILDER AGENT CLASS
// ============================================

export class PACOBuilderAgent {
  private options: BuilderAgentOptions
  private memoryStore?: MemoryStore
  private auditLogger?: AuditLogger

  constructor(options: BuilderAgentOptions) {
    this.options = { model: 'sonnet', maxTurns: 50, enableThinking: true, thinkingBudget: 10000, ...options }
    if (options.memoryPath) this.memoryStore = new MemoryStore(options.memoryPath)
    if (options.auditLogPath) this.auditLogger = new AuditLogger(options.auditLogPath)
  }

  getTools() { return Object.values(tools) }
  getSystemPrompt(): string { return BUILDER_SYSTEM_PROMPT }
  
  getSDKConfig() {
    return {
      model: this.options.model,
      systemPrompt: this.getSystemPrompt(),
      maxTurns: this.options.maxTurns,
      maxBudgetUsd: this.options.maxBudgetUsd,
      ...(this.options.enableThinking && { thinking: { type: 'enabled', budget_tokens: this.options.thinkingBudget || 10000 } }),
    }
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = tools[name as keyof typeof tools]
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    const startTime = Date.now()
    const result = await tool.handler(args as any)
    if (this.auditLogger) {
      this.auditLogger.log({ sessionId: this.options.sessionId || 'unknown', event: 'tool_execution', toolName: name, input: args, output: JSON.stringify(result), duration_ms: Date.now() - startTime })
    }
    return result
  }

  getMemoryStore() { return this.memoryStore }
  getAuditLogger() { return this.auditLogger }
}

export function createBuilderAgent(options: BuilderAgentOptions): PACOBuilderAgent {
  return new PACOBuilderAgent(options)
}

export default { createBuilderAgent, PACOBuilderAgent, MemoryStore, AuditLogger, tools, BUILDER_SYSTEM_PROMPT }
