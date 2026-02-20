'use client';

import { z } from 'zod';

/**
 * Zod schema for knowledge base configuration validation.
 * Aligned with PACO KnowledgeConfig types.
 */
export const knowledgeSchema = z.object({
  // Required fields
  name: z.string().min(1, 'Knowledge base name is required'),
  sourceType: z.enum(['document', 'url', 'database']),
  sources: z.array(z.string()).min(1, 'At least one source is required'),

  // Optional processing configuration
  chunkSize: z.number().min(100).max(10000).optional(),
  overlapSize: z.number().min(0).max(1000).optional(),
});

/**
 * Type derived from the Zod schema for TypeScript inference.
 */
export type KnowledgeFormValues = z.infer<typeof knowledgeSchema>;

/**
 * Default values for the knowledge base configuration form.
 */
export const defaultKnowledgeValues: Partial<KnowledgeFormValues> = {
  name: '',
  sourceType: 'document',
  sources: [],
  chunkSize: 1000,
  overlapSize: 200,
};
