"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Workflow,
  Bot,
  Wrench,
  BookOpen,
  Activity,
  Users,
  Settings,
  LogOut,
  ExternalLink,
  Network,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Builder", href: "/builder", icon: Workflow },
  { name: "Infrastructures", href: "/infrastructures", icon: Network },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Tools", href: "/tools", icon: Wrench },
  { name: "Skills", href: "/skills", icon: BookOpen },
  { name: "Executions", href: "/executions", icon: Activity },
  { name: "Training", href: "/training", icon: Zap },
  { name: "Users", href: "/users", icon: Users, adminOnly: true },
  { name: "Settings", href: "/settings", icon: Settings },
];

const externalLinks = [
  {
    name: "Langfuse",
    href: process.env.NEXT_PUBLIC_LANGFUSE_URL || "http://localhost:3001",
    description: "Observability",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-background-secondary border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-coral-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span className="text-xl font-bold text-gradient">PACO</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          // Hide admin-only items from non-admins
          if (item.adminOnly && user?.role !== "admin") {
            return null;
          }

          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "sidebar-link",
                isActive && "sidebar-link-active"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}

        {/* External Links */}
        <div className="pt-4 mt-4 border-t border-border">
          <p className="px-3 text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
            External
          </p>
          {externalLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-link group"
            >
              <ExternalLink className="w-5 h-5" />
              <span className="flex-1">{link.name}</span>
              <span className="text-xs text-foreground-muted group-hover:text-foreground">
                {link.description}
              </span>
            </a>
          ))}
        </div>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-coral-500/20 flex items-center justify-center">
            <span className="text-coral-500 font-medium text-sm">
              {user?.name?.charAt(0).toUpperCase() || "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name || "Unknown"}
            </p>
            <p className="text-xs text-foreground-muted capitalize">
              {user?.role || "viewer"}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="sidebar-link w-full text-error hover:bg-error/10"
        >
          <LogOut className="w-5 h-5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
