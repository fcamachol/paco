'use client'
import Link from 'next/link'
import { LayoutShell } from '@/components/layout-shell'

const agents = [
  { id: '1', name: 'María', description: 'CEA Querétaro customer service', status: 'active', conversations: 234, model: 'sonnet', accuracy: '94%' },
  { id: '2', name: 'TickIt', description: 'Ticket classification & routing', status: 'active', conversations: 1203, model: 'haiku', accuracy: '97%' },
  { id: '3', name: 'Copilot', description: 'Admin database control', status: 'beta', conversations: 0, model: 'opus', accuracy: '--' },
]

export default function AgentsPage() {
  return (
    <LayoutShell breadcrumb="/ agents">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Agents</h1>
        <button className="btn btn-primary">+ new agent</button>
      </div>
      <div className="space-y-3">
        {agents.map(agent => (
          <Link href={`/agents/${agent.id}/configure`} key={agent.id}>
            <div className="card hover:glow cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <span className={`status-dot ${agent.status}`} />
                    </div>
                    <div className="text-text-secondary text-sm">{agent.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-8 font-mono text-sm">
                  <div className="stat">
                    <div className="stat-label">model</div>
                    <div className="text-text-primary">{agent.model}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">accuracy</div>
                    <div className="text-accent">{agent.accuracy}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">today</div>
                    <div className="text-text-primary">{agent.conversations || '--'}</div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </LayoutShell>
  )
}
