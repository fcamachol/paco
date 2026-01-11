'use client'
import { LayoutShell } from '@/components/layout-shell'

const agents = [
  { id: '1', name: 'María', description: 'CEA Customer', status: 'active', conversations: 234 },
  { id: '2', name: 'TickIt', description: 'Ticket Intel', status: 'active', conversations: 1203 },
  { id: '3', name: 'Copilot', description: 'Admin Control', status: 'beta', conversations: 0 },
]

const stats = [
  { label: 'conversations', value: '1,847' },
  { label: 'resolved', value: '78%' },
  { label: 'escalated', value: '12%' },
  { label: 'tokens', value: '264.5m' },
  { label: 'avg response', value: '1.8s' },
  { label: 'peak hour', value: '16:00' },
]

function AgentCard({ agent }: { agent: typeof agents[0] }) {
  return (
    <div className="card hover:glow cursor-pointer">
      <div className="card-title">{agent.name}</div>
      <div className="card-description">{agent.description}</div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <span className={`status-dot ${agent.status}`} />
          <span className="text-text-muted">{agent.status}</span>
        </div>
        <span className="text-accent font-mono">
          {agent.conversations > 0 ? `${agent.conversations.toLocaleString()} today` : '--'}
        </span>
      </div>
    </div>
  )
}

function Heatmap() {
  const data = Array.from({ length: 52 }, () => 
    Array.from({ length: 7 }, (_, i) => Math.random() > (i > 45 ? 0.2 : 0.9) ? Math.floor(Math.random() * 5) : 0)
  )
  return (
    <div className="font-mono text-xs">
      <div className="flex mb-1 ml-8 text-text-muted">
        {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan'].map((m,i) => 
          <span key={i} className="flex-1">{m}</span>
        )}
      </div>
      {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((day, dayIndex) => (
        <div key={dayIndex} className="flex items-center gap-1 mb-0.5">
          <div className="w-8 text-text-muted text-right pr-2">{day}</div>
          <div className="flex gap-0.5">
            {data.map((week, weekIndex) => (
              <div key={weekIndex} className="heatmap-cell" data-level={week[dayIndex]} />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-2 ml-10 text-text-muted">
        <span>Less</span>
        {[0,1,2,3,4].map(l => <div key={l} className="heatmap-cell" data-level={l} />)}
        <span>More</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <LayoutShell breadcrumb="/ dashboard">
      <section className="section">
        <div className="section-title">agents</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {agents.map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
        <button className="btn btn-ghost">+ new agent</button>
      </section>
      <section className="section">
        <div className="section-title">activity</div>
        <Heatmap />
      </section>
      <section className="section">
        <div className="stats-grid">
          {stats.map(s => (
            <div key={s.label} className="stat">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
            </div>
          ))}
        </div>
      </section>
      <footer className="text-center text-text-muted text-sm font-mono mt-12">
        <p className="text-accent mb-1">PACO resolved ~142 tickets while you were sleeping</p>
        <p>Stats from the last 61 days</p>
      </footer>
    </LayoutShell>
  )
}
