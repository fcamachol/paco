'use client'
import { Sidebar, TopNav } from './navigation'

export function LayoutShell({ children, breadcrumb }: { children: React.ReactNode; breadcrumb: string }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-48 p-6 max-w-5xl">
        <TopNav breadcrumb={breadcrumb} />
        {children}
      </main>
    </div>
  )
}
