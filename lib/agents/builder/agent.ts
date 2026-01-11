/**
 * PACO Builder Agent - Main Orchestrator
 *
 * Uses Anthropic's Claude Agent SDK (TypeScript) to power the agent builder.
 * Follows the official SDK patterns from:
 * https://github.com/anthropics/claude-agent-sdk-typescript
 * https://platform.claude.com/docs/en/agent-sdk/typescript
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import * as fs from 'fs'
import * as path from 'path'

// Import tool handlers (to be implemented)
import { discoveryToolHandlers } from './tools/handlers/discovery'
import { creationToolHandlers } from './tools/handlers/creation'
import { workflowToolHandlers } from './tools/handlers/workflow'
import { guardrailToolHandlers } from './tools/handlers/guardrails'
import { testingToolHandlers } from './tools/handlers/testing'
import { deploymentToolHandlers } from './tools/handlers/deployment'

// ============================================
// TYPES
// ============================================

export interface BuilderAgentOptions {
  accountId: string
  model?: string
  cwd?: string
}

export interface BuilderMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'error'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
}

// ============================================
// MCP SERVER FOR BUILDER TOOLS
// ============================================

/**
 * Create the MCP server with all PACO builder tools.
 * This follows the MCP protocol that Claude Agent SDK supports.
 */
export function createBuilderMcpServer(accountId: string) {
  const server = new Server(
    {
      name: 'paco-builder',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // List all available builder tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Discovery Tools
        {
          name: 'list_connectors',
          description: 'List all available data source connectors for this account',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['connected', 'pending', 'error', 'all'] },
              type: { type: 'string', enum: ['rest', 'soap', 'database', 'mcp', 'all'] },
            },
          },
        },
        {
          name: 'discover_tools',
          description: 'Discover available tools from a connector by auto-introspecting',
          inputSchema: {
            type: 'object',
            properties: {
              connector_id: { type: 'string', description: 'Connector ID to discover tools from' },
              refresh: { type: 'boolean', description: 'Force refresh discovery' },
            },
            required: ['connector_id'],
          },
        },
        {
          name: 'list_skills',
          description: 'List available skills (behaviors, prompts, guards)',
          inputSchema: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: ['tone', 'language', 'safety', 'domain', 'government', 'all'] },
              type: { type: 'string', enum: ['prompt', 'behavior', 'guard', 'composite', 'all'] },
            },
          },
        },

        // Creation Tools
        {
          name: 'create_agent',
          description: 'Create a new agent with basic metadata',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Agent display name' },
              type: { type: 'string', enum: ['customer', 'ticket_intel', 'copilot', 'custom'] },
              description: { type: 'string' },
            },
            required: ['name', 'type'],
          },
        },
        {
          name: 'set_persona',
          description: "Define agent's personality and communication style",
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              system_prompt: { type: 'string' },
              personality_traits: { type: 'array', items: { type: 'string' } },
              language: { type: 'string', default: 'es-MX' },
              formality: { type: 'string', enum: ['formal', 'casual', 'adaptive'] },
            },
            required: ['agent_id', 'system_prompt'],
          },
        },
        {
          name: 'add_tool_to_agent',
          description: 'Attach a tool to an agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              tool_id: { type: 'string', description: 'Format: connector.tool_name' },
              config: { type: 'object' },
              auto_execute: { type: 'boolean', default: false },
            },
            required: ['agent_id', 'tool_id'],
          },
        },
        {
          name: 'add_skill_to_agent',
          description: 'Attach a skill to an agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              skill_id: { type: 'string' },
              priority: { type: 'number', default: 0 },
            },
            required: ['agent_id', 'skill_id'],
          },
        },
        {
          name: 'get_agent_preview',
          description: 'Get current state of agent being built',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
            },
            required: ['agent_id'],
          },
        },

        // Workflow Tools
        {
          name: 'create_workflow',
          description: 'Create a conversation workflow',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              name: { type: 'string' },
              trigger: { type: 'string', description: 'e.g., intent:report_leak or keyword:fuga' },
              steps: { type: 'array', items: { type: 'object' } },
            },
            required: ['agent_id', 'name', 'trigger', 'steps'],
          },
        },
        {
          name: 'add_intent',
          description: 'Add an intent the agent should recognize',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              intent_name: { type: 'string' },
              examples: { type: 'array', items: { type: 'string' } },
              workflow_id: { type: 'string' },
            },
            required: ['agent_id', 'intent_name', 'examples'],
          },
        },

        // Guardrail Tools
        {
          name: 'add_guardrail',
          description: 'Add a safety guardrail to an agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string', enum: ['block', 'escalate', 'warn', 'require_approval'] },
              trigger: { type: 'string' },
              action: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['agent_id', 'name', 'type', 'trigger', 'action'],
          },
        },
        {
          name: 'set_escalation_rules',
          description: 'Define escalation rules for an agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              rules: { type: 'array', items: { type: 'object' } },
            },
            required: ['agent_id', 'rules'],
          },
        },

        // Testing Tools
        {
          name: 'simulate_conversation',
          description: 'Run a simulated conversation to test agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              scenario: { type: 'string' },
              expected_outcome: { type: 'string' },
              max_turns: { type: 'number', default: 10 },
            },
            required: ['agent_id', 'scenario'],
          },
        },
        {
          name: 'validate_agent',
          description: 'Validate agent configuration',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
            },
            required: ['agent_id'],
          },
        },
        {
          name: 'run_test_suite',
          description: 'Run comprehensive tests on agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              include_edge_cases: { type: 'boolean', default: true },
            },
            required: ['agent_id'],
          },
        },

        // Deployment Tools
        {
          name: 'deploy_agent',
          description: 'Deploy agent to an environment',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              environment: { type: 'string', enum: ['sandbox', 'beta', 'production'] },
              channels: { type: 'array', items: { type: 'string' } },
            },
            required: ['agent_id', 'environment'],
          },
        },
        {
          name: 'create_agent_version',
          description: 'Create a versioned snapshot of agent',
          inputSchema: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              version_name: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['agent_id', 'version_name'],
          },
        },
      ],
    }
  })

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const typedArgs = args as Record<string, unknown>

    try {
      let result: unknown

      switch (name) {
        // Discovery
        case 'list_connectors':
          result = await discoveryToolHandlers.listConnectors(accountId, typedArgs)
          break
        case 'discover_tools':
          result = await discoveryToolHandlers.discoverTools(accountId, typedArgs)
          break
        case 'list_skills':
          result = await discoveryToolHandlers.listSkills(accountId, typedArgs)
          break

        // Creation
        case 'create_agent':
          result = await creationToolHandlers.createAgent(accountId, typedArgs)
          break
        case 'set_persona':
          result = await creationToolHandlers.setPersona(accountId, typedArgs)
          break
        case 'add_tool_to_agent':
          result = await creationToolHandlers.addToolToAgent(accountId, typedArgs)
          break
        case 'add_skill_to_agent':
          result = await creationToolHandlers.addSkillToAgent(accountId, typedArgs)
          break
        case 'get_agent_preview':
          result = await creationToolHandlers.getAgentPreview(accountId, typedArgs)
          break

        // Workflow
        case 'create_workflow':
          result = await workflowToolHandlers.createWorkflow(accountId, typedArgs)
          break
        case 'add_intent':
          result = await workflowToolHandlers.addIntent(accountId, typedArgs)
          break

        // Guardrails
        case 'add_guardrail':
          result = await guardrailToolHandlers.addGuardrail(accountId, typedArgs)
          break
        case 'set_escalation_rules':
          result = await guardrailToolHandlers.setEscalationRules(accountId, typedArgs)
          break

        // Testing
        case 'simulate_conversation':
          result = await testingToolHandlers.simulateConversation(accountId, typedArgs)
          break
        case 'validate_agent':
          result = await testingToolHandlers.validateAgent(accountId, typedArgs)
          break
        case 'run_test_suite':
          result = await testingToolHandlers.runTestSuite(accountId, typedArgs)
          break

        // Deployment
        case 'deploy_agent':
          result = await deploymentToolHandlers.deployAgent(accountId, typedArgs)
          break
        case 'create_agent_version':
          result = await deploymentToolHandlers.createAgentVersion(accountId, typedArgs)
          break

        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true,
          },
        ],
      }
    }
  })

  return server
}

// ============================================
// SYSTEM PROMPT LOADER
// ============================================

function loadSystemPrompt(): string {
  const promptPath = path.join(__dirname, 'prompts', 'system.md')
  try {
    return fs.readFileSync(promptPath, 'utf-8')
  } catch {
    return `You are PACO Builder Agent, an expert AI agent architect.
Your job is to help users create powerful, production-ready AI agents through conversation.
Follow the build flow: discover → create → configure → test → deploy.`
  }
}

// ============================================
// BUILDER AGENT CLASS
// ============================================

/**
 * PACO Builder Agent - helps users create AI agents through conversation.
 *
 * Uses the Claude Agent SDK with custom MCP tools for agent building.
 * Follows Anthropic's official SDK patterns.
 */
export class PACOBuilderAgent {
  private accountId: string
  private model: string
  private cwd: string
  private systemPrompt: string

  constructor(options: BuilderAgentOptions) {
    this.accountId = options.accountId
    this.model = options.model || 'claude-sonnet-4-20250514'
    this.cwd = options.cwd || process.cwd()
    this.systemPrompt = loadSystemPrompt()
  }

  /**
   * Query the builder agent with a prompt.
   * Returns an async generator of messages.
   *
   * Uses the Claude Agent SDK query() function which:
   * - Manages the agentic loop automatically
   * - Executes tools through MCP
   * - Handles retries and context management
   */
  async *query(prompt: string): AsyncGenerator<BuilderMessage> {
    // Build MCP server config for the builder tools
    const mcpServerConfig = {
      type: 'stdio' as const,
      command: 'node',
      args: [path.join(__dirname, 'mcp-server.js'), this.accountId],
    }

    // Query using Claude Agent SDK
    // The SDK handles the agentic loop: prompt → tool calls → results → repeat
    for await (const message of query({
      prompt,
      options: {
        model: this.model,
        systemPrompt: this.systemPrompt,
        cwd: this.cwd,
        mcpServers: {
          builder: mcpServerConfig,
        },
        allowedTools: [
          // All builder tools via MCP
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
        permissionMode: 'acceptEdits',
        maxTurns: 50,
      },
    })) {
      // Convert SDK messages to our BuilderMessage format
      yield* this.processMessage(message)
    }
  }

  /**
   * Process SDK messages into BuilderMessage format
   */
  private *processMessage(message: SDKMessage): Generator<BuilderMessage> {
    if (message.type === 'assistant') {
      const apiMessage = message.message
      if ('content' in apiMessage && Array.isArray(apiMessage.content)) {
        for (const block of apiMessage.content) {
          if ('type' in block) {
            if (block.type === 'text' && 'text' in block) {
              yield { type: 'text', content: block.text as string }
            } else if (block.type === 'tool_use' && 'name' in block) {
              yield {
                type: 'tool_use',
                content: `Calling ${block.name}`,
                toolName: block.name as string,
                toolInput: ('input' in block ? block.input : {}) as Record<string, unknown>,
                toolUseId: ('id' in block ? block.id : undefined) as string | undefined,
              }
            }
          }
        }
      }
    } else if (message.type === 'result') {
      yield {
        type: 'status',
        content: `Completed: ${message.subtype}`,
      }
    }
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Create a PACO Builder Agent session.
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

// ============================================
// MCP SERVER ENTRY POINT
// ============================================

/**
 * Run as standalone MCP server.
 * This is invoked by the Claude Agent SDK when it needs builder tools.
 */
export async function runMcpServer(accountId: string) {
  const server = createBuilderMcpServer(accountId)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// If run directly, start MCP server
if (require.main === module) {
  const accountId = process.argv[2] || 'default'
  runMcpServer(accountId).catch(console.error)
}
