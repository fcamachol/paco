"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Clock, XCircle, AlertCircle, Heart } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "heartbeat_ok", label: "Heartbeat OK" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500",
  in_progress: "bg-blue-500/10 text-blue-500",
  completed: "bg-green-500/10 text-green-500",
  failed: "bg-red-500/10 text-red-500",
  heartbeat_ok: "bg-emerald-500/10 text-emerald-500",
  skipped: "bg-gray-500/10 text-gray-500",
};

export default function CompanyTasksPage() {
  const { id } = useParams<{ id: string }>();
  const [filter, setFilter] = useState("all");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["company-tasks", id, filter],
    queryFn: () => {
      if (filter === "active") return api.getCompanyActiveTasks(id);
      const params: any = { limit: 100 };
      if (filter !== "all") params.status = filter;
      return api.getCompanyTasks(id, params);
    },
  });

  return (
    <div>
      <Header title="Tasks" description="Heartbeat results and scheduled job executions" />
      <div className="p-6 space-y-6">
        {/* Filter tabs */}
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-coral-500 text-white" : "bg-background-secondary text-foreground-muted hover:text-foreground"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-background-secondary rounded-lg" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="card p-12 text-center">
            <CheckCircle className="w-12 h-12 text-foreground-muted mx-auto mb-3" />
            <p className="text-foreground-muted">No tasks found for this filter.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task: any) => (
              <div key={task.id} className="card p-4 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  task.status === "heartbeat_ok" ? "bg-emerald-500" :
                  task.status === "completed" ? "bg-green-500" :
                  task.status === "failed" ? "bg-red-500" :
                  task.status === "in_progress" ? "bg-blue-500" :
                  "bg-yellow-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-xs text-foreground-muted">{task.agent_slug} · {task.task_type}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[task.status] || "bg-background-secondary"}`}>
                  {task.status}
                </span>
                {task.duration_ms != null && (
                  <span className="text-xs text-foreground-muted w-16 text-right">{(task.duration_ms / 1000).toFixed(1)}s</span>
                )}
                {task.cost_usd != null && (
                  <span className="text-xs text-foreground-muted w-20 text-right">${task.cost_usd.toFixed(4)}</span>
                )}
                <span className="text-xs text-foreground-muted w-32 text-right">
                  {task.created_at ? new Date(task.created_at).toLocaleTimeString() : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
