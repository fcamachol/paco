"use client";

import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Database,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api, LightningDataset, TrainingRun, Agent } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";

type Tab = "datasets" | "runs" | "results";

export default function TrainingPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("datasets");

  // -- Data queries --
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
  });

  const { data: datasets = [], isLoading: datasetsLoading } = useQuery({
    queryKey: ["lightning-datasets"],
    queryFn: () => api.getLightningDatasets(),
    refetchInterval: 15000,
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["training-runs"],
    queryFn: () => api.getTrainingRuns(),
    refetchInterval: 5000,
  });

  return (
    <div>
      <Header
        title="Agent Training"
        description="Optimize agents with reinforcement learning via Agent Lightning"
      />

      <div className="p-6 space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-border">
          {(
            [
              { key: "datasets", label: "Datasets", icon: Database },
              { key: "runs", label: "Training Runs", icon: Zap },
              { key: "results", label: "Results", icon: BarChart3 },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === key
                  ? "border-coral-500 text-coral-500"
                  : "border-transparent text-foreground-muted hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "datasets" && (
          <DatasetsTab
            datasets={datasets}
            agents={agents}
            isLoading={datasetsLoading}
            queryClient={queryClient}
          />
        )}
        {activeTab === "runs" && (
          <TrainingRunsTab
            runs={runs}
            datasets={datasets}
            agents={agents}
            isLoading={runsLoading}
            queryClient={queryClient}
          />
        )}
        {activeTab === "results" && (
          <ResultsTab runs={runs} agents={agents} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Datasets Tab
// =============================================================================

function DatasetsTab({
  datasets,
  agents,
  isLoading,
  queryClient,
}: {
  datasets: LightningDataset[];
  agents: Agent[];
  isLoading: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [itemsText, setItemsText] = useState("");

  const createMutation = useMutation({
    mutationFn: () => {
      const items = itemsText
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.split("|").map((s) => s.trim());
          return {
            prompt: parts[0],
            expected_output: parts[1] || undefined,
          };
        });
      return api.createLightningDataset({ name, description, agent_id: agentId, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lightning-datasets"] });
      setShowCreate(false);
      setName("");
      setDescription("");
      setAgentId("");
      setItemsText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteLightningDataset(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lightning-datasets"] }),
  });

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || id.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Training Datasets</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Dataset
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Create Dataset</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-foreground-muted mb-1">Name</label>
              <input
                className="input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. math-evaluation"
              />
            </div>
            <div>
              <label className="block text-sm text-foreground-muted mb-1">Agent</label>
              <select className="input w-full" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">Select agent...</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-foreground-muted mb-1">Description</label>
            <input
              className="input w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground-muted mb-1">
              Items (one per line, use | to separate prompt from expected output)
            </label>
            <textarea
              className="input w-full h-32 font-mono text-xs"
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              placeholder={"What is 2+2? | 4\nCapital of France? | Paris\nExplain gravity"}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!name || !agentId || createMutation.isPending}
              className="btn btn-primary"
            >
              {createMutation.isPending ? "Creating..." : "Create Dataset"}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Dataset List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Agent</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">Items</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Created</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-foreground-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-coral-500" />
                  </td>
                </tr>
              ) : datasets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-foreground-muted">
                    No datasets yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                datasets.map((ds) => (
                  <tr key={ds.id} className="border-b border-border hover:bg-background-secondary transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{ds.name}</p>
                      {ds.description && (
                        <p className="text-xs text-foreground-muted">{ds.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{agentName(ds.agent_id)}</td>
                    <td className="px-4 py-3 text-sm text-right text-foreground">{ds.item_count}</td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">{formatDateTime(ds.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => deleteMutation.mutate(ds.id)}
                        className="text-error hover:text-error/80 transition-colors"
                        title="Delete dataset"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Training Runs Tab
// =============================================================================

function TrainingRunsTab({
  runs,
  datasets,
  agents,
  isLoading,
  queryClient,
}: {
  runs: TrainingRun[];
  datasets: LightningDataset[];
  agents: Agent[];
  isLoading: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [showLaunch, setShowLaunch] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [algorithm, setAlgorithm] = useState("apo");
  const [rewardFunction, setRewardFunction] = useState("llm_judge");
  const [maxEpochs, setMaxEpochs] = useState(10);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const launchMutation = useMutation({
    mutationFn: () =>
      api.createTrainingRun({
        agent_id: agentId,
        dataset_id: datasetId,
        algorithm,
        reward_function: rewardFunction,
        max_epochs: maxEpochs,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-runs"] });
      setShowLaunch(false);
    },
  });

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || id.slice(0, 8);
  const datasetName = (id: string) => datasets.find((d) => d.id === id)?.name || id.slice(0, 8);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-foreground-muted/20 text-foreground-muted",
      running: "bg-coral-500/20 text-coral-500",
      completed: "bg-success/20 text-success",
      failed: "bg-error/20 text-error",
      canceled: "bg-warning/20 text-warning",
    };
    const icons: Record<string, React.ReactNode> = {
      pending: <Clock className="w-3 h-3" />,
      running: <Loader2 className="w-3 h-3 animate-spin" />,
      completed: <CheckCircle className="w-3 h-3" />,
      failed: <XCircle className="w-3 h-3" />,
    };
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", styles[status] || styles.pending)}>
        {icons[status]}
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Training Runs</h2>
        <button
          onClick={() => setShowLaunch(!showLaunch)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Play className="w-4 h-4" />
          Launch Training
        </button>
      </div>

      {/* Launch Form */}
      {showLaunch && (
        <div className="card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Launch Training Run</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-foreground-muted mb-1">Agent</label>
              <select className="input w-full" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">Select agent...</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-foreground-muted mb-1">Dataset</label>
              <select className="input w-full" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                <option value="">Select dataset...</option>
                {datasets
                  .filter((d) => !agentId || d.agent_id === agentId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.item_count} items)
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-foreground-muted mb-1">Algorithm</label>
              <select className="input w-full" value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
                <option value="apo">APO (Agent Policy Optimization)</option>
                <option value="dpo">DPO (Direct Preference Optimization)</option>
                <option value="ppo">PPO (Proximal Policy Optimization)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-foreground-muted mb-1">Reward Function</label>
              <select className="input w-full" value={rewardFunction} onChange={(e) => setRewardFunction(e.target.value)}>
                <option value="llm_judge">LLM Judge</option>
                <option value="keyword_match">Keyword Match</option>
                <option value="regex_match">Regex Match</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-foreground-muted mb-1">Max Epochs</label>
              <input
                type="number"
                className="input w-full"
                value={maxEpochs}
                onChange={(e) => setMaxEpochs(Number(e.target.value))}
                min={1}
                max={100}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => launchMutation.mutate()}
              disabled={!agentId || !datasetId || launchMutation.isPending}
              className="btn btn-primary"
            >
              {launchMutation.isPending ? "Launching..." : "Launch Run"}
            </button>
            <button onClick={() => setShowLaunch(false)} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Runs List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Agent</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Dataset</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Algorithm</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Progress</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-foreground-muted">Best Reward</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-foreground-muted">Created</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-coral-500" />
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-foreground-muted">
                    No training runs yet. Launch one to get started.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <Fragment key={run.id}>
                    <tr
                      className="border-b border-border hover:bg-background-secondary transition-colors cursor-pointer"
                      onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    >
                      <td className="px-4 py-3">{getStatusBadge(run.status)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{agentName(run.agent_id)}</td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">{datasetName(run.dataset_id)}</td>
                      <td className="px-4 py-3 text-sm text-foreground-muted uppercase">{run.algorithm}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-background rounded-full overflow-hidden max-w-[120px]">
                            <div
                              className="h-full bg-coral-500 rounded-full transition-all"
                              style={{ width: `${(run.current_epoch / run.max_epochs) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-foreground-muted">
                            {run.current_epoch}/{run.max_epochs}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-foreground">
                        {run.best_reward != null ? run.best_reward.toFixed(4) : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">{formatDateTime(run.created_at)}</td>
                      <td className="px-4 py-3">
                        {expandedRun === run.id ? (
                          <ChevronUp className="w-4 h-4 text-foreground-muted" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-foreground-muted" />
                        )}
                      </td>
                    </tr>
                    {expandedRun === run.id && (
                      <tr key={`${run.id}-detail`} className="border-b border-border">
                        <td colSpan={8} className="px-4 py-4 bg-background-secondary">
                          <RunDetailPanel run={run} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RunDetailPanel({ run }: { run: TrainingRun }) {
  const epochs = run.metrics?.epochs || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-foreground-muted">Reward Function</p>
          <p className="text-sm font-medium text-foreground">{run.reward_function}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Started</p>
          <p className="text-sm text-foreground">{run.started_at ? formatDateTime(run.started_at) : "-"}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Completed</p>
          <p className="text-sm text-foreground">{run.completed_at ? formatDateTime(run.completed_at) : "-"}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Best Reward</p>
          <p className="text-sm font-mono font-bold text-coral-500">
            {run.best_reward != null ? run.best_reward.toFixed(4) : "-"}
          </p>
        </div>
      </div>

      {/* Epoch metrics table */}
      {epochs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground-muted mb-2">Epoch Metrics</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {epochs.map((ep: any) => (
              <div
                key={ep.epoch}
                className="rounded-lg border border-border p-2 text-center"
              >
                <p className="text-xs text-foreground-muted">Epoch {ep.epoch}</p>
                <p className="text-sm font-mono font-bold text-foreground">
                  {ep.avg_reward?.toFixed(3)}
                </p>
                <p className="text-xs text-foreground-muted">{ep.total_items} items</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimized prompt */}
      {run.optimized_prompt && (
        <div>
          <p className="text-xs font-medium text-foreground-muted mb-1">Optimized Prompt</p>
          <pre className="text-xs bg-background rounded-lg border border-border p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {run.optimized_prompt}
          </pre>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Results Tab
// =============================================================================

function ResultsTab({ runs, agents }: { runs: TrainingRun[]; agents: Agent[] }) {
  const completedRuns = runs.filter((r) => r.status === "completed");
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || id.slice(0, 8);

  if (completedRuns.length === 0) {
    return (
      <div className="card p-12 text-center">
        <BarChart3 className="w-12 h-12 mx-auto text-foreground-muted mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No Results Yet</h3>
        <p className="text-foreground-muted">
          Completed training runs will appear here with their reward metrics and optimized outputs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Completed Training Results</h2>

      <div className="grid gap-4">
        {completedRuns.map((run) => {
          const epochs = run.metrics?.epochs || [];
          const rewards = epochs.map((e: any) => e.avg_reward || 0);
          const maxR = Math.max(...rewards, 0.01);

          return (
            <div key={run.id} className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {agentName(run.agent_id)}
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    {run.algorithm.toUpperCase()} &middot; {run.reward_function} &middot;{" "}
                    {run.max_epochs} epochs
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold font-mono text-coral-500">
                    {run.best_reward != null ? run.best_reward.toFixed(4) : "-"}
                  </p>
                  <p className="text-xs text-foreground-muted">best reward</p>
                </div>
              </div>

              {/* Mini reward chart */}
              {rewards.length > 1 && (
                <div className="flex items-end gap-1 h-16">
                  {rewards.map((r: number, i: number) => (
                    <div
                      key={i}
                      className="flex-1 bg-coral-500/80 rounded-t transition-all hover:bg-coral-500"
                      style={{ height: `${(r / maxR) * 100}%` }}
                      title={`Epoch ${i + 1}: ${r.toFixed(3)}`}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-foreground-muted">
                <span>Started: {run.started_at ? formatDateTime(run.started_at) : "-"}</span>
                <span>Completed: {run.completed_at ? formatDateTime(run.completed_at) : "-"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
