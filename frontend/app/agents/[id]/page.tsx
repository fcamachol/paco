"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  Pencil,
  Trash2,
  Save,
  X,
  Key,
  Wrench,
  Sparkles,
  RefreshCw,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { api, AgentDetail, AgentToolInfo, ApiError, Tool, Skill } from "@/lib/api";
import { cn, getStatusColor, formatRelativeTime } from "@/lib/utils";
import { useIsOperator } from "@/lib/auth";
import { AgentConfigForm } from "@/components/agent-config";
import type { AgentFormValues } from "@/components/agent-config";
import { InboundWebhookList, OutboundWebhookList, ChatwootConfigEditor } from "@/components/webhooks";

type TabId = "config" | "tools" | "skills" | "webhooks";

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const isOperator = useIsOperator();

  const [activeTab, setActiveTab] = useState<TabId>("config");
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAgentConfig, setEditAgentConfig] = useState<Partial<AgentFormValues>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    data: agent,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll faster during transitional states to catch status changes quickly
      return status === "starting" || status === "stopping" ? 3000 : 15000;
    },
  });

  // Fetch available tools and skills for assignment
  const { data: allTools } = useQuery({
    queryKey: ["tools"],
    queryFn: () => api.getTools(),
    enabled: activeTab === "tools",
  });

  const { data: allSkills } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.getSkills(),
    enabled: activeTab === "skills",
  });

  const startEditing = () => {
    if (!agent) return;
    setEditDisplayName(agent.display_name || "");
    setEditDescription(agent.description || "");

    // Populate form from agent detail + sdk_config
    const sdkConfig = agent.sdk_config || {};
    setEditAgentConfig({
      name: agent.name,
      model: agent.model || "claude-sonnet-4-5-20250929",
      systemPrompt: agent.system_prompt || "",
      temperature: sdkConfig.temperature ?? 1.0,
      maxTokens: sdkConfig.max_tokens,
      topP: sdkConfig.top_p,
      topK: sdkConfig.top_k,
      stopSequences: sdkConfig.stop_sequences || [],
      envVars: agent.env_vars || {},
    });
    setEditing(true);
    setError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError(null);
  };

  const handleConfigChange = useCallback((values: AgentFormValues) => {
    setEditAgentConfig(values);
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Mutations
  const startMutation = useMutation({
    mutationFn: () => api.startAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent", id] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent", id] }),
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restartAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent", id] }),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      // Build sdk_config from form parameters
      const sdkConfig: Record<string, any> = {};
      if (editAgentConfig.temperature !== undefined) sdkConfig.temperature = editAgentConfig.temperature;
      if (editAgentConfig.maxTokens !== undefined) sdkConfig.max_tokens = editAgentConfig.maxTokens;
      if (editAgentConfig.topP !== undefined) sdkConfig.top_p = editAgentConfig.topP;
      if (editAgentConfig.topK !== undefined) sdkConfig.top_k = editAgentConfig.topK;
      if (editAgentConfig.stopSequences && editAgentConfig.stopSequences.length > 0) {
        sdkConfig.stop_sequences = editAgentConfig.stopSequences;
      }

      // Resolve model (handle custom model)
      const model = editAgentConfig.model === "custom" && editAgentConfig.customModel
        ? editAgentConfig.customModel
        : editAgentConfig.model || undefined;

      return api.updateAgent(id, {
        display_name: editDisplayName || undefined,
        description: editDescription || undefined,
        model,
        system_prompt: editAgentConfig.systemPrompt,
        env_vars: editAgentConfig.envVars || {},
        sdk_config: Object.keys(sdkConfig).length > 0 ? sdkConfig : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      setEditing(false);
      setError(null);
      showSuccess("Config updated — changes apply to new conversations automatically");
    },
    onError: (err: ApiError) => {
      setError(err.detail || "Failed to update agent");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      router.push("/agents");
    },
    onError: (err: ApiError) => {
      setError(err.detail || "Failed to delete agent");
    },
  });

  // Tool assignment mutations
  const assignToolMutation = useMutation({
    mutationFn: (toolId: string) => api.assignToolToAgent(id, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      showSuccess("Tool assigned — config pushed to agent");
    },
    onError: (err: ApiError) => setError(err.detail || "Failed to assign tool"),
  });

  const removeToolMutation = useMutation({
    mutationFn: (toolId: string) => api.removeToolFromAgent(id, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      showSuccess("Tool removed — config pushed to agent");
    },
    onError: (err: ApiError) => setError(err.detail || "Failed to remove tool"),
  });

  // Skill assignment mutations
  const attachSkillMutation = useMutation({
    mutationFn: (skillCode: string) => api.attachSkillToAgent(id, skillCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      showSuccess("Skill attached — config pushed to agent");
    },
    onError: (err: ApiError) => setError(err.detail || "Failed to attach skill"),
  });

  const detachSkillMutation = useMutation({
    mutationFn: (skillCode: string) => api.detachSkillFromAgent(id, skillCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      showSuccess("Skill detached — config pushed to agent");
    },
    onError: (err: ApiError) => setError(err.detail || "Failed to detach skill"),
  });

  const toggleSkillMutation = useMutation({
    mutationFn: ({ skillCode, isEnabled }: { skillCode: string; isEnabled: boolean }) =>
      api.toggleAgentSkill(id, skillCode, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      showSuccess("Skill toggled — config pushed to agent");
    },
    onError: (err: ApiError) => setError(err.detail || "Failed to toggle skill"),
  });

  // Chatwoot config mutation
  const chatwootMutation = useMutation({
    mutationFn: (webhookConfig: Record<string, any>) =>
      api.updateAgent(id, { webhook_config: webhookConfig }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      showSuccess("Chatwoot config saved");
    },
    onError: (err: ApiError) => setError(err.detail || "Failed to save Chatwoot config"),
  });

  // Apply & Restart mutation
  const applyMutation = useMutation({
    mutationFn: () => api.applyAgentConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", id] });
      showSuccess("Code regenerated and agent restarted");
    },
    onError: (err: ApiError) => setError(err.detail || "Failed to apply config"),
  });

  if (isLoading) {
    return (
      <div>
        <Header title="Agent" />
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (fetchError || !agent) {
    return (
      <div>
        <Header title="Agent" />
        <div className="p-6">
          <Link
            href="/agents"
            className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Agents
          </Link>
          <div className="card p-8 text-center">
            <p className="text-foreground-muted">
              Agent not found or failed to load.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isRunning = agent.status === "running";
  const isStopped = agent.status === "stopped";
  const isError = agent.status === "error";
  const isTransitioning = agent.status === "starting" || agent.status === "stopping";
  const lifecycleLoading =
    startMutation.isPending ||
    stopMutation.isPending ||
    restartMutation.isPending;

  // Compute available tools (not yet assigned)
  const assignedToolIds = new Set((agent.tools || []).map((t: AgentToolInfo) => t.id));
  const availableTools = (allTools || []).filter((t: Tool) => !assignedToolIds.has(t.id));

  // Compute available skills (not yet attached)
  const attachedSkillCodes = new Set((agent.skills || []).map((s) => s.code));
  const availableSkills = (allSkills || []).filter((s: Skill) => !attachedSkillCodes.has(s.code));

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "config", label: "Configuration", icon: <Pencil className="w-3.5 h-3.5" /> },
    { id: "tools", label: `Tools (${agent.tools?.length || 0})`, icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: "skills", label: `Skills (${agent.skills?.length || 0})`, icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "webhooks", label: "Webhooks", icon: <Globe className="w-3.5 h-3.5" /> },
  ];

  return (
    <div>
      <Header
        title={agent.display_name || agent.name}
        description={agent.description || undefined}
      />

      <div className="p-6 space-y-6 max-w-4xl">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </Link>

        {error && (
          <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
            {successMessage}
          </div>
        )}

        {/* Agent Info Card */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {agent.display_name || agent.name}
              </h2>
              <p className="text-sm text-foreground-muted">{agent.name}</p>
            </div>
            <span
              className={cn(
                "px-3 py-1 rounded-full text-sm font-medium",
                getStatusColor(agent.status)
              )}
            >
              {agent.status}
            </span>
          </div>

          {agent.description && !editing && (
            <p className="text-sm text-foreground-muted mb-4">
              {agent.description}
            </p>
          )}

          {/* Meta info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-foreground-muted">Type</p>
              <p className="font-medium text-foreground">{agent.type}</p>
            </div>
            <div>
              <p className="text-foreground-muted">Version</p>
              <p className="font-medium text-foreground">v{agent.version}</p>
            </div>
            {agent.port && (
              <div>
                <p className="text-foreground-muted">Port</p>
                <p className="font-medium text-foreground">{agent.port}</p>
              </div>
            )}
            {agent.last_health_check && (
              <div>
                <p className="text-foreground-muted">Last Health Check</p>
                <p className="font-medium text-foreground">
                  {formatRelativeTime(agent.last_health_check)}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
            <Link href={`/agents/${id}/playground`} className="btn-primary btn-sm">
              <Play className="w-3.5 h-3.5 mr-1" />
              Playground
            </Link>

            {isOperator && (
              <button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="btn-secondary btn-sm"
                title="Regenerate code, compile TypeScript, and restart PM2"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1", applyMutation.isPending && "animate-spin")} />
                {applyMutation.isPending ? "Applying..." : "Apply & Restart"}
              </button>
            )}
          </div>

          {/* Lifecycle controls */}
          {isOperator && (
            <div className="flex items-center gap-2 mt-2">
              {isTransitioning && (
                <div className="flex items-center gap-2 text-sm text-foreground-muted">
                  <div className="animate-spin w-4 h-4 border-2 border-coral-500 border-t-transparent rounded-full" />
                  {agent.status === "starting" ? "Starting..." : "Stopping..."}
                </div>
              )}
              {(isStopped || isError) && (
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={lifecycleLoading}
                  className="btn-primary btn-sm"
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  Start
                </button>
              )}
              {isRunning && (
                <>
                  <button
                    onClick={() => stopMutation.mutate()}
                    disabled={lifecycleLoading}
                    className="btn-secondary btn-sm"
                  >
                    <Square className="w-3.5 h-3.5 mr-1" />
                    Stop
                  </button>
                  <button
                    onClick={() => restartMutation.mutate()}
                    disabled={lifecycleLoading}
                    className="btn-secondary btn-sm"
                  >
                    <RotateCw className="w-3.5 h-3.5 mr-1" />
                    Restart
                  </button>
                </>
              )}
              {lifecycleLoading && !isTransitioning && (
                <div className="animate-spin w-4 h-4 border-2 border-coral-500 border-t-transparent rounded-full ml-2" />
              )}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.id
                  ? "border-coral-500 text-foreground"
                  : "border-transparent text-foreground-muted hover:text-foreground hover:border-foreground/20"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "config" && (
          <>
            {/* Configuration Card */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-foreground">
                  Configuration
                </h3>
                {isOperator && !editing && (
                  <button onClick={startEditing} className="btn-secondary btn-sm">
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Description
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                      className="input w-full resize-none"
                    />
                  </div>

                  {/* Agent Configuration Form */}
                  <div className="border-t border-border pt-4">
                    <AgentConfigForm
                      key={agent.id}
                      defaultValues={editAgentConfig}
                      onChange={handleConfigChange}
                      hideFields={['name']}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateMutation.mutate()}
                      disabled={updateMutation.isPending}
                      className="btn-primary btn-sm"
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </button>
                    <button onClick={cancelEditing} className="btn-secondary btn-sm">
                      <X className="w-3.5 h-3.5 mr-1" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <pre className="bg-background-tertiary p-4 rounded-lg text-sm text-foreground font-mono overflow-x-auto whitespace-pre-wrap">
                    {agent.config && Object.keys(agent.config).length > 0
                      ? configToDisplay(agent.config)
                      : "No configuration available"}
                  </pre>
                </div>
              )}
            </div>

            {/* Credentials Card (read-only view) */}
            {!editing && agent.env_vars && Object.keys(agent.env_vars).length > 0 && (
              <div className="card p-6">
                <h3 className="text-md font-semibold text-foreground mb-3">
                  <Key className="w-4 h-4 inline mr-1" />
                  Credentials
                </h3>
                <div className="space-y-2">
                  {Object.entries(agent.env_vars).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3 text-sm">
                      <span className="font-mono text-foreground">{key}</span>
                      <span className="font-mono text-foreground-muted">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tools Tab */}
        {activeTab === "tools" && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-semibold text-foreground">
                <Wrench className="w-4 h-4 inline mr-1" />
                Assigned Tools
              </h3>
            </div>

            {/* Assigned tools list */}
            {(agent.tools || []).length === 0 ? (
              <p className="text-sm text-foreground-muted italic mb-4">
                No tools assigned to this agent yet.
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {(agent.tools || []).map((tool: AgentToolInfo) => (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background-tertiary"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{tool.name}</p>
                      {tool.description && (
                        <p className="text-xs text-foreground-muted mt-0.5">{tool.description}</p>
                      )}
                      {tool.mcp_server_name && (
                        <p className="text-xs text-foreground-muted mt-0.5">
                          Server: {tool.mcp_server_name}
                        </p>
                      )}
                    </div>
                    {isOperator && (
                      <button
                        onClick={() => removeToolMutation.mutate(tool.id)}
                        disabled={removeToolMutation.isPending}
                        className="p-1.5 text-foreground-muted hover:text-error rounded"
                        title="Remove tool from agent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add tool dropdown */}
            {isOperator && availableTools.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Add Tool
                </label>
                <div className="space-y-1 max-h-60 overflow-y-auto border border-border rounded-lg p-2">
                  {availableTools.map((tool: Tool) => (
                    <button
                      key={tool.id}
                      onClick={() => assignToolMutation.mutate(tool.id)}
                      disabled={assignToolMutation.isPending}
                      className="w-full text-left p-2 rounded hover:bg-background-tertiary transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">{tool.name}</p>
                      {tool.description && (
                        <p className="text-xs text-foreground-muted">{tool.description}</p>
                      )}
                      {tool.mcp_server_name && (
                        <p className="text-xs text-foreground-muted">
                          Server: {tool.mcp_server_name}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isOperator && availableTools.length === 0 && (agent.tools || []).length > 0 && (
              <p className="text-xs text-foreground-muted italic">
                All available tools are already assigned.
              </p>
            )}
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === "skills" && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-semibold text-foreground">
                <Sparkles className="w-4 h-4 inline mr-1" />
                Attached Skills
              </h3>
            </div>

            {/* Attached skills list */}
            {(agent.skills || []).length === 0 ? (
              <p className="text-sm text-foreground-muted italic mb-4">
                No skills attached to this agent yet.
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {(agent.skills || []).map((skill) => (
                  <div
                    key={skill.code}
                    className="flex items-center justify-between p-3 rounded-lg bg-background-tertiary"
                  >
                    <div className="flex items-center gap-3">
                      {isOperator && (
                        <button
                          onClick={() =>
                            toggleSkillMutation.mutate({
                              skillCode: skill.code,
                              isEnabled: !skill.is_enabled,
                            })
                          }
                          disabled={toggleSkillMutation.isPending}
                          className={cn(
                            "w-9 h-5 rounded-full relative transition-colors",
                            skill.is_enabled ? "bg-emerald-500" : "bg-foreground-muted/30"
                          )}
                          title={skill.is_enabled ? "Disable skill" : "Enable skill"}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                              skill.is_enabled ? "left-[18px]" : "left-0.5"
                            )}
                          />
                        </button>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {skill.name}
                          {!skill.is_enabled && (
                            <span className="ml-2 text-xs text-foreground-muted">(disabled)</span>
                          )}
                        </p>
                        <p className="text-xs text-foreground-muted">{skill.code}</p>
                        {skill.allowed_tools.length > 0 && (
                          <p className="text-xs text-foreground-muted mt-0.5">
                            Tools: {skill.allowed_tools.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    {isOperator && (
                      <button
                        onClick={() => detachSkillMutation.mutate(skill.code)}
                        disabled={detachSkillMutation.isPending}
                        className="p-1.5 text-foreground-muted hover:text-error rounded"
                        title="Detach skill from agent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Attach skill dropdown */}
            {isOperator && availableSkills.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Attach Skill
                </label>
                <div className="space-y-1 max-h-60 overflow-y-auto border border-border rounded-lg p-2">
                  {availableSkills.map((skill: Skill) => (
                    <button
                      key={skill.code}
                      onClick={() => attachSkillMutation.mutate(skill.code)}
                      disabled={attachSkillMutation.isPending}
                      className="w-full text-left p-2 rounded hover:bg-background-tertiary transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">{skill.name}</p>
                      {skill.description && (
                        <p className="text-xs text-foreground-muted">{skill.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Webhooks Tab */}
        {activeTab === "webhooks" && (
          <div className="space-y-8">
            {isOperator && (
              <div className="card p-6">
                <ChatwootConfigEditor
                  webhookConfig={agent.webhook_config || {}}
                  onSave={(cfg) => chatwootMutation.mutate(cfg)}
                  saving={chatwootMutation.isPending}
                />
              </div>
            )}
            <div className="card p-6">
              <InboundWebhookList agentId={id} />
            </div>
            <div className="card p-6">
              <OutboundWebhookList agentId={id} />
            </div>
          </div>
        )}

        {/* Danger Zone */}
        {isOperator && (
          <div className="card p-6 border-error/30">
            <h3 className="text-md font-semibold text-error mb-2">
              Danger Zone
            </h3>
            <p className="text-sm text-foreground-muted mb-4">
              Permanently delete this agent. This action cannot be undone.
            </p>

            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="btn-md bg-error text-white hover:bg-error/80"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deleteMutation.isPending
                    ? "Deleting..."
                    : "Yes, Delete Agent"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn-secondary btn-md"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn-md bg-error/10 text-error hover:bg-error/20 border border-error/30"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Agent
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pretty-print a config object as YAML-like text for read-only display */
function configToDisplay(config: Record<string, any>, indent = 0): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(config)) {
    if (value === null || value === undefined) {
      lines.push(`${pad}${key}:`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(configToDisplay(value, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        if (typeof item === "object") {
          lines.push(`${pad}  -`);
          lines.push(configToDisplay(item, indent + 2));
        } else {
          lines.push(`${pad}  - ${item}`);
        }
      }
    } else {
      lines.push(`${pad}${key}: ${value}`);
    }
  }

  return lines.join("\n");
}
