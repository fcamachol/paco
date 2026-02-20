"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Play,
  Square,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

export default function CompanyOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ["company-config", id],
    queryFn: () => api.getCompanyConfig(id).catch(() => null),
  });

  const { data: overview } = useQuery({
    queryKey: ["company-overview", id],
    queryFn: () => api.getCompanyOverview(id).catch(() => null),
  });

  const { data: timeline } = useQuery({
    queryKey: ["company-timeline", id],
    queryFn: () => api.getCompanyTimeline(id).catch(() => []),
  });

  const startMutation = useMutation({
    mutationFn: () => api.startCompany(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-config", id] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopCompany(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-config", id] }),
  });

  const isRunning = config?.status === "running";

  const navLinks = [
    { label: "Departments", href: `/infrastructures/${id}/company/departments`, icon: Building2 },
    { label: "Schedules", href: `/infrastructures/${id}/company/schedules`, icon: Calendar },
    { label: "Tasks", href: `/infrastructures/${id}/company/tasks`, icon: CheckCircle },
    { label: "Messages", href: `/infrastructures/${id}/company/messages`, icon: MessageSquare },
  ];

  return (
    <div>
      <Header title="Company Overview" description="Agent employees with heartbeat scheduling" />

      <div className="p-6 space-y-6">
        {/* Config status */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isRunning ? "bg-green-500/10" : "bg-background-secondary"}`}>
                <Building2 className={`w-6 h-6 ${isRunning ? "text-green-500" : "text-foreground-muted"}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Heartbeat Scheduler</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${isRunning ? "bg-green-500/10 text-green-500" : "bg-background-secondary text-foreground-muted"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : "bg-foreground-muted"}`} />
                    {config?.status || "not configured"}
                  </span>
                  {config && (
                    <span className="text-sm text-foreground-muted">
                      Every {Math.round((config.heartbeat_interval_seconds || 1800) / 60)}min
                      · {config.active_hours_start}–{config.active_hours_end} {config.timezone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {config && (
              <div className="flex gap-2">
                {isRunning ? (
                  <button onClick={() => stopMutation.mutate()} className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-medium flex items-center gap-2">
                    <Square className="w-4 h-4" /> Stop
                  </button>
                ) : (
                  <button onClick={() => startMutation.mutate()} className="px-4 py-2 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 text-sm font-medium flex items-center gap-2">
                    <Play className="w-4 h-4" /> Start
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* KPI Grid */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Active Agents", value: overview.active_agents, icon: Users },
              { label: "Tasks Today", value: overview.tasks_today, icon: CheckCircle },
              { label: "Heartbeat OK", value: overview.heartbeat_ok_today, icon: Clock },
              { label: "Failed", value: overview.tasks_failed_today, icon: XCircle },
              { label: "Cost Today", value: overview.total_cost_today != null ? `$${overview.total_cost_today.toFixed(4)}` : "—", icon: DollarSign },
            ].map((kpi) => (
              <div key={kpi.label} className="card p-4 text-center">
                <kpi.icon className="w-5 h-5 mx-auto text-foreground-muted mb-2" />
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-foreground-muted">{kpi.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Nav links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {navLinks.map((link) => (
            <Link key={link.label} href={link.href} className="card p-4 hover:border-coral-500/50 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <link.icon className="w-5 h-5 text-foreground-muted group-hover:text-coral-500 transition-colors" />
                  <span className="font-medium">{link.label}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-foreground-muted group-hover:text-coral-500 transition-colors" />
              </div>
            </Link>
          ))}
        </div>

        {/* Activity Timeline */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          {timeline && timeline.length > 0 ? (
            <div className="space-y-3">
              {timeline.slice(0, 20).map((task: any) => (
                <div key={task.id} className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    task.status === "heartbeat_ok" ? "bg-green-500" :
                    task.status === "completed" ? "bg-blue-500" :
                    task.status === "failed" ? "bg-red-500" :
                    "bg-yellow-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-foreground-muted">{task.agent_slug} · {task.task_type}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      task.status === "heartbeat_ok" ? "bg-green-500/10 text-green-500" :
                      task.status === "completed" ? "bg-blue-500/10 text-blue-500" :
                      task.status === "failed" ? "bg-red-500/10 text-red-500" :
                      "bg-yellow-500/10 text-yellow-500"
                    }`}>
                      {task.status}
                    </span>
                    {task.duration_ms != null && (
                      <p className="text-xs text-foreground-muted mt-0.5">{(task.duration_ms / 1000).toFixed(1)}s</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted text-center py-8">No activity yet. Start the scheduler and add schedules.</p>
          )}
        </div>
      </div>
    </div>
  );
}
