import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ============ CONNECTORS ============
  const ceaConnector = await prisma.connector.create({
    data: {
      name: 'CEA Legacy System',
      type: 'rest',
      status: 'connected',
      endpoint: 'https://api.cea.gob.mx/v1',
      config: JSON.stringify({
        auth: 'api_key',
        timeout: 30000
      })
    }
  })

  const ticketConnector = await prisma.connector.create({
    data: {
      name: 'Internal Ticket System',
      type: 'database',
      status: 'connected',
      endpoint: 'postgresql://localhost:5432/tickets',
      config: JSON.stringify({
        pool_size: 10
      })
    }
  })

  // ============ TOOLS (Connector-based) ============
  const lookupTool = await prisma.tool.create({
    data: {
      name: 'Lookup Citizen',
      slug: 'lookup-citizen',
      description: 'Look up citizen information by CURP or name',
      connectorId: ceaConnector.id,
      category: 'integration',
      isPublic: true,
      isVerified: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          curp: { type: 'string', description: 'CURP identifier' },
          name: { type: 'string', description: 'Full name' }
        }
      })
    }
  })

  const accountTool = await prisma.tool.create({
    data: {
      name: 'Get Account Status',
      slug: 'get-account-status',
      description: 'Get water account status and balance',
      connectorId: ceaConnector.id,
      category: 'integration',
      isPublic: true,
      isVerified: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          account_number: { type: 'string', description: 'Account number' }
        },
        required: ['account_number']
      })
    }
  })

  const paymentTool = await prisma.tool.create({
    data: {
      name: 'Process Payment',
      slug: 'process-payment',
      description: 'Process a payment for a water bill',
      connectorId: ceaConnector.id,
      category: 'integration',
      isPublic: true,
      isVerified: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          account_number: { type: 'string' },
          amount: { type: 'number' },
          payment_method: { type: 'string', enum: ['card', 'transfer', 'cash'] }
        },
        required: ['account_number', 'amount', 'payment_method']
      })
    }
  })

  const createTicketTool = await prisma.tool.create({
    data: {
      name: 'Create Ticket',
      slug: 'create-ticket',
      description: 'Create a support ticket',
      connectorId: ticketConnector.id,
      category: 'integration',
      isPublic: true,
      isVerified: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          category: { type: 'string' }
        },
        required: ['title', 'description', 'priority']
      })
    }
  })

  const routeTicketTool = await prisma.tool.create({
    data: {
      name: 'Route Ticket',
      slug: 'route-ticket',
      description: 'Route a ticket to the appropriate department',
      connectorId: ticketConnector.id,
      category: 'integration',
      isPublic: true,
      isVerified: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          department: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['ticket_id', 'department']
      })
    }
  })

  // ============ STANDALONE TOOLS ============
  const calculatorTool = await prisma.tool.create({
    data: {
      name: 'Calculator',
      slug: 'calculator',
      description: 'Perform mathematical calculations',
      category: 'utility',
      handler: 'lib/tools/calculator',
      isPublic: true,
      isVerified: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression to evaluate' }
        },
        required: ['expression']
      })
    }
  })

  const dateTimeTool = await prisma.tool.create({
    data: {
      name: 'DateTime',
      slug: 'datetime',
      description: 'Get current date/time or format dates',
      category: 'utility',
      handler: 'lib/tools/datetime',
      isPublic: true,
      isVerified: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['now', 'format', 'parse'] },
          value: { type: 'string' },
          format: { type: 'string' },
          timezone: { type: 'string', default: 'America/Mexico_City' }
        },
        required: ['action']
      })
    }
  })

  // ============ SKILLS ============
  const empatheticSkill = await prisma.skill.create({
    data: {
      name: 'Empathetic Response',
      slug: 'empathetic-response',
      description: 'Respond with empathy and understanding to user frustration or concerns',
      type: 'prompt',
      category: 'tone',
      isPublic: true,
      isVerified: true,
      definition: JSON.stringify({
        promptTemplate: `When responding to the user, always:
1. Acknowledge their feelings or frustration
2. Show understanding of their situation
3. Use warm, supportive language
4. Avoid defensive or dismissive responses
5. Offer concrete help or next steps

Example phrases:
- "I understand this situation is frustrating..."
- "I hear your concern and want to help..."
- "That sounds really difficult. Let me see what I can do..."`,
        triggers: ['frustrated', 'angry', 'upset', 'complaint']
      })
    }
  })

  const formalSpanishSkill = await prisma.skill.create({
    data: {
      name: 'Formal Spanish (Usted)',
      slug: 'formal-spanish',
      description: 'Use formal Spanish with usted form for professional interactions',
      type: 'prompt',
      category: 'language',
      isPublic: true,
      isVerified: true,
      definition: JSON.stringify({
        promptTemplate: `Always use formal Spanish (usted) in all interactions:
- Use "usted" instead of "tú"
- Conjugate verbs accordingly (tiene, puede, desea)
- Use formal greetings: "Buenos días", "¿En qué puedo servirle?"
- Maintain professional, respectful tone
- Avoid slang or informal expressions`,
        language: 'es',
        formality: 'formal'
      })
    }
  })

  const safetyGuardrailSkill = await prisma.skill.create({
    data: {
      name: 'Safety Guardrails',
      slug: 'safety-guardrails',
      description: 'Prevent disclosure of sensitive information and unsafe actions',
      type: 'behavior',
      category: 'safety',
      isPublic: true,
      isVerified: true,
      definition: JSON.stringify({
        rules: [
          { type: 'never_disclose', patterns: ['password', 'api_key', 'secret', 'token'] },
          { type: 'never_execute', patterns: ['delete_all', 'drop_table', 'rm -rf'] },
          { type: 'require_confirmation', patterns: ['payment', 'transfer', 'cancel'] },
          { type: 'pii_protection', fields: ['curp', 'rfc', 'bank_account'] }
        ],
        escalateOn: ['bypass_attempt', 'repeated_sensitive_request']
      })
    }
  })

  const governmentProtocolSkill = await prisma.skill.create({
    data: {
      name: 'Government Protocol',
      slug: 'government-protocol',
      description: 'Follow Mexican government service standards and protocols',
      type: 'composite',
      category: 'government',
      isPublic: true,
      isVerified: true,
      definition: JSON.stringify({
        includes: ['formal-spanish', 'safety-guardrails'],
        additionalRules: [
          'Always identify as a government service representative',
          'Reference applicable regulations when relevant',
          'Provide CURP/RFC validation before sensitive operations',
          'Log all citizen interactions for audit compliance',
          'Offer alternative channels (phone, in-person) when needed'
        ],
        disclaimers: [
          'Este es un servicio automatizado del gobierno',
          'Para trámites urgentes, visite su oficina más cercana'
        ]
      })
    }
  })

  const escalationDetectionSkill = await prisma.skill.create({
    data: {
      name: 'Escalation Detection',
      slug: 'escalation-detection',
      description: 'Detect when a conversation should be escalated to a human',
      type: 'behavior',
      category: 'safety',
      isPublic: true,
      isVerified: true,
      definition: JSON.stringify({
        triggers: [
          { type: 'keyword', patterns: ['hablar con humano', 'supervisor', 'queja formal', 'demanda'], action: 'immediate' },
          { type: 'sentiment', threshold: -0.5, consecutive: 2, action: 'escalate' },
          { type: 'retry', maxAttempts: 3, action: 'escalate' },
          { type: 'topic', patterns: ['legal', 'muerte', 'emergencia', 'amenaza'], action: 'immediate' }
        ],
        escalationMessage: 'Entiendo. Permítame transferirlo con un agente humano que podrá asistirle mejor.'
      })
    }
  })

  // ============ AGENTS ============
  const maria = await prisma.agent.create({
    data: {
      name: 'María',
      description: 'Customer-facing agent for CEA water utility inquiries',
      status: 'active',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      maxTurns: 15,
      systemPrompt: `You are María, a helpful and empathetic customer service representative for CEA (Comisión Estatal del Agua), the state water utility.

Your responsibilities:
- Help citizens check their water account status and balance
- Assist with bill payments and payment plans
- Answer questions about water service, rates, and policies
- Report water leaks or service issues
- Schedule service appointments

Always maintain a warm, professional tone and use formal Spanish (usted).`
    }
  })

  const tickit = await prisma.agent.create({
    data: {
      name: 'TickIt',
      description: 'Intelligent ticket routing and classification agent',
      status: 'active',
      model: 'claude-haiku-4-20250414',
      temperature: 0.3,
      maxTurns: 5,
      systemPrompt: `You are TickIt, an intelligent ticket routing system.

Your sole purpose is to:
1. Analyze incoming tickets or conversations
2. Classify them by category (billing, service, technical, complaint, emergency)
3. Determine priority (low, medium, high, urgent)
4. Route to the appropriate department or agent

Be concise and efficient. Output structured routing decisions.`
    }
  })

  const copilot = await prisma.agent.create({
    data: {
      name: 'Copilot',
      description: 'Admin assistant with full system access for operators',
      status: 'beta',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.5,
      maxTurns: 20,
      systemPrompt: `You are Copilot, an advanced administrative assistant for CEA operators and supervisors.

You have elevated access to all systems and can:
- Generate reports and analytics
- Perform bulk operations
- Configure agents and workflows
- Monitor system health

Be efficient, precise, and proactive.`
    }
  })

  // ============ AGENT-TOOL LINKS ============
  await prisma.agentTool.createMany({
    data: [
      { agentId: maria.id, toolId: lookupTool.id, enabled: true, priority: 1 },
      { agentId: maria.id, toolId: accountTool.id, enabled: true, priority: 2 },
      { agentId: maria.id, toolId: paymentTool.id, enabled: true, priority: 3 },
      { agentId: maria.id, toolId: createTicketTool.id, enabled: true, priority: 4 },
      { agentId: maria.id, toolId: dateTimeTool.id, enabled: true, priority: 5 },
      { agentId: tickit.id, toolId: createTicketTool.id, enabled: true, priority: 1 },
      { agentId: tickit.id, toolId: routeTicketTool.id, enabled: true, priority: 2 },
      { agentId: copilot.id, toolId: lookupTool.id, enabled: true, priority: 1 },
      { agentId: copilot.id, toolId: accountTool.id, enabled: true, priority: 2 },
      { agentId: copilot.id, toolId: paymentTool.id, enabled: true, priority: 3 },
      { agentId: copilot.id, toolId: createTicketTool.id, enabled: true, priority: 4 },
      { agentId: copilot.id, toolId: routeTicketTool.id, enabled: true, priority: 5 },
      { agentId: copilot.id, toolId: calculatorTool.id, enabled: true, priority: 6 },
      { agentId: copilot.id, toolId: dateTimeTool.id, enabled: true, priority: 7 }
    ]
  })

  // ============ AGENT-SKILL LINKS ============
  await prisma.agentSkill.createMany({
    data: [
      { agentId: maria.id, skillId: empatheticSkill.id, enabled: true, priority: 1 },
      { agentId: maria.id, skillId: formalSpanishSkill.id, enabled: true, priority: 2 },
      { agentId: maria.id, skillId: safetyGuardrailSkill.id, enabled: true, priority: 3 },
      { agentId: maria.id, skillId: governmentProtocolSkill.id, enabled: true, priority: 4 },
      { agentId: maria.id, skillId: escalationDetectionSkill.id, enabled: true, priority: 5 },
      { agentId: tickit.id, skillId: safetyGuardrailSkill.id, enabled: true, priority: 1 },
      { agentId: copilot.id, skillId: safetyGuardrailSkill.id, enabled: true, priority: 1 }
    ]
  })

  // ============ AGENT CONFIGS ============
  await prisma.agentConfig.createMany({
    data: [
      {
        agentId: maria.id,
        escalationRules: JSON.stringify([
          { id: '1', type: 'sentiment', condition: 'negative_count >= 2', action: 'transfer_human', priority: 1 },
          { id: '2', type: 'keyword', condition: 'emergency|urgent|leak|flood', action: 'notify', destination: 'emergency_team', priority: 0 },
          { id: '3', type: 'user_request', condition: 'human|agent|person', action: 'transfer_human', priority: 2 }
        ])
      },
      {
        agentId: tickit.id,
        escalationRules: JSON.stringify([
          { id: '1', type: 'keyword', condition: 'emergency|urgent|flood|contamination', action: 'transfer_agent', destination: 'emergency_response', priority: 0 }
        ])
      },
      {
        agentId: copilot.id,
        escalationRules: JSON.stringify([])
      }
    ]
  })

  // ============ SAMPLE CONVERSATION ============
  const now = new Date()
  const conv1 = await prisma.conversation.create({
    data: {
      agentId: maria.id,
      status: 'resolved',
      resolvedAt: now,
      metadata: JSON.stringify({ channel: 'web', language: 'es' })
    }
  })

  await prisma.message.createMany({
    data: [
      { conversationId: conv1.id, role: 'user', content: 'Hola, quiero consultar mi saldo' },
      { conversationId: conv1.id, role: 'assistant', content: '¡Hola! Con gusto le ayudo a consultar su saldo. ¿Podría proporcionarme su número de cuenta o CURP?' },
      { conversationId: conv1.id, role: 'user', content: 'Mi cuenta es 12345678' },
      { conversationId: conv1.id, role: 'assistant', content: 'Gracias. He encontrado su cuenta. Su saldo actual es de $450.00 MXN con fecha de vencimiento el 15 de febrero. ¿Desea realizar un pago?' }
    ]
  })

  // ============ METRICS ============
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)

    await prisma.dailyMetrics.create({
      data: {
        date,
        conversations: Math.floor(Math.random() * 100) + 50,
        resolved: Math.floor(Math.random() * 80) + 30,
        escalated: Math.floor(Math.random() * 15) + 2,
        totalTokens: Math.floor(Math.random() * 500000) + 100000,
        avgResponseMs: Math.floor(Math.random() * 1000) + 500
      }
    })
  }

  // Hourly activity for heatmap
  for (let week = 0; week < 12; week++) {
    for (let day = 0; day < 7; day++) {
      for (let hour = 8; hour < 20; hour++) {
        const timestamp = new Date(now)
        timestamp.setDate(timestamp.getDate() - (week * 7 + day))
        timestamp.setHours(hour, 0, 0, 0)

        const baseCount = hour >= 9 && hour <= 17 ? 15 : 5
        const count = Math.floor(Math.random() * baseCount) + (hour >= 9 && hour <= 17 ? 5 : 1)

        await prisma.hourlyActivity.create({
          data: {
            timestamp,
            agentId: [maria.id, tickit.id, copilot.id][Math.floor(Math.random() * 3)],
            count
          }
        })
      }
    }
  }

  console.log('Seed completed successfully!')
  console.log(`Created ${await prisma.agent.count()} agents`)
  console.log(`Created ${await prisma.tool.count()} tools`)
  console.log(`Created ${await prisma.skill.count()} skills`)
  console.log(`Created ${await prisma.connector.count()} connectors`)
  console.log(`Created ${await prisma.dailyMetrics.count()} daily metrics records`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
