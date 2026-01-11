'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'dashboard', icon: '◉' },
  { href: '/agents', label: 'agents', icon: '◈' },
  { href: '/connectors', label: 'connectors', icon: '◇' },
  { href: '/playground', label: 'playground', icon: '▷' },
  { href: '/monitoring', label: 'monitoring', icon: '◐' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-48 bg-bg-secondary border-r border-border p-4 flex flex-col">
      <Link href="/dashboard" className="nav-brand mb-8">
        <span className="text-xl">◉</span>
        PACO
      </Link>
      <nav className="flex-1">
        <ul className="space-y-1">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-mono transition-colors ${
                    isActive
                      ? 'text-accent bg-accent/10'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="text-text-muted text-xs font-mono">
        <div>v0.1.0</div>
        <div className="mt-1">fernando@cea</div>
      </div>
    </aside>
  )
}

export function TopNav({ breadcrumb }: { breadcrumb: string }) {
  return (
    <nav className="flex items-center justify-between py-4 border-b border-border mb-6">
      <span className="nav-breadcrumb">{breadcrumb}</span>
      <span className="kbd">⌘K</span>
    </nav>
  )
}
