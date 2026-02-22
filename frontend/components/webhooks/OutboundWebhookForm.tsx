"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, CreateOutboundWebhookRequest, OutboundWebhookCreated, ApiError } from "@/lib/api";
import { EventTypeSelector } from "./EventTypeSelector";

interface OutboundWebhookFormProps {
  agentId?: string;
  onCreated: (wh: OutboundWebhookCreated) => void;
  onCancel: () => void;
}

export function OutboundWebhookForm({ agentId, onCreated, onCancel }: OutboundWebhookFormProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const createMutation = useMutation({
    mutationFn: (data: CreateOutboundWebhookRequest) => api.createOutboundWebhook(data),
    onSuccess: (wh) => onCreated(wh),
    onError: (err: ApiError) => setError(err.detail),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!url.trim()) {
      setError("URL is required");
      return;
    }
    if (events.length === 0) {
      setError("Select at least one event type");
      return;
    }
    setError(null);
    createMutation.mutate({
      name: name.trim(),
      url: url.trim(),
      events,
      agent_id: agentId,
      description: description.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-background rounded-lg border border-border w-full max-w-lg max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">New Outbound Webhook</h3>
          <button type="button" onClick={onCancel} className="p-1 text-foreground-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-2 rounded bg-error/10 border border-error/30 text-error text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Slack Notifications"
              className="input w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">URL *</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="input w-full text-sm font-mono"
            />
            <p className="text-xs text-foreground-muted mt-1">
              PACO will POST event payloads to this URL with HMAC-SHA256 signing.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="input w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-2">
              Events * ({events.length} selected)
            </label>
            <div className="border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
              <EventTypeSelector selected={events} onChange={setEvents} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-border">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="btn-primary btn-sm"
          >
            {createMutation.isPending ? "Creating..." : "Create Webhook"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
