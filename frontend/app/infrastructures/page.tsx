"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, Network } from "lucide-react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { InfraCard } from "@/components/infrastructure/InfraCard";
import { api } from "@/lib/api";
import { useIsOperator } from "@/lib/auth";
import { Infrastructure } from "@/types/infrastructure";

export default function InfrastructuresPage() {
  const router = useRouter();
  const isOperator = useIsOperator();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: infrastructures = [], isLoading, refetch } = useQuery({
    queryKey: ["infrastructures"],
    queryFn: () => api.getInfrastructures(),
    refetchInterval: 30000,
  });

  const filtered = (infrastructures as Infrastructure[]).filter((infra) => {
    const matchesSearch =
      infra.name.toLowerCase().includes(search.toLowerCase()) ||
      infra.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      infra.description?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "all" || infra.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const runningCount = infrastructures.filter((i: Infrastructure) => i.status === "running").length;
  const stoppedCount = infrastructures.filter(
    (i: Infrastructure) => i.status === "stopped" || i.status === "draft"
  ).length;
  const errorCount = infrastructures.filter((i: Infrastructure) => i.status === "error").length;

  return (
    <div>
      <Header
        title="Infrastructures"
        description="Create and manage multi-agent systems"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{infrastructures.length}</p>
            <p className="text-sm text-foreground-muted">Total</p>
          </div>
          <div className="card p-4 text-center border-success/30">
            <p className="text-2xl font-bold text-success">{runningCount}</p>
            <p className="text-sm text-foreground-muted">Running</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground-muted">{stoppedCount}</p>
            <p className="text-sm text-foreground-muted">Stopped / Draft</p>
          </div>
          <div className="card p-4 text-center border-error/30">
            <p className="text-2xl font-bold text-error">{errorCount}</p>
            <p className="text-sm text-foreground-muted">Error</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search infrastructures..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 w-64"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-40"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="draft">Draft</option>
              <option value="generated">Generated</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="btn-secondary btn-md"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>

            {isOperator && (
              <button
                onClick={() => router.push("/infrastructures/new")}
                className="btn-primary btn-md"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Infrastructure
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Network className="w-12 h-12 text-foreground-muted mx-auto mb-4" />
            <p className="text-foreground-muted mb-2">
              {search || statusFilter !== "all"
                ? "No infrastructures match your filters"
                : "No infrastructures created yet"}
            </p>
            {isOperator && !search && statusFilter === "all" && (
              <button
                onClick={() => router.push("/infrastructures/new")}
                className="btn-primary btn-md mt-4"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Infrastructure
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((infra) => (
              <InfraCard
                key={infra.id}
                infra={infra}
                onClick={() => router.push(`/infrastructures/${infra.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
