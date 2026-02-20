"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  BookOpen,
  CheckCircle,
  XCircle,
  Trash2,
  X,
  Users,
  Wrench,
  Upload,
  Download,
  FileText,
  RefreshCw,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/ui/Header";
import {
  api,
  Skill,
  CreateSkillRequest,
  UpdateSkillRequest,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsAdmin, useIsOperator } from "@/lib/auth";

type StatusFilter = "all" | "active" | "inactive";

// ---------------------------------------------------------------------------
// Skill Card (simplified)
// ---------------------------------------------------------------------------

function SkillCard({
  skill,
  isAdmin,
  isOperator,
  onClick,
  onDelete,
}: {
  skill: Skill;
  isAdmin: boolean;
  isOperator: boolean;
  onClick: () => void;
  onDelete: (skill: Skill) => void;
}) {
  const resourceCount = skill.resource_files?.length || 0;

  async function handleExport() {
    try {
      const resp = await api.exportSkillMd(skill.code, resourceCount > 0);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resourceCount > 0 ? `${skill.code}.zip` : "SKILL.md";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  }

  return (
    <div
      onClick={onClick}
      className="block p-4 rounded-lg bg-background-tertiary hover:bg-border/50 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            skill.is_active ? "bg-coral-500/20" : "bg-foreground-muted/20"
          )}
        >
          <BookOpen
            className={cn(
              "w-5 h-5",
              skill.is_active ? "text-coral-500" : "text-foreground-muted"
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-background-secondary px-2 py-0.5 rounded text-foreground-muted">
              {skill.code}
            </span>
            <h3 className="font-medium text-foreground">{skill.name}</h3>
          </div>

          {/* Description */}
          <p className="text-sm text-foreground-muted mt-1 line-clamp-2">
            {skill.description || "No description"}
          </p>

          {/* Badges row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {skill.allowed_tools.length > 0 && (
              <span className="text-xs text-foreground-muted flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                {skill.allowed_tools.length} tool{skill.allowed_tools.length !== 1 && "s"}
              </span>
            )}

            {resourceCount > 0 && (
              <span className="text-xs text-foreground-muted flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {resourceCount} file{resourceCount !== 1 && "s"}
              </span>
            )}

            {skill.agent_count > 0 && (
              <span className="text-xs text-coral-500 flex items-center gap-1">
                <Users className="w-3 h-3" />
                {skill.agent_count} agent{skill.agent_count !== 1 && "s"}
              </span>
            )}
          </div>
        </div>

        {/* Right side: status + admin actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            {isOperator && (
              <Link
                href={`/skills/${skill.code}/edit`}
                onClick={(e) => e.stopPropagation()}
                className="p-1 text-foreground-muted hover:text-coral-500 transition-colors"
                title="Edit SKILL.md"
              >
                <Pencil className="w-4 h-4" />
              </Link>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport();
                  }}
                  className="p-1 text-foreground-muted hover:text-foreground transition-colors"
                  title="Export SKILL.md"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(skill);
                  }}
                  className="p-1 text-foreground-muted hover:text-error transition-colors"
                  title="Delete skill"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            {skill.is_active ? (
              <CheckCircle className="w-5 h-5 text-success" />
            ) : (
              <XCircle className="w-5 h-5 text-foreground-muted" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Modal (simplified)
// ---------------------------------------------------------------------------

function CreateSkillModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateSkillRequest) => api.createSkill(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      onSaved();
      onClose();
    },
    onError: (err: any) => setError(err.detail || "Failed to create skill"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!code.trim() || !name.trim()) {
      setError("Code and Name are required");
      return;
    }

    createMutation.mutate({
      code: code.trim(),
      name: name.trim(),
      description: description || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">New Skill</h2>
          <button onClick={onClose} className="text-foreground-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded bg-error/10 text-error text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Code <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. consultas"
              className="input w-full"
            />
            <p className="text-xs text-foreground-muted mt-1">
              Unique identifier, used as directory name
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Consultas"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this skill do?"
              className="input w-full"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary px-4 py-2"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation
// ---------------------------------------------------------------------------

function DeleteConfirmation({
  skill,
  onClose,
  onConfirm,
  isPending,
}: {
  skill: Skill;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Delete Skill</h2>
        <p className="text-sm text-foreground-muted mb-4">
          Are you sure you want to delete{" "}
          <span className="font-medium text-foreground">{skill.name}</span> (
          <code className="text-xs">{skill.code}</code>)? This will also remove
          the SKILL.md file from the filesystem.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-ghost px-4 py-2">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-error text-white hover:bg-error/90 transition-colors disabled:opacity-50"
          >
            {isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Detail Modal
// ---------------------------------------------------------------------------

function SkillDetailModal({
  skill: initialSkill,
  isAdmin,
  onClose,
  onUpdated,
}: {
  skill: Skill;
  isAdmin: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // Editable fields
  const [name, setName] = useState(initialSkill.name);
  const [description, setDescription] = useState(initialSkill.description ?? "");
  const [allowedToolsText, setAllowedToolsText] = useState(
    initialSkill.allowed_tools.join(", ")
  );
  const [body, setBody] = useState(initialSkill.body ?? "");
  const [isActive, setIsActive] = useState(initialSkill.is_active);
  const [error, setError] = useState<string | null>(null);

  // Fetch fresh skill detail
  const { data: skill } = useQuery({
    queryKey: ["skill", initialSkill.code],
    queryFn: () => api.getSkill(initialSkill.code),
    initialData: initialSkill,
  });

  // Fetch agents using this skill
  const { data: agents = [] } = useQuery({
    queryKey: ["skill-agents", initialSkill.code],
    queryFn: () => api.getSkillAgents(initialSkill.code),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateSkillRequest) =>
      api.updateSkill(initialSkill.code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["skill", initialSkill.code] });
      setIsEditing(false);
      onUpdated();
    },
    onError: (err: any) => setError(err.detail || "Failed to update skill"),
  });

  function handleSave() {
    setError(null);
    const parsedTools = allowedToolsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    updateMutation.mutate({
      name: name.trim() || undefined,
      description: description || undefined,
      allowed_tools: parsedTools,
      body: body || undefined,
      is_active: isActive,
    });
  }

  function handleCancelEdit() {
    setName(skill.name);
    setDescription(skill.description ?? "");
    setAllowedToolsText(skill.allowed_tools.join(", "));
    setBody(skill.body ?? "");
    setIsActive(skill.is_active);
    setError(null);
    setIsEditing(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className={cn("w-5 h-5", skill.is_active ? "text-coral-500" : "text-foreground-muted")} />
            <h2 className="text-lg font-semibold text-foreground">{skill.name}</h2>
            <span className="text-xs font-mono bg-background-tertiary px-2 py-0.5 rounded text-foreground-muted">
              {skill.code}
            </span>
          </div>
          <button onClick={onClose} className="text-foreground-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded bg-error/10 text-error text-sm">{error}</div>
          )}

          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">Status</span>
            {isEditing ? (
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  isActive ? "bg-coral-500" : "bg-foreground-muted/30"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    isActive ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            ) : skill.is_active ? (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle className="w-4 h-4" /> Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-foreground-muted">
                <XCircle className="w-4 h-4" /> Inactive
              </span>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name</label>
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
              />
            ) : (
              <p className="text-sm text-foreground-muted">{skill.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            {isEditing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="input w-full"
              />
            ) : (
              <p className="text-sm text-foreground-muted">
                {skill.description || "No description"}
              </p>
            )}
          </div>

          {/* Allowed Tools */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Allowed Tools
            </label>
            {isEditing ? (
              <>
                <input
                  type="text"
                  value={allowedToolsText}
                  onChange={(e) => setAllowedToolsText(e.target.value)}
                  placeholder="tool1, tool2, ..."
                  className="input w-full"
                />
                <p className="text-xs text-foreground-muted mt-1">Comma-separated tool names</p>
              </>
            ) : skill.allowed_tools.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {skill.allowed_tools.map((t) => (
                  <span
                    key={t}
                    className="text-xs font-mono bg-background-tertiary px-2 py-0.5 rounded text-foreground-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">None</p>
            )}
          </div>

          {/* Resource Files */}
          {skill.resource_files && skill.resource_files.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Resource Files
              </label>
              <div className="flex flex-wrap gap-1">
                {skill.resource_files.map((f) => (
                  <span
                    key={f}
                    className="text-xs font-mono bg-background-tertiary px-2 py-0.5 rounded text-foreground-muted flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Body (SKILL.md content) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Body (SKILL.md)
            </label>
            {isEditing ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="input w-full font-mono text-sm"
              />
            ) : skill.body ? (
              <pre className="p-3 rounded bg-background text-xs text-foreground-muted overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                {skill.body}
              </pre>
            ) : (
              <p className="text-sm text-foreground-muted">No content</p>
            )}
          </div>

          {/* Agents using this skill */}
          {agents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Used by Agents
              </label>
              <div className="flex flex-wrap gap-1">
                {agents.map((a) => (
                  <span
                    key={a.agent_id}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      a.is_enabled
                        ? "bg-coral-500/10 text-coral-500"
                        : "bg-foreground-muted/10 text-foreground-muted"
                    )}
                  >
                    {a.agent_display_name || a.agent_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn-ghost px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="btn-primary px-4 py-2"
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <>
                <button onClick={onClose} className="btn-ghost px-4 py-2">
                  Close
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="btn-primary px-4 py-2"
                  >
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const isOperator = useIsOperator();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [detailTarget, setDetailTarget] = useState<Skill | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.getSkills(),
  });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => api.deleteSkill(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      setDeleteTarget(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importSkillMd(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncSkillsFromFilesystem(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      importMutation.mutate(file);
    }
    e.target.value = "";
  }

  // Filter skills
  const filteredSkills = skills.filter((skill) => {
    if (statusFilter === "active" && !skill.is_active) return false;
    if (statusFilter === "inactive" && skill.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        skill.code.toLowerCase().includes(q) ||
        skill.name.toLowerCase().includes(q) ||
        skill.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeCount = skills.filter((s) => s.is_active).length;
  const inactiveCount = skills.filter((s) => !s.is_active).length;

  return (
    <div>
      <Header title="Skills" description="SKILL.md-based skill library" />

      <div className="p-6">
        {/* Top bar */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-foreground">
                Skills{" "}
                <span className="text-foreground-muted font-normal text-sm">
                  ({filteredSkills.length})
                </span>
              </h2>

              {/* Status toggle */}
              <div className="flex items-center gap-1 bg-background-tertiary rounded-lg p-0.5">
                {(
                  [
                    ["all", `All (${skills.length})`],
                    ["active", `Active (${activeCount})`],
                    ["inactive", `Inactive (${inactiveCount})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs transition-colors",
                      statusFilter === value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-foreground-muted hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-9 w-64"
                />
              </div>
              {isAdmin && (
                <>
                  <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="btn-ghost px-3 py-2 flex items-center gap-2 text-sm"
                    title="Sync from filesystem"
                  >
                    <RefreshCw className={cn("w-4 h-4", syncMutation.isPending && "animate-spin")} />
                    Sync
                  </button>
                  <input
                    ref={importRef}
                    type="file"
                    accept=".md"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <button
                    onClick={() => importRef.current?.click()}
                    disabled={importMutation.isPending}
                    className="btn-ghost px-3 py-2 flex items-center gap-2 text-sm"
                  >
                    <Upload className="w-4 h-4" />
                    {importMutation.isPending ? "Importing..." : "Import"}
                  </button>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="btn-primary px-3 py-2 flex items-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New Skill
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Toasts */}
          {importMutation.isError && (
            <div className="mx-4 mt-2 p-3 rounded bg-error/10 text-error text-sm flex items-center justify-between">
              <span>{(importMutation.error as any)?.detail || "Import failed"}</span>
              <button onClick={() => importMutation.reset()}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {importMutation.isSuccess && (
            <div className="mx-4 mt-2 p-3 rounded bg-success/10 text-success text-sm flex items-center justify-between">
              <span>Skill imported successfully</span>
              <button onClick={() => importMutation.reset()}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {syncMutation.isSuccess && (
            <div className="mx-4 mt-2 p-3 rounded bg-success/10 text-success text-sm flex items-center justify-between">
              <span>
                Synced: {(syncMutation.data as any)?.scanned} scanned,{" "}
                {(syncMutation.data as any)?.created} created,{" "}
                {(syncMutation.data as any)?.updated} updated
              </span>
              <button onClick={() => syncMutation.reset()}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Skills list */}
          <div className="p-4">
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-foreground-muted">
                {search || statusFilter !== "all"
                  ? "No skills match your filters"
                  : "No skills registered"}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    isAdmin={!!isAdmin}
                    isOperator={!!isOperator}
                    onClick={() => setDetailTarget(skill)}
                    onDelete={(s) => setDeleteTarget(s)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateSkillModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {}}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <DeleteConfirmation
          skill={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.code)}
          isPending={deleteMutation.isPending}
        />
      )}

      {/* Skill Detail Modal */}
      {detailTarget && (
        <SkillDetailModal
          skill={detailTarget}
          isAdmin={!!isAdmin}
          onClose={() => setDetailTarget(null)}
          onUpdated={() => {}}
        />
      )}
    </div>
  );
}
