/**
 * Example: Building a Customer Support Agent with PACO Builder
 * 
 * This demonstrates the complete flow of using PACO Builder
 * to create a production-ready customer support agent.
 */

import { createBuilderAgent } from '../lib/agents/builder/agent'

async function buildCustomerSupportAgent() {
  // 1. Initialize the Builder
  const builder = createBuilderAgent({
    accountId: 'acct_example',
    model: 'sonnet',
    enableThinking: true,
    memoryPath: './memories',
    auditLogPath: './logs/audit.jsonl',
    sessionId: 'session_build_support_agent',
  })

  console.log('🚀 Starting agent build process...\n')

  // 2. Discover Available Resources
  console.log('📦 Discovering connectors and patterns...')
  
  const connectors = await builder.executeTool('list_connectors', { type: 'all', status: 'available' })
  console.log('Connectors:', JSON.parse(connectors.content[0].text))

  const patterns = await builder.executeTool('list_patterns', { category: 'all' })
  console.log('Patterns:', JSON.parse(patterns.content[0].text))

  // 3. Create the Agent
  console.log('\n🏗️ Creating agent...')
  
  const agent = await builder.executeTool('create_agent', {
    name: 'Support Assistant',
    description: 'Handles customer inquiries, order tracking, and refund requests',
    model: 'sonnet',
    enable_memory: true,
    enable_thinking: true,
  })
  
  const agentData = JSON.parse(agent.content[0].text)
  const agentId = agentData.agent.id
  console.log('Created agent:', agentId)

  // 4. Set System Prompt
  console.log('\n📝 Setting system prompt...')
  
  await builder.executeTool('set_system_prompt', {
    agent_id: agentId,
    thinking_style: 'structured',
    system_prompt: `You are a helpful customer support assistant.

## Capabilities
- Track order status
- Process refunds (up to $500)
- Answer product questions
- Escalate complex issues

## Guidelines
- Be friendly and professional
- Verify identity before account access
- Escalate refunds over $500`,
  })

  // 5. Add Tools
  console.log('\n🔧 Adding tools...')
  
  await builder.executeTool('add_tool', { agent_id: agentId, tool_id: 'orders.track_shipment', requires_approval: false })
  await builder.executeTool('add_tool', { agent_id: agentId, tool_id: 'customers.get_account', requires_approval: false })
  await builder.executeTool('add_tool', { agent_id: agentId, tool_id: 'payments.process_refund', requires_approval: true }) // HITL

  // 6. Create Workflows
  console.log('\n⚙️ Creating workflows...')
  
  await builder.executeTool('create_workflow', {
    agent_id: agentId,
    name: 'Intent Router',
    description: 'Routes requests to handlers',
    trigger: 'always',
    pattern: 'conditional',
    steps: [
      { name: 'classify', type: 'prompt', config: { prompt: 'Classify intent' } },
      { name: 'route', type: 'condition', config: { branches: { refund: 'refund_workflow', order: 'order_workflow' } } },
    ],
  })

  // 7. Add Guardrails
  console.log('\n🛡️ Adding guardrails...')
  
  await builder.executeTool('add_guardrail', {
    agent_id: agentId,
    name: 'Large Refund Escalation',
    type: 'tool_use',
    action: 'escalate',
    condition: 'refund_amount > 500',
    message: 'Refunds over $500 require supervisor approval.',
  })

  await builder.executeTool('add_guardrail', {
    agent_id: agentId,
    name: 'PII Protection',
    type: 'output',
    action: 'transform',
    condition: 'contains_credit_card',
  })

  // 8. Test with Simulations
  console.log('\n🧪 Running test simulations...')
  
  const sim = await builder.executeTool('simulate_conversation', {
    agent_id: agentId,
    scenario: 'Where is my order #12345?',
    expected_behavior: 'Look up order and provide tracking',
    enable_reflection: true,
  })
  console.log('Simulation:', JSON.parse(sim.content[0].text).result.status)

  // 9. Validate
  console.log('\n✅ Validating agent...')
  
  const validation = await builder.executeTool('validate_agent', { agent_id: agentId, validation_level: 'strict' })
  console.log('Validation:', JSON.parse(validation.content[0].text).summary)

  // 10. Deploy
  console.log('\n🚀 Deploying to staging...')
  
  const deployment = await builder.executeTool('deploy_agent', { agent_id: agentId, environment: 'staging', validate_first: true })
  const deployData = JSON.parse(deployment.content[0].text)
  
  console.log('\n' + '='.repeat(60))
  console.log('✨ Agent build complete!')
  console.log('='.repeat(60))
  console.log(`
Agent: ${agentData.agent.name} (${agentId})
Endpoints:
  - Chat: ${deployData.endpoints.chat}
  - Webhook: ${deployData.endpoints.webhook}

Patterns Applied:
  - Routing (intent classification)
  - Human-in-the-Loop (refund approval)
  - Guardrails/Safety (3 rules)
  - Memory Management (enabled)
`)
}

buildCustomerSupportAgent().catch(console.error)
