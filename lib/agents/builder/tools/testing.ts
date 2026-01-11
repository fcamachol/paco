/**
 * PACO Builder Agent - Testing Tools
 * 
 * Tools for validating and testing agents
 */

import { z } from 'zod'

// ============================================
// SCHEMAS
// ============================================

export const SimulationResultSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  scenario: z.string(),
  status: z.enum(['passed', 'failed', 'error']),
  turns: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    toolCalls: z.array(z.object({
      name: z.string(),
      params: z.record(z.any()),
      result: z.any(),
      status: z.enum(['success', 'error']),
    })).optional(),
  })),
  outcome: z.object({
    expected: z.string().optional(),
    actual: z.string(),
    match: z.boolean(),
  }),
  metrics: z.object({
    turns: z.number(),
    toolCalls: z.number(),
    tokens: z.number(),
    latencyMs: z.number(),
  }),
  errors: z.array(z.string()).optional(),
})

export const ValidationResultSchema = z.object({
  agentId: z.string(),
  status: z.enum(['valid', 'invalid', 'warnings']),
  checks: z.array(z.object({
    name: z.string(),
    status: z.enum(['passed', 'failed', 'warning']),
    message: z.string(),
  })),
  summary: z.string(),
})

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  scenario: z.string(),
  expectedOutcome: z.string(),
  tags: z.array(z.string()).optional(),
})

export const TestResultsSchema = z.object({
  agentId: z.string(),
  totalTests: z.number(),
  passed: z.number(),
  failed: z.number(),
  errors: z.number(),
  results: z.array(z.object({
    testId: z.string(),
    name: z.string(),
    status: z.enum(['passed', 'failed', 'error']),
    message: z.string().optional(),
    duration: z.number(),
  })),
  coverage: z.object({
    workflows: z.number(),
    intents: z.number(),
    guardrails: z.number(),
  }),
})

// ============================================
// TOOL DEFINITIONS
// ============================================

export const testingTools = [
  {
    name: 'simulate_conversation',
    description: 'Run a simulated conversation with the agent to test how it handles a specific scenario. The simulation uses a test user that follows the scenario.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to test',
        },
        scenario: {
          type: 'string',
          description: 'Description of the test scenario (e.g., "User reports a water leak at Av. Universidad 123")',
        },
        expected_outcome: {
          type: 'string',
          description: 'Optional expected outcome (e.g., "Ticket created with category FUG")',
        },
        max_turns: {
          type: 'number',
          description: 'Maximum conversation turns before stopping. Default: 10',
        },
        user_personality: {
          type: 'string',
          enum: ['cooperative', 'confused', 'impatient', 'angry', 'random'],
          description: 'How the simulated user behaves. Default: cooperative',
        },
      },
      required: ['agent_id', 'scenario'],
    },
  },

  {
    name: 'validate_agent',
    description: 'Run comprehensive validation on an agent\'s configuration. Checks for completeness, consistency, and best practices.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to validate',
        },
        checks: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'required_tools',      // Has minimum required tools
              'workflow_complete',   // All workflows have proper endings
              'intent_coverage',     // All intents have workflows
              'guardrails_exist',    // Has at least one guardrail
              'escalation_exists',   // Has escalation rules
              'no_orphan_states',    // State machine has no dead ends
              'prompt_quality',      // System prompt is well-structured
              'tool_permissions',    // All tools are properly configured
            ],
          },
          description: 'Specific checks to run. Default: all',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'run_test_suite',
    description: 'Run a comprehensive test suite against the agent. Auto-generates test cases if none provided.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to test',
        },
        test_cases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              scenario: { type: 'string' },
              expected_outcome: { type: 'string' },
            },
          },
          description: 'Optional list of test cases. If not provided, tests are auto-generated from workflows and intents.',
        },
        include_edge_cases: {
          type: 'boolean',
          description: 'Generate edge case tests (angry users, invalid inputs, etc.). Default: true',
        },
        include_guardrail_tests: {
          type: 'boolean',
          description: 'Test that guardrails trigger correctly. Default: true',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'test_single_intent',
    description: 'Test how well the agent recognizes a specific intent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        intent_name: {
          type: 'string',
          description: 'Intent to test',
        },
        test_phrases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional test phrases. If not provided, variations are auto-generated.',
        },
      },
      required: ['agent_id', 'intent_name'],
    },
  },

  {
    name: 'test_workflow',
    description: 'Run through a specific workflow with various inputs to verify it works correctly.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: {
          type: 'string',
          description: 'The workflow ID to test',
        },
        input_variations: {
          type: 'array',
          items: {
            type: 'object',
            description: 'Field values to test with',
          },
          description: 'Different input combinations to test',
        },
      },
      required: ['workflow_id'],
    },
  },

  {
    name: 'test_guardrail',
    description: 'Test that a specific guardrail triggers correctly.',
    inputSchema: {
      type: 'object',
      properties: {
        guardrail_id: {
          type: 'string',
          description: 'The guardrail ID to test',
        },
        test_inputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Inputs that should trigger the guardrail',
        },
        negative_inputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Inputs that should NOT trigger the guardrail',
        },
      },
      required: ['guardrail_id'],
    },
  },

  {
    name: 'benchmark_agent',
    description: 'Run performance benchmarks on the agent (latency, token usage, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to benchmark',
        },
        num_conversations: {
          type: 'number',
          description: 'Number of conversations to simulate. Default: 10',
        },
        scenarios: {
          type: 'array',
          items: { type: 'string' },
          description: 'Scenarios to test. Default: auto-generated',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'compare_agents',
    description: 'Compare two agent versions or configurations.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_a_id: {
          type: 'string',
          description: 'First agent ID',
        },
        agent_b_id: {
          type: 'string',
          description: 'Second agent ID',
        },
        scenarios: {
          type: 'array',
          items: { type: 'string' },
          description: 'Scenarios to compare on',
        },
      },
      required: ['agent_a_id', 'agent_b_id'],
    },
  },

  {
    name: 'get_test_report',
    description: 'Get a comprehensive test report for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        format: {
          type: 'string',
          enum: ['summary', 'detailed', 'json'],
          description: 'Report format. Default: summary',
        },
      },
      required: ['agent_id'],
    },
  },

  {
    name: 'create_test_case',
    description: 'Create a reusable test case for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID',
        },
        name: {
          type: 'string',
          description: 'Test case name',
        },
        scenario: {
          type: 'string',
          description: 'Test scenario description',
        },
        expected_outcome: {
          type: 'string',
          description: 'Expected outcome',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for organizing tests (e.g., ["happy_path", "leak_report"])',
        },
      },
      required: ['agent_id', 'name', 'scenario', 'expected_outcome'],
    },
  },
]

// ============================================
// TYPE EXPORTS
// ============================================

export type TestingToolName =
  | 'simulate_conversation'
  | 'validate_agent'
  | 'run_test_suite'
  | 'test_single_intent'
  | 'test_workflow'
  | 'test_guardrail'
  | 'benchmark_agent'
  | 'compare_agents'
  | 'get_test_report'
  | 'create_test_case'

export type SimulationResult = z.infer<typeof SimulationResultSchema>
export type ValidationResult = z.infer<typeof ValidationResultSchema>
export type TestCase = z.infer<typeof TestCaseSchema>
export type TestResults = z.infer<typeof TestResultsSchema>
