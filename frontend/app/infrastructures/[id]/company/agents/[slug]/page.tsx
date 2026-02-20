"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { User, Calendar, CheckCircle, FileText, Clock, MessageSquare, Mail, MailOpen, ArrowRight } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

export default function CompanyAgentProfilePage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();

  const { data: role } = useQuery({
    queryKey: ["company-role", id, slug],
    queryFn: () => api.getCompanyRole(id, slug).catch(() => null),
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["company-schedules", id, slug],
    queryFn: () => api.getCompanySchedules(id, slug),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["company-tasks-agent", id, slug],
    queryFn: () => api.getCompanyTasks(id, { agent_slug: slug, limit: 20 }),
  });

  const { data: workLogs = [] } = useQuery({
    queryKey: ["company-worklogs", id, slug],
    queryFn: () => api.getCompanyWorkLogs(id, { agent_slug: slug }),
  });

  const { data: inbox = [] } = useQuery({
    queryKey: ["company-inbox", id, slug],
    queryFn: () => api.getCompanyInbox(id, slug).catch(() => []),
  });

  const { data: sentMessages = [] } = useQuery({
    queryKey: ["company-messages-sent", id, slug],
    queryFn: () => api.getCompanyMessages(id, { sender: slug }).catch(() => []),
  });

  return (
    <div>
      <Header title={role?.title || slug} description={`Agent employee profile: ${slug}`} />
      <div className="p-6 space-y-6">
        {/* Role card */}
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-coral-500/10 flex items-center justify-center">
              <User className="w-7 h-7 text-coral-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{role?.title || slug}</h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-foreground-muted">
                <span className="capitalize">{role?.role_type || "employee"}</span>
                {role?.reports_to_slug && <span>Reports to: {role.reports_to_slug}</span>}
                {role?.hired_at && <span>Since {new Date(role.hired_at).toLocaleDateString()}</span>}
              </div>
            </div>
          </div>
          {role?.checklist_md && (
            <div className="mt-4 p-3 bg-background-secondary rounded-lg">
              <p className="text-xs text-foreground-muted mb-1">Heartbeat Checklist</p>
              <pre className="text-sm whitespace-pre-wrap">{role.checklist_md}</pre>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Schedules */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-foreground-muted" /> Schedules
            </h3>
            {schedules.length === 0 ? (
              <p className="text-sm text-foreground-muted">No schedules assigned.</p>
            ) : (
              <div className="space-y-3">
                {schedules.map((s: any) => (
                  <div key={s.id} className="p-3 bg-background-secondary rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${s.is_enabled ? "bg-green-500/10 text-green-500" : "bg-background text-foreground-muted"}`}>
                        {s.is_enabled ? "active" : "disabled"}
                      </span>
                    </div>
                    <p className="text-xs text-foreground-muted mt-1">
                      {s.schedule_type}{s.cron_expression ? ` · ${s.cron_expression}` : s.interval_seconds ? ` · ${Math.round(s.interval_seconds / 60)}min` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Work Log */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-foreground-muted" /> Work Log
            </h3>
            {workLogs.length === 0 ? (
              <p className="text-sm text-foreground-muted">No work log entries yet.</p>
            ) : (
              <div className="space-y-3">
                {workLogs.slice(0, 5).map((wl: any) => (
                  <div key={wl.id} className="p-3 bg-background-secondary rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{wl.log_date}</span>
                      <span className="text-xs text-foreground-muted">
                        {wl.tasks_completed} done · {wl.tasks_failed} failed
                      </span>
                    </div>
                    {wl.summary && <p className="text-xs text-foreground-muted">{wl.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inbox */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Mail className="w-5 h-5 text-foreground-muted" /> Inbox
              {inbox.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-coral-500 text-white">{inbox.length}</span>
              )}
            </h3>
            {inbox.length === 0 ? (
              <p className="text-sm text-foreground-muted">No unread messages.</p>
            ) : (
              <div className="space-y-3">
                {inbox.slice(0, 5).map((msg: any) => (
                  <div key={msg.id} className="p-3 bg-background-secondary rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{msg.sender_slug}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        msg.message_type === "task_request" ? "bg-orange-500/10 text-orange-500" :
                        msg.message_type === "escalation" ? "bg-red-500/10 text-red-500" :
                        "bg-blue-500/10 text-blue-500"
                      }`}>{msg.message_type}</span>
                    </div>
                    {msg.subject && <p className="text-sm font-medium mt-1">{msg.subject}</p>}
                    <p className="text-xs text-foreground-muted mt-1 line-clamp-2">{msg.content}</p>
                    <p className="text-xs text-foreground-muted mt-1">{new Date(msg.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sent */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-foreground-muted" /> Sent Messages
            </h3>
            {sentMessages.length === 0 ? (
              <p className="text-sm text-foreground-muted">No sent messages.</p>
            ) : (
              <div className="space-y-3">
                {sentMessages.slice(0, 5).map((msg: any) => (
                  <div key={msg.id} className="p-3 bg-background-secondary rounded-lg">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-3 h-3 text-foreground-muted" />
                      <span className="text-sm font-medium">{msg.recipient_slug || "all"}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        msg.status === "read" ? "bg-green-500/10 text-green-500" : "bg-background text-foreground-muted"
                      }`}>{msg.status}</span>
                    </div>
                    {msg.subject && <p className="text-sm font-medium mt-1">{msg.subject}</p>}
                    <p className="text-xs text-foreground-muted mt-1 line-clamp-2">{msg.content}</p>
                    <p className="text-xs text-foreground-muted mt-1">{new Date(msg.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent tasks */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-foreground-muted" /> Recent Tasks
          </h3>
          {tasks.length === 0 ? (
            <p className="text-sm text-foreground-muted">No tasks yet.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task: any) => (
                <div key={task.id} className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    task.status === "heartbeat_ok" ? "bg-emerald-500" :
                    task.status === "completed" ? "bg-green-500" :
                    task.status === "failed" ? "bg-red-500" :
                    "bg-yellow-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{task.title}</p>
                    <p className="text-xs text-foreground-muted">{task.task_type}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    task.status === "heartbeat_ok" ? "bg-emerald-500/10 text-emerald-500" :
                    task.status === "completed" ? "bg-green-500/10 text-green-500" :
                    task.status === "failed" ? "bg-red-500/10 text-red-500" :
                    "bg-yellow-500/10 text-yellow-500"
                  }`}>{task.status}</span>
                  {task.duration_ms != null && (
                    <span className="text-xs text-foreground-muted">{(task.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                  <span className="text-xs text-foreground-muted">
                    {task.created_at ? new Date(task.created_at).toLocaleTimeString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
