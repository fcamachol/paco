/**
 * PACO Builder Agent - Discovery Tools
 * 
 * Tools for discovering available resources (connectors, tools, skills)
 */

import { z } from 'zod'

// ============================================
// SCHEMAS
// ============================================

export const ConnectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  type: z.enum(['rest', 'soap', 'database', 'mcp']),
  status: z.enum(['connected', 'pending', 'error']),
  toolCount: z.number(),
  endpoint: z.string().optional(),
})

export const DiscoveredToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  connectorId: z.string(),
  inputSchema: z.record(z.string(), z.any()),
  outputSchema: z.record(z.string(), z.any()).optional(),
})

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  type: z.enum(['prompt', 'behavior', 'guard', 'composite']),
  category: z.string(),
})

export const AgentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['customer', 'ticket_intel', 'copilot', 'custom']),
  toolCount: z.number(),
  skillCount: z.number(),
})

// ============================================
// TOOL DEFINITIONS
// ============================================

export const discoveryTools = [
  {
    name: 'list_connectors',
    description: 'List all available data source connectors for this account. Returns connectors with their status and available tool count.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['connected', 'pending', 'error', 'all'],
          description: 'Filter by connection status. Default: all',
        },
        type: {
          type: 'string', 
          enum: ['rest', 'soap', 'database', 'mcp', 'all'],
          description: 'Filter by connector type. Default: all',
        },
      },
      required: [],
    },
  },

  {
    name: 'discover_tools',
    description: 'Discover available tools from a connector by auto-introspecting the API, database schema, or MCP server. Returns tools that can be attached to agents.',
    inputSchema: {
      type: 'object',
      properties: {
        connector_id: {
          type: 'string',
          description: 'The connector ID to discover tools from',
        },
        refresh: {
          type: 'boolean',
          description: 'Force refresh discovery (re-introspect). Default: false',
        },
      },
      required: ['connector_id'],
    },
  },

  {
    name: 'list_skills',
    description: 'List available skills (reusable behaviors, prompts, guards) that can be attached to agents.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['tone', 'language', 'safety', 'domain', 'government', 'all'],
          description: 'Filter by skill category. Default: all',
        },
        type: {
          type: 'string',
          enum: ['prompt', 'behavior', 'guard', 'composite', 'all'],
          description: 'Filter by skill type. Default: all',
        },
        include_public: {
          type: 'boolean',
          description: 'Include public/system skills. Default: true',
        },
      },
      required: [],
    },
  },

  {
    name: 'search_agent_templates',
    description: 'Search for similar agent templates that can be used as a starting point. Templates are pre-configured agents for common use cases.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "customer service", "ticket routing")',
        },
        type: {
          type: 'string',
          enum: ['customer', 'ticket_intel', 'copilot', 'custom', 'all'],
          description: 'Filter by agent type. Default: all',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'get_connector_schema',
    description: 'Get the full schema of a connector including all endpoints, tables, or available operations. Useful for understanding what data and actions are available.',
    inputSchema: {
      type: 'object',
      properties: {
        connector_id: {
          type: 'string',
          description: 'The connector ID to get schema for',
        },
        include_examples: {
          type: 'boolean',
          description: 'Include example requests/responses. Default: false',
        },
      },
      required: ['connector_id'],
    },
  },

  {
    name: 'get_tool_details',
    description: 'Get detailed information about a specific tool including its full input/output schema and usage examples.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_id: {
          type: 'string',
          description: 'The tool ID (format: connector.tool_name)',
        },
      },
      required: ['tool_id'],
    },
  },

  {
    name: 'get_skill_details',
    description: 'Get detailed information about a specific skill including its definition and how it modifies agent behavior.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'The skill ID',
        },
      },
      required: ['skill_id'],
    },
  },
]

// ============================================
// TOOL HANDLERS (to be implemented)
// ============================================

export type DiscoveryToolName = 
  | 'list_connectors'
  | 'discover_tools'
  | 'list_skills'
  | 'search_agent_templates'
  | 'get_connector_schema'
  | 'get_tool_details'
  | 'get_skill_details'

export interface DiscoveryToolHandlers {
  list_connectors: (params: { status?: string; type?: string }) => Promise<z.infer<typeof ConnectorSchema>[]>
  discover_tools: (params: { connector_id: string; refresh?: boolean }) => Promise<z.infer<typeof DiscoveredToolSchema>[]>
  list_skills: (params: { category?: string; type?: string; include_public?: boolean }) => Promise<z.infer<typeof SkillSchema>[]>
  search_agent_templates: (params: { query: string; type?: string }) => Promise<z.infer<typeof AgentTemplateSchema>[]>
  get_connector_schema: (params: { connector_id: string; include_examples?: boolean }) => Promise<Record<string, any>>
  get_tool_details: (params: { tool_id: string }) => Promise<z.infer<typeof DiscoveredToolSchema> & { examples?: any[] }>
  get_skill_details: (params: { skill_id: string }) => Promise<z.infer<typeof SkillSchema> & { definition: any }>
}
