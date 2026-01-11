import prisma from '@/lib/db/client'

export interface ToolInput {
  [key: string]: unknown
}

export interface ToolOutput {
  success: boolean
  data?: unknown
  error?: string
}

export type ToolHandler = (input: ToolInput) => Promise<ToolOutput>

export interface RegisteredTool {
  id: string
  slug: string
  name: string
  description: string
  category: string
  inputSchema: Record<string, unknown>
  handler: ToolHandler
  isStandalone: boolean
}

/**
 * Tool Registry - Manages both connector-based and standalone tools
 */
export class ToolRegistry {
  private handlers: Map<string, ToolHandler> = new Map()
  private tools: Map<string, RegisteredTool> = new Map()

  constructor() {
    // Register built-in standalone tools
    this.registerBuiltinTools()
  }

  /**
   * Register built-in standalone tools
   */
  private registerBuiltinTools(): void {
    // Calculator tool
    this.handlers.set('lib/tools/calculator', async (input: ToolInput): Promise<ToolOutput> => {
      try {
        const expression = input.expression as string
        // Safe math evaluation (no eval!)
        const result = this.evaluateMath(expression)
        return { success: true, data: { result } }
      } catch (error) {
        return { success: false, error: `Calculation error: ${error}` }
      }
    })

    // DateTime tool
    this.handlers.set('lib/tools/datetime', async (input: ToolInput): Promise<ToolOutput> => {
      try {
        const action = input.action as string
        const timezone = (input.timezone as string) || 'America/Mexico_City'

        switch (action) {
          case 'now':
            return {
              success: true,
              data: {
                iso: new Date().toISOString(),
                local: new Date().toLocaleString('es-MX', { timeZone: timezone }),
                timestamp: Date.now()
              }
            }
          case 'format':
            const date = new Date(input.value as string)
            return {
              success: true,
              data: {
                formatted: date.toLocaleString('es-MX', { timeZone: timezone })
              }
            }
          default:
            return { success: false, error: `Unknown action: ${action}` }
        }
      } catch (error) {
        return { success: false, error: `DateTime error: ${error}` }
      }
    })
  }

  /**
   * Safe math expression evaluator (no eval)
   */
  private evaluateMath(expression: string): number {
    // Only allow numbers and basic operators
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
    if (sanitized !== expression.replace(/\s/g, '')) {
      throw new Error('Invalid characters in expression')
    }

    // Simple recursive descent parser for safety
    const tokens = sanitized.match(/(\d+\.?\d*|[+\-*/()%])/g) || []
    let pos = 0

    const parseNumber = (): number => {
      const token = tokens[pos++]
      if (!token || !/^\d+\.?\d*$/.test(token)) {
        throw new Error('Expected number')
      }
      return parseFloat(token)
    }

    const parseFactor = (): number => {
      if (tokens[pos] === '(') {
        pos++ // skip (
        const result = parseExpression()
        pos++ // skip )
        return result
      }
      if (tokens[pos] === '-') {
        pos++
        return -parseFactor()
      }
      return parseNumber()
    }

    const parseTerm = (): number => {
      let left = parseFactor()
      while (tokens[pos] === '*' || tokens[pos] === '/' || tokens[pos] === '%') {
        const op = tokens[pos++]
        const right = parseFactor()
        if (op === '*') left *= right
        else if (op === '/') left /= right
        else left %= right
      }
      return left
    }

    const parseExpression = (): number => {
      let left = parseTerm()
      while (tokens[pos] === '+' || tokens[pos] === '-') {
        const op = tokens[pos++]
        const right = parseTerm()
        if (op === '+') left += right
        else left -= right
      }
      return left
    }

    return parseExpression()
  }

  /**
   * Get all tools assigned to an agent
   */
  async getAgentTools(agentId: string): Promise<RegisteredTool[]> {
    const agentTools = await prisma.agentTool.findMany({
      where: { agentId, enabled: true },
      include: {
        tool: {
          include: { connector: true }
        }
      },
      orderBy: { priority: 'asc' }
    })

    const registered: RegisteredTool[] = []

    for (const at of agentTools) {
      const tool = at.tool
      let inputSchema: Record<string, unknown> = {}
      try {
        inputSchema = JSON.parse(tool.inputSchema)
      } catch {
        console.warn(`Failed to parse input schema for tool: ${tool.slug}`)
      }

      const isStandalone = !tool.connectorId
      const handler = isStandalone && tool.handler
        ? this.handlers.get(tool.handler)
        : this.createConnectorHandler(tool)

      if (handler) {
        registered.push({
          id: tool.id,
          slug: tool.slug,
          name: tool.name,
          description: tool.description,
          category: tool.category,
          inputSchema,
          handler,
          isStandalone
        })
      }
    }

    return registered
  }

  /**
   * Create a handler for connector-based tools
   */
  private createConnectorHandler(tool: {
    id: string
    slug: string
    connector: { endpoint: string; config: string; type: string } | null
  }): ToolHandler {
    return async (input: ToolInput): Promise<ToolOutput> => {
      if (!tool.connector) {
        return { success: false, error: 'Tool has no connector configured' }
      }

      try {
        // This is a placeholder - actual implementation would call the connector
        console.log(`Calling connector tool: ${tool.slug}`, input)

        // TODO: Implement actual connector calls based on type (rest, soap, database, webhook)
        return {
          success: true,
          data: {
            message: `Tool ${tool.slug} executed successfully`,
            input
          }
        }
      } catch (error) {
        return { success: false, error: `Connector error: ${error}` }
      }
    }
  }

  /**
   * Execute a tool by slug
   */
  async execute(slug: string, input: ToolInput): Promise<ToolOutput> {
    const tool = this.tools.get(slug)
    if (!tool) {
      return { success: false, error: `Tool not found: ${slug}` }
    }

    // Increment usage count
    await prisma.tool.update({
      where: { slug },
      data: { usageCount: { increment: 1 } }
    }).catch(() => {
      // Ignore if tool doesn't exist in DB (might be runtime-only)
    })

    return tool.handler(input)
  }

  /**
   * Get tool by slug
   */
  async getBySlug(slug: string): Promise<RegisteredTool | null> {
    // Check cache first
    if (this.tools.has(slug)) {
      return this.tools.get(slug)!
    }

    // Load from database
    const tool = await prisma.tool.findUnique({
      where: { slug },
      include: { connector: true }
    })

    if (!tool) return null

    let inputSchema: Record<string, unknown> = {}
    try {
      inputSchema = JSON.parse(tool.inputSchema)
    } catch {
      console.warn(`Failed to parse input schema for tool: ${tool.slug}`)
    }

    const isStandalone = !tool.connectorId
    const handler = isStandalone && tool.handler
      ? this.handlers.get(tool.handler)
      : this.createConnectorHandler(tool)

    if (!handler) return null

    const registered: RegisteredTool = {
      id: tool.id,
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema,
      handler,
      isStandalone
    }

    this.tools.set(slug, registered)
    return registered
  }

  /**
   * Register a custom handler (for runtime tool additions)
   */
  registerHandler(handlerPath: string, handler: ToolHandler): void {
    this.handlers.set(handlerPath, handler)
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry()
