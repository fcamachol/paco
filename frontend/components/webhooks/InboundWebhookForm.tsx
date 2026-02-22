"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, InboundWebhookCreated, CreateInboundWebhookRequest, ApiError } from "@/lib/api";

interface InboundWebhookFormProps {
  agentId: string;
  onCreated: (wh: InboundWebhookCreated) => void;
  onCancel: () => void;
}

const SOURCES = [
  { value: "generic", label: "Generic" },
  { value: "chatwoot", label: "Chatwoot" },
  { value: "slack", label: "Slack" },
  { value: "github", label: "GitHub" },
];

export function InboundWebhookForm({ agentId, onCreated, onCancel }: InboundWebhookFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("generic");
  const [processingMode, setProcessingMode] = useState<"async" | "sync">("async");
  const [secret, setSecret] = useState("");
  const [signatureHeader, setSignatureHeader] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateInboundWebhookRequest) =>
      api.createInboundWebhook(agentId, data),
    onSuccess: (wh) => onCreated(wh),
    onError: (err: ApiError) => setError(err.detail),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      source,
      processing_mode: processingMode,
      secret: secret.trim() || undefined,
      signature_header: signatureHeader.trim() || undefined,
      prompt_template: promptTemplate.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 bg-background-secondary space-y-3">
      <h5 className="text-sm font-semibold text-foreground">New Inbound Webhook</h5>

      {error && (
        <div className="p-2 rounded bg-error/10 border border-error/30 text-error text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chatwoot Messages"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="input w-full text-sm"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
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

      {/* Processing mode toggle */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Processing Mode</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setProcessingMode("async")}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              processingMode === "async"
                ? "bg-coral-500/20 border-coral-500/50 text-coral-400"
                : "border-border text-foreground-muted hover:text-foreground"
            }`}
          >
            Async (queue)
          </button>
          <button
            type="button"
            onClick={() => setProcessingMode("sync")}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              processingMode === "sync"
                ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                : "border-border text-foreground-muted hover:text-foreground"
            }`}
          >
            Sync (wait for response)
          </button>
        </div>
        <p className="text-xs text-foreground-muted mt-1">
          {processingMode === "async"
            ? "Returns 200 immediately and processes in background."
            : "Waits for agent response and returns it to caller."}
        </p>
      </div>

      {/* Signature verification */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Secret (HMAC verification)
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Optional shared secret"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Signature Header
          </label>
          <input
            type="text"
            value={signatureHeader}
            onChange={(e) => setSignatureHeader(e.target.value)}
            placeholder="e.g. X-Hub-Signature-256"
            className="input w-full text-sm"
          />
        </div>
      </div>

      {/* Prompt template */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Prompt Template
        </label>
        <textarea
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          placeholder="Optional. Use {{key}} or {{nested.key}} to extract from payload. Leave empty to forward full JSON."
          rows={2}
          className="input w-full text-sm resize-none font-mono"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="btn-primary btn-sm"
        >
          {createMutation.isPending ? "Creating..." : "Create Webhook"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary btn-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
