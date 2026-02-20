"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, CheckCircle, XCircle, Key } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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
    process.env.NEXT_PUBLIC_LANGFUSE_URL || "http://localhost:3001";

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
              Default API keys configured via environment variables. Individual
              agents can override these with per-agent credentials.
            </p>
            {apiKeysLoading ? (
              <div className="h-16 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-coral-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys?.keys.map((key) => (
                  <div
                    key={key.env_var}
                    className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {key.provider}
                      </p>
                      <p className="text-xs text-foreground-muted font-mono">
                        {key.env_var}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {key.configured ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-success" />
                          <span className="text-sm text-success">
                            Configured
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-foreground-muted" />
                          <span className="text-sm text-foreground-muted">
                            Not set
                          </span>
                        </>
                      )}
                    </div>
                  </div>
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
                value={process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
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
