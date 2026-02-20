"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, Wifi, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { AgentCard } from "@/components/agents/AgentCard";
import { api, Agent } from "@/lib/api";
import { useIsOperator } from "@/lib/auth";
import { useWebSocket } from "@/lib/websocket";

export default function AgentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isOperator = useIsOperator();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Real-time status via WebSocket
  const { data: wsData, isConnected: wsConnected } = useWebSocket<{
    type: string;
    agents: Array<{ name: string; status: string }>;
  }>("ws/agents/status");

  const liveStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (wsData?.agents) {
      for (const a of wsData.agents) {
        map[a.name] = a.status;
      }
    }
    return map;
  }, [wsData]);

  // Fetch agents
  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
    refetchInterval: 30000,
  });

  // Mutations
  const startMutation = useMutation({
    mutationFn: (id: string) => api.startAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.stopAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => api.restartAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncAgentsFromYaml(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      agent.description?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || agent.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Stats
  const runningCount = agents.filter((a) => a.status === "running").length;
  const stoppedCount = agents.filter((a) => a.status === "stopped").length;
  const errorCount = agents.filter((a) => a.status === "error").length;

  return (
    <div>
      <Header
        title="Agents"
        description="Manage your AI agents and their lifecycle"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{agents.length}</p>
            <p className="text-sm text-foreground-muted">Total Agents</p>
          </div>
          <div className="card p-4 text-center border-success/30">
            <p className="text-2xl font-bold text-success">{runningCount}</p>
            <p className="text-sm text-foreground-muted">Running</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground-muted">
              {stoppedCount}
            </p>
            <p className="text-sm text-foreground-muted">Stopped</p>
          </div>
          <div className="card p-4 text-center border-error/30">
            <p className="text-2xl font-bold text-error">{errorCount}</p>
            <p className="text-sm text-foreground-muted">Error</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search agents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 w-64"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-40"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Live status indicator */}
            <span
              className="flex items-center gap-1 text-xs text-foreground-muted"
              title={wsConnected ? "Live updates active" : "Live updates disconnected"}
            >
              {wsConnected ? (
                <Wifi className="w-3.5 h-3.5 text-success" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-foreground-muted" />
              )}
            </span>

            {isOperator && (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="btn-secondary btn-md"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${
                    syncMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                Sync from YAML
              </button>
            )}

            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="btn-secondary btn-md"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>

            {isOperator && (
              <Link href="/agents/new" className="btn-primary btn-md">
                <Plus className="w-4 h-4 mr-2" />
                Add Agent
              </Link>
            )}
          </div>
        </div>

        {/* Agents Grid */}
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-foreground-muted">
              {search || statusFilter !== "all"
                ? "No agents match your filters"
                : "No agents registered yet"}
            </p>
            {isOperator && !search && statusFilter === "all" && (
              <button
                onClick={() => syncMutation.mutate()}
                className="btn-primary btn-md mt-4"
              >
                Sync from YAML Files
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                liveStatus={liveStatusMap[agent.pm2_name || agent.name]}
                onClick={() => router.push(`/agents/${agent.id}`)}
                onStart={() => startMutation.mutate(agent.id)}
                onStop={() => stopMutation.mutate(agent.id)}
                onRestart={() => restartMutation.mutate(agent.id)}
                isLoading={
                  startMutation.isPending ||
                  stopMutation.isPending ||
                  restartMutation.isPending
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
