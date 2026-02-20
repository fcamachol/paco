"use client";

import { useEffect, useRef, useState } from "react";

interface TimelineEvent {
  id: string;
  title: string;
  agent_slug: string;
  task_type: string;
  status: string;
  duration_ms: number | null;
  created_at: string;
}

interface ActivityTimelineProps {
  infraId: string;
  initialEvents?: TimelineEvent[];
}

const STATUS_COLORS: Record<string, string> = {
  heartbeat_ok: "bg-emerald-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  in_progress: "bg-blue-500",
  pending: "bg-yellow-500",
};

export function ActivityTimeline({ infraId, initialEvents = [] }: ActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${window.location.hostname}:8000`;
    const url = `${host}/ws/company/${infraId}/activity`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "heartbeat_result") {
            const newEvent: TimelineEvent = {
              id: crypto.randomUUID(),
              title: `${data.schedule_name || "heartbeat"}`,
              agent_slug: data.agent_slug,
              task_type: "heartbeat_check",
              status: data.status,
              duration_ms: data.duration_ms || null,
              created_at: data.timestamp || new Date().toISOString(),
            };
            setEvents((prev) => [newEvent, ...prev].slice(0, 50));
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
      };

      // Keep alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, 25000);

      return () => {
        clearInterval(pingInterval);
        ws.close();
      };
    } catch {
      // WebSocket connection failed, use polling instead
      return;
    }
  }, [infraId]);

  if (events.length === 0) {
    return (
      <p className="text-sm text-foreground-muted text-center py-6">
        No activity yet. Events will appear here in real-time.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={event.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-background-secondary/50 transition-colors">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[event.status] || "bg-gray-500"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">
              <span className="font-medium">{event.agent_slug}</span>
              <span className="text-foreground-muted"> · {event.title}</span>
            </p>
          </div>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            event.status === "heartbeat_ok" ? "bg-emerald-500/10 text-emerald-500" :
            event.status === "completed" ? "bg-green-500/10 text-green-500" :
            event.status === "failed" ? "bg-red-500/10 text-red-500" :
            "bg-yellow-500/10 text-yellow-500"
          }`}>
            {event.status}
          </span>
          <span className="text-xs text-foreground-muted flex-shrink-0">
            {new Date(event.created_at).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}
