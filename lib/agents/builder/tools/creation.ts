/**
 * PACO Builder Agent - Creation Tools
 * 
 * Tools for creating and configuring agents
 */

import { z } from 'zod'

// ============================================
// SCHEMAS
// ============================================

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  type: z.enum(['customer', 'ticket_intel', 'copilot', 'custom']),
  status: z.enum(['draft', 'sandbox', 'beta', 'production']),
  version: z.string(),
  persona: z.object({
    systemPrompt: z.string(),
    language: z.string(),
    formality: z.enum(['formal', 'casual', 'adaptive']),
    traits: z.array(z.string()),
  }).optional(),
  tools: z.array(z.string()),
  skills: z.array(z.string()),
  workflows: z.array(z.string()),
  guardrails: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const PersonaSchema = z.object({
  systemPrompt: z.string(),
  language: z.string().default('es-MX'),
  formality: z.enum(['formal', 'casual', 'adaptive']).default('adaptive'),
  traits: z.array(z.string()),
})

// ============================================
// TOOL DEFINITIONS
// ============================================

export const creationTools = [
  {
    name: 'create_agent',
    description: 'Initialize a new agent with basic metadata. This creates a draft agent that can be configured with tools, skills, and workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Display name for the agent (e.g., "María")',
        },
        description: {
          type: 'string',
          description: 'Brief description of what the agent does',
        },
        type: {
          type: 'string',
          enum: ['customer', 'ticket_intel', 'copilot', 'custom'],
          description: 'Agent type: customer (external-facing), ticket_intel (routing/classification), copilot (admin), custom',
        },
        from_template: {
          type: 'string',
          description: 'Optional template ID to use as starting point',
        },
      },
      required: ['name', 'type'],
    },
  },

  {
    name: 'set_persona',
    description: 'Define the agent\'s personality, communication style, and system prompt. This shapes how the agent interacts with users.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to configure',
        },
        system_prompt: {
          type: 'string',
          description: 'The system prompt that defines the agent\'s behavior and instructions',
        },
        personality_traits: {
          type: 'array',
          items: { type: 'string' },
          description: 'Personality traits (e.g., ["empathetic", "professional", "helpful"])',
        },
        language: {
          type: 'string',
          description: 'Primary language code (e.g., "es-MX" for Mexican Spanish). Default: es-MX',
        },
        formality: {
          type: 'string',
          enum: ['formal', 'casual', 'adaptive'],
          description: 'Communication formality level. Adaptive adjusts based on user. Default: adaptive',
        },
      },
      required: ['agent_id', 'system_prompt'],
    },
  },

  {
    name: 'add_tool_to_agent',
    description: 'Attach a tool to an agent. Tools give agents the ability to perform actions like creating tickets, querying databases, or calling APIs.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        tool_id: {
          type: 'string',
          description: 'The tool ID (format: connector.tool_name, e.g., "agora.create_ticket")',
        },
        config: {
          type: 'object',
          description: 'Tool-specific configuration overrides',
        },
        required_fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields the agent must collect before using this tool',
        },
        auto_execute: {
          type: 'boolean',
          description: 'Execute without user confirmation. Default: false',
        },
        description_override: {
          type: 'string',
          description: 'Custom description for this tool in this agent\'s context',
        },
      },
      required: ['agent_id', 'tool_id'],
    },
  },

  {
    name: 'remove_tool_from_agent',
    description: 'Remove a tool from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        tool_id: {
          type: 'string',
          description: 'The tool ID to remove',
        },
      },
      required: ['agent_id', 'tool_id'],
    },
  },

  {
    name: 'add_skill_to_agent',
    description: 'Attach a skill (behavior/prompt enhancement) to an agent. Skills modify how the agent behaves or responds.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        skill_id: {
          type: 'string',
          description: 'The skill ID to attach',
        },
        priority: {
          type: 'number',
          description: 'Priority order (higher = applied first). Default: 0',
        },
        config: {
          type: 'object',
          description: 'Skill-specific configuration',
        },
      },
      required: ['agent_id', 'skill_id'],
    },
  },

  {
    name: 'remove_skill_from_agent',
    description: 'Remove a skill from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        skill_id: {
          type: 'string',
          description: 'The skill ID to remove',
        },
      },
      required: ['agent_id', 'skill_id'],
    },
  },

  {
    name: 'add_knowledge_base',
    description: 'Add a knowledge base the agent can reference. Knowledge bases provide context and information the agent can use to answer questions.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        name: {
          type: 'string',
          description: 'Name of the knowledge base',
        },
        type: {
          type: 'string',
          enum: ['faq', 'procedures', 'policies', 'catalog', 'custom'],
          description: 'Type of knowledge base',
        },
        content: {
          type: 'string',
          description: 'Content in Markdown format, or JSON for structured data',
        },
        source_url: {
          type: 'string',
          description: 'Optional URL to sync content from',
        },
      },
      required: ['agent_id', 'name', 'type', 'content'],
    },
  },

  {
    name: 'get_agent_preview',
    description: 'Get the current state of an agent being built. Returns a summary of persona, tools, skills, workflows, and guardrails.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'update_agent',
    description: 'Update basic agent metadata (name, description).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'delete_agent',
    description: 'Delete a draft agent. Only works for agents in draft status.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['agent_id', 'confirm'],
    },
  },
]

// ============================================
// TYPE EXPORTS
// ============================================

export type CreationToolName =
  | 'create_agent'
  | 'set_persona'
  | 'add_tool_to_agent'
  | 'remove_tool_from_agent'
  | 'add_skill_to_agent'
  | 'remove_skill_from_agent'
  | 'add_knowledge_base'
  | 'get_agent_preview'
  | 'update_agent'
  | 'delete_agent'

export type Agent = z.infer<typeof AgentSchema>
export type Persona = z.infer<typeof PersonaSchema>
