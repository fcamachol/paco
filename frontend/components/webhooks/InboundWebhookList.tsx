"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api, InboundWebhook, InboundWebhookCreated, ApiError } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useIsOperator } from "@/lib/auth";
import { InboundWebhookForm } from "./InboundWebhookForm";
import { InboundWebhookEventLog } from "./InboundWebhookEventLog";
import { SecretDisplay } from "./SecretDisplay";

interface InboundWebhookListProps {
  agentId: string;
}

const SOURCE_BADGES: Record<string, string> = {
  chatwoot: "bg-blue-500/20 text-blue-400",
  slack: "bg-purple-500/20 text-purple-400",
  github: "bg-gray-500/20 text-gray-300",
  generic: "bg-foreground-muted/20 text-foreground-muted",
};

export function InboundWebhookList({ agentId }: InboundWebhookListProps) {
  const queryClient = useQueryClient();
  const isOperator = useIsOperator();
  const [showForm, setShowForm] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<InboundWebhookCreated | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["inbound-webhooks", agentId],
    queryFn: () => api.getAgentInboundWebhooks(agentId),
  });

  const deleteMutation = useMutation({
    mutationFn: (webhookId: string) => api.deleteInboundWebhook(agentId, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateInboundWebhook(agentId, id, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });

  const regenerateMutation = useMutation({
    mutationFn: (webhookId: string) => api.regenerateWebhookToken(agentId, webhookId),
    onSuccess: (data) => {
      setRegeneratedUrl(`${process.env.NEXT_PUBLIC_API_URL || window.location.origin}${data.url}`);
      queryClient.invalidateQueries({ queryKey: ["inbound-webhooks", agentId] });
    },
    onError: (err: ApiError) => setError(err.detail),
  });

  const handleCopyUrl = async (wh: InboundWebhook) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    await navigator.clipboard.writeText(`${baseUrl}${wh.url}`);
    setCopiedToken(wh.id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreated = (wh: InboundWebhookCreated) => {
    setCreatedWebhook(wh);
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ["inbound-webhooks", agentId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          Inbound Webhooks
        </h4>
        {isOperator && (
          <button
            onClick={() => { setShowForm(!showForm); setCreatedWebhook(null); }}
            className="btn-secondary btn-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Webhook
          </button>
        )}
      </div>

      <p className="text-xs text-foreground-muted">
        External services POST to these URLs to send data to this agent.
      </p>

      {error && (
        <div className="p-2 rounded bg-error/10 border border-error/30 text-error text-xs">
          {error}
        </div>
      )}

      {/* Creation form */}
      {showForm && (
        <InboundWebhookForm
          agentId={agentId}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Show secret after creation */}
      {createdWebhook && createdWebhook.secret && (
        <SecretDisplay
          value={createdWebhook.secret}
          label="Webhook Secret (save this now — it won't be shown again)"
        />
      )}

      {/* Show regenerated URL */}
      {regeneratedUrl && (
        <SecretDisplay
          value={regeneratedUrl}
          label="New Webhook URL (save this now — the old URL no longer works)"
        />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="h-16 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-coral-500 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Webhook list */}
      {!isLoading && (!webhooks || webhooks.length === 0) && !showForm && (
        <p className="text-sm text-foreground-muted italic">
          No inbound webhooks configured yet.
        </p>
      )}

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
                  {wh.source && (
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded",
                      SOURCE_BADGES[wh.source] || SOURCE_BADGES.generic,
                    )}>
                      {wh.source}
                    </span>
                  )}
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    wh.processing_mode === "sync"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-foreground-muted/20 text-foreground-muted"
                  )}>
                    {wh.processing_mode}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="text-xs text-foreground-muted font-mono truncate max-w-[300px]">
                    {wh.url}
                  </code>
                  <button
                    onClick={() => handleCopyUrl(wh)}
                    className="p-0.5 text-foreground-muted hover:text-foreground"
                    title="Copy URL"
                  >
                    {copiedToken === wh.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-foreground-muted">
                {wh.total_events} events
              </span>

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
                    onClick={() => {
                      if (confirm("Regenerate token? The old webhook URL will stop working immediately.")) {
                        regenerateMutation.mutate(wh.id);
                      }
                    }}
                    disabled={regenerateMutation.isPending}
                    className="p-1 text-foreground-muted hover:text-foreground"
                    title="Regenerate token"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", regenerateMutation.isPending && "animate-spin")} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this webhook? All event history will be lost.")) {
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

          {/* Expanded: Event log */}
          {expandedId === wh.id && (
            <div className="border-t border-border p-3">
              <InboundWebhookEventLog agentId={agentId} webhookId={wh.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
