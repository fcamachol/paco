'use client'
import { LayoutShell } from '@/components/layout-shell'
import { useState, useEffect } from 'react'

interface Tool {
  id: string
  slug: string
  name: string
  description: string
  category: string
  isPublic: boolean
  isVerified: boolean
  usageCount: number
  connectorId: string | null
  connector?: { name: string; type: string } | null
  _count?: { agentTools: number }
}

interface Skill {
  id: string
  slug: string
  name: string
  description: string
  type: string
  category: string
  isPublic: boolean
  isVerified: boolean
  usageCount: number
  _count?: { agentSkills: number }
}

type TabType = 'tools' | 'skills'

const categoryColors: Record<string, string> = {
  // Tool categories
  utility: 'bg-blue-500/20 text-blue-400',
  integration: 'bg-purple-500/20 text-purple-400',
  data: 'bg-green-500/20 text-green-400',
  communication: 'bg-yellow-500/20 text-yellow-400',
  general: 'bg-gray-500/20 text-gray-400',
  // Skill categories
  tone: 'bg-pink-500/20 text-pink-400',
  language: 'bg-cyan-500/20 text-cyan-400',
  safety: 'bg-red-500/20 text-red-400',
  domain: 'bg-orange-500/20 text-orange-400',
  government: 'bg-indigo-500/20 text-indigo-400',
}

function ToolCard({ tool }: { tool: Tool }) {
  const isStandalone = !tool.connectorId
  return (
    <div className="card hover:glow cursor-pointer group">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{isStandalone ? '⚡' : '🔌'}</span>
          <div className="card-title">{tool.name}</div>
        </div>
        <div className="flex items-center gap-1">
          {tool.isVerified && (
            <span className="text-accent text-sm" title="Verified">✓</span>
          )}
        </div>
      </div>
      <div className="card-description mb-3">{tool.description}</div>
      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`text-xs px-2 py-0.5 rounded ${categoryColors[tool.category] || categoryColors.general}`}>
          {tool.category}
        </span>
        {isStandalone ? (
          <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent">standalone</span>
        ) : tool.connector && (
          <span className="text-xs px-2 py-0.5 rounded bg-surface-elevated text-text-muted">
            {tool.connector.type}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{tool.usageCount.toLocaleString()} uses</span>
        <span>{tool._count?.agentTools || 0} agents</span>
      </div>
    </div>
  )
}

function SkillCard({ skill }: { skill: Skill }) {
  const typeIcons: Record<string, string> = {
    prompt: '💬',
    behavior: '🛡️',
    composite: '🧩',
  }
  return (
    <div className="card hover:glow cursor-pointer group">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeIcons[skill.type] || '📦'}</span>
          <div className="card-title">{skill.name}</div>
        </div>
        <div className="flex items-center gap-1">
          {skill.isVerified && (
            <span className="text-accent text-sm" title="Verified">✓</span>
          )}
        </div>
      </div>
      <div className="card-description mb-3">{skill.description}</div>
      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`text-xs px-2 py-0.5 rounded ${categoryColors[skill.category] || categoryColors.general}`}>
          {skill.category}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-surface-elevated text-text-muted">
          {skill.type}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{skill.usageCount.toLocaleString()} uses</span>
        <span>{skill._count?.agentSkills || 0} agents</span>
      </div>
    </div>
  )
}

export default function Marketplace() {
  const [activeTab, setActiveTab] = useState<TabType>('tools')
  const [tools, setTools] = useState<Tool[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [toolsRes, skillsRes] = await Promise.all([
          fetch('/api/tools'),
          fetch('/api/skills')
        ])
        if (toolsRes.ok) setTools(await toolsRes.json())
        if (skillsRes.ok) setSkills(await skillsRes.json())
      } catch (err) {
        console.error('Failed to fetch marketplace data:', err)
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const toolCategories = ['all', ...Array.from(new Set(tools.map(t => t.category)))]
  const skillCategories = ['all', ...Array.from(new Set(skills.map(s => s.category)))]
  const categories = activeTab === 'tools' ? toolCategories : skillCategories

  const filteredTools = filter === 'all' ? tools : tools.filter(t => t.category === filter)
  const filteredSkills = filter === 'all' ? skills : skills.filter(s => s.category === filter)

  const verifiedTools = tools.filter(t => t.isVerified).length
  const verifiedSkills = skills.filter(s => s.isVerified).length

  return (
    <LayoutShell breadcrumb="/ marketplace">
      {/* Header Stats */}
      <section className="section">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-mono text-accent mb-1">Marketplace</h1>
            <p className="text-text-muted text-sm">Reusable tools and skills for your agents</p>
          </div>
          <button className="btn btn-primary">+ Publish</button>
        </div>

        <div className="stats-grid mb-6">
          <div className="stat">
            <div className="stat-value">{tools.length}</div>
            <div className="stat-label">tools</div>
          </div>
          <div className="stat">
            <div className="stat-value">{skills.length}</div>
            <div className="stat-label">skills</div>
          </div>
          <div className="stat">
            <div className="stat-value">{verifiedTools + verifiedSkills}</div>
            <div className="stat-label">verified</div>
          </div>
          <div className="stat">
            <div className="stat-value">{tools.filter(t => !t.connectorId).length}</div>
            <div className="stat-label">standalone</div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="section">
        <div className="flex items-center gap-4 mb-4 border-b border-border">
          <button
            onClick={() => { setActiveTab('tools'); setFilter('all') }}
            className={`pb-2 px-1 text-sm font-mono transition-colors ${
              activeTab === 'tools'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text'
            }`}
          >
            ⚡ Tools ({tools.length})
          </button>
          <button
            onClick={() => { setActiveTab('skills'); setFilter('all') }}
            className={`pb-2 px-1 text-sm font-mono transition-colors ${
              activeTab === 'skills'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text'
            }`}
          >
            🧠 Skills ({skills.length})
          </button>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filter === cat
                  ? 'bg-accent text-black'
                  : 'bg-surface-elevated text-text-muted hover:text-text'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center text-text-muted py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTab === 'tools'
              ? filteredTools.map(tool => <ToolCard key={tool.id} tool={tool} />)
              : filteredSkills.map(skill => <SkillCard key={skill.id} skill={skill} />)
            }
          </div>
        )}

        {!loading && ((activeTab === 'tools' && filteredTools.length === 0) ||
                       (activeTab === 'skills' && filteredSkills.length === 0)) && (
          <div className="text-center text-text-muted py-12">
            No {activeTab} found in this category
          </div>
        )}
      </section>

      {/* Legend */}
      <section className="section">
        <div className="flex flex-wrap gap-6 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="text-accent">✓</span>
            <span>PACO Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <span>⚡</span>
            <span>Standalone (no connector)</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🔌</span>
            <span>Connector-based</span>
          </div>
          <div className="flex items-center gap-2">
            <span>💬</span>
            <span>Prompt skill</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🛡️</span>
            <span>Behavior skill</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🧩</span>
            <span>Composite skill</span>
          </div>
        </div>
      </section>
    </LayoutShell>
  )
}
