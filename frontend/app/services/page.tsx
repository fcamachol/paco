"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  Plug,
  Key,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import {
  api,
  ExternalService,
  CreateExternalServiceRequest,
  UpdateExternalServiceRequest,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE_TYPE_LABELS: Record<string, string> = {
  llm_provider: "LLM Providers",
  media_processor: "Media Processors",
  integration: "Integrations",
  observability: "Observability",
  database: "Databases",
  custom: "Custom",
};

const SERVICE_TYPE_ORDER = [
  "llm_provider",
  "media_processor",
  "integration",
  "observability",
  "database",
  "custom",
];

const statusColor = (s: string) => {
  switch (s) {
    case "online":
      return "bg-success";
    case "offline":
    case "error":
      return "bg-error";
    case "unconfigured":
      return "bg-amber-500";
    default:
      return "bg-foreground-muted";
  }
};

const statusBadge = (s: string) => {
  switch (s) {
    case "online":
      return "bg-success/10 text-success";
    case "offline":
    case "error":
      return "bg-error/10 text-error";
    case "unconfigured":
      return "bg-amber-500/10 text-amber-500";
    default:
      return "bg-foreground-muted/10 text-foreground-muted";
  }
};

// ---------------------------------------------------------------------------
// Add / Edit Service Modal
// ---------------------------------------------------------------------------

function ServiceModal({
  service,
  onClose,
  onSaved,
}: {
  service: ExternalService | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = service !== null;
  const queryClient = useQueryClient();

  const [name, setName] = useState(service?.name ?? "");
  const [serviceType, setServiceType] = useState(service?.service_type ?? "custom");
  const [provider, setProvider] = useState(service?.provider ?? "custom");
  const [baseUrl, setBaseUrl] = useState(service?.base_url ?? "");
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState(service?.api_key_env_var ?? "");
  const [healthCheckEndpoint, setHealthCheckEndpoint] = useState(
    service?.health_check_endpoint ?? ""
  );
  const [healthCheckMethod, setHealthCheckMethod] = useState(
    service?.health_check_method ?? "GET"
  );
  const [description, setDescription] = useState(service?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        const data: UpdateExternalServiceRequest = {
          name: name.trim(),
          service_type: serviceType,
          provider: provider.trim() || "custom",
          base_url: baseUrl.trim() || null,
          api_key_env_var: apiKeyEnvVar.trim() || null,
          health_check_endpoint: healthCheckEndpoint.trim() || null,
          health_check_method: healthCheckMethod,
          description: description.trim() || null,
        };
        await api.updateExternalService(service.id, data);
      } else {
        const data: CreateExternalServiceRequest = {
          name: name.trim(),
          service_type: serviceType,
          provider: provider.trim() || "custom",
          base_url: baseUrl.trim() || undefined,
          api_key_env_var: apiKeyEnvVar.trim() || undefined,
          health_check_endpoint: healthCheckEndpoint.trim() || undefined,
          health_check_method: healthCheckMethod,
          description: description.trim() || undefined,
        };
        await api.createExternalService(data);
      }
      queryClient.invalidateQueries({ queryKey: ["external-services"] });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.detail || "Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background-secondary rounded-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit Service" : "Add Service"}
          </h2>
          <button onClick={onClose} className="text-foreground-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="e.g. Anthropic Claude API"
            />
          </div>

          {/* Service Type */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Service Type
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            >
              {SERVICE_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {SERVICE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Provider
            </label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="e.g. anthropic, openai, custom"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="https://api.example.com"
            />
          </div>

          {/* API Key Env Var */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              API Key Env Var
            </label>
            <input
              type="text"
              value={apiKeyEnvVar}
              onChange={(e) => setApiKeyEnvVar(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="e.g. ANTHROPIC_API_KEY"
            />
          </div>

          {/* Health Check Endpoint */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Health Check Endpoint
            </label>
            <input
              type="text"
              value={healthCheckEndpoint}
              onChange={(e) => setHealthCheckEndpoint(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              placeholder="https://api.example.com/health"
            />
          </div>

          {/* Health Check Method */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Health Check Method
            </label>
            <select
              value={healthCheckMethod}
              onChange={(e) => setHealthCheckMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
              rows={3}
              placeholder="Optional description..."
            />
          </div>

          {error && (
            <p className="text-sm text-error">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-background transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Key Inline Editor
// ---------------------------------------------------------------------------

function ApiKeyInlineEditor({
  envVar,
  serviceId,
}: {
  envVar: string;
  serviceId: string;
}) {
  const queryClient = useQueryClient();
  const [keyValue, setKeyValue] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current status
  const { data: keyStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["api-key-status", envVar],
    queryFn: () => api.getApiKeyStatusByEnv(envVar),
  });

  const source = keyStatus?.source ?? "none";
  const configured = keyStatus?.configured ?? false;

  const handleSave = useCallback(async () => {
    if (!keyValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveApiKeyByEnv(envVar, keyValue.trim());
      setKeyValue("");
      setShowInput(false);
      await refetchStatus();
      // Trigger health check after saving
      try {
        await api.checkExternalServiceHealth(serviceId);
      } catch {
        // health check failure is not fatal
      }
      queryClient.invalidateQueries({ queryKey: ["external-services"] });
    } catch (e: any) {
      setError(e?.detail || "Failed to save key");
    } finally {
      setSaving(false);
    }
  }, [keyValue, envVar, serviceId, refetchStatus, queryClient]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteApiKeyByEnv(envVar);
      await refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["external-services"] });
    } catch (e: any) {
      setError(e?.detail || "Failed to delete key");
    } finally {
      setDeleting(false);
    }
  }, [envVar, refetchStatus, queryClient]);

  return (
    <div className="col-span-2">
      <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-2">
        API Key
      </p>

      {/* Env var label */}
      <div className="flex items-center gap-2 mb-2">
        <code className="text-sm text-foreground font-mono bg-background px-2 py-0.5 rounded">
          {envVar}
        </code>
        {configured ? (
          <span
            className={cn(
              "text-xs flex items-center gap-1",
              source === "database" ? "text-success" : "text-blue-500"
            )}
          >
            <CheckCircle className="w-3 h-3" />
            {source === "database" ? "Stored in DB" : "From environment"}
          </span>
        ) : (
          <span className="text-xs text-amber-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Not configured
          </span>
        )}
      </div>

      {/* Action buttons / input */}
      {!showInput ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowInput(true);
              setError(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-foreground-muted hover:text-foreground hover:bg-background transition-colors"
          >
            <Key className="w-3.5 h-3.5" />
            {configured ? "Replace Key" : "Add Key"}
          </button>
          {source === "database" && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-error/70 hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") {
                    setShowInput(false);
                    setKeyValue("");
                    setError(null);
                  }
                }}
                placeholder="Enter API key..."
                className="w-full px-3 py-1.5 pr-9 rounded-lg bg-background border border-border text-sm text-foreground font-mono"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !keyValue.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coral-500 text-white text-sm hover:bg-coral-600 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setShowInput(false);
                setKeyValue("");
                setError(null);
              }}
              className="p-1.5 rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-background transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editService, setEditService] = useState<ExternalService | null>(null);

  // Data
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["external-services"],
    queryFn: () => api.getExternalServices(),
    refetchInterval: 30000,
  });

  // Mutations
  const checkAllMutation = useMutation({
    mutationFn: () => api.checkAllExternalServicesHealth(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["external-services"] }),
  });

  const checkOneMutation = useMutation({
    mutationFn: (id: string) => api.checkExternalServiceHealth(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["external-services"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteExternalService(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-services"] });
      setSelectedId(null);
    },
  });

  // Derived
  const selected = services.find((s) => s.id === selectedId) || null;
  const grouped = SERVICE_TYPE_ORDER.map((type) => ({
    type,
    label: SERVICE_TYPE_LABELS[type] || type,
    services: services.filter((s) => s.service_type === type),
  })).filter((g) => g.services.length > 0);

  const onlineCount = services.filter((s) => s.status === "online").length;
  const errorCount = services.filter(
    (s) => s.status === "error" || s.status === "offline"
  ).length;
  const unconfiguredCount = services.filter((s) => s.status === "unconfigured").length;

  const handleDelete = (svc: ExternalService) => {
    if (window.confirm(`Delete service "${svc.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(svc.id);
    }
  };

  return (
    <div className="p-8">
      <Header
        title="Services & Integrations"
        description="Monitor external service health and manage integrations"
      />

      {/* Action bar */}
      <div className="flex items-center justify-between mb-6">
        {/* Summary strip */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="text-foreground-muted">
              {onlineCount} online
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-error" />
            <span className="text-foreground-muted">
              {errorCount} error
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-foreground-muted">
              {unconfiguredCount} unconfigured
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => checkAllMutation.mutate()}
            disabled={checkAllMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-background-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={cn("w-4 h-4", checkAllMutation.isPending && "animate-spin")}
            />
            Check All
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-coral-500 text-white hover:bg-coral-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-foreground-muted">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading services...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && services.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-foreground-muted">
          <Plug className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium mb-1">No services configured</p>
          <p className="text-sm">
            Services will be auto-seeded on startup from configured API keys, or add one manually.
          </p>
        </div>
      )}

      {/* Two-column layout */}
      {!isLoading && services.length > 0 && (
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Service list */}
          <div className="col-span-5 space-y-1">
            <div className="bg-background-secondary rounded-xl border border-border overflow-hidden">
              {grouped.map((group) => (
                <div key={group.type}>
                  {/* Group header */}
                  <div className="px-4 py-2 text-xs font-medium text-foreground-muted uppercase tracking-wider bg-background/50 border-b border-border">
                    {group.label}
                  </div>
                  {/* Service items */}
                  {group.services.map((svc) => (
                    <button
                      key={svc.id}
                      onClick={() => setSelectedId(svc.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border last:border-b-0 hover:bg-background/50 transition-colors",
                        selectedId === svc.id &&
                          "bg-coral-500/10 border-l-2 border-l-coral-500"
                      )}
                    >
                      <span
                        className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", statusColor(svc.status))}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {svc.name}
                        </p>
                        <p className="text-xs text-foreground-muted truncate">
                          {svc.provider}
                          {svc.response_time_ms != null &&
                            svc.status === "online" &&
                            ` \u00b7 ${svc.response_time_ms}ms`}
                        </p>
                      </div>
                      {svc.is_auto_seeded && (
                        <span className="text-[10px] text-foreground-muted bg-background rounded px-1.5 py-0.5">
                          auto
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detail panel */}
          <div className="col-span-7">
            {!selected ? (
              <div className="bg-background-secondary rounded-xl border border-border flex flex-col items-center justify-center py-20 text-foreground-muted">
                <Plug className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">Select a service to view details</p>
              </div>
            ) : (
              <div className="bg-background-secondary rounded-xl border border-border p-6 space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-xl font-semibold text-foreground">
                        {selected.name}
                      </h2>
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
                          statusBadge(selected.status)
                        )}
                      >
                        {selected.status}
                      </span>
                    </div>
                    {selected.description && (
                      <p className="text-sm text-foreground-muted">
                        {selected.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditService(selected)}
                      className="p-2 rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-background transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(selected)}
                      disabled={deleteMutation.isPending}
                      className="p-2 rounded-lg border border-border text-error/70 hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1">
                      Provider
                    </p>
                    <p className="text-sm text-foreground">{selected.provider}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1">
                      Type
                    </p>
                    <p className="text-sm text-foreground">
                      {SERVICE_TYPE_LABELS[selected.service_type] || selected.service_type}
                    </p>
                  </div>
                  {selected.base_url && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1">
                        Base URL
                      </p>
                      <p className="text-sm text-foreground font-mono truncate">
                        {selected.base_url}
                      </p>
                    </div>
                  )}
                  {selected.api_key_env_var && (
                    <ApiKeyInlineEditor
                      envVar={selected.api_key_env_var}
                      serviceId={selected.id}
                    />
                  )}
                </div>

                {/* Health info */}
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                      Health Check
                    </p>
                    <button
                      onClick={() => checkOneMutation.mutate(selected.id)}
                      disabled={checkOneMutation.isPending}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-foreground-muted hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
                    >
                      <RefreshCw
                        className={cn(
                          "w-3.5 h-3.5",
                          checkOneMutation.isPending && "animate-spin"
                        )}
                      />
                      Check Now
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-foreground-muted mb-0.5">Last Checked</p>
                      <p className="text-sm text-foreground">
                        {selected.last_health_check
                          ? formatRelativeTime(selected.last_health_check)
                          : "Never"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted mb-0.5">Response Time</p>
                      <p className="text-sm text-foreground">
                        {selected.response_time_ms != null
                          ? `${selected.response_time_ms}ms`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {selected.last_error && (
                    <div className="bg-error/5 border border-error/20 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-error break-all">
                          {selected.last_error}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Auto-seeded indicator */}
                {selected.is_auto_seeded && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs text-foreground-muted flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5" />
                      Auto-seeded from environment configuration
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <ServiceModal
          service={null}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {}}
        />
      )}

      {/* Edit modal */}
      {editService && (
        <ServiceModal
          service={editService}
          onClose={() => setEditService(null)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
