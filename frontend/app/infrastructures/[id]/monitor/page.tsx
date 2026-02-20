"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Heart,
  Zap,
  AlertTriangle,
  Terminal,
  RefreshCw,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { InfraStatusBadge } from "@/components/infrastructure/InfraStatusBadge";

export default function MonitorPage() {
  const { id } = useParams<{ id: string }>();
  const [logService, setLogService] = useState<string | undefined>(undefined);
  const [logTail, setLogTail] = useState(100);

  const { data: infra } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ["infra-health", id],
    queryFn: () => api.getInfraHealth(id),
    refetchInterval: 15000,
  });

  const { data: metrics } = useQuery({
    queryKey: ["infra-metrics", id],
    queryFn: () => api.getInfraMetrics(id),
    refetchInterval: 30000,
  });

  const { data: agentMetrics = [] } = useQuery({
    queryKey: ["infra-agent-metrics", id],
    queryFn: () => api.getInfraAgentMetrics(id),
    refetchInterval: 30000,
  });

  const { data: circuits = [] } = useQuery({
    queryKey: ["infra-circuits", id],
    queryFn: () => api.getInfraCircuits(id),
    refetchInterval: 15000,
  });

  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ["infra-logs", id, logService, logTail],
    queryFn: () => api.getInfraLogs(id, logService, logTail),
    refetchInterval: 10000,
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "healthy":
        return "bg-success";
      case "unhealthy":
        return "bg-error";
      case "degraded":
        return "bg-yellow-400";
      default:
        return "bg-foreground-muted";
    }
  };

  const circuitColor = (state: string) => {
    switch (state) {
      case "closed":
        return "text-success";
      case "open":
        return "text-error";
      case "half_open":
        return "text-yellow-400";
      default:
        return "text-foreground-muted";
    }
  };

  return (
    <div>
      <Header
        title="Monitoring"
        description={
          infra?.display_name || "Infrastructure health and metrics"
        }
      />

      <div className="p-6 space-y-6">
        {/* Health Grid */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-coral-500" />
              <h2 className="text-lg font-semibold">Service Health</h2>
            </div>
            <button
              onClick={() => refetchHealth()}
              className="btn-secondary btn-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </button>
          </div>

          {health?.services?.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No health data available. Infrastructure may not be running.
            </p>
          ) : (
            <>
              {/* Summary */}
              {health?.summary && (
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-success" />
                    <span className="text-sm">
                      {health.summary.healthy} Healthy
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span className="text-sm">
                      {health.summary.degraded} Degraded
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-error" />
                    <span className="text-sm">
                      {health.summary.unhealthy} Unhealthy
                    </span>
                  </div>
                </div>
              )}

              {/* Service Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {health?.services?.map((svc: any) => (
                  <div
                    key={svc.service_name}
                    className="p-3 bg-background-secondary rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-2 h-2 rounded-full ${statusColor(
                          svc.status
                        )}`}
                      />
                      <span className="text-sm font-medium truncate">
                        {svc.service_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground-muted">
                      <span className="capitalize">{svc.service_type}</span>
                      {svc.response_time_ms && (
                        <span>{svc.response_time_ms}ms</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Metrics + Circuit Breakers row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Aggregated Metrics */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-coral-500" />
              <h2 className="text-lg font-semibold">Metrics</h2>
            </div>

            {metrics ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-background-secondary rounded-lg">
                  <p className="text-xs text-foreground-muted">
                    Total Requests
                  </p>
                  <p className="text-xl font-bold">
                    {metrics.total_requests?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-3 bg-background-secondary rounded-lg">
                  <p className="text-xs text-foreground-muted">Total Tokens</p>
                  <p className="text-xl font-bold">
                    {metrics.total_tokens?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-3 bg-background-secondary rounded-lg">
                  <p className="text-xs text-foreground-muted">Avg Latency</p>
                  <p className="text-xl font-bold">
                    {metrics.avg_latency_ms?.toFixed(0) || 0}ms
                  </p>
                </div>
                <div className="p-3 bg-background-secondary rounded-lg">
                  <p className="text-xs text-foreground-muted">Error Rate</p>
                  <p
                    className={`text-xl font-bold ${
                      (metrics.error_rate || 0) > 5 ? "text-error" : ""
                    }`}
                  >
                    {metrics.error_rate?.toFixed(1) || 0}%
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">
                No metrics available yet.
              </p>
            )}
          </div>

          {/* Circuit Breakers */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-coral-500" />
              <h2 className="text-lg font-semibold">Circuit Breakers</h2>
            </div>

            {(circuits as any[]).length === 0 ? (
              <p className="text-sm text-foreground-muted">
                No circuit breaker data available.
              </p>
            ) : (
              <div className="space-y-2">
                {(circuits as any[]).map((cb: any) => (
                  <div
                    key={cb.agent_slug}
                    className="flex items-center justify-between p-3 bg-background-secondary rounded-lg"
                  >
                    <div>
                      <span className="text-sm font-medium">
                        {cb.display_name || cb.agent_slug}
                      </span>
                      {cb.failure_count > 0 && (
                        <span className="text-xs text-error ml-2">
                          {cb.failure_count} failures
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium uppercase ${circuitColor(
                        cb.circuit_state
                      )}`}
                    >
                      {cb.circuit_state === "half_open"
                        ? "HALF OPEN"
                        : cb.circuit_state?.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent Metrics Table */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-coral-500" />
            <h2 className="text-lg font-semibold">Agent Metrics</h2>
          </div>

          {(agentMetrics as any[]).length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No agent metrics available yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium">Agent</th>
                    <th className="text-right py-2 px-3 font-medium">Status</th>
                    <th className="text-right py-2 px-3 font-medium">
                      Requests
                    </th>
                    <th className="text-right py-2 px-3 font-medium">Tokens</th>
                    <th className="text-right py-2 px-3 font-medium">Errors</th>
                    <th className="text-right py-2 px-3 font-medium">
                      Avg Latency
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(agentMetrics as any[]).map((am: any) => (
                    <tr
                      key={am.agent_slug}
                      className="border-b border-border/50"
                    >
                      <td className="py-2 px-3">
                        <span className="font-medium">
                          {am.display_name || am.agent_slug}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <InfraStatusBadge status={am.status} />
                      </td>
                      <td className="py-2 px-3 text-right">
                        {am.total_requests.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {am.total_tokens.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span
                          className={am.total_errors > 0 ? "text-error" : ""}
                        >
                          {am.total_errors}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {am.avg_latency_ms.toFixed(0)}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Log Viewer */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-coral-500" />
              <h2 className="text-lg font-semibold">Logs</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="input text-sm"
                value={logService || ""}
                onChange={(e) =>
                  setLogService(e.target.value || undefined)
                }
              >
                <option value="">All Services</option>
                <option value="orchestrator">Orchestrator</option>
                {infra?.agents?.map((a: any) => (
                  <option key={a.agent_id_slug} value={`agent-${a.agent_id_slug}`}>
                    {a.display_name || a.agent_id_slug}
                  </option>
                ))}
                <option value="redis">Redis</option>
                <option value="postgres">PostgreSQL</option>
              </select>
              <select
                className="input text-sm w-20"
                value={logTail}
                onChange={(e) => setLogTail(Number(e.target.value))}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
              <button
                onClick={() => refetchLogs()}
                className="btn-secondary btn-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-[#1a1a2e] rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
              {logs?.logs || "No logs available. Infrastructure may not be running."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
