/**
 * Creation Tool Handlers
 * Implements the actual logic for agent creation tools
 */

import { randomUUID } from 'crypto'

// In-memory store for draft agents (replace with database)
const draftAgents = new Map<string, any>()

export const creationToolHandlers = {
  async createAgent(accountId: string, args: Record<string, unknown>) {
    const id = `agt_${randomUUID().slice(0, 8)}`
    const agent = {
      id,
      accountId,
      name: args.name as string,
      slug: (args.name as string).toLowerCase().replace(/\s+/g, '_'),
      description: args.description as string || '',
      type: args.type as string,
      status: 'draft',
      version: '0.1.0',
      persona: null,
      tools: [],
      skills: [],
      workflows: [],
      guardrails: [],
      intents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    draftAgents.set(id, agent)
    return { success: true, agent_id: id, message: `Created agent "${agent.name}"` }
  },

  async setPersona(accountId: string, args: Record<string, unknown>) {
    const agentId = args.agent_id as string
    const agent = draftAgents.get(agentId)
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    agent.persona = {
      systemPrompt: args.system_prompt as string,
      personalityTraits: (args.personality_traits as string[]) || [],
      language: (args.language as string) || 'es-MX',
      formality: (args.formality as string) || 'adaptive',
    }
    agent.updatedAt = new Date().toISOString()

    return { success: true, message: 'Persona set successfully' }
  },

  async addToolToAgent(accountId: string, args: Record<string, unknown>) {
    const agentId = args.agent_id as string
    const agent = draftAgents.get(agentId)
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    const toolConfig = {
      toolId: args.tool_id as string,
      config: args.config || {},
      autoExecute: args.auto_execute || false,
    }
    
    agent.tools.push(toolConfig)
    agent.updatedAt = new Date().toISOString()

    return { 
      success: true, 
      message: `Added tool ${args.tool_id}`,
      toolCount: agent.tools.length,
    }
  },

  async addSkillToAgent(accountId: string, args: Record<string, unknown>) {
    const agentId = args.agent_id as string
    const agent = draftAgents.get(agentId)
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    const skillConfig = {
      skillId: args.skill_id as string,
      priority: (args.priority as number) || 0,
    }
    
    agent.skills.push(skillConfig)
    agent.updatedAt = new Date().toISOString()

    return { 
      success: true, 
      message: `Added skill ${args.skill_id}`,
      skillCount: agent.skills.length,
    }
  },

  async getAgentPreview(accountId: string, args: Record<string, unknown>) {
    const agentId = args.agent_id as string
    const agent = draftAgents.get(agentId)
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    return {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      hasPersona: !!agent.persona,
      toolCount: agent.tools.length,
      skillCount: agent.skills.length,
      workflowCount: agent.workflows.length,
      guardrailCount: agent.guardrails.length,
      intentCount: agent.intents.length,
      completeness: calculateCompleteness(agent),
    }
  },
}

function calculateCompleteness(agent: any): number {
  let score = 0
  if (agent.persona) score += 20
  if (agent.tools.length > 0) score += 20
  if (agent.skills.length > 0) score += 15
  if (agent.workflows.length > 0) score += 20
  if (agent.guardrails.length > 0) score += 15
  if (agent.intents.length > 0) score += 10
  return score
}
