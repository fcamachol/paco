"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  CheckCircle,
  XCircle,
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Database,
  Server,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

function ApiKeyRow({
  provider,
  envVar,
  configured,
  source,
}: {
  provider: string;
  envVar: string;
  configured: boolean;
  source: "database" | "environment" | "none";
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [keyValue, setKeyValue] = useState("");

  const saveMutation = useMutation({
    mutationFn: (value: string) => api.saveGlobalApiKey(provider, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "api-keys"] });
      setEditing(false);
      setKeyValue("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteGlobalApiKey(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "api-keys"] });
    },
  });

  const handleSave = () => {
    if (keyValue.trim()) {
      saveMutation.mutate(keyValue.trim());
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setKeyValue("");
    saveMutation.reset();
  };

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">{provider}</p>
          <p className="text-xs text-foreground-muted font-mono">{envVar}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badge */}
          {source === "database" ? (
            <>
              <Database className="w-3.5 h-3.5 text-success" />
              <span className="text-sm text-success">Stored</span>
            </>
          ) : source === "environment" ? (
            <>
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-sm text-blue-400">Environment</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-foreground-muted" />
              <span className="text-sm text-foreground-muted">Not set</span>
            </>
          )}

          {/* Action buttons */}
          {!editing && (
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setEditing(true)}
                className="btn btn-sm btn-ghost text-xs"
              >
                {configured ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Replace
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </>
                )}
              </button>
              {source === "database" && (
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="btn btn-sm btn-ghost text-error text-xs"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder={`Enter ${provider} API key...`}
            className="input flex-1 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <button
            onClick={handleSave}
            disabled={!keyValue.trim() || saveMutation.isPending}
            className="btn btn-sm btn-primary"
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleCancel}
            className="btn btn-sm btn-ghost"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error messages */}
      {saveMutation.isError && (
        <p className="text-xs text-error mt-1">
          Failed to save: {(saveMutation.error as any)?.detail || "Unknown error"}
        </p>
      )}
      {deleteMutation.isError && (
        <p className="text-xs text-error mt-1">
          Failed to delete: {(deleteMutation.error as any)?.detail || "Unknown error"}
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  // Fetch health status
  const { data: health, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.healthCheck(),
  });

  // Fetch global API keys status
  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: () => api.getGlobalApiKeys(),
  });

  const langfuseUrl =
    process.env.NEXT_PUBLIC_LANGFUSE_URL || "";

  return (
    <div>
      <Header
        title="Settings"
        description="Configure PACO and connected services"
      />

      <div className="p-6 space-y-6">
        {/* System Status */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-foreground">System Status</h2>
          </div>
          <div className="card-content">
            {isLoading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <p className="font-medium text-foreground">PACO Backend</p>
                    <p className="text-sm text-foreground-muted">
                      {health?.app} v{health?.version}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {health?.status === "healthy" ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-success" />
                        <span className="text-success">Connected</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-error" />
                        <span className="text-error">Disconnected</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <p className="font-medium text-foreground">Langfuse</p>
                    <p className="text-sm text-foreground-muted">
                      Observability & Token Tracking
                    </p>
                  </div>
                  <a
                    href={langfuseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-coral-500 hover:text-coral-400"
                  >
                    Open Dashboard
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global API Keys */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-foreground">
              <Key className="w-4 h-4 inline mr-1.5" />
              Global API Keys
            </h2>
          </div>
          <div className="card-content">
            <p className="text-sm text-foreground-muted mb-4">
              Manage API keys for LLM providers. Keys stored here are the primary
              source — environment variables serve as a legacy fallback. Individual
              agents can override these with per-agent credentials.
            </p>
            {apiKeysLoading ? (
              <div className="h-16 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-coral-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div>
                {apiKeys?.keys.map((key) => (
                  <ApiKeyRow
                    key={key.env_var}
                    provider={key.provider}
                    envVar={key.env_var}
                    configured={key.configured}
                    source={key.source}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Configuration */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-foreground">Configuration</h2>
          </div>
          <div className="card-content space-y-4">
            <div>
              <label className="label block mb-1">API URL</label>
              <input
                type="text"
                value={process.env.NEXT_PUBLIC_API_URL || "(relative)"}
                readOnly
                className="input bg-background-tertiary"
              />
            </div>

            <div>
              <label className="label block mb-1">Langfuse URL</label>
              <input
                type="text"
                value={langfuseUrl}
                readOnly
                className="input bg-background-tertiary"
              />
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-foreground">About PACO</h2>
          </div>
          <div className="card-content">
            <p className="text-foreground-muted mb-4">
              <strong className="text-foreground">PACO</strong> (Pretty Advanced
              Cognitive Orchestrator) is an Agent Hub for centralized management,
              configuration, deployment, monitoring, and observability for AI
              agents.
            </p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-foreground-muted">Version</p>
                <p className="text-foreground">1.0.0</p>
              </div>
              <div>
                <p className="text-foreground-muted">Stack</p>
                <p className="text-foreground">FastAPI + Next.js + PostgreSQL</p>
              </div>
              <div>
                <p className="text-foreground-muted">Observability</p>
                <p className="text-foreground">Langfuse (self-hosted)</p>
              </div>
              <div>
                <p className="text-foreground-muted">Agent Protocol</p>
                <p className="text-foreground">MCP (Model Context Protocol)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
