"use client";

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Network, Cpu, Layers } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

interface AgentForm {
  agent_id_slug: string;
  display_name: string;
  description: string;
  category_code: string;
  task_types: string;
  keywords: string;
  confidentiality_level: string;
}

export default function NewInfrastructurePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 0: Project
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [portRangeStart, setPortRangeStart] = useState(8000);

  // Step 1: Type
  const [infraType, setInfraType] = useState<"orchestrator" | "hive">("orchestrator");

  // Step 2: Orchestrator (when type=orchestrator)
  const [classificationModel, setClassificationModel] = useState("claude-sonnet-4-5-20250929");
  const [classificationTemp, setClassificationTemp] = useState(0.1);
  const [fallbackAgent, setFallbackAgent] = useState("");

  // Step 2: Coordinator (when type=hive)
  const [coordinatorModel, setCoordinatorModel] = useState("claude-sonnet-4-5-20250929");
  const [coordinatorTemp, setCoordinatorTemp] = useState(0.1);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(5);
  const [taskTimeout, setTaskTimeout] = useState(300);
  const [aggregationStrategy, setAggregationStrategy] = useState("merge");
  const [planModeEnabled, setPlanModeEnabled] = useState(true);

  // Step 3: Agents
  const [agents, setAgents] = useState<AgentForm[]>([]);
  const [newAgent, setNewAgent] = useState<AgentForm>({
    agent_id_slug: "",
    display_name: "",
    description: "",
    category_code: "",
    task_types: "general_inquiry, create_ticket, check_status",
    keywords: "",
    confidentiality_level: "INTERNAL",
  });

  // Step 4: Shared
  const [dbName, setDbName] = useState("");

  const STEPS = useMemo(() => {
    if (infraType === "hive") {
      return ["Project", "Type", "Coordinator", "Agents", "Shared Services", "Review & Generate"];
    }
    return ["Project", "Type", "Orchestrator", "Agents", "Shared Services", "Review & Generate"];
  }, [infraType]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () => {
      // 1. Create infrastructure
      const infra = await api.createInfrastructure({
        name,
        display_name: displayName || name,
        description,
        port_range_start: portRangeStart,
        type: infraType,
        db_name: dbName || name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      });

      // 2. Create orchestrator or coordinator
      if (infraType === "hive") {
        await api.createCoordinator(infra.id, {
          coordinator_model: coordinatorModel,
          coordinator_temperature: coordinatorTemp,
          max_concurrent_tasks: maxConcurrentTasks,
          task_timeout: taskTimeout,
          aggregation_strategy: aggregationStrategy,
          plan_mode_enabled: planModeEnabled,
        });
      } else {
        await api.createOrchestrator(infra.id, {
          classification_model: classificationModel,
          classification_temperature: classificationTemp,
          fallback_agent: fallbackAgent || (agents[0]?.category_code || ""),
        });
      }

      // 3. Create agents
      for (const agent of agents) {
        await api.createInfraAgent(infra.id, {
          agent_id_slug: agent.agent_id_slug,
          display_name: agent.display_name,
          description: agent.description,
          category_code: agent.category_code,
          task_types: agent.task_types.split(",").map((t) => t.trim()).filter(Boolean),
          keywords: agent.keywords.split(",").map((k) => k.trim()).filter(Boolean),
          confidentiality_level: agent.confidentiality_level,
        });
      }

      // 4. Generate code
      await api.generateInfrastructure(infra.id);

      return infra;
    },
    onSuccess: (infra) => {
      router.push(`/infrastructures/${infra.id}`);
    },
  });

  const addAgent = () => {
    if (!newAgent.agent_id_slug || !newAgent.category_code) return;
    setAgents([...agents, { ...newAgent }]);
    setNewAgent({
      agent_id_slug: "",
      display_name: "",
      description: "",
      category_code: "",
      task_types: "general_inquiry, create_ticket, check_status",
      keywords: "",
      confidentiality_level: "INTERNAL",
    });
  };

  const removeAgent = (index: number) => {
    setAgents(agents.filter((_, i) => i !== index));
  };

  const canProceed = () => {
    switch (step) {
      case 0: return name.length > 0;
      case 1: return true; // type selection always valid
      case 2: return true; // orchestrator/coordinator config always valid
      case 3: return agents.length > 0;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  return (
    <div>
      <Header
        title="New Infrastructure"
        description="Create a multi-agent system step by step"
      />

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  i === step
                    ? "bg-coral-500 text-white"
                    : i < step
                    ? "bg-success/20 text-success cursor-pointer"
                    : "bg-background-secondary text-foreground-muted"
                }`}
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="w-8 h-px bg-border" />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Project Configuration</h2>
              <div>
                <label className="block text-sm font-medium mb-1">Name (slug)</label>
                <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-agent-system" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input className="input w-full" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="My Agent System" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea className="input w-full" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Multi-agent system for..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port Range Start</label>
                <input className="input w-32" type="number" value={portRangeStart} onChange={(e) => setPortRangeStart(Number(e.target.value))} />
                <p className="text-xs text-foreground-muted mt-1">Orchestrator gets this port, agents get +1, +2, etc.</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Infrastructure Type</h2>
              <p className="text-sm text-foreground-muted">Choose how your agents will be coordinated.</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setInfraType("orchestrator")}
                  className={`p-5 rounded-lg border-2 text-left transition-colors ${
                    infraType === "orchestrator"
                      ? "border-coral-500 bg-coral-500/5"
                      : "border-border hover:border-foreground-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-5 h-5 text-coral-500" />
                    <h3 className="font-semibold">Orchestrator</h3>
                  </div>
                  <p className="text-sm text-foreground-muted">
                    Routes incoming requests to the right specialist agent based on classification.
                  </p>
                  <p className="text-xs text-foreground-muted mt-2">
                    Best for: customer service, FAQ handling, domain-specific routing.
                  </p>
                </button>
                <button
                  onClick={() => setInfraType("hive")}
                  className={`p-5 rounded-lg border-2 text-left transition-colors ${
                    infraType === "hive"
                      ? "border-coral-500 bg-coral-500/5"
                      : "border-border hover:border-foreground-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-5 h-5 text-coral-500" />
                    <h3 className="font-semibold">Hive</h3>
                  </div>
                  <p className="text-sm text-foreground-muted">
                    Decomposes complex requests into parallel tasks assigned to worker agents.
                  </p>
                  <p className="text-xs text-foreground-muted mt-2">
                    Best for: research tasks, multi-step workflows, complex analysis.
                  </p>
                </button>
              </div>
            </div>
          )}

          {step === 2 && infraType === "orchestrator" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Orchestrator Configuration</h2>
              <div>
                <label className="block text-sm font-medium mb-1">Classification Model</label>
                <select className="input w-full" value={classificationModel} onChange={(e) => setClassificationModel(e.target.value)}>
                  <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Classification Temperature</label>
                <input className="input w-32" type="number" step="0.1" min="0" max="1" value={classificationTemp} onChange={(e) => setClassificationTemp(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fallback Agent Category</label>
                <input className="input w-full" value={fallbackAgent} onChange={(e) => setFallbackAgent(e.target.value)} placeholder="Leave empty to use first agent" />
              </div>
            </div>
          )}

          {step === 2 && infraType === "hive" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Coordinator Configuration</h2>
              <div>
                <label className="block text-sm font-medium mb-1">Coordinator Model</label>
                <select className="input w-full" value={coordinatorModel} onChange={(e) => setCoordinatorModel(e.target.value)}>
                  <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Temperature</label>
                <input className="input w-32" type="number" step="0.1" min="0" max="1" value={coordinatorTemp} onChange={(e) => setCoordinatorTemp(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Concurrent Tasks</label>
                <input className="input w-32" type="number" min="1" max="20" value={maxConcurrentTasks} onChange={(e) => setMaxConcurrentTasks(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Task Timeout (seconds)</label>
                <input className="input w-32" type="number" min="30" max="3600" value={taskTimeout} onChange={(e) => setTaskTimeout(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Aggregation Strategy</label>
                <select className="input w-full" value={aggregationStrategy} onChange={(e) => setAggregationStrategy(e.target.value)}>
                  <option value="merge">Merge</option>
                  <option value="summarize">Summarize</option>
                  <option value="first">First</option>
                </select>
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
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Specialist Agents</h2>

              {agents.length > 0 && (
                <div className="space-y-2">
                  {agents.map((agent, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg">
                      <div className="flex-1">
                        <span className="font-medium">{agent.display_name || agent.agent_id_slug}</span>
                        <span className="text-xs text-foreground-muted ml-2">[{agent.category_code}]</span>
                        {agent.description && <p className="text-xs text-foreground-muted">{agent.description}</p>}
                      </div>
                      <button onClick={() => removeAgent(i)} className="text-error hover:bg-error/10 p-1 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Add Agent</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1">Slug ID</label>
                    <input className="input w-full" value={newAgent.agent_id_slug} onChange={(e) => setNewAgent({ ...newAgent, agent_id_slug: e.target.value })} placeholder="water-service" />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Category Code</label>
                    <input className="input w-full" value={newAgent.category_code} onChange={(e) => setNewAgent({ ...newAgent, category_code: e.target.value.toUpperCase() })} placeholder="WAT" />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Display Name</label>
                    <input className="input w-full" value={newAgent.display_name} onChange={(e) => setNewAgent({ ...newAgent, display_name: e.target.value })} placeholder="Water Service Agent" />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Confidentiality</label>
                    <select className="input w-full" value={newAgent.confidentiality_level} onChange={(e) => setNewAgent({ ...newAgent, confidentiality_level: e.target.value })}>
                      <option value="PUBLIC">Public</option>
                      <option value="INTERNAL">Internal</option>
                      <option value="CONFIDENTIAL">Confidential</option>
                      <option value="SECRET">Secret</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1">Description</label>
                  <input className="input w-full" value={newAgent.description} onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })} placeholder="Handles water service inquiries" />
                </div>
                <div>
                  <label className="block text-xs mb-1">Task Types (comma-separated)</label>
                  <input className="input w-full" value={newAgent.task_types} onChange={(e) => setNewAgent({ ...newAgent, task_types: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs mb-1">Keywords (comma-separated)</label>
                  <input className="input w-full" value={newAgent.keywords} onChange={(e) => setNewAgent({ ...newAgent, keywords: e.target.value })} placeholder="water, leak, pipe, bill" />
                </div>
                <button
                  onClick={addAgent}
                  disabled={!newAgent.agent_id_slug || !newAgent.category_code}
                  className="btn-secondary btn-sm"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Agent
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Shared Services</h2>
              <div>
                <label className="block text-sm font-medium mb-1">Database Name</label>
                <input className="input w-full" value={dbName} onChange={(e) => setDbName(e.target.value)} placeholder={name.toLowerCase().replace(/[^a-z0-9]/g, "_") || "my_db"} />
              </div>
              <div className="p-3 bg-background-secondary rounded-lg text-sm text-foreground-muted">
                <p>The following shared services will be automatically configured:</p>
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li>PostgreSQL 15 (Alpine) with auto-schema initialization</li>
                  <li>Redis 7 (Alpine) for session management</li>
                  <li>Shared security module (PII detection, audit logging)</li>
                  <li>Circuit breaker HTTP client for inter-service resilience</li>
                </ul>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Review & Generate</h2>

              <div className="space-y-3">
                <div className="p-3 bg-background-secondary rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Project</h3>
                  <p className="text-sm">{displayName || name}</p>
                  <p className="text-xs text-foreground-muted">{description}</p>
                  <p className="text-xs text-foreground-muted">Ports: {portRangeStart} - {portRangeStart + agents.length}</p>
                </div>

                <div className="p-3 bg-background-secondary rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Type</h3>
                  <p className="text-sm capitalize">{infraType}</p>
                </div>

                {infraType === "orchestrator" ? (
                  <div className="p-3 bg-background-secondary rounded-lg">
                    <h3 className="text-sm font-medium mb-2">Orchestrator</h3>
                    <p className="text-xs text-foreground-muted">Model: {classificationModel}</p>
                    <p className="text-xs text-foreground-muted">Temperature: {classificationTemp}</p>
                  </div>
                ) : (
                  <div className="p-3 bg-background-secondary rounded-lg">
                    <h3 className="text-sm font-medium mb-2">Coordinator</h3>
                    <p className="text-xs text-foreground-muted">Model: {coordinatorModel}</p>
                    <p className="text-xs text-foreground-muted">Temperature: {coordinatorTemp}</p>
                    <p className="text-xs text-foreground-muted">Max Concurrent Tasks: {maxConcurrentTasks}</p>
                    <p className="text-xs text-foreground-muted">Task Timeout: {taskTimeout}s</p>
                    <p className="text-xs text-foreground-muted">Aggregation: {aggregationStrategy}</p>
                    <p className="text-xs text-foreground-muted">Plan Mode: {planModeEnabled ? "Enabled" : "Disabled"}</p>
                  </div>
                )}

                <div className="p-3 bg-background-secondary rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Agents ({agents.length})</h3>
                  {agents.map((a, i) => (
                    <p key={i} className="text-xs text-foreground-muted">
                      [{a.category_code}] {a.display_name || a.agent_id_slug} - Port {portRangeStart + 1 + i}
                    </p>
                  ))}
                </div>

                <div className="p-3 bg-background-secondary rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Files to Generate</h3>
                  <p className="text-xs text-foreground-muted">
                    docker-compose.yml, .env.example, {infraType === "hive" ? "coordinator/" : "orchestrator/"} (7 files),
                    {agents.length} agent directories (8 files each), shared/ (10 files)
                  </p>
                  <p className="text-xs text-foreground-muted font-medium mt-1">
                    Total: ~{17 + agents.length * 8 + 10} files
                  </p>
                </div>
              </div>

              {createMutation.isError && (
                <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
                  {(createMutation.error as any)?.detail || "Failed to create infrastructure"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={() => step === 0 ? router.push("/infrastructures") : setStep(step - 1)}
            className="btn-secondary btn-md"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === 0 ? "Cancel" : "Back"}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="btn-primary btn-md"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          ) : (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !canProceed()}
              className="btn-primary btn-md"
            >
              {createMutation.isPending ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Network className="w-4 h-4 mr-2" />
                  Create & Generate
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
