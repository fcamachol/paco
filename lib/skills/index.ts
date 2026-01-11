import prisma from '@/lib/db/client'

export interface SkillDefinition {
  promptTemplate?: string
  triggers?: string[]
  rules?: Array<{
    type: string
    patterns?: string[]
    fields?: string[]
  }>
  includes?: string[]
  [key: string]: unknown
}

export interface ResolvedSkill {
  id: string
  slug: string
  name: string
  type: string
  category: string
  definition: SkillDefinition
  priority: number
}

/**
 * Skill Registry - Manages loading and resolving skills for agents
 */
export class SkillRegistry {
  private cache: Map<string, ResolvedSkill> = new Map()

  /**
   * Get all skills assigned to an agent, resolved and sorted by priority
   */
  async getAgentSkills(agentId: string): Promise<ResolvedSkill[]> {
    const agentSkills = await prisma.agentSkill.findMany({
      where: { agentId, enabled: true },
      include: { skill: true },
      orderBy: { priority: 'asc' }
    })

    const resolved: ResolvedSkill[] = []

    for (const as of agentSkills) {
      const skill = await this.resolveSkill(as.skill, as.priority, as.config)
      if (skill) resolved.push(skill)
    }

    return resolved
  }

  /**
   * Resolve a skill, including any composite dependencies
   */
  private async resolveSkill(
    skill: { id: string; slug: string; name: string; type: string; category: string; definition: string },
    priority: number,
    configOverrides?: string
  ): Promise<ResolvedSkill | null> {
    // Check cache
    const cacheKey = `${skill.id}:${priority}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    let definition: SkillDefinition
    try {
      definition = JSON.parse(skill.definition)
    } catch {
      console.error(`Failed to parse skill definition for ${skill.slug}`)
      return null
    }

    // Apply config overrides if present
    if (configOverrides && configOverrides !== '{}') {
      try {
        const overrides = JSON.parse(configOverrides)
        definition = { ...definition, ...overrides }
      } catch {
        console.warn(`Failed to parse config overrides for skill ${skill.slug}`)
      }
    }

    // Resolve composite skills (include dependencies)
    if (skill.type === 'composite' && definition.includes) {
      const includedSkills = await prisma.skill.findMany({
        where: { slug: { in: definition.includes } }
      })

      // Merge included skill definitions
      for (const included of includedSkills) {
        try {
          const includedDef = JSON.parse(included.definition) as SkillDefinition
          // Merge rules arrays
          if (includedDef.rules && definition.rules) {
            definition.rules = [...definition.rules, ...includedDef.rules]
          } else if (includedDef.rules) {
            definition.rules = includedDef.rules
          }
          // Merge triggers
          if (includedDef.triggers && definition.triggers) {
            definition.triggers = Array.from(new Set([...definition.triggers, ...includedDef.triggers]))
          } else if (includedDef.triggers) {
            definition.triggers = includedDef.triggers
          }
        } catch {
          console.warn(`Failed to parse included skill: ${included.slug}`)
        }
      }
    }

    const resolved: ResolvedSkill = {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      type: skill.type,
      category: skill.category,
      definition,
      priority
    }

    this.cache.set(cacheKey, resolved)
    return resolved
  }

  /**
   * Build a system prompt section from skills
   */
  buildPromptSection(skills: ResolvedSkill[]): string {
    const sections: string[] = []

    for (const skill of skills) {
      if (skill.type === 'prompt' && skill.definition.promptTemplate) {
        sections.push(`## ${skill.name}\n${skill.definition.promptTemplate}`)
      }
    }

    return sections.join('\n\n')
  }

  /**
   * Get behavior rules from skills (for runtime enforcement)
   */
  getBehaviorRules(skills: ResolvedSkill[]): SkillDefinition['rules'] {
    const rules: NonNullable<SkillDefinition['rules']> = []

    for (const skill of skills) {
      if ((skill.type === 'behavior' || skill.type === 'composite') && skill.definition.rules) {
        rules.push(...skill.definition.rules)
      }
    }

    return rules
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}

// Singleton instance
export const skillRegistry = new SkillRegistry()
