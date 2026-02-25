"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  MessageSquare,
  Play,
  ShieldCheck,
  Download,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api, SessionRun } from "@/lib/api";
import {
  cn,
  formatDateTime,
  formatDuration,
  formatCost,
  formatTokens,
} from "@/lib/utils";

export default function SessionRunsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["session-runs", statusFilter, sourceFilter, page],
    queryFn: () =>
      api.getSessionRuns({
        status: statusFilter !== "all" ? statusFilter : undefined,
        source: sourceFilter !== "all" ? sourceFilter : undefined,
        page,
        per_page: perPage,
      }),
    refetchInterval: 15000,
  });

  const sessions = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / perPage);

  // Client-side search filter
  const filtered = sessions.filter(
    (s) =>
      s.title?.toLowerCase().includes(search.toLowerCase()) ||
      s.source?.toLowerCase().includes(search.toLowerCase()) ||
      s.model?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "error":
        return <XCircle className="w-4 h-4 text-error" />;
      case "active":
        return (
          <div className="w-4 h-4 border-2 border-coral-500 border-t-transparent rounded-full animate-spin" />
        );
      case "cancelled":
        return <Clock className="w-4 h-4 text-warning" />;
      default:
        return <AlertCircle className="w-4 h-4 text-foreground-muted" />;
    }
  };

  const getSourceBadge = (source: string) => {
    const colors: Record<string, string> = {
      playground: "bg-blue-500/20 text-blue-400",
      api: "bg-green-500/20 text-green-400",
      webhook: "bg-purple-500/20 text-purple-400",
      a2a: "bg-yellow-500/20 text-yellow-400",
      company: "bg-coral-500/20 text-coral-400",
    };
    return (
      <span
        className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium",
          colors[source] || "bg-foreground-muted/20 text-foreground-muted"
        )}
      >
        {source}
      </span>
    );
  };

  // KPI stats
  const activeCount = sessions.filter((s) => s.status === "active").length;
  const totalTokens = sessions.reduce(
    (acc, s) => acc + s.total_input_tokens + s.total_output_tokens,
    0
  );
  const totalCostSum = sessions.reduce((acc, s) => acc + s.total_cost, 0);

  return (
    <div>
      <Header
        title="Session Runs"
        description="Full conversation replay for debugging and audit"
      />

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{total}</p>
            <p className="text-sm text-foreground-muted">Total Sessions</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-coral-500">{activeCount}</p>
            <p className="text-sm text-foreground-muted">Active</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {formatTokens(totalTokens)}
            </p>
            <p className="text-sm text-foreground-muted">Tokens (page)</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">
              {formatCost(totalCostSum)}
            </p>
            <p className="text-sm text-foreground-muted">Cost (page)</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search by title, source, model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 w-80"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="input w-40"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="error">Error</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
              className="input w-40"
            >
              <option value="all">All Sources</option>
              <option value="playground">Playground</option>
              <option value="api">API</option>
              <option value="webhook">Webhook</option>
              <option value="a2a">A2A</option>
              <option value="company">Company</option>
            </select>
          </div>
        </div>

        {/* Sessions Table */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Title
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Source
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">
                    Started
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">
                    Messages
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-foreground-muted"
                    >
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      {search || statusFilter !== "all" || sourceFilter !== "all"
                        ? "No sessions match your filters"
                        : "No session runs recorded yet. Use the Playground to create one."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((session) => (
                    <tr
                      key={session.id}
                      className="border-b border-border hover:bg-background-secondary transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(session.status)}
                          <span
                            className={cn(
                              "text-sm capitalize",
                              session.status === "completed" && "text-success",
                              session.status === "error" && "text-error",
                              session.status === "active" && "text-coral-500",
                              session.status === "cancelled" && "text-warning"
                            )}
                          >
                            {session.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/session-runs/${session.id}`}
                          className="text-sm font-medium text-foreground hover:text-coral-500 transition-colors"
                        >
                          {session.title
                            ? session.title.length > 60
                              ? session.title.slice(0, 60) + "..."
                              : session.title
                            : "Untitled Session"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {getSourceBadge(session.source)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {formatDateTime(session.started_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">
                        {session.message_count}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className="text-foreground">
                          {formatTokens(
                            session.total_input_tokens +
                              session.total_output_tokens
                          )}
                        </span>
                        <span className="text-foreground-muted text-xs block">
                          {formatTokens(session.total_input_tokens)} /{" "}
                          {formatTokens(session.total_output_tokens)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">
                        {formatCost(session.total_cost)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">
                        {session.model || "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/session-runs/${session.id}`}
                          className="text-coral-500 hover:text-coral-400 inline-block"
                          title="View replay"
                        >
                          <Play className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-foreground-muted">
                Showing {(page - 1) * perPage + 1}–
                {Math.min(page * perPage, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-ghost btn-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-foreground-muted">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-ghost btn-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
