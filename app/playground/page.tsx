'use client'
import { useState } from 'react'
import { LayoutShell } from '@/components/layout-shell'

type TabType = 'test' | 'build'

// ============ TEST PANEL (existing playground) ============

const initialMessages = [
  { id: '1', role: 'user', content: 'Hola, quiero reportar una fuga' },
  { id: '2', role: 'assistant', content: '¡Hola! Entiendo que hay una fuga. Para ayudarte necesito la dirección exacta. ¿Dónde está ubicada?' },
  { id: '3', role: 'user', content: 'Av. Universidad 123, col. Centro' },
  { id: '4', role: 'assistant', content: 'Perfecto. ¿Hay alguna referencia cercana que nos ayude a ubicar mejor el lugar?' },
]

const toolCalls = [
  { name: 'list_categories', status: 'complete', duration: '42ms' },
  { name: 'validate_address', status: 'complete', duration: '128ms' },
  { name: 'create_ticket', status: 'pending' },
]

const debugState = {
  intent: 'fuga',
  category: 'FUG',
  fields: { direccion: 'Av. Universidad 123, col. Centro', referencia: null, telefono: null }
}

function TestChatPanel() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(initialMessages)

  const handleSend = () => {
    if (!input.trim()) return
    setMessages([...messages, { id: Date.now().toString(), role: 'user', content: input }])
    setInput('')
  }

  return (
    <div className="chat-container">
      <div className="p-3 border-b border-border text-text-muted text-sm font-mono">conversation</div>
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="text-xs text-text-muted mb-1">{msg.role}</div>
            <div>{msg.content}</div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder="Type a message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button className="btn btn-primary" onClick={handleSend}>send</button>
        </div>
      </div>
    </div>
  )
}

function TestDebugPanel() {
  return (
    <div className="debug-panel h-[600px] overflow-y-auto">
      <div className="text-text-muted text-sm mb-4 font-mono">debug</div>

      <div className="mb-4">
        <div className="text-text-muted text-xs mb-2">state</div>
        <div className="debug-json">
          <pre>{JSON.stringify(debugState, null, 2)}</pre>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-text-muted text-xs mb-2">tool calls</div>
        <div className="space-y-1">
          {toolCalls.map((tool, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-accent">
                {tool.status === 'complete' ? '▶' : '▷'}
              </span>
              <span>{tool.name}</span>
              <span className="text-text-muted text-xs">
                {tool.status === 'complete' ? `└─ ${tool.duration}` : '└─ waiting...'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4 mt-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { label: 'tokens', value: '1,234' },
            { label: 'cost', value: '$0.02' },
            { label: 'latency', value: '1.2s' },
            { label: 'turns', value: '4' },
          ].map(s => (
            <div key={s.label} className="stat">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value text-base">{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TestPanel() {
  return (
    <>
      <div className="flex items-center gap-4 mb-4 font-mono text-sm">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">agent:</span>
          <select className="input w-32 py-1">
            <option>maría</option>
            <option>tickit</option>
            <option>copilot</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted">model:</span>
          <select className="input w-32 py-1">
            <option>sonnet</option>
            <option>haiku</option>
            <option>opus</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TestChatPanel />
        <TestDebugPanel />
      </div>
    </>
  )
}

// ============ BUILD PANEL (Agent Builder) ============

const builderMessages = [
  { id: '1', role: 'user', content: 'I need to build María, a customer service agent for CEA water utility' },
  { id: '2', role: 'builder', content: `I'll help you build María. Let me ask a few questions first:

1. What types of requests should María handle?
2. What systems does she need access to?
3. Are there any actions that require human approval?` },
  { id: '3', role: 'user', content: 'She handles leak reports, balance inquiries, and complaints. Connect to AGORA for tickets and CEA SOAP for account data.' },
  { id: '4', role: 'builder', content: `Perfect. I found these connectors available:

● AGORA (5 tools)
● CEA SOAP (4 tools)

I'll now:
1. Create María agent
2. Attach relevant tools
3. Set up persona`, toolCall: { name: 'create_agent', input: { name: 'María', type: 'customer' } } },
]

interface AgentDraft {
  name: string
  description: string
  status: 'building' | 'testing' | 'ready'
  version: string
  persona: { label: string; enabled: boolean }[]
  tools: { name: string; enabled: boolean }[]
  skills: { name: string; enabled: boolean }[]
  workflows: { name: string; status: 'building' | 'pending' | 'complete' }[]
  guardrails: { name: string; enabled: boolean }[]
  tests: { name: string; status: 'passed' | 'failed' | 'pending' }[]
}

const mockAgentDraft: AgentDraft = {
  name: 'MARÍA',
  description: 'CEA Customer Service',
  status: 'building',
  version: '0.1.0-draft',
  persona: [
    { label: 'Mexican Spanish (es-MX)', enabled: true },
    { label: 'Empathetic tone', enabled: true },
    { label: 'Formal with adaptive', enabled: true },
  ],
  tools: [
    { name: 'create_ticket', enabled: true },
    { name: 'get_balance', enabled: true },
    { name: 'list_categories', enabled: true },
    { name: 'get_consumption', enabled: true },
  ],
  skills: [
    { name: 'mexican_formality', enabled: true },
    { name: 'empathy_response', enabled: true },
    { name: 'escalation_detection', enabled: true },
  ],
  workflows: [
    { name: 'leak_report', status: 'building' },
    { name: 'balance_inquiry', status: 'pending' },
    { name: 'complaint', status: 'pending' },
  ],
  guardrails: [
    { name: 'no_legal_advice', enabled: true },
    { name: 'escalate_on_threat', enabled: true },
  ],
  tests: [
    { name: 'leak_report', status: 'passed' },
    { name: 'balance', status: 'passed' },
    { name: 'complaint', status: 'pending' },
    { name: 'escalation', status: 'passed' },
  ],
}

function BuilderChatPanel() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(builderMessages)

  const handleSend = () => {
    if (!input.trim()) return
    setMessages([...messages, { id: Date.now().toString(), role: 'user', content: input }])
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-surface rounded-lg border border-border">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-text-muted text-sm font-mono">conversation</span>
        <span className="text-xs text-accent font-mono">builder agent</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`${msg.role === 'user' ? 'ml-8' : 'mr-8'}`}>
            <div className={`rounded-lg p-3 ${
              msg.role === 'user'
                ? 'bg-accent/10 border border-accent/20'
                : 'bg-surface-elevated border border-border'
            }`}>
              <div className="text-xs text-text-muted mb-2 font-mono">{msg.role}</div>
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              {msg.toolCall && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="text-xs text-text-muted font-mono flex items-center gap-2">
                    <span className="text-accent">▶</span>
                    <span>calling: {msg.toolCall.name}</span>
                  </div>
                  <pre className="text-xs text-text-muted mt-1 pl-4">
                    {JSON.stringify(msg.toolCall.input, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder="Describe what you want to build..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button className="btn btn-primary" onClick={handleSend}>send</button>
        </div>
      </div>
    </div>
  )
}

function AgentPreviewPanel({ draft }: { draft: AgentDraft }) {
  const statusIcon = {
    building: '◐',
    testing: '◑',
    ready: '●',
  }
  const statusColor = {
    building: 'text-yellow-400',
    testing: 'text-blue-400',
    ready: 'text-green-400',
  }

  return (
    <div className="bg-surface rounded-lg border border-border h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono font-bold text-accent">{draft.name}</span>
          <span className={`${statusColor[draft.status]}`}>{statusIcon[draft.status]}</span>
        </div>
        <div className="text-sm text-text-muted">{draft.description}</div>
        <div className="flex items-center gap-4 mt-2 text-xs text-text-muted font-mono">
          <span>status: {draft.status}</span>
          <span>version: {draft.version}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Persona */}
        <div>
          <div className="text-xs text-text-muted font-mono mb-2 flex items-center gap-2">
            <span className="text-accent">───</span> persona <span className="text-accent">───────────────</span>
          </div>
          <div className="space-y-1 pl-2">
            {draft.persona.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={p.enabled ? 'text-accent' : 'text-text-muted'}>
                  {p.enabled ? '☑' : '☐'}
                </span>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div>
          <div className="text-xs text-text-muted font-mono mb-2 flex items-center gap-2">
            <span className="text-accent">───</span> tools ({draft.tools.length}) <span className="text-accent">───────────────</span>
          </div>
          <div className="space-y-1 pl-2">
            {draft.tools.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-mono">
                <span className="text-text-muted">{i === draft.tools.length - 1 ? '└─' : '├─'}</span>
                <span className={t.enabled ? 'text-accent' : 'text-text-muted'}>
                  {t.enabled ? '☑' : '☐'}
                </span>
                <span>{t.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div>
          <div className="text-xs text-text-muted font-mono mb-2 flex items-center gap-2">
            <span className="text-accent">───</span> skills ({draft.skills.length}) <span className="text-accent">────────────────</span>
          </div>
          <div className="space-y-1 pl-2">
            {draft.skills.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-mono">
                <span className="text-text-muted">{i === draft.skills.length - 1 ? '└─' : '├─'}</span>
                <span className={s.enabled ? 'text-accent' : 'text-text-muted'}>
                  {s.enabled ? '☑' : '☐'}
                </span>
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Workflows */}
        <div>
          <div className="text-xs text-text-muted font-mono mb-2 flex items-center gap-2">
            <span className="text-accent">───</span> workflows ({draft.workflows.length}) <span className="text-accent">───────────</span>
          </div>
          <div className="space-y-1 pl-2">
            {draft.workflows.map((w, i) => {
              const icon = w.status === 'complete' ? '●' : w.status === 'building' ? '◐' : '○'
              const color = w.status === 'complete' ? 'text-green-400' : w.status === 'building' ? 'text-yellow-400' : 'text-text-muted'
              return (
                <div key={i} className="flex items-center gap-2 text-sm font-mono">
                  <span className="text-text-muted">{i === draft.workflows.length - 1 ? '└─' : '├─'}</span>
                  <span className={color}>{icon}</span>
                  <span>{w.name}</span>
                  {w.status === 'building' && <span className="text-xs text-text-muted">(building)</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Guardrails */}
        <div>
          <div className="text-xs text-text-muted font-mono mb-2 flex items-center gap-2">
            <span className="text-accent">───</span> guardrails ({draft.guardrails.length}) <span className="text-accent">──────────</span>
          </div>
          <div className="space-y-1 pl-2">
            {draft.guardrails.map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-mono">
                <span className="text-text-muted">{i === draft.guardrails.length - 1 ? '└─' : '├─'}</span>
                <span className={g.enabled ? 'text-accent' : 'text-text-muted'}>
                  {g.enabled ? '☑' : '☐'}
                </span>
                <span>{g.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tests */}
        <div>
          <div className="text-xs text-text-muted font-mono mb-2 flex items-center gap-2">
            <span className="text-accent">───</span> tests <span className="text-accent">──────────────────</span>
          </div>
          <div className="bg-surface-elevated rounded border border-border p-3 space-y-1">
            {draft.tests.map((t, i) => {
              const icon = t.status === 'passed' ? '✓' : t.status === 'failed' ? '✗' : '○'
              const color = t.status === 'passed' ? 'text-green-400' : t.status === 'failed' ? 'text-red-400' : 'text-text-muted'
              return (
                <div key={i} className="flex items-center gap-2 text-sm font-mono">
                  <span className={color}>{icon}</span>
                  <span>{t.name}:</span>
                  <span className={color}>{t.status}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-border">
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1">Test Agent</button>
            <button className="btn btn-primary flex-1">Deploy ▼</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BuildPanel() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-200px)]">
      {/* Left: Conversation */}
      <BuilderChatPanel />

      {/* Right: Preview panel */}
      <AgentPreviewPanel draft={mockAgentDraft} />
    </div>
  )
}

// ============ MAIN COMPONENT ============

export default function Playground() {
  const [activeTab, setActiveTab] = useState<TabType>('test')

  return (
    <LayoutShell breadcrumb="/ playground">
      {/* Accordion Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('test')}
          className={`px-4 py-2 text-sm font-mono transition-colors flex items-center gap-2 ${
            activeTab === 'test'
              ? 'text-accent border-b-2 border-accent bg-accent/5'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <span>▷</span>
          Test
        </button>
        <button
          onClick={() => setActiveTab('build')}
          className={`px-4 py-2 text-sm font-mono transition-colors flex items-center gap-2 ${
            activeTab === 'build'
              ? 'text-accent border-b-2 border-accent bg-accent/5'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <span>◈</span>
          Build
        </button>
      </div>

      {/* Panel Content */}
      {activeTab === 'test' ? <TestPanel /> : <BuildPanel />}
    </LayoutShell>
  )
}
