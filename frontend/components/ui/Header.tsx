"use client";

import { Bell, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-background-secondary px-6 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-foreground-muted">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder="Search..."
            className="input pl-9 w-64"
          />
        </div>

        {/* Notifications */}
        <button className="btn-ghost p-2 rounded-md">
          <Bell className="w-5 h-5 text-foreground-muted" />
        </button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-coral-500/20 flex items-center justify-center">
          <span className="text-coral-500 font-medium text-sm">
            {user?.name?.charAt(0).toUpperCase() || "?"}
          </span>
        </div>
      </div>
    </header>
  );
}
