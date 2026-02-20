"use client";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500",
  in_progress: "bg-blue-500/10 text-blue-500",
  completed: "bg-green-500/10 text-green-500",
  failed: "bg-red-500/10 text-red-500",
  heartbeat_ok: "bg-emerald-500/10 text-emerald-500",
  skipped: "bg-gray-500/10 text-gray-500",
};

const STATUS_DOTS: Record<string, string> = {
  pending: "bg-yellow-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  heartbeat_ok: "bg-emerald-500",
  skipped: "bg-gray-500",
};

interface Task {
  id: string;
  title: string;
  agent_slug: string;
  task_type: string;
  status: string;
  duration_ms: number | null;
  cost_usd: number | null;
  created_at: string;
}

interface TaskListProps {
  tasks: Task[];
  compact?: boolean;
}

export function TaskList({ tasks, compact = false }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-foreground-muted text-center py-6">No tasks found.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`flex items-center gap-3 ${compact ? "p-2" : "p-3"} bg-background-secondary rounded-lg`}
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOTS[task.status] || "bg-gray-500"}`} />
          <div className="flex-1 min-w-0">
            <p className={`${compact ? "text-xs" : "text-sm"} font-medium truncate`}>{task.title}</p>
            {!compact && (
              <p className="text-xs text-foreground-muted">{task.agent_slug} · {task.task_type}</p>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[task.status] || "bg-background"}`}>
            {task.status}
          </span>
          {task.duration_ms != null && (
            <span className="text-xs text-foreground-muted">{(task.duration_ms / 1000).toFixed(1)}s</span>
          )}
          {!compact && task.cost_usd != null && (
            <span className="text-xs text-foreground-muted">${task.cost_usd.toFixed(4)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
