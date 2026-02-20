"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Layers } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { HiveCoordinator } from "@/types/infrastructure";

export default function CoordinatorPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: infra } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const { data: coordinator, isLoading } = useQuery({
    queryKey: ["infra-coordinator", id],
    queryFn: () => api.getCoordinator(id),
  });

  const [model, setModel] = useState("claude-sonnet-4-5-20250929");
  const [temperature, setTemperature] = useState(0.1);
  const [decompositionPrompt, setDecompositionPrompt] = useState("");
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(5);
  const [taskTimeout, setTaskTimeout] = useState(300);
  const [maxRetries, setMaxRetries] = useState(3);
  const [aggregationStrategy, setAggregationStrategy] = useState("merge");
  const [aggregationPrompt, setAggregationPrompt] = useState("");
  const [planModeEnabled, setPlanModeEnabled] = useState(true);

  useEffect(() => {
    if (coordinator) {
      const c = coordinator as HiveCoordinator;
      setModel(c.coordinator_model);
      setTemperature(c.coordinator_temperature);
      setDecompositionPrompt(c.decomposition_prompt || "");
      setMaxConcurrentTasks(c.max_concurrent_tasks);
      setTaskTimeout(c.task_timeout);
      setMaxRetries(c.max_retries);
      setAggregationStrategy(c.aggregation_strategy);
      setAggregationPrompt(c.aggregation_prompt || "");
      setPlanModeEnabled(c.plan_mode_enabled);
    }
  }, [coordinator]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateCoordinator(id, {
        coordinator_model: model,
        coordinator_temperature: temperature,
        decomposition_prompt: decompositionPrompt || null,
        max_concurrent_tasks: maxConcurrentTasks,
        task_timeout: taskTimeout,
        max_retries: maxRetries,
        aggregation_strategy: aggregationStrategy,
        aggregation_prompt: aggregationPrompt || null,
        plan_mode_enabled: planModeEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-coordinator", id] });
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createCoordinator(id, {
        coordinator_model: model,
        coordinator_temperature: temperature,
        decomposition_prompt: decompositionPrompt || null,
        max_concurrent_tasks: maxConcurrentTasks,
        task_timeout: taskTimeout,
        max_retries: maxRetries,
        aggregation_strategy: aggregationStrategy,
        aggregation_prompt: aggregationPrompt || null,
        plan_mode_enabled: planModeEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-coordinator", id] });
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
    },
  });

  const hasCoordinator = !!coordinator;

  return (
    <div>
      <Header
        title="Coordinator"
        description={infra?.display_name || "Hive coordinator configuration"}
      />

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-5 h-5 text-coral-500" />
            <h2 className="text-lg font-semibold">
              {hasCoordinator ? "Edit Coordinator" : "Create Coordinator"}
            </h2>
          </div>

          {hasCoordinator && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success">
                {(coordinator as HiveCoordinator).status}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Coordinator Model
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
              Temperature
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
              Decomposition Prompt
            </label>
            <textarea
              className="input w-full"
              rows={4}
              value={decompositionPrompt}
              onChange={(e) => setDecompositionPrompt(e.target.value)}
              placeholder="Custom prompt for task decomposition (optional)"
            />
            <p className="text-xs text-foreground-muted mt-1">
              Override the default prompt used to break down requests into tasks.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Max Concurrent Tasks
            </label>
            <input
              className="input w-32"
              type="number"
              min="1"
              max="20"
              value={maxConcurrentTasks}
              onChange={(e) => setMaxConcurrentTasks(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Task Timeout (seconds)
            </label>
            <input
              className="input w-32"
              type="number"
              min="30"
              max="3600"
              value={taskTimeout}
              onChange={(e) => setTaskTimeout(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Max Retries
            </label>
            <input
              className="input w-32"
              type="number"
              min="0"
              max="10"
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Aggregation Strategy
            </label>
            <select
              className="input w-full"
              value={aggregationStrategy}
              onChange={(e) => setAggregationStrategy(e.target.value)}
            >
              <option value="merge">Merge</option>
              <option value="summarize">Summarize</option>
              <option value="first">First</option>
            </select>
            <p className="text-xs text-foreground-muted mt-1">
              How results from multiple agents are combined into a final response.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Aggregation Prompt
            </label>
            <textarea
              className="input w-full"
              rows={4}
              value={aggregationPrompt}
              onChange={(e) => setAggregationPrompt(e.target.value)}
              placeholder="Custom prompt for result aggregation (optional)"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={planModeEnabled}
                onChange={(e) => setPlanModeEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              Plan Mode Enabled
            </label>
            <p className="text-xs text-foreground-muted mt-1">
              When enabled, agents must submit plans for approval before executing.
            </p>
          </div>

          {(updateMutation.isError || createMutation.isError) && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {((updateMutation.error || createMutation.error) as any)?.detail ||
                "Operation failed"}
            </div>
          )}

          {(updateMutation.isSuccess || createMutation.isSuccess) && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
              Coordinator {hasCoordinator ? "updated" : "created"} successfully
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() =>
                hasCoordinator
                  ? updateMutation.mutate()
                  : createMutation.mutate()
              }
              disabled={updateMutation.isPending || createMutation.isPending}
              className="btn-primary btn-md"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending || createMutation.isPending
                ? "Saving..."
                : hasCoordinator
                ? "Save"
                : "Create Coordinator"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
