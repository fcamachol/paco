import prisma from '@/lib/db/client'
import { skillRegistry, ResolvedSkill } from '@/lib/skills'
import { toolRegistry, RegisteredTool } from '@/lib/tools'

export interface AgentConfig {
  id: string
  name: string
  model: string
  systemPrompt: string
  temperature: number
  maxTurns: number
  tools: RegisteredTool[]
  skills: ResolvedSkill[]
  escalationRules: EscalationRule[]
}

export interface EscalationRule {
  id: string
  type: 'sentiment' | 'keyword' | 'retry_limit' | 'user_request' | 'timeout'
  condition: string
  action: 'transfer_human' | 'transfer_agent' | 'notify' | 'log'
  destination?: string
  priority: number
}

/**
 * Agent Factory - Creates fully configured agents from database
 */
export class AgentFactory {
  /**
   * Build a complete agent configuration from database
   */
  async build(agentId: string): Promise<AgentConfig | null> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        config: true
      }
    })

    if (!agent) return null

    // Load tools and skills in parallel
    const [tools, skills] = await Promise.all([
      toolRegistry.getAgentTools(agentId),
      skillRegistry.getAgentSkills(agentId)
    ])

    // Parse escalation rules
    let escalationRules: EscalationRule[] = []
    if (agent.config?.escalationRules) {
      try {
        escalationRules = JSON.parse(agent.config.escalationRules)
      } catch {
        console.warn(`Failed to parse escalation rules for agent: ${agent.name}`)
      }
    }

    // Build enhanced system prompt with skills
    const skillPromptSection = skillRegistry.buildPromptSection(skills)
    const enhancedSystemPrompt = skillPromptSection
      ? `${agent.systemPrompt}\n\n${skillPromptSection}`
      : agent.systemPrompt

    return {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      systemPrompt: enhancedSystemPrompt,
      temperature: agent.temperature,
      maxTurns: agent.maxTurns,
      tools,
      skills,
      escalationRules
    }
  }

  /**
   * Build agent by name (for URL-based lookups)
   */
  async buildByName(name: string): Promise<AgentConfig | null> {
    // SQLite doesn't support case-insensitive mode, so we use raw query
    const agents = await prisma.agent.findMany({
      where: {
        name: name
      }
    })

    // Fallback: case-insensitive search in application
    const agent = agents.find(a => a.name.toLowerCase() === name.toLowerCase())
      || agents[0]

    if (!agent) return null
    return this.build(agent.id)
  }

  /**
   * Get all available agents
   */
  async listAgents(): Promise<Array<{
    id: string
    name: string
    description: string
    status: string
    model: string
    toolCount: number
    skillCount: number
  }>> {
    const agents = await prisma.agent.findMany({
      include: {
        _count: {
          select: {
            agentTools: true,
            agentSkills: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    return agents.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      status: a.status,
      model: a.model,
      toolCount: a._count.agentTools,
      skillCount: a._count.agentSkills
    }))
  }
}

// Singleton instance
export const agentFactory = new AgentFactory()

// Re-export types
export type { ResolvedSkill } from '@/lib/skills'
export type { RegisteredTool, ToolInput, ToolOutput } from '@/lib/tools'
