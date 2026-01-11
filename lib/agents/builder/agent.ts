/**
 * PACO Builder Agent - Main Orchestrator
 *
 * Uses Anthropic's Claude Agent SDK (TypeScript) to power the agent builder.
 * Follows the official SDK patterns from:
 * https://platform.claude.com/docs/en/agent-sdk/typescript
 *
 * Key SDK concepts used:
 * - query(): Main function for interacting with Claude
 * - tool(): Creates type-safe MCP tool definitions
 * - createSdkMcpServer(): Creates in-process MCP server
 * - Proper message types: SDKMessage, SDKAssistantMessage, etc.
 */

import { z } from 'zod'
import {
  query,
  tool,
  createSdkMcpServer,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type CallToolResult,
} from '@anthropic-ai/claude-agent-sdk'
import * as fs from 'fs'
import * as path from 'path'

// ============================================
// TYPES
// ============================================

export interface BuilderAgentOptions {
  accountId: string
  model?: string
  cwd?: string
  maxTurns?: number
  maxBudgetUsd?: number
}

export interface BuilderMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'error' | 'system'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  metadata?: Record<string, unknown>
}

// ============================================
// TOOL DEFINITIONS using SDK's tool() function
// Uses Zod schemas for type-safe tool definitions
// ============================================

// --- Discovery Tools ---

const listConnectorsTool = tool(
  'list_connectors',
  'List all available data source connectors for this account',
  {
    status: z.enum(['connected', 'pending', 'error', 'all']).optional().default('all'),
    type: z.enum(['rest', 'soap', 'database', 'mcp', 'all']).optional().default('all'),
  },
  async (args): Promise<CallToolResult> => {
    // TODO: Replace with actual database query
    const connectors = [
      {
        id: 'conn_agora',
        name: 'AGORA',
        slug: 'agora',
        type: 'rest',
        status: 'connected',
        toolCount: 4,
      },
      {
        id: 'conn_cea',
        name: 'CEA SOAP',
        slug: 'cea-soap',
        type: 'soap',
        status: 'connected',
        toolCount: 3,
      },
    ]
    return {
      content: [{ type: 'text', text: JSON.stringify(connectors, null, 2) }],
    }
  }
)

const discoverToolsTool = tool(
  'discover_tools',
  'Discover available tools from a connector by auto-introspecting its API',
  {
    connector_id: z.string().describe('Connector ID to discover tools from'),
    refresh: z.boolean().optional().default(false).describe('Force refresh discovery'),
  },
  async (args): Promise<CallToolResult> => {
    const { connector_id } = args
    // TODO: Implement actual connector introspection
    const tools = connector_id.includes('agora')
      ? [
          { id: 'agora.create_ticket', name: 'create_ticket', description: 'Create a new ticket' },
          { id: 'agora.get_ticket', name: 'get_ticket', description: 'Get ticket details' },
          { id: 'agora.list_categories', name: 'list_categories', description: 'List categories' },
        ]
      : [
          { id: 'cea.get_balance', name: 'get_balance', description: 'Get account balance' },
          { id: 'cea.get_consumption', name: 'get_consumption', description: 'Get consumption' },
        ]
    return {
      content: [{ type: 'text', text: JSON.stringify(tools, null, 2) }],
    }
  }
)

const listSkillsTool = tool(
  'list_skills',
  'List available skills (behaviors, prompts, guards) for agents',
  {
    category: z.enum(['tone', 'language', 'safety', 'domain', 'government', 'all']).optional(),
    type: z.enum(['prompt', 'behavior', 'guard', 'composite', 'all']).optional(),
  },
  async (args): Promise<CallToolResult> => {
    const skills = [
      { id: 'skill_mexican_formality', name: 'Mexican Formality', type: 'behavior', category: 'tone' },
      { id: 'skill_empathy', name: 'Empathy Response', type: 'behavior', category: 'tone' },
      { id: 'skill_no_legal', name: 'No Legal Advice', type: 'guard', category: 'safety' },
    ]
    return {
      content: [{ type: 'text', text: JSON.stringify(skills, null, 2) }],
    }
  }
)

// --- Creation Tools ---

const createAgentTool = tool(
  'create_agent',
  'Create a new agent with basic metadata',
  {
    name: z.string().describe('Agent display name'),
    type: z.enum(['customer', 'ticket_intel', 'copilot', 'custom']).describe('Agent type'),
    description: z.string().optional().describe('Agent description'),
  },
  async (args): Promise<CallToolResult> => {
    const id = `agt_${Date.now().toString(36)}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            agent_id: id,
            name: args.name,
            type: args.type,
            status: 'draft',
            message: `Created agent "${args.name}" (${id})`,
          }),
        },
      ],
    }
  }
)

const setPersonaTool = tool(
  'set_persona',
  "Define agent's personality and communication style",
  {
    agent_id: z.string().describe('Agent ID'),
    system_prompt: z.string().describe('System prompt for the agent'),
    personality_traits: z.array(z.string()).optional().describe('Personality traits'),
    language: z.string().optional().default('es-MX').describe('Primary language'),
    formality: z.enum(['formal', 'casual', 'adaptive']).optional().default('adaptive'),
  },
  async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            agent_id: args.agent_id,
            message: 'Persona configured successfully',
            persona: {
              language: args.language,
              formality: args.formality,
              traits: args.personality_traits || [],
            },
          }),
        },
      ],
    }
  }
)

const addToolToAgentTool = tool(
  'add_tool_to_agent',
  'Attach a tool to an agent',
  {
    agent_id: z.string().describe('Agent ID'),
    tool_id: z.string().describe('Tool ID (format: connector.tool_name)'),
    config: z.record(z.unknown()).optional().describe('Tool configuration'),
    auto_execute: z.boolean().optional().default(false).describe('Auto-execute without confirmation'),
  },
  async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            agent_id: args.agent_id,
            tool_id: args.tool_id,
            message: `Added tool ${args.tool_id} to agent`,
          }),
        },
      ],
    }
  }
)

const addSkillToAgentTool = tool(
  'add_skill_to_agent',
  'Attach a skill to an agent',
  {
    agent_id: z.string().describe('Agent ID'),
    skill_id: z.string().describe('Skill ID'),
    priority: z.number().optional().default(0).describe('Skill priority'),
  },
  async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            agent_id: args.agent_id,
            skill_id: args.skill_id,
            message: `Added skill ${args.skill_id} to agent`,
          }),
        },
      ],
    }
  }
)

const getAgentPreviewTool = tool(
  'get_agent_preview',
  'Get current state of agent being built for preview',
  {
    agent_id: z.string().describe('Agent ID'),
  },
  async (args): Promise<CallToolResult> => {
    // TODO: Fetch actual agent state from database
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            id: args.agent_id,
            name: 'María',
            type: 'customer',
            status: 'draft',
            hasPersona: true,
            toolCount: 3,
            skillCount: 2,
            workflowCount: 1,
            guardrailCount: 2,
            completeness: 75,
          }),
        },
      ],
    }
  }
)

// --- Workflow Tools ---

const createWorkflowTool = tool(
  'create_workflow',
  'Create a conversation workflow for the agent',
  {
    agent_id: z.string().describe('Agent ID'),
    name: z.string().describe('Workflow name'),
    trigger: z.string().describe('Trigger condition (e.g., intent:report_leak)'),
    steps: z.array(z.record(z.unknown())).describe('Workflow steps'),
  },
  async (args): Promise<CallToolResult> => {
    const id = `wf_${Date.now().toString(36)}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            workflow_id: id,
            name: args.name,
            steps_count: args.steps.length,
            message: `Created workflow "${args.name}" with ${args.steps.length} steps`,
          }),
        },
      ],
    }
  }
)

const addIntentTool = tool(
  'add_intent',
  'Add an intent the agent should recognize',
  {
    agent_id: z.string().describe('Agent ID'),
    intent_name: z.string().describe('Intent name'),
    examples: z.array(z.string()).describe('Example phrases'),
    workflow_id: z.string().optional().describe('Workflow to trigger'),
  },
  async (args): Promise<CallToolResult> => {
    const id = `int_${Date.now().toString(36)}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            intent_id: id,
            name: args.intent_name,
            examples_count: args.examples.length,
            message: `Created intent "${args.intent_name}" with ${args.examples.length} examples`,
          }),
        },
      ],
    }
  }
)

// --- Guardrail Tools ---

const addGuardrailTool = tool(
  'add_guardrail',
  'Add a safety guardrail to an agent',
  {
    agent_id: z.string().describe('Agent ID'),
    name: z.string().describe('Guardrail name'),
    type: z.enum(['block', 'escalate', 'warn', 'require_approval']).describe('Guardrail type'),
    trigger: z.string().describe('Trigger condition'),
    action: z.string().describe('Action to take'),
    message: z.string().optional().describe('Message to show'),
  },
  async (args): Promise<CallToolResult> => {
    const id = `gr_${Date.now().toString(36)}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            guardrail_id: id,
            name: args.name,
            type: args.type,
            message: `Created guardrail "${args.name}" (${args.type})`,
          }),
        },
      ],
    }
  }
)

const setEscalationRulesTool = tool(
  'set_escalation_rules',
  'Define escalation rules for an agent',
  {
    agent_id: z.string().describe('Agent ID'),
    rules: z.array(z.record(z.unknown())).describe('Escalation rules'),
  },
  async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            agent_id: args.agent_id,
            rules_count: args.rules.length,
            message: `Set ${args.rules.length} escalation rules`,
          }),
        },
      ],
    }
  }
)

// --- Testing Tools ---

const simulateConversationTool = tool(
  'simulate_conversation',
  'Run a simulated conversation to test agent behavior',
  {
    agent_id: z.string().describe('Agent ID'),
    scenario: z.string().describe('Test scenario description'),
    expected_outcome: z.string().optional().describe('Expected outcome'),
    max_turns: z.number().optional().default(10).describe('Maximum conversation turns'),
  },
  async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            simulation_id: `sim_${Date.now()}`,
            agent_id: args.agent_id,
            scenario: args.scenario,
            status: 'passed',
            turns: [
              { role: 'user', content: args.scenario },
              { role: 'assistant', content: 'Simulated response' },
            ],
            outcome: { expected: args.expected_outcome, match: true },
          }),
        },
      ],
    }
  }
)

const validateAgentTool = tool(
  'validate_agent',
  'Validate agent configuration for completeness and correctness',
  {
    agent_id: z.string().describe('Agent ID'),
  },
  async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            agent_id: args.agent_id,
            status: 'valid',
            checks: [
              { name: 'has_persona', status: 'passed' },
              { name: 'has_tools', status: 'passed' },
              { name: 'has_guardrails', status: 'warning', message: 'Consider adding more' },
            ],
          }),
        },
      ],
    }
  }
)

const runTestSuiteTool = tool(
  'run_test_suite',
  'Run comprehensive tests on agent',
  {
    agent_id: z.string().describe('Agent ID'),
    include_edge_cases: z.boolean().optional().default(true),
  },
  async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            agent_id: args.agent_id,
            total: 5,
            passed: 4,
            failed: 1,
            coverage: { workflows: 100, intents: 85, guardrails: 100 },
          }),
        },
      ],
    }
  }
)

// --- Deployment Tools ---

const deployAgentTool = tool(
  'deploy_agent',
  'Deploy agent to an environment',
  {
    agent_id: z.string().describe('Agent ID'),
    environment: z.enum(['sandbox', 'beta', 'production']).describe('Target environment'),
    channels: z.array(z.string()).optional().default(['web']).describe('Deployment channels'),
  },
  async (args): Promise<CallToolResult> => {
    const id = `dep_${Date.now().toString(36)}`
    const url =
      args.environment === 'production'
        ? `https://paco.ai/agent/${args.agent_id}`
        : `https://${args.environment}.paco.ai/agent/${args.agent_id}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            deployment_id: id,
            agent_id: args.agent_id,
            environment: args.environment,
            channels: args.channels,
            url,
            message: `Deployed to ${args.environment}`,
          }),
        },
      ],
    }
  }
)

const createAgentVersionTool = tool(
  'create_agent_version',
  'Create a versioned snapshot of agent',
  {
    agent_id: z.string().describe('Agent ID'),
    version_name: z.string().describe('Version name (e.g., v1.0.0)'),
    notes: z.string().optional().describe('Release notes'),
  },
  async (args): Promise<CallToolResult> => {
    const id = `ver_${Date.now().toString(36)}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            version_id: id,
            agent_id: args.agent_id,
            version_name: args.version_name,
            message: `Created version "${args.version_name}"`,
          }),
        },
      ],
    }
  }
)

// ============================================
// MCP SERVER using SDK's createSdkMcpServer()
// ============================================

/**
 * Create the MCP server with all PACO builder tools.
 * Uses the SDK's createSdkMcpServer() for in-process MCP.
 */
export function createBuilderMcpServer() {
  return createSdkMcpServer({
    name: 'paco-builder',
    version: '1.0.0',
    tools: [
      // Discovery
      listConnectorsTool,
      discoverToolsTool,
      listSkillsTool,
      // Creation
      createAgentTool,
      setPersonaTool,
      addToolToAgentTool,
      addSkillToAgentTool,
      getAgentPreviewTool,
      // Workflow
      createWorkflowTool,
      addIntentTool,
      // Guardrails
      addGuardrailTool,
      setEscalationRulesTool,
      // Testing
      simulateConversationTool,
      validateAgentTool,
      runTestSuiteTool,
      // Deployment
      deployAgentTool,
      createAgentVersionTool,
    ],
  })
}

// ============================================
// SYSTEM PROMPT
// ============================================

function loadSystemPrompt(): string {
  const promptPath = path.join(__dirname, 'prompts', 'system.md')
  try {
    return fs.readFileSync(promptPath, 'utf-8')
  } catch {
    return `You are PACO Builder Agent, an expert AI agent architect.

Your job is to help users create powerful, production-ready AI agents through natural conversation.

## Your Capabilities
You have tools to:
- **Discover**: List connectors, discover tools, find skills
- **Create**: Create agents, set personas, add tools and skills
- **Configure**: Create workflows, add intents, set guardrails
- **Test**: Simulate conversations, validate configuration, run test suites
- **Deploy**: Deploy to environments, create versions

## Build Flow
1. **Understand** - Ask what kind of agent they need
2. **Discover** - Show available connectors and tools
3. **Create** - Initialize the agent with a name and type
4. **Configure** - Set up persona, tools, workflows, guardrails
5. **Test** - Validate and simulate before deployment
6. **Deploy** - Push to sandbox, then production

## Communication Style
- Speak in Spanish (es-MX) by default
- Be warm and helpful
- Show progress visually when possible
- Celebrate milestones ("¡Excelente! Agent created!")`
  }
}

// ============================================
// BUILDER AGENT CLASS
// ============================================

/**
 * PACO Builder Agent - helps users create AI agents through conversation.
 *
 * Uses the Claude Agent SDK's query() function with:
 * - Custom MCP tools via createSdkMcpServer()
 * - Streaming message handling
 * - Proper permission modes
 */
export class PACOBuilderAgent {
  private accountId: string
  private model: string
  private cwd: string
  private maxTurns: number
  private maxBudgetUsd?: number
  private systemPrompt: string
  private mcpServer: ReturnType<typeof createSdkMcpServer>

  constructor(options: BuilderAgentOptions) {
    this.accountId = options.accountId
    this.model = options.model || 'claude-sonnet-4-20250514'
    this.cwd = options.cwd || process.cwd()
    this.maxTurns = options.maxTurns || 50
    this.maxBudgetUsd = options.maxBudgetUsd
    this.systemPrompt = loadSystemPrompt()
    this.mcpServer = createBuilderMcpServer()
  }

  /**
   * Query the builder agent with a prompt.
   * Returns an async generator of BuilderMessage objects.
   *
   * Uses the Claude Agent SDK's query() function which:
   * - Manages the agentic loop automatically
   * - Executes tools through MCP
   * - Handles retries and context management
   */
  async *query(prompt: string): AsyncGenerator<BuilderMessage> {
    // Use SDK's query() function - the main entry point
    const queryResult = query({
      prompt,
      options: {
        model: this.model,
        systemPrompt: this.systemPrompt,
        cwd: this.cwd,
        maxTurns: this.maxTurns,
        maxBudgetUsd: this.maxBudgetUsd,
        // Attach our MCP server with builder tools
        mcpServers: {
          builder: this.mcpServer,
        },
        // Allow all our custom MCP tools
        allowedTools: [
          'mcp__builder__list_connectors',
          'mcp__builder__discover_tools',
          'mcp__builder__list_skills',
          'mcp__builder__create_agent',
          'mcp__builder__set_persona',
          'mcp__builder__add_tool_to_agent',
          'mcp__builder__add_skill_to_agent',
          'mcp__builder__get_agent_preview',
          'mcp__builder__create_workflow',
          'mcp__builder__add_intent',
          'mcp__builder__add_guardrail',
          'mcp__builder__set_escalation_rules',
          'mcp__builder__simulate_conversation',
          'mcp__builder__validate_agent',
          'mcp__builder__run_test_suite',
          'mcp__builder__deploy_agent',
          'mcp__builder__create_agent_version',
        ],
        // Auto-accept tool executions since these are safe builder tools
        permissionMode: 'acceptEdits',
      },
    })

    // Process messages from the async generator
    for await (const message of queryResult) {
      yield* this.processMessage(message)
    }
  }

  /**
   * Process SDK messages into BuilderMessage format for the UI.
   */
  private *processMessage(message: SDKMessage): Generator<BuilderMessage> {
    switch (message.type) {
      case 'assistant': {
        const assistantMsg = message as SDKAssistantMessage
        const content = assistantMsg.message.content

        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              yield { type: 'text', content: block.text }
            } else if (block.type === 'tool_use') {
              yield {
                type: 'tool_use',
                content: `Calling ${block.name}`,
                toolName: block.name,
                toolInput: block.input as Record<string, unknown>,
                toolUseId: block.id,
              }
            }
          }
        }
        break
      }

      case 'result': {
        const resultMsg = message as SDKResultMessage
        yield {
          type: 'status',
          content: resultMsg.subtype === 'success' ? 'Completed' : `Error: ${resultMsg.subtype}`,
          metadata: {
            duration_ms: resultMsg.duration_ms,
            num_turns: resultMsg.num_turns,
            total_cost_usd: resultMsg.total_cost_usd,
          },
        }
        break
      }

      case 'system': {
        const sysMsg = message as SDKSystemMessage
        if (sysMsg.subtype === 'init') {
          yield {
            type: 'system',
            content: `Session initialized with model ${sysMsg.model}`,
            metadata: {
              tools: sysMsg.tools,
              mcp_servers: sysMsg.mcp_servers,
            },
          }
        }
        break
      }

      default:
        // Handle other message types as needed
        break
    }
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Create a PACO Builder Agent instance.
 *
 * Usage:
 *   const builder = createBuilderAgent({ accountId: 'account_123' })
 *   for await (const msg of builder.query('Build María, a customer service agent')) {
 *     console.log(msg)
 *   }
 */
export function createBuilderAgent(options: BuilderAgentOptions): PACOBuilderAgent {
  return new PACOBuilderAgent(options)
}

/**
 * One-shot query to the builder agent.
 * Collects all messages and returns them.
 */
export async function queryBuilder(
  prompt: string,
  options: BuilderAgentOptions
): Promise<BuilderMessage[]> {
  const agent = new PACOBuilderAgent(options)
  const messages: BuilderMessage[] = []

  for await (const message of agent.query(prompt)) {
    messages.push(message)
  }

  return messages
}
