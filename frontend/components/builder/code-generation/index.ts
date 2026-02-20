/**
 * Code Generation Module
 *
 * Provides workflow-to-IR transformation and code generation utilities
 * for the PACO Visual Agent Builder.
 */

// IR Types - language-agnostic representation
export type {
  WorkflowIR,
  AgentIR,
  McpServerIR,
  KnowledgeSourceIR,
  PermissionMode,
} from './ir';

// Transformation functions
export { workflowToIR } from './workflow-to-ir';

// Code generation functions
export { generateTypeScriptCode } from './ir-to-typescript';

// UI Components
export { CodePreview } from './code-preview';
