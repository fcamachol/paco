"use client";

import { Calendar, Timer, Play, Pause, Trash2 } from "lucide-react";

interface ScheduleCardProps {
  schedule: {
    id: string;
    name: string;
    agent_slug: string;
    schedule_type: string;
    cron_expression: string | null;
    interval_seconds: number | null;
    is_enabled: boolean;
    next_trigger_at: string | null;
    last_triggered_at: string | null;
  };
  onTrigger?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ScheduleCard({ schedule, onTrigger, onDelete }: ScheduleCardProps) {
  const formatNextTrigger = (dt: string | null) => {
    if (!dt) return "—";
    const d = new Date(dt);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs < 0) return "overdue";
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 60) return `in ${diffMin}m`;
    return `in ${Math.round(diffMin / 60)}h`;
  };

  const Icon = schedule.schedule_type === "cron" ? Calendar : Timer;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${schedule.is_enabled ? "bg-green-500/10" : "bg-background-secondary"}`}>
            <Icon className={`w-4 h-4 ${schedule.is_enabled ? "text-green-500" : "text-foreground-muted"}`} />
          </div>
          <div>
            <p className="text-sm font-medium">{schedule.name}</p>
            <p className="text-xs text-foreground-muted">
              {schedule.agent_slug} · {schedule.schedule_type}
              {schedule.cron_expression ? ` · ${schedule.cron_expression}` : ""}
              {schedule.interval_seconds ? ` · ${Math.round(schedule.interval_seconds / 60)}min` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {onTrigger && (
            <button
              onClick={() => onTrigger(schedule.id)}
              className="p-1.5 rounded hover:bg-coral-500/10 text-foreground-muted hover:text-coral-500 transition-colors"
              title="Trigger now"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(schedule.id)}
              className="p-1.5 rounded hover:bg-red-500/10 text-foreground-muted hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-foreground-muted">
        <span className={`inline-flex items-center gap-1 ${schedule.is_enabled ? "text-green-500" : ""}`}>
          {schedule.is_enabled ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          {schedule.is_enabled ? "Enabled" : "Disabled"}
        </span>
        <span>Next: {formatNextTrigger(schedule.next_trigger_at)}</span>
      </div>
    </div>
  );
}
