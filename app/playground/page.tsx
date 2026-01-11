'use client'
import { useState } from 'react'
import { LayoutShell } from '@/components/layout-shell'

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

function ChatPanel() {
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

function DebugPanel() {
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

export default function Playground() {
  return (
    <LayoutShell breadcrumb="/ playground">
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
        <ChatPanel />
        <DebugPanel />
      </div>
    </LayoutShell>
  )
}
