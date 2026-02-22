"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  ExternalLink,
} from "lucide-react";
import { api, OutboundWebhook, OutboundWebhookCreated, ApiError } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useIsOperator } from "@/lib/auth";
import { OutboundWebhookForm } from "./OutboundWebhookForm";
import { OutboundDeliveryLog } from "./OutboundDeliveryLog";
import { SecretDisplay } from "./SecretDisplay";

interface OutboundWebhookListProps {
  agentId?: string;
}

export function OutboundWebhookList({ agentId }: OutboundWebhookListProps) {
  const queryClient = useQueryClient();
  const isOperator = useIsOperator();
  const [showForm, setShowForm] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<OutboundWebhookCreated | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["outbound-webhooks", agentId],
    queryFn: () => api.getOutboundWebhooks(agentId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteOutboundWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateOutboundWebhook(id, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.testOutboundWebhook(id),
    onSuccess: (result) => {
      if (result.success) {
        setError(null);
      } else {
        setError(`Test delivery failed: ${result.error || "Unknown error"}`);
      }
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });

  const handleCreated = (wh: OutboundWebhookCreated) => {
    setCreatedWebhook(wh);
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ["outbound-webhooks", agentId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          Outbound Webhooks
        </h4>
        {isOperator && (
          <button
            onClick={() => { setShowForm(true); setCreatedWebhook(null); }}
            className="btn-secondary btn-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Webhook
          </button>
        )}
      </div>

      <p className="text-xs text-foreground-muted">
        PACO sends event notifications to these URLs when things happen{agentId ? " with this agent" : ""}.
      </p>

      {error && (
        <div className="p-2 rounded bg-error/10 border border-error/30 text-error text-xs">
          {error}
        </div>
      )}

      {/* Creation form (modal) */}
      {showForm && (
        <OutboundWebhookForm
          agentId={agentId}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Show secret after creation */}
      {createdWebhook && createdWebhook.secret && (
        <SecretDisplay
          value={createdWebhook.secret}
          label="Signing Secret (save this now — it won't be shown again)"
        />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="h-16 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-coral-500 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!webhooks || webhooks.length === 0) && !showForm && (
        <p className="text-sm text-foreground-muted italic">
          No outbound webhooks configured yet.
        </p>
      )}

      {/* Webhook list */}
      {webhooks?.map((wh) => (
        <div key={wh.id} className="rounded-lg border border-border overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between p-3 bg-background-secondary">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)}
                className="p-0.5 text-foreground-muted hover:text-foreground"
              >
                {expandedId === wh.id ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {wh.name}
                  </p>
                  <span className="text-xs text-foreground-muted">
                    {wh.events.length} event{wh.events.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ExternalLink className="w-3 h-3 text-foreground-muted flex-shrink-0" />
                  <code className="text-xs text-foreground-muted font-mono truncate max-w-[300px]">
                    {wh.url}
                  </code>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Active toggle */}
              {isOperator && (
                <button
                  onClick={() => toggleMutation.mutate({ id: wh.id, isActive: !wh.is_active })}
                  role="switch"
                  aria-checked={wh.is_active}
                  aria-label={`Toggle ${wh.name} active`}
                  className={cn(
                    "w-8 h-4 rounded-full relative transition-colors",
                    wh.is_active ? "bg-emerald-500" : "bg-foreground-muted/30"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                    wh.is_active ? "left-[16px]" : "left-0.5"
                  )} />
                </button>
              )}

              {isOperator && (
                <>
                  <button
                    onClick={() => testMutation.mutate(wh.id)}
                    disabled={testMutation.isPending}
                    className="p-1 text-foreground-muted hover:text-foreground"
                    title="Send test event"
                  >
                    <Zap className={cn("w-3.5 h-3.5", testMutation.isPending && "animate-pulse")} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this webhook? All delivery history will be lost.")) {
                        deleteMutation.mutate(wh.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-1 text-foreground-muted hover:text-error"
                    title="Delete webhook"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Event tags */}
          <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1">
            {wh.events.map((evt) => (
              <span
                key={evt}
                className="text-xs px-1.5 py-0.5 rounded bg-foreground-muted/10 text-foreground-muted font-mono"
              >
                {evt}
              </span>
            ))}
          </div>

          {/* Expanded: Delivery log */}
          {expandedId === wh.id && (
            <div className="border-t border-border p-3">
              <OutboundDeliveryLog webhookId={wh.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
