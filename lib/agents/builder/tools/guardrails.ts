/**
 * PACO Builder Agent - Guardrail Tools
 * 
 * Tools for setting up safety rules and escalation
 */

import { z } from 'zod'

// ============================================
// SCHEMAS
// ============================================

export const GuardrailSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  type: z.enum(['block', 'escalate', 'warn', 'require_approval', 'transform']),
  trigger: z.string(), // condition expression
  action: z.string(),
  message: z.string().optional(),
  isActive: z.boolean().default(true),
  priority: z.number().default(0),
})

export const EscalationRuleSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  condition: z.string(),
  action: z.enum(['transfer_to_human', 'transfer_to_agent', 'create_ticket', 'notify']),
  target: z.string().optional(), // human queue, agent id, etc.
  message: z.string().optional(),
  cooldown: z.number().optional(), // seconds before can trigger again
})

// ============================================
// TOOL DEFINITIONS
// ============================================

export const guardrailTools = [
  {
    name: 'add_guardrail',
    description: 'Add a safety guardrail to an agent. Guardrails prevent unwanted behaviors and protect users.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        name: {
          type: 'string',
          description: 'Guardrail name (e.g., "no_legal_advice")',
        },
        type: {
          type: 'string',
          enum: ['block', 'escalate', 'warn', 'require_approval', 'transform'],
          description: `
            - block: Refuse to perform action, show message
            - escalate: Transfer to human or another agent
            - warn: Allow but log/alert
            - require_approval: Pause until human approves
            - transform: Modify the output before sending
          `,
        },
        trigger: {
          type: 'string',
          description: `Condition that activates this guardrail. Examples:
            - "intent:legal_advice"
            - "keywords:abogado,demanda,lawsuit"
            - "sentiment:very_negative"
            - "tool:delete_account"
            - "amount:>1000"
            - "pattern:SSN" (regex patterns)
          `,
        },
        action: {
          type: 'string',
          description: 'What to do when triggered (depends on type)',
        },
        message: {
          type: 'string',
          description: 'Message to show user (for block/escalate types)',
        },
        priority: {
          type: 'number',
          description: 'Priority order (higher = checked first). Default: 0',
        },
      },
      required: ['agent_id', 'name', 'type', 'trigger', 'action'],
    },
  },

  {
    name: 'update_guardrail',
    description: 'Update an existing guardrail.',
    inputSchema: {
      type: 'object',
      properties: {
        guardrail_id: {
          type: 'string',
          description: 'The guardrail ID',
        },
        trigger: {
          type: 'string',
          description: 'New trigger condition',
        },
        action: {
          type: 'string',
          description: 'New action',
        },
        message: {
          type: 'string',
          description: 'New message',
        },
        is_active: {
          type: 'boolean',
          description: 'Enable/disable guardrail',
        },
      },
      required: ['guardrail_id'],
    },
  },

  {
    name: 'delete_guardrail',
    description: 'Delete a guardrail from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        guardrail_id: {
          type: 'string',
          description: 'The guardrail ID to delete',
        },
      },
      required: ['guardrail_id'],
    },
  },

  {
    name: 'list_guardrails',
    description: 'List all guardrails for an agent.',
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
    name: 'set_escalation_rules',
    description: 'Define comprehensive escalation rules for when and how to hand off to humans or other agents.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Rule name' },
              condition: {
                type: 'string',
                description: `When to escalate. Examples:
                  - "user_requests" (user asks to speak to human)
                  - "keywords:supervisor,manager,encargado"
                  - "sentiment:angry"
                  - "failed_attempts:3" (after 3 failed tool calls)
                  - "no_progress:5" (5 turns with no resolution)
                  - "outside_hours" (outside business hours)
                `,
              },
              action: {
                type: 'string',
                enum: ['transfer_to_human', 'transfer_to_agent', 'create_ticket', 'notify'],
              },
              target: {
                type: 'string',
                description: 'Target queue, agent ID, or notification channel',
              },
              message: {
                type: 'string',
                description: 'Message to show user when escalating',
              },
            },
          },
          description: 'List of escalation rules',
        },
      },
      required: ['agent_id', 'rules'],
    },
  },

  {
    name: 'add_content_filter',
    description: 'Add content filtering to prevent sensitive data exposure.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        filter_type: {
          type: 'string',
          enum: ['pii', 'profanity', 'custom'],
          description: 'Type of content to filter',
        },
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'For custom: regex patterns to match',
        },
        action: {
          type: 'string',
          enum: ['redact', 'block', 'warn'],
          description: 'What to do with matching content',
        },
        replacement: {
          type: 'string',
          description: 'For redact: what to replace with (e.g., "[REDACTED]")',
        },
      },
      required: ['agent_id', 'filter_type', 'action'],
    },
  },

  {
    name: 'set_rate_limits',
    description: 'Set rate limits for agent actions to prevent abuse.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        limits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['user', 'conversation', 'global'],
              },
              target: {
                type: 'string',
                description: 'What to limit: "messages", "tool:create_ticket", "escalations"',
              },
              max_count: { type: 'number' },
              window_seconds: { type: 'number' },
              on_exceed: {
                type: 'string',
                enum: ['block', 'escalate', 'warn'],
              },
            },
          },
          description: 'Rate limit rules',
        },
      },
      required: ['agent_id', 'limits'],
    },
  },

  {
    name: 'add_output_validator',
    description: 'Add validation rules for agent outputs before they are sent to users.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        name: {
          type: 'string',
          description: 'Validator name',
        },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              check: {
                type: 'string',
                description: 'What to check: "max_length", "no_hallucination", "factual", "tone"',
              },
              params: { type: 'object' },
              on_fail: { type: 'string', enum: ['retry', 'escalate', 'warn'] },
            },
          },
        },
      },
      required: ['agent_id', 'name', 'rules'],
    },
  },

  {
    name: 'set_prohibited_topics',
    description: 'Define topics the agent should never discuss.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              keywords: {
                type: 'array',
                items: { type: 'string' },
              },
              response: {
                type: 'string',
                description: 'What to say when topic is detected',
              },
            },
          },
          description: 'List of prohibited topics',
        },
      },
      required: ['agent_id', 'topics'],
    },
  },
]

// ============================================
// TYPE EXPORTS
// ============================================

export type GuardrailToolName =
  | 'add_guardrail'
  | 'update_guardrail'
  | 'delete_guardrail'
  | 'list_guardrails'
  | 'set_escalation_rules'
  | 'add_content_filter'
  | 'set_rate_limits'
  | 'add_output_validator'
  | 'set_prohibited_topics'

export type Guardrail = z.infer<typeof GuardrailSchema>
export type EscalationRule = z.infer<typeof EscalationRuleSchema>
