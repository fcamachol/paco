"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Cpu, Rocket } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { InfraOrchestrator } from "@/types/infrastructure";

export default function OrchestratorPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: infra } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const { data: orchestrator, isLoading } = useQuery({
    queryKey: ["infra-orchestrator", id],
    queryFn: () => api.getOrchestrator(id),
  });

  const [model, setModel] = useState("claude-sonnet-4-5-20250929");
  const [temperature, setTemperature] = useState(0.1);
  const [fallbackAgent, setFallbackAgent] = useState("");
  const [agentTimeout, setAgentTimeout] = useState(30);

  useEffect(() => {
    if (orchestrator) {
      const o = orchestrator as InfraOrchestrator;
      setModel(o.classification_model);
      setTemperature(o.classification_temperature);
      setFallbackAgent(o.fallback_agent || "");
      setAgentTimeout(o.agent_timeout);
    }
  }, [orchestrator]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateOrchestrator(id, {
        classification_model: model,
        classification_temperature: temperature,
        fallback_agent: fallbackAgent || null,
        agent_timeout: agentTimeout,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-orchestrator", id] });
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createOrchestrator(id, {
        classification_model: model,
        classification_temperature: temperature,
        fallback_agent: fallbackAgent || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-orchestrator", id] });
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
    },
  });

  const deployMutation = useMutation({
    mutationFn: () => api.upgradeOrchestrator(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-orchestrator", id] });
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
    },
  });

  const hasOrchestrator = !!orchestrator;

  return (
    <div>
      <Header
        title="Orchestrator"
        description={infra?.display_name || "Orchestrator configuration"}
      />

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-5 h-5 text-coral-500" />
            <h2 className="text-lg font-semibold">
              {hasOrchestrator ? "Edit Orchestrator" : "Create Orchestrator"}
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Classification Model
            </label>
            <select
              className="input w-full"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Classification Temperature
            </label>
            <input
              className="input w-32"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Agent Timeout (seconds)
            </label>
            <input
              className="input w-32"
              type="number"
              min="5"
              max="300"
              value={agentTimeout}
              onChange={(e) => setAgentTimeout(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Fallback Agent Category
            </label>
            <input
              className="input w-full"
              value={fallbackAgent}
              onChange={(e) => setFallbackAgent(e.target.value)}
              placeholder="Leave empty for first agent"
            />
          </div>

          {(updateMutation.isError || createMutation.isError) && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {((updateMutation.error || createMutation.error) as any)?.detail ||
                "Operation failed"}
            </div>
          )}

          {(updateMutation.isSuccess || createMutation.isSuccess) && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
              Orchestrator {hasOrchestrator ? "updated" : "created"} successfully
            </div>
          )}

          {deployMutation.isSuccess && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
              Classification updated and deployed to running orchestrator
            </div>
          )}

          {deployMutation.isError && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {(deployMutation.error as any)?.detail || "Deploy failed"}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() =>
                hasOrchestrator
                  ? updateMutation.mutate()
                  : createMutation.mutate()
              }
              disabled={updateMutation.isPending || createMutation.isPending}
              className="btn-secondary btn-md"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending || createMutation.isPending
                ? "Saving..."
                : hasOrchestrator
                ? "Save"
                : "Create Orchestrator"}
            </button>
            {hasOrchestrator && (
              <button
                onClick={() => deployMutation.mutate()}
                disabled={deployMutation.isPending}
                className="btn-primary btn-md"
              >
                <Rocket className="w-4 h-4 mr-2" />
                {deployMutation.isPending ? "Deploying..." : "Save & Deploy"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
