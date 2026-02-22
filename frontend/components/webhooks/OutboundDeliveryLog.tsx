"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { api, WebhookDeliveryItem, ApiError } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useIsOperator } from "@/lib/auth";

interface OutboundDeliveryLogProps {
  webhookId: string;
}

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-error/20 text-error",
};

export function OutboundDeliveryLog({ webhookId }: OutboundDeliveryLogProps) {
  const queryClient = useQueryClient();
  const isOperator = useIsOperator();
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["webhook-deliveries", webhookId, page],
    queryFn: () => api.getWebhookDeliveries(webhookId, page, 20),
  });

  const retryMutation = useMutation({
    mutationFn: (deliveryId: string) => api.retryWebhookDelivery(webhookId, deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });

  if (isLoading) {
    return (
      <div className="h-12 flex items-center justify-center">
        <div className="animate-spin w-5 h-5 border-2 border-coral-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data || data.deliveries.length === 0) {
    return (
      <p className="text-xs text-foreground-muted italic py-2">
        No deliveries yet.
      </p>
    );
  }

  const totalPages = Math.ceil(data.total / data.per_page);

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-2 rounded bg-error/10 border border-error/30 text-error text-xs mb-2">
          {error}
        </div>
      )}
      <div className="text-xs text-foreground-muted mb-2">
        {data.total} delivery{data.total !== 1 ? "ies" : ""} total
      </div>

      {data.deliveries.map((delivery) => (
        <DeliveryRow
          key={delivery.id}
          delivery={delivery}
          expanded={expandedId === delivery.id}
          onToggle={() => setExpandedId(expandedId === delivery.id ? null : delivery.id)}
          onRetry={() => retryMutation.mutate(delivery.id)}
          canRetry={isOperator && delivery.status === "failed"}
          retrying={retryMutation.isPending}
        />
      ))}

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

function DeliveryRow({
  delivery,
  expanded,
  onToggle,
  onRetry,
  canRetry,
  retrying,
}: {
  delivery: WebhookDeliveryItem;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  canRetry: boolean;
  retrying: boolean;
}) {
  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="flex items-center justify-between p-2 hover:bg-background-secondary/50 transition-colors">
        <button onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-foreground-muted flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-foreground-muted flex-shrink-0" />
          )}

          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded flex-shrink-0",
              STATUS_BADGES[delivery.status] || "bg-foreground-muted/20 text-foreground-muted"
            )}
          >
            {delivery.status}
          </span>

          <span className="text-xs font-mono text-foreground truncate">
            {delivery.event_type}
          </span>

          {delivery.response_status_code && (
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded flex-shrink-0",
                delivery.response_status_code >= 200 && delivery.response_status_code < 300
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-error/20 text-error"
              )}
            >
              {delivery.response_status_code}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-foreground-muted">
            {delivery.attempts}/{delivery.max_attempts}
          </span>
          <span className="text-xs text-foreground-muted">
            {formatRelativeTime(delivery.created_at)}
          </span>
          {canRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="p-1 text-foreground-muted hover:text-foreground"
              title="Retry delivery"
            >
              <RotateCw className={cn("w-3.5 h-3.5", retrying && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3 bg-background-secondary/30">
          {delivery.error_message && (
            <div>
              <p className="text-xs font-medium text-error mb-1">Error</p>
              <pre className="text-xs text-error/80 bg-error/5 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {delivery.error_message}
              </pre>
            </div>
          )}

          {delivery.response_body && (
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Response Body</p>
              <pre className="text-xs text-foreground-muted bg-background-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-32">
                {delivery.response_body}
              </pre>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-foreground mb-1">Payload</p>
            <pre className="text-xs text-foreground-muted bg-background-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-40">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
