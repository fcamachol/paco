'use client'
import { useState } from 'react'
import { LayoutShell } from '@/components/layout-shell'

const toolGroups = [
  {
    source: 'AGORA',
    tools: [
      { name: 'create_ticket', description: 'Create ticket', enabled: true },
      { name: 'get_ticket_status', description: 'Check ticket by folio', enabled: true },
      { name: 'list_categories', description: 'Get categories', enabled: true },
      { name: 'update_ticket', description: 'Modify ticket', enabled: false },
    ]
  },
  {
    source: 'CEA SOAP',
    tools: [
      { name: 'get_deuda', description: 'Query balance', enabled: true },
      { name: 'get_consumo', description: 'Get consumption', enabled: true },
      { name: 'validate_contract', description: 'Verify contract', enabled: true },
    ]
  },
  {
    source: 'system',
    tools: [
      { name: 'transfer_to_human', description: 'Escalate', enabled: true },
      { name: 'send_notification', description: 'Push notification', enabled: false },
    ]
  }
]

export default function AgentConfig() {
  const [groups, setGroups] = useState(toolGroups)
  const [activeTab, setActiveTab] = useState('tools')
  const tabs = ['general', 'prompts', 'tools', 'workflows', 'escalation']

  const toggleTool = (gi: number, ti: number) => {
    const newGroups = [...groups]
    newGroups[gi].tools[ti].enabled = !newGroups[gi].tools[ti].enabled
    setGroups(newGroups)
  }

  const enabledCount = groups.reduce((a, g) => a + g.tools.filter(t => t.enabled).length, 0)

  return (
    <LayoutShell breadcrumb="/ agents / maría / configure">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-medium">María</h1>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="status-dot active" />
            <span className="text-text-muted">active</span>
          </div>
        </div>
        <p className="text-text-secondary text-sm">CEA Querétaro customer service agent</p>
      </div>
      <div className="tabs">
        {tabs.map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="section-title mb-0">tools</div>
            <span className="text-accent font-mono text-sm">{enabledCount} enabled</span>
          </div>
          <input type="text" className="input mb-4" placeholder="search tools..." />
          <div className="font-mono text-sm">
            {groups.map((group, gi) => (
              <div key={group.source} className="mb-4">
                <div className="text-text-muted text-xs mb-2">from {group.source}</div>
                {group.tools.map((tool, ti) => (
                  <div key={tool.name} className="tree-item group" onClick={() => toggleTool(gi, ti)}>
                    <span className="text-text-muted">{ti === group.tools.length - 1 ? '└─' : '├─'}</span>
                    <input type="checkbox" className="w-4 h-4" checked={tool.enabled} onChange={() => toggleTool(gi, ti)} onClick={e => e.stopPropagation()} />
                    <span className={tool.enabled ? '' : 'text-text-muted'}>{tool.name}</span>
                    <span className="text-text-muted text-xs ml-auto opacity-0 group-hover:opacity-100">{tool.description}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <button className="btn btn-ghost mt-4">+ custom tool</button>
        </div>
        <div className="card">
          <div className="text-text-muted text-sm mb-4 font-mono">tool preview</div>
          <div className="debug-json">
            <pre>{JSON.stringify({ name: "create_ticket", parameters: { category_id: "string", title: "string" } }, null, 2)}</pre>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn">test tool</button>
            <button className="btn btn-ghost">view docs</button>
          </div>
        </div>
      </div>
      <div className="mt-8 flex justify-end gap-2">
        <button className="btn btn-ghost">cancel</button>
        <button className="btn btn-primary">save draft</button>
      </div>
    </LayoutShell>
  )
}
