'use client';

import { z } from 'zod';

/**
 * Zod schema for MCP server configuration validation.
 * Aligned with PACO MCP server types.
 *
 * Note: Uses refinement to validate that command is provided for stdio
 * servers and URL is provided for sse/http servers.
 */
export const mcpServerSchema = z.object({
  // Required fields
  name: z.string().min(1, 'Server name is required'),
  serverType: z.enum(['stdio', 'sse', 'http']),

  // Stdio fields (required when serverType === 'stdio')
  command: z.string().optional(),
  args: z.array(z.string()).optional(),

  // SSE/HTTP fields (required when serverType === 'sse' or 'http')
  url: z.string().optional(),

  // Common fields
  env: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),

  // Tool selection
  enabledTools: z.array(z.string()).optional(),

  // Link to PACO registry (for tool fetching)
  serverId: z.string().optional(),
}).refine(
  (data) => {
    if (data.serverType === 'stdio') {
      return !!data.command && data.command.trim().length > 0;
    }
    if (data.serverType === 'sse' || data.serverType === 'http') {
      return !!data.url && data.url.trim().length > 0;
    }
    return true;
  },
  {
    message: 'Command required for stdio, URL required for sse/http',
    path: ['command'], // This will be replaced dynamically in form validation
  }
);

/**
 * Type derived from the Zod schema for TypeScript inference.
 */
export type McpServerFormValues = z.infer<typeof mcpServerSchema>;

/**
 * Default values for the MCP server configuration form.
 */
export const defaultMcpServerValues: Partial<McpServerFormValues> = {
  name: '',
  serverType: 'stdio',
  command: '',
  args: [],
  url: '',
  env: {},
  headers: {},
  enabledTools: [],
  serverId: undefined,
};
