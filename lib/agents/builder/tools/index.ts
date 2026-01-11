/**
 * PACO Builder Agent - Tool Registry
 * 
 * Central export for all builder agent tools
 */

// Tool definitions
export { discoveryTools } from './discovery'
export { creationTools } from './creation'
export { workflowTools } from './workflow'
export { guardrailTools } from './guardrails'
export { testingTools } from './testing'
export { deploymentTools } from './deployment'

// Types
export type { DiscoveryToolName, DiscoveryToolHandlers } from './discovery'
export type { CreationToolName, Agent, Persona } from './creation'
export type { WorkflowToolName, Workflow, WorkflowStep, Intent } from './workflow'
export type { GuardrailToolName, Guardrail, EscalationRule } from './guardrails'
export type { TestingToolName, SimulationResult, ValidationResult, TestCase, TestResults } from './testing'
export type { DeploymentToolName, Deployment, AgentVersion, ChannelConfig } from './deployment'

// Schemas
export { ConnectorSchema, DiscoveredToolSchema, SkillSchema, AgentTemplateSchema } from './discovery'
export { AgentSchema, PersonaSchema } from './creation'
export { WorkflowSchema, WorkflowStepSchema, IntentSchema, StateSchema, TransitionSchema } from './workflow'
export { GuardrailSchema, EscalationRuleSchema } from './guardrails'
export { SimulationResultSchema, ValidationResultSchema, TestCaseSchema, TestResultsSchema } from './testing'
export { DeploymentSchema, AgentVersionSchema, ChannelConfigSchema } from './deployment'

import { discoveryTools } from './discovery'
import { creationTools } from './creation'
import { workflowTools } from './workflow'
import { guardrailTools } from './guardrails'
import { testingTools } from './testing'
import { deploymentTools } from './deployment'

/**
 * All Builder Agent tools combined
 */
export const allBuilderTools = [
  ...discoveryTools,
  ...creationTools,
  ...workflowTools,
  ...guardrailTools,
  ...testingTools,
  ...deploymentTools,
]

/**
 * Tool categories for organization
 */
export const toolCategories = {
  discovery: discoveryTools,
  creation: creationTools,
  workflow: workflowTools,
  guardrails: guardrailTools,
  testing: testingTools,
  deployment: deploymentTools,
} as const

/**
 * Get tool by name
 */
export function getToolByName(name: string) {
  return allBuilderTools.find(t => t.name === name)
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof toolCategories) {
  return toolCategories[category]
}

/**
 * Tool count summary
 */
export const toolSummary = {
  discovery: discoveryTools.length,
  creation: creationTools.length,
  workflow: workflowTools.length,
  guardrails: guardrailTools.length,
  testing: testingTools.length,
  deployment: deploymentTools.length,
  total: allBuilderTools.length,
}
