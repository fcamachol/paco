'use client';

import { z } from 'zod';

/**
 * Zod schema for logic node configuration validation.
 * Aligned with PACO LogicConfig types.
 */
export const logicSchema = z.object({
  // Required fields
  name: z.string().min(1, 'Logic node name is required'),
  logicType: z.enum(['condition', 'loop', 'parallel', 'approval']),

  // Condition-specific fields
  condition: z.string().optional(),

  // Loop-specific fields
  maxIterations: z.number().min(1).max(1000).optional(),
});

/**
 * Type derived from the Zod schema for TypeScript inference.
 */
export type LogicFormValues = z.infer<typeof logicSchema>;

/**
 * Default values for the logic node configuration form.
 */
export const defaultLogicValues: Partial<LogicFormValues> = {
  name: '',
  logicType: 'condition',
  condition: '',
  maxIterations: 10,
};
