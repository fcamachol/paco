"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Key, Trash2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { api, ApiError } from "@/lib/api";

const AGENT_TYPES = [
  { value: "claude-sdk", label: "Claude SDK" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_YAML = `# Agent configuration
model: claude-sonnet-4-5-20250929
temperature: 0.7
max_tokens: 4096
system_prompt: |
  You are a helpful assistant.
`;

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("claude-sdk");
  const [configYaml, setConfigYaml] = useState(DEFAULT_YAML);
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [visibleEnvKeys, setVisibleEnvKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => {
      const envVarsObj: Record<string, string> = {};
      for (const { key, value } of envVars) {
        if (key.trim()) envVarsObj[key.trim()] = value;
      }
      return api.createAgent({
        name,
        display_name: displayName || undefined,
        description: description || undefined,
        type,
        config_yaml: configYaml,
        env_vars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
      });
    },
    onSuccess: (agent) => {
      router.push(`/agents/${agent.id}`);
    },
    onError: (err: ApiError) => {
      setError(err.detail || "Failed to create agent");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
      setError("Name must be lowercase alphanumeric with hyphens only");
      return;
    }

    createMutation.mutate();
  };

  return (
    <div>
      <Header title="Add Agent" description="Register a new agent" />

      <div className="p-6 max-w-2xl">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className="input w-full"
            />
            <p className="text-xs text-foreground-muted mt-1">
              Lowercase alphanumeric with hyphens (e.g., my-agent)
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Agent"
              className="input w-full"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              rows={2}
              className="input w-full resize-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Type <span className="text-error">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input w-full"
            >
              {AGENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Environment Variables */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Key className="w-3.5 h-3.5 inline mr-1" />
              Credentials &amp; Environment Variables
            </label>
            {envVars.length === 0 && (
              <p className="text-sm text-foreground-muted italic mb-2">
                Using global default API keys. Add overrides below if needed.
              </p>
            )}
            <div className="space-y-2 mb-2">
              {envVars.map((entry, index) => {
                const sensitive = ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIAL'].some(
                  (p) => entry.key.toUpperCase().includes(p)
                );
                const isVisible = visibleEnvKeys.has(entry.key);
                return (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={entry.key}
                      onChange={(e) => {
                        const next = [...envVars];
                        next[index] = { ...next[index], key: e.target.value };
                        setEnvVars(next);
                      }}
                      placeholder="KEY_NAME"
                      className="input flex-1 font-mono text-sm"
                    />
                    <div className="relative flex-1">
                      <input
                        type={sensitive && !isVisible ? "password" : "text"}
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...envVars];
                          next[index] = { ...next[index], value: e.target.value };
                          setEnvVars(next);
                        }}
                        placeholder={sensitive ? "••••••••" : "value"}
                        className="input w-full font-mono text-sm pr-8"
                      />
                      {sensitive && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(visibleEnvKeys);
                            if (isVisible) next.delete(entry.key);
                            else next.add(entry.key);
                            setVisibleEnvKeys(next);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                        >
                          {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnvVars(envVars.filter((_, i) => i !== index))}
                      className="p-1.5 text-foreground-muted hover:text-error rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setEnvVars([...envVars, { key: "", value: "" }])}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground-muted hover:text-foreground hover:border-foreground/30"
              >
                <Plus className="w-3 h-3" />
                Add Variable
              </button>
              {!envVars.some((e) => e.key === "ANTHROPIC_API_KEY") && (
                <button
                  type="button"
                  onClick={() => setEnvVars([...envVars, { key: "ANTHROPIC_API_KEY", value: "" }])}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground-muted hover:text-foreground hover:border-foreground/30"
                >
                  <Key className="w-3 h-3" />
                  Anthropic API Key
                </button>
              )}
              {!envVars.some((e) => e.key === "OPENAI_API_KEY") && (
                <button
                  type="button"
                  onClick={() => setEnvVars([...envVars, { key: "OPENAI_API_KEY", value: "" }])}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground-muted hover:text-foreground hover:border-foreground/30"
                >
                  <Key className="w-3 h-3" />
                  OpenAI API Key
                </button>
              )}
            </div>
          </div>

          {/* YAML Config */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Configuration (YAML)
            </label>
            <textarea
              value={configYaml}
              onChange={(e) => setConfigYaml(e.target.value)}
              rows={12}
              className="input w-full font-mono text-sm resize-y"
              spellCheck={false}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary btn-md"
            >
              {createMutation.isPending ? "Creating..." : "Create Agent"}
            </button>
            <Link href="/agents" className="btn-secondary btn-md">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
