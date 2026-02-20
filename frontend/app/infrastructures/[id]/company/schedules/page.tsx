"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, Play, Trash2, Pause, Timer, Calendar } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

export default function CompanySchedulesPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    agent_slug: "",
    name: "",
    schedule_type: "heartbeat",
    interval_seconds: 1800,
    cron_expression: "",
    checklist_md: "",
    prompt_template: "",
  });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["company-schedules", id],
    queryFn: () => api.getCompanySchedules(id),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createCompanySchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-schedules", id] });
      setShowForm(false);
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (scheduleId: string) => api.triggerCompanySchedule(id, scheduleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-schedules", id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => api.deleteCompanySchedule(id, scheduleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-schedules", id] }),
  });

  const formatNextTrigger = (dt: string | null) => {
    if (!dt) return "—";
    const d = new Date(dt);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs < 0) return "overdue";
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 60) return `in ${diffMin}m`;
    const diffHrs = Math.round(diffMin / 60);
    return `in ${diffHrs}h`;
  };

  return (
    <div>
      <Header title="Schedules" description="Heartbeat and cron job definitions" />
      <div className="p-6 space-y-6">
        <div className="flex justify-end">
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Schedule
          </button>
        </div>

        {showForm && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold">Create Schedule</h3>
            <div className="grid grid-cols-3 gap-4">
              <input value={form.agent_slug} onChange={(e) => setForm({ ...form, agent_slug: e.target.value })} placeholder="Agent slug" className="px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" />
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Schedule name" className="px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" />
              <select value={form.schedule_type} onChange={(e) => setForm({ ...form, schedule_type: e.target.value })} className="px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm">
                <option value="heartbeat">Heartbeat</option>
                <option value="cron">Cron</option>
                <option value="interval">Interval</option>
              </select>
            </div>
            {form.schedule_type === "cron" ? (
              <input value={form.cron_expression} onChange={(e) => setForm({ ...form, cron_expression: e.target.value })} placeholder="Cron expression (e.g. 0 9 * * 1-5)" className="w-full px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" />
            ) : (
              <input type="number" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: parseInt(e.target.value) || 1800 })} placeholder="Interval (seconds)" className="w-full px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" />
            )}
            <textarea value={form.checklist_md} onChange={(e) => setForm({ ...form, checklist_md: e.target.value })} placeholder="Checklist markdown (HEARTBEAT.md content)" className="w-full px-3 py-2 rounded-lg bg-background-secondary border border-transparent focus:border-coral-500 outline-none text-sm" rows={4} />
            <div className="flex gap-2">
              <button onClick={() => createMutation.mutate(form)} disabled={!form.agent_slug || !form.name} className="px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 text-sm font-medium disabled:opacity-50">Create</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-background-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-background-secondary rounded-lg" />)}
          </div>
        ) : schedules.length === 0 ? (
          <div className="card p-12 text-center">
            <Clock className="w-12 h-12 text-foreground-muted mx-auto mb-3" />
            <p className="text-foreground-muted">No schedules yet. Create one to start heartbeat monitoring.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.map((s: any) => (
              <div key={s.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.is_enabled ? "bg-green-500/10" : "bg-background-secondary"}`}>
                      {s.schedule_type === "cron" ? <Calendar className={`w-5 h-5 ${s.is_enabled ? "text-green-500" : "text-foreground-muted"}`} /> : <Timer className={`w-5 h-5 ${s.is_enabled ? "text-green-500" : "text-foreground-muted"}`} />}
                    </div>
                    <div>
                      <h3 className="font-semibold">{s.name}</h3>
                      <p className="text-xs text-foreground-muted">{s.agent_slug} · {s.schedule_type}{s.cron_expression ? ` · ${s.cron_expression}` : s.interval_seconds ? ` · ${Math.round(s.interval_seconds / 60)}min` : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => triggerMutation.mutate(s.id)} className="p-1.5 rounded hover:bg-coral-500/10 text-foreground-muted hover:text-coral-500 transition-colors" title="Trigger now">
                      <Play className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(s.id)} className="p-1.5 rounded hover:bg-red-500/10 text-foreground-muted hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-foreground-muted">
                  <span className={`inline-flex items-center gap-1 ${s.is_enabled ? "text-green-500" : ""}`}>
                    {s.is_enabled ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    {s.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                  <span>Next: {formatNextTrigger(s.next_trigger_at)}</span>
                  {s.last_triggered_at && <span>Last: {new Date(s.last_triggered_at).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
