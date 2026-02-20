"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Zap,
  DollarSign,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { AgentCard } from "@/components/agents/AgentCard";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";
import { AgentCostChart } from "@/components/charts/AgentCostChart";
import { api } from "@/lib/api";
import { formatCost, formatTokens, formatNumber, cn } from "@/lib/utils";

export default function DashboardPage() {
  // Fetch agents
  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch metrics summary
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["metrics", 30],
    queryFn: () => api.getMetricsSummary(30),
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch realtime metrics
  const { data: realtime } = useQuery({
    queryKey: ["realtime-metrics"],
    queryFn: () => api.getRealtimeMetrics(1),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const runningAgents = agents.filter((a) => a.status === "running").length;
  const errorAgents = agents.filter((a) => a.status === "error").length;

  // Calculate trend (compare last 7 days to previous 7 days)
  const recentDays = metrics?.by_day.slice(0, 7) || [];
  const previousDays = metrics?.by_day.slice(7, 14) || [];
  const recentCost = recentDays.reduce((sum, d) => sum + d.total_cost, 0);
  const previousCost = previousDays.reduce((sum, d) => sum + d.total_cost, 0);
  const costTrend =
    previousCost > 0 ? ((recentCost - previousCost) / previousCost) * 100 : 0;

  return (
    <div>
      <Header
        title="Dashboard"
        description="Overview of your AI agents and operations"
      />

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Agents */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground-muted text-sm">Active Agents</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {agentsLoading ? "-" : `${runningAgents}/${agents.length}`}
                </p>
              </div>
              <div
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center",
                  runningAgents > 0 ? "bg-success/20" : "bg-background-tertiary"
                )}
              >
                <Bot
                  className={cn(
                    "w-6 h-6",
                    runningAgents > 0 ? "text-success" : "text-foreground-muted"
                  )}
                />
              </div>
            </div>
            {errorAgents > 0 && (
              <div className="flex items-center gap-1 mt-2 text-error text-sm">
                <AlertCircle className="w-4 h-4" />
                {errorAgents} agent{errorAgents > 1 ? "s" : ""} with errors
              </div>
            )}
          </div>

          {/* Total Tokens */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground-muted text-sm">
                  Tokens (30 days)
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {metricsLoading
                    ? "-"
                    : formatTokens(metrics?.total.total_tokens || 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-coral-500/20 flex items-center justify-center">
                <Zap className="w-6 h-6 text-coral-500" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <span className="text-foreground-muted">
                {formatTokens(metrics?.total.total_input_tokens || 0)} in
              </span>
              <span className="text-foreground-muted">/</span>
              <span className="text-foreground-muted">
                {formatTokens(metrics?.total.total_output_tokens || 0)} out
              </span>
            </div>
          </div>

          {/* Total Cost */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground-muted text-sm">Cost (30 days)</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {metricsLoading
                    ? "-"
                    : formatCost(metrics?.total.total_cost || 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-success/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-success" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 text-sm">
              {costTrend !== 0 && (
                <>
                  {costTrend > 0 ? (
                    <TrendingUp className="w-4 h-4 text-error" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-success" />
                  )}
                  <span
                    className={cn(
                      costTrend > 0 ? "text-error" : "text-success"
                    )}
                  >
                    {Math.abs(costTrend).toFixed(1)}%
                  </span>
                  <span className="text-foreground-muted">vs last week</span>
                </>
              )}
            </div>
          </div>

          {/* Executions */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground-muted text-sm">
                  Executions (30 days)
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {metricsLoading
                    ? "-"
                    : formatNumber(metrics?.total.execution_count || 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-warning/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-warning" />
              </div>
            </div>
            {realtime && (
              <div className="flex items-center gap-2 mt-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-foreground-muted">
                  {realtime.running_executions} running now
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Token Usage Chart */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-foreground">
                Token Usage Over Time
              </h2>
            </div>
            <div className="card-content">
              {metricsLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
                </div>
              ) : metrics?.by_day.length ? (
                <TokenUsageChart data={metrics.by_day} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-foreground-muted">
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Cost by Agent Chart */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-foreground">Cost by Agent</h2>
            </div>
            <div className="card-content">
              {metricsLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
                </div>
              ) : metrics?.by_agent.length ? (
                <AgentCostChart data={metrics.by_agent} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-foreground-muted">
                  No data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Agents Grid */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Agents</h2>
            <a
              href="/agents"
              className="text-sm text-coral-500 hover:text-coral-400"
            >
              View all
            </a>
          </div>
          <div className="card-content">
            {agentsLoading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
              </div>
            ) : agents.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-foreground-muted">
                No agents registered
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.slice(0, 6).map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
