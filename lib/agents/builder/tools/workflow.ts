/**
 * PACO Builder Agent - Workflow Tools
 * 
 * Tools for defining conversation workflows and state machines
 */

import { z } from 'zod'

// ============================================
// SCHEMAS
// ============================================

export const WorkflowStepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('collect_field'),
    field: z.string(),
    prompt: z.string(),
    required: z.boolean().default(true),
    validation: z.string().optional(), // regex or validation type
  }),
  z.object({
    type: z.literal('call_tool'),
    tool: z.string(),
    params: z.record(z.string(), z.any()),
    store_result: z.string().optional(), // variable name to store result
  }),
  z.object({
    type: z.literal('conditional'),
    condition: z.string(), // expression to evaluate
    if_true: z.array(z.any()), // steps if true
    if_false: z.array(z.any()).optional(), // steps if false
  }),
  z.object({
    type: z.literal('respond'),
    message: z.string(), // can include {variables}
  }),
  z.object({
    type: z.literal('confirm'),
    message: z.string(),
    on_reject: z.string().optional(), // what to do if user says no
  }),
  z.object({
    type: z.literal('escalate'),
    reason: z.string(),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal('end'),
    message: z.string().optional(),
  }),
])

export const WorkflowSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  trigger: z.string(), // "intent:xxx" or "keyword:xxx" or "always"
  steps: z.array(WorkflowStepSchema),
  isActive: z.boolean().default(true),
})

export const IntentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  slug: z.string(),
  examples: z.array(z.string()),
  workflowId: z.string().optional(),
})

export const StateSchema = z.object({
  name: z.string(),
  onEnter: z.array(z.any()).optional(),
  onExit: z.array(z.any()).optional(),
})

export const TransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  trigger: z.string(),
  condition: z.string().optional(),
})

// ============================================
// TOOL DEFINITIONS
// ============================================

export const workflowTools = [
  {
    name: 'create_workflow',
    description: 'Create a conversation workflow that defines how the agent handles a specific type of request. Workflows are triggered by intents or keywords.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        name: {
          type: 'string',
          description: 'Workflow name (e.g., "leak_report", "balance_inquiry")',
        },
        description: {
          type: 'string',
          description: 'What this workflow handles',
        },
        trigger: {
          type: 'string',
          description: 'Trigger condition: "intent:report_leak" or "keyword:fuga" or "always"',
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['collect_field', 'call_tool', 'conditional', 'respond', 'confirm', 'escalate', 'end'],
              },
            },
          },
          description: 'Ordered list of workflow steps',
        },
      },
      required: ['agent_id', 'name', 'trigger', 'steps'],
    },
  },

  {
    name: 'update_workflow',
    description: 'Update an existing workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'The workflow ID',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        trigger: {
          type: 'string',
          description: 'New trigger',
        },
        steps: {
          type: 'array',
          description: 'New steps (replaces all existing)',
        },
        is_active: {
          type: 'boolean',
          description: 'Enable/disable workflow',
        },
      },
      required: ['workflow_id'],
    },
  },

  {
    name: 'delete_workflow',
    description: 'Delete a workflow from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'The workflow ID to delete',
        },
      },
      required: ['workflow_id'],
    },
  },

  {
    name: 'add_intent',
    description: 'Add an intent that the agent should recognize. Intents are user intentions detected from their messages.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        intent_name: {
          type: 'string',
          description: 'Intent identifier (e.g., "report_leak", "check_balance")',
        },
        examples: {
          type: 'array',
          items: { type: 'string' },
          description: 'Example phrases that indicate this intent (5-10 recommended)',
        },
        workflow_id: {
          type: 'string',
          description: 'Optional workflow ID to trigger when this intent is detected',
        },
      },
      required: ['agent_id', 'intent_name', 'examples'],
    },
  },

  {
    name: 'update_intent',
    description: 'Update intent examples or linked workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        intent_id: {
          type: 'string',
          description: 'The intent ID',
        },
        examples: {
          type: 'array',
          items: { type: 'string' },
          description: 'New examples (replaces existing)',
        },
        workflow_id: {
          type: 'string',
          description: 'New workflow to trigger',
        },
      },
      required: ['intent_id'],
    },
  },

  {
    name: 'delete_intent',
    description: 'Delete an intent from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        intent_id: {
          type: 'string',
          description: 'The intent ID to delete',
        },
      },
      required: ['intent_id'],
    },
  },

  {
    name: 'define_state_machine',
    description: 'Define a state machine for complex multi-turn conversations. Use this for flows that need explicit state tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        name: {
          type: 'string',
          description: 'State machine name',
        },
        initial_state: {
          type: 'string',
          description: 'Starting state name',
        },
        states: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              on_enter: { type: 'array', description: 'Actions when entering state' },
              on_exit: { type: 'array', description: 'Actions when leaving state' },
            },
          },
          description: 'List of states',
        },
        transitions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              trigger: { type: 'string' },
              condition: { type: 'string' },
            },
          },
          description: 'State transitions',
        },
      },
      required: ['agent_id', 'name', 'initial_state', 'states', 'transitions'],
    },
  },

  {
    name: 'add_category_mapping',
    description: 'Map user intents to ticket categories with required fields. Used for ticket-creating agents.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        intent: {
          type: 'string',
          description: 'Intent name to map',
        },
        category_id: {
          type: 'string',
          description: 'Ticket category ID (e.g., "FUG" for fugas)',
        },
        required_fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields agent must collect before creating ticket',
        },
        auto_values: {
          type: 'object',
          description: 'Fields to auto-fill (e.g., {"priority": 2})',
        },
      },
      required: ['agent_id', 'intent', 'category_id', 'required_fields'],
    },
  },

  {
    name: 'list_workflows',
    description: 'List all workflows for an agent.',
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
    name: 'list_intents',
    description: 'List all intents for an agent.',
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
    name: 'get_workflow_diagram',
    description: 'Get a visual representation of a workflow as Mermaid diagram.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'The workflow ID',
        },
      },
      required: ['workflow_id'],
    },
  },
]

// ============================================
// TYPE EXPORTS
// ============================================

export type WorkflowToolName =
  | 'create_workflow'
  | 'update_workflow'
  | 'delete_workflow'
  | 'add_intent'
  | 'update_intent'
  | 'delete_intent'
  | 'define_state_machine'
  | 'add_category_mapping'
  | 'list_workflows'
  | 'list_intents'
  | 'get_workflow_diagram'

export type Workflow = z.infer<typeof WorkflowSchema>
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>
export type Intent = z.infer<typeof IntentSchema>
