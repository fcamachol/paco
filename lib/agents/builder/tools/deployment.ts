/**
 * PACO Builder Agent - Deployment Tools
 * 
 * Tools for deploying agents to environments
 */

import { z } from 'zod'

// ============================================
// SCHEMAS
// ============================================

export const DeploymentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentVersionId: z.string(),
  environment: z.enum(['sandbox', 'beta', 'production']),
  status: z.enum(['pending', 'deploying', 'active', 'failed', 'stopped']),
  channels: z.array(z.enum(['web', 'whatsapp', 'telegram', 'api', 'chatwoot'])),
  url: z.string().optional(),
  config: z.object({
    maxConcurrentUsers: z.number().optional(),
    rateLimits: z.record(z.number()).optional(),
    features: z.record(z.boolean()).optional(),
  }).optional(),
  deployedAt: z.string(),
  deployedBy: z.string(),
})

export const AgentVersionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  version: z.string(),
  name: z.string(),
  notes: z.string().optional(),
  snapshot: z.record(z.any()), // Full agent config at this version
  createdAt: z.string(),
  createdBy: z.string(),
})

export const ChannelConfigSchema = z.object({
  channel: z.enum(['web', 'whatsapp', 'telegram', 'api', 'chatwoot']),
  enabled: z.boolean(),
  config: z.record(z.any()),
})

// ============================================
// TOOL DEFINITIONS
// ============================================

export const deploymentTools = [
  {
    name: 'deploy_agent',
    description: 'Deploy an agent to a specific environment and channel(s). Always deploy to sandbox first.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to deploy',
        },
        environment: {
          type: 'string',
          enum: ['sandbox', 'beta', 'production'],
          description: `
            - sandbox: For testing, no real users
            - beta: Limited real users, for validation
            - production: Full deployment
          `,
        },
        channels: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['web', 'whatsapp', 'telegram', 'api', 'chatwoot'],
          },
          description: 'Channels to deploy to. Default: ["web"]',
        },
        version_name: {
          type: 'string',
          description: 'Optional version name for this deployment',
        },
        notes: {
          type: 'string',
          description: 'Deployment notes',
        },
      },
      required: ['agent_id', 'environment'],
    },
  },

  {
    name: 'promote_agent',
    description: 'Promote an agent from one environment to the next (sandbox→beta→production).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        from_environment: {
          type: 'string',
          enum: ['sandbox', 'beta'],
          description: 'Current environment',
        },
        to_environment: {
          type: 'string',
          enum: ['beta', 'production'],
          description: 'Target environment',
        },
        run_tests: {
          type: 'boolean',
          description: 'Run test suite before promoting. Default: true',
        },
      },
      required: ['agent_id', 'from_environment', 'to_environment'],
    },
  },

  {
    name: 'rollback_agent',
    description: 'Rollback an agent deployment to a previous version.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        environment: {
          type: 'string',
          enum: ['sandbox', 'beta', 'production'],
          description: 'Environment to rollback',
        },
        version_id: {
          type: 'string',
          description: 'Optional specific version to rollback to. Default: previous version',
        },
        reason: {
          type: 'string',
          description: 'Reason for rollback',
        },
      },
      required: ['agent_id', 'environment'],
    },
  },

  {
    name: 'stop_deployment',
    description: 'Stop an active deployment (take agent offline).',
    inputSchema: {
      type: 'object',
      properties: {
        deployment_id: {
          type: 'string',
          description: 'The deployment ID to stop',
        },
        reason: {
          type: 'string',
          description: 'Reason for stopping',
        },
      },
      required: ['deployment_id'],
    },
  },

  {
    name: 'create_agent_version',
    description: 'Create a versioned snapshot of the current agent configuration. Useful before making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        version_name: {
          type: 'string',
          description: 'Version name (e.g., "v1.0.0", "pre-update")',
        },
        notes: {
          type: 'string',
          description: 'Version notes describing what this version includes',
        },
      },
      required: ['agent_id', 'version_name'],
    },
  },

  {
    name: 'list_agent_versions',
    description: 'List all versions of an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        limit: {
          type: 'number',
          description: 'Max versions to return. Default: 10',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'restore_agent_version',
    description: 'Restore an agent to a previous version (without deploying).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        version_id: {
          type: 'string',
          description: 'Version ID to restore',
        },
      },
      required: ['agent_id', 'version_id'],
    },
  },

  {
    name: 'get_deployment_status',
    description: 'Get the current deployment status of an agent across all environments.',
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
    name: 'configure_channel',
    description: 'Configure settings for a specific deployment channel.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        channel: {
          type: 'string',
          enum: ['web', 'whatsapp', 'telegram', 'api', 'chatwoot'],
          description: 'Channel to configure',
        },
        config: {
          type: 'object',
          properties: {
            welcome_message: { type: 'string' },
            fallback_message: { type: 'string' },
            typing_indicator: { type: 'boolean' },
            response_delay_ms: { type: 'number' },
            max_message_length: { type: 'number' },
          },
          description: 'Channel-specific configuration',
        },
      },
      required: ['agent_id', 'channel', 'config'],
    },
  },

  {
    name: 'get_deployment_url',
    description: 'Get the URL/endpoint for accessing a deployed agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        environment: {
          type: 'string',
          enum: ['sandbox', 'beta', 'production'],
          description: 'Environment',
        },
        channel: {
          type: 'string',
          enum: ['web', 'api'],
          description: 'Channel. Default: web',
        },
      },
      required: ['agent_id', 'environment'],
    },
  },

  {
    name: 'export_agent',
    description: 'Export agent configuration as JSON for backup or sharing.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        include_secrets: {
          type: 'boolean',
          description: 'Include API keys and credentials (encrypted). Default: false',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'import_agent',
    description: 'Import an agent from exported JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Agent configuration JSON',
        },
        name_override: {
          type: 'string',
          description: 'Optional new name for imported agent',
        },
      },
      required: ['config'],
    },
  },

  {
    name: 'clone_agent',
    description: 'Create a copy of an existing agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent ID to clone',
        },
        new_name: {
          type: 'string',
          description: 'Name for the cloned agent',
        },
      },
      required: ['agent_id', 'new_name'],
    },
  },
]

// ============================================
// TYPE EXPORTS
// ============================================

export type DeploymentToolName =
  | 'deploy_agent'
  | 'promote_agent'
  | 'rollback_agent'
  | 'stop_deployment'
  | 'create_agent_version'
  | 'list_agent_versions'
  | 'restore_agent_version'
  | 'get_deployment_status'
  | 'configure_channel'
  | 'get_deployment_url'
  | 'export_agent'
  | 'import_agent'
  | 'clone_agent'

export type Deployment = z.infer<typeof DeploymentSchema>
export type AgentVersion = z.infer<typeof AgentVersionSchema>
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>
