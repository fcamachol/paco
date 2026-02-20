"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Plus, Trash2, Rocket } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { InfraAgent } from "@/types/infrastructure";

export default function AgentPromptsPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["infra-agent", id, slug],
    queryFn: () => api.getInfraAgent(id, slug),
  });

  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");

  useEffect(() => {
    if (agent) {
      const a = agent as InfraAgent;
      setPrompts(a.system_prompts || {});
    }
  }, [agent]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateInfraAgent(id, slug, {
        system_prompts: prompts,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-agent", id, slug] });
    },
  });

  const deployMutation = useMutation({
    mutationFn: () => api.upgradePrompts(id, slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-agent", id, slug] });
    },
  });

  const addPrompt = () => {
    if (!newKey.trim()) return;
    setPrompts({ ...prompts, [newKey.trim()]: "" });
    setNewKey("");
  };

  const removePrompt = (key: string) => {
    const next = { ...prompts };
    delete next[key];
    setPrompts(next);
  };

  const updatePrompt = (key: string, value: string) => {
    setPrompts({ ...prompts, [key]: value });
  };

  const a = agent as InfraAgent;
  const promptKeys = Object.keys(prompts);

  return (
    <div>
      <Header
        title="System Prompts"
        description={`${a?.display_name || slug} — Edit task-type prompts`}
      />

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Add new prompt */}
        <div className="card p-4 flex items-center gap-3">
          <input
            className="input flex-1"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Task type key (e.g., general_inquiry)"
            onKeyDown={(e) => e.key === "Enter" && addPrompt()}
          />
          <button
            onClick={addPrompt}
            disabled={!newKey.trim()}
            className="btn-secondary btn-sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Prompt
          </button>
        </div>

        {/* Prompt editors */}
        {promptKeys.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-foreground-muted">
              No prompts configured. Add a task type to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {promptKeys.map((key) => (
              <div key={key} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold font-mono bg-background-secondary px-2 py-0.5 rounded">
                    {key}
                  </h3>
                  <button
                    onClick={() => removePrompt(key)}
                    className="text-error/60 hover:text-error p-1 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  className="input w-full font-mono text-sm"
                  rows={8}
                  value={prompts[key]}
                  onChange={(e) => updatePrompt(key, e.target.value)}
                  placeholder={`System prompt for ${key}...`}
                />
              </div>
            ))}
          </div>
        )}

        {/* Save & Deploy */}
        <div className="flex items-center justify-between">
          <div>
            {updateMutation.isSuccess && (
              <span className="text-sm text-success">Prompts saved successfully</span>
            )}
            {updateMutation.isError && (
              <span className="text-sm text-error">
                {(updateMutation.error as any)?.detail || "Failed to save prompts"}
              </span>
            )}
            {deployMutation.isSuccess && (
              <span className="text-sm text-success">Prompts deployed to running agent</span>
            )}
            {deployMutation.isError && (
              <span className="text-sm text-error">
                {(deployMutation.error as any)?.detail || "Failed to deploy prompts"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="btn-secondary btn-md"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
              className="btn-primary btn-md"
            >
              <Rocket className="w-4 h-4 mr-2" />
              {deployMutation.isPending ? "Deploying..." : "Save & Deploy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
