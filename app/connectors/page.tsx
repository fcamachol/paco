'use client'

const connectors = [
  { id: '1', name: 'AGORA', type: 'REST API', status: 'connected', tools: 5, endpoint: 'agora.humansoftware.mx/api/v1' },
  { id: '2', name: 'CEA SOAP', type: 'SOAP', status: 'connected', tools: 4, endpoint: 'cea.qro.gob.mx/ws' },
  { id: '3', name: 'PostgreSQL', type: 'Database', status: 'connected', tools: 12, endpoint: 'localhost:5432/agora' },
  { id: '4', name: 'Chatwoot', type: 'Webhook', status: 'pending', tools: 0, endpoint: 'chatwoot.humansoftware.mx' },
]

function Nav() {
  return (
    <nav className="nav">
      <div className="flex items-center gap-4">
        <span className="nav-brand"><span className="text-xl">◉</span> PACO</span>
        <span className="nav-breadcrumb">/ connectors</span>
      </div>
      <span className="kbd">⌘K</span>
    </nav>
  )
}

export default function ConnectorsPage() {
  return (
    <div className="page">
      <Nav />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Connectors</h1>
        <button className="btn btn-primary">+ add connector</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map(conn => (
          <div key={conn.id} className="card hover:glow cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{conn.name}</span>
                <span className="text-text-muted text-xs bg-bg-tertiary px-2 py-0.5 rounded">{conn.type}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`status-dot ${conn.status === 'connected' ? 'active' : 'beta'}`} />
                <span className="text-text-muted text-sm">{conn.status}</span>
              </div>
            </div>
            <div className="text-text-muted text-sm font-mono mb-3">{conn.endpoint}</div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{conn.tools} tools discovered</span>
              <button className="btn btn-ghost text-xs">configure</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <div className="section-title">available integrations</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['Salesforce', 'Zendesk', 'Twilio', 'Slack', 'Discord', 'Telegram', 'WhatsApp', 'Email'].map(name => (
            <div key={name} className="card text-center py-6 opacity-50 hover:opacity-100 transition-opacity">
              <div className="text-text-secondary text-sm">{name}</div>
              <div className="text-text-muted text-xs mt-1">coming soon</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
