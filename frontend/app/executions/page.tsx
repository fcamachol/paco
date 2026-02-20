"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ExternalLink, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api, Execution } from "@/lib/api";
import { cn, formatDateTime, formatDuration, formatCost, formatTokens, getStatusColor } from "@/lib/utils";

export default function ExecutionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  // Fetch executions
  const { data: executions = [], isLoading } = useQuery({
    queryKey: ["executions", statusFilter, limit],
    queryFn: () =>
      api.getExecutions({
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit,
      }),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Filter by search
  const filteredExecutions = executions.filter(
    (ex) =>
      ex.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
      ex.conversation_id?.toLowerCase().includes(search.toLowerCase()) ||
      ex.trace_id?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "error":
        return <XCircle className="w-4 h-4 text-error" />;
      case "running":
        return (
          <div className="w-4 h-4 border-2 border-coral-500 border-t-transparent rounded-full animate-spin" />
        );
      case "timeout":
        return <Clock className="w-4 h-4 text-warning" />;
      default:
        return <AlertCircle className="w-4 h-4 text-foreground-muted" />;
    }
  };

  return (
    <div>
      <Header
        title="Executions"
        description="View agent execution logs and traces"
      />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search by agent, conversation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 w-80"
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
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="timeout">Timeout</option>
            </select>

            {/* Limit */}
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="input w-32"
            >
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={200}>200 rows</option>
            </select>
          </div>
        </div>

        {/* Executions Table */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Agent
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Started
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Duration
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">
                    Tokens
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">
                    Cost
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Model
                  </th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-foreground-muted">
                    Trace
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
                      </div>
                    </td>
                  </tr>
                ) : filteredExecutions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-foreground-muted"
                    >
                      {search || statusFilter !== "all"
                        ? "No executions match your filters"
                        : "No executions recorded yet"}
                    </td>
                  </tr>
                ) : (
                  filteredExecutions.map((execution) => (
                    <tr
                      key={execution.id}
                      className="border-b border-border hover:bg-background-secondary transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(execution.status)}
                          <span
                            className={cn(
                              "text-sm capitalize",
                              execution.status === "success" && "text-success",
                              execution.status === "error" && "text-error",
                              execution.status === "running" && "text-coral-500",
                              execution.status === "timeout" && "text-warning"
                            )}
                          >
                            {execution.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {execution.agent_name || "Unknown"}
                          </p>
                          {execution.conversation_id && (
                            <p className="text-xs text-foreground-muted font-mono truncate max-w-[200px]">
                              {execution.conversation_id}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {formatDateTime(execution.started_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {execution.duration_ms
                          ? formatDuration(execution.duration_ms)
                          : execution.status === "running"
                          ? "..."
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className="text-foreground">
                          {formatTokens(execution.total_tokens)}
                        </span>
                        <span className="text-foreground-muted text-xs block">
                          {formatTokens(execution.input_tokens)} /{" "}
                          {formatTokens(execution.output_tokens)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">
                        {formatCost(execution.total_cost)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {execution.model || "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {execution.langfuse_trace_id ? (
                          <button
                            onClick={async () => {
                              try {
                                const { full_url } = await api.getLangfuseEmbedUrl(
                                  execution.langfuse_trace_id!
                                );
                                window.open(full_url, "_blank");
                              } catch {
                                // Fallback to direct link
                                const langfuseUrl =
                                  process.env.NEXT_PUBLIC_LANGFUSE_URL ||
                                  "http://localhost:3001";
                                window.open(
                                  `${langfuseUrl}/traces/${execution.langfuse_trace_id}`,
                                  "_blank"
                                );
                              }
                            }}
                            className="text-coral-500 hover:text-coral-400"
                            title="View in Langfuse"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-foreground-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
