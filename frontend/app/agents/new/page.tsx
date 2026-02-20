"use client";

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { api, ApiError } from "@/lib/api";
import { AgentConfigForm } from "@/components/agent-config";
import type { AgentFormValues } from "@/components/agent-config";
import { defaultAgentValues } from "@/components/agent-config";

const AGENT_TYPES = [
  { value: "claude-sdk", label: "Claude SDK" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom" },
];

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("claude-sdk");
  const [agentConfig, setAgentConfig] = useState<Partial<AgentFormValues>>({
    ...defaultAgentValues,
    name: "new-agent", // placeholder to satisfy validation
  });
  const [error, setError] = useState<string | null>(null);

  const handleConfigChange = useCallback((values: AgentFormValues) => {
    setAgentConfig(values);
  }, []);

  const createMutation = useMutation({
    mutationFn: () => {
      // Build sdk_config from form parameters
      const sdkConfig: Record<string, any> = {};
      if (agentConfig.temperature !== undefined) sdkConfig.temperature = agentConfig.temperature;
      if (agentConfig.maxTokens !== undefined) sdkConfig.max_tokens = agentConfig.maxTokens;
      if (agentConfig.topP !== undefined) sdkConfig.top_p = agentConfig.topP;
      if (agentConfig.topK !== undefined) sdkConfig.top_k = agentConfig.topK;
      if (agentConfig.stopSequences && agentConfig.stopSequences.length > 0) {
        sdkConfig.stop_sequences = agentConfig.stopSequences;
      }

      // Resolve model (handle custom model)
      const model = agentConfig.model === "custom" && agentConfig.customModel
        ? agentConfig.customModel
        : agentConfig.model || "claude-sonnet-4-5-20250929";

      return api.createAgent({
        name,
        display_name: displayName || undefined,
        description: description || undefined,
        type,
        model,
        system_prompt: agentConfig.systemPrompt || undefined,
        env_vars: agentConfig.envVars && Object.keys(agentConfig.envVars).length > 0
          ? agentConfig.envVars
          : undefined,
        sdk_config: Object.keys(sdkConfig).length > 0 ? sdkConfig : undefined,
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

          {/* Agent Configuration Form */}
          <div className="border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Agent Configuration</h3>
            <AgentConfigForm
              defaultValues={agentConfig}
              onChange={handleConfigChange}
              hideFields={['name']}
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
