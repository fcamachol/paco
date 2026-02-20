'use client';

import { z } from 'zod';

/**
 * Zod schema for agent configuration validation.
 * Aligned with Claude Agent SDK parameters.
 *
 * Note: Using optional() without .default() to avoid TypeScript inference issues
 * with react-hook-form's zodResolver. Defaults are handled in form initialization.
 */
export const agentSchema = z.object({
  // Required fields
  name: z.string().min(1, 'Agent name is required'),
  model: z.string().min(1, 'Model is required'),

  // Optional: custom model ID when model === 'custom'
  customModel: z.string().optional(),

  // System prompt (optional, can be empty)
  systemPrompt: z.string().optional(),

  // Temperature: 0-2 range (OpenAI uses 0-2, Anthropic 0-1 but we normalize)
  temperature: z.number().min(0).max(2).optional(),

  // Max tokens: optional, 1-200000
  maxTokens: z.number().min(1).max(200000).optional(),

  // Top P: nucleus sampling, 0-1
  topP: z.number().min(0).max(1).optional(),

  // Top K: number of tokens to consider, 1-500
  topK: z.number().min(1).max(500).optional(),

  // Stop sequences: array of strings that stop generation
  stopSequences: z.array(z.string()).optional(),

  // Environment variables (API keys, secrets)
  envVars: z.record(z.string(), z.string()).optional(),
});

/**
 * Type derived from the Zod schema for TypeScript inference.
 */
export type AgentFormValues = z.infer<typeof agentSchema>;

/**
 * Default values for the agent configuration form.
 */
export const defaultAgentValues: Partial<AgentFormValues> = {
  name: '',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: '',
  temperature: 1.0,
  stopSequences: [],
  envVars: {},
};
