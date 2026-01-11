'use client'

const escalations = [
  { time: '10:23', reason: 'user requested', category: 'pagos', resolution: 'resolved by agent' },
  { time: '09:45', reason: 'negative sentiment', category: 'quejas', resolution: 'pending' },
  { time: '09:12', reason: '3 retries', category: 'fugas', resolution: 'resolved by agent' },
  { time: '08:30', reason: 'keyword: abogado', category: 'contratos', resolution: 'transferred to legal' },
]

const categories = [
  { name: 'fugas', percentage: 34 },
  { name: 'pagos', percentage: 28 },
  { name: 'contratos', percentage: 18 },
  { name: 'consumos', percentage: 12 },
  { name: 'otros', percentage: 8 },
]

const funnel = [
  { name: 'started', percentage: 100 },
  { name: 'collected', percentage: 82 },
  { name: 'resolved', percentage: 78 },
  { name: 'escalated', percentage: 12 },
]

const volumeData = [
  { day: 'Jan 4', value: 180 },
  { day: '5', value: 220 },
  { day: '6', value: 310 },
  { day: '7', value: 280 },
  { day: '8', value: 340 },
  { day: '9', value: 290 },
  { day: '10', value: 227 },
]

function Nav() {
  return (
    <nav className="nav">
      <div className="flex items-center gap-4">
        <span className="nav-brand"><span className="text-xl">◉</span> PACO</span>
        <span className="nav-breadcrumb">/ monitoring</span>
      </div>
      <div className="flex items-center gap-3">
        <select className="input w-32 py-1 text-sm">
          <option>last 7 days</option>
          <option>last 30 days</option>
          <option>this month</option>
        </select>
        <span className="kbd">⌘K</span>
      </div>
    </nav>
  )
}

function TopStats() {
  const stats = [
    { label: 'conversations', value: '1,847' },
    { label: 'resolved', value: '78%' },
    { label: 'escalated', value: '12%' },
    { label: 'tokens', value: '264.5m' },
    { label: 'avg response', value: '1.8s' },
    { label: 'peak hour', value: '16:00' },
  ]
  return (
    <div className="stats-grid mb-8">
      {stats.map(s => (
        <div key={s.label} className="stat">
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">{s.value}</div>
        </div>
      ))}
    </div>
  )
}

function VolumeChart() {
  const maxValue = Math.max(...volumeData.map(d => d.value))
  return (
    <div className="section">
      <div className="section-title">volume</div>
      <div className="card">
        <div className="h-48 flex items-end justify-between gap-2">
          {volumeData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div
                className="w-full bg-accent rounded-t transition-all hover:bg-accent-dim"
                style={{ height: `${(d.value / maxValue) * 100}%` }}
              />
              <span className="text-text-muted text-xs font-mono">{d.day}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BarChart({ data, title }: { data: { name: string; percentage: number }[]; title: string }) {
  return (
    <div>
      <div className="section-title">{title}</div>
      <div className="bar-chart">
        {data.map(item => (
          <div key={item.name} className="bar-row">
            <div className="bar-label">{item.name}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${item.percentage}%` }} />
            </div>
            <div className="w-12 text-text-muted text-right">{item.percentage}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EscalationsTable() {
  return (
    <div className="section">
      <div className="section-title">recent escalations</div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>time</th>
              <th>reason</th>
              <th>category</th>
              <th>resolution</th>
            </tr>
          </thead>
          <tbody>
            {escalations.map((esc, i) => (
              <tr key={i}>
                <td className="text-text-muted">{esc.time}</td>
                <td>{esc.reason}</td>
                <td className="text-accent">{esc.category}</td>
                <td className={esc.resolution === 'pending' ? 'text-warning' : 'text-text-secondary'}>
                  {esc.resolution}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Monitoring() {
  return (
    <div className="page">
      <Nav />
      <TopStats />
      <VolumeChart />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <BarChart data={categories} title="by category" />
        <BarChart data={funnel} title="resolution funnel" />
      </div>
      <EscalationsTable />
    </div>
  )
}
