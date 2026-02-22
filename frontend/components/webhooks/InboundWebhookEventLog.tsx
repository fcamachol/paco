"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, InboundWebhookEvent } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

interface InboundWebhookEventLogProps {
  agentId: string;
  webhookId: string;
}

const STATUS_BADGES: Record<string, string> = {
  received: "bg-blue-500/20 text-blue-400",
  processing: "bg-amber-500/20 text-amber-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-error/20 text-error",
  rejected: "bg-red-500/20 text-red-400",
};

export function InboundWebhookEventLog({ agentId, webhookId }: InboundWebhookEventLogProps) {
  const [page, setPage] = useState(1);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["webhook-events", agentId, webhookId, page],
    queryFn: () => api.getWebhookEvents(agentId, webhookId, page, 20),
  });

  if (isLoading) {
    return (
      <div className="h-12 flex items-center justify-center">
        <div className="animate-spin w-5 h-5 border-2 border-coral-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data || data.events.length === 0) {
    return (
      <p className="text-xs text-foreground-muted italic py-2">
        No events received yet.
      </p>
    );
  }

  const totalPages = Math.ceil(data.total / data.per_page);

  return (
    <div className="space-y-2">
      <div className="text-xs text-foreground-muted mb-2">
        {data.total} event{data.total !== 1 ? "s" : ""} total
      </div>

      {data.events.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          expanded={expandedEventId === event.id}
          onToggle={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
        />
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="btn-secondary btn-sm text-xs"
          >
            Prev
          </button>
          <span className="text-xs text-foreground-muted">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="btn-secondary btn-sm text-xs"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: InboundWebhookEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2 hover:bg-background-secondary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-foreground-muted flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-foreground-muted flex-shrink-0" />
          )}

          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded flex-shrink-0",
              STATUS_BADGES[event.status] || "bg-foreground-muted/20 text-foreground-muted"
            )}
          >
            {event.status}
          </span>

          {event.signature_valid !== null && (
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded flex-shrink-0",
                event.signature_valid
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              )}
            >
              {event.signature_valid ? "sig ok" : "sig fail"}
            </span>
          )}

          <span className="text-xs text-foreground-muted truncate">
            {event.source_ip || "unknown IP"}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {event.processing_ms !== null && (
            <span className="text-xs text-foreground-muted">
              {event.processing_ms}ms
            </span>
          )}
          <span className="text-xs text-foreground-muted">
            {formatRelativeTime(event.received_at)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3 bg-background-secondary/30">
          {/* Prompt sent */}
          {event.prompt_sent && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Prompt Sent</p>
              <pre className="text-xs text-foreground-muted bg-background-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-32">
                {event.prompt_sent}
              </pre>
            </div>
          )}

          {/* Agent response */}
          {event.agent_response && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Agent Response</p>
              <pre className="text-xs text-foreground-muted bg-background-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-32">
                {JSON.stringify(event.agent_response, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {event.error_message && (
            <div>
              <p className="text-xs font-medium text-error mb-1">Error</p>
              <pre className="text-xs text-error/80 bg-error/5 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {event.error_message}
              </pre>
            </div>
          )}

          {/* Payload */}
          <div>
            <p className="text-xs font-medium text-foreground mb-1">Payload</p>
            <pre className="text-xs text-foreground-muted bg-background-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-40">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
