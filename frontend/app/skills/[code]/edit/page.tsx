"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, X, FileText, Wrench } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Header } from "@/components/ui/Header";
import { api, Skill, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsOperator } from "@/lib/auth";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] flex items-center justify-center bg-background-tertiary rounded-lg">
      <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
    </div>
  ),
});

export default function SkillEditPage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;
  const queryClient = useQueryClient();
  const isOperator = useIsOperator();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowedToolsText, setAllowedToolsText] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch skill data
  const {
    data: skill,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["skill", code],
    queryFn: () => api.getSkillContent(code),
  });

  // Fetch resource files
  const { data: resources = [] } = useQuery({
    queryKey: ["skill-resources", code],
    queryFn: () => api.getSkillResources(code),
  });

  // Populate form when skill data loads
  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description ?? "");
      setAllowedToolsText(skill.allowed_tools.join(", "));
      setBody(skill.body ?? "");
      setIsActive(skill.is_active);
      setHasChanges(false);
    }
  }, [skill]);

  // Redirect if not operator
  useEffect(() => {
    if (isOperator === false) {
      router.push("/skills");
    }
  }, [isOperator, router]);

  // Track changes
  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string;
      allowed_tools: string[];
      body: string;
      is_active: boolean;
    }) =>
      api.updateSkillContent(code, {
        name: data.name,
        description: data.description,
        allowed_tools: data.allowed_tools,
        body: data.body,
        is_active: data.is_active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["skill", code] });
      setHasChanges(false);
      setError(null);
    },
    onError: (err: ApiError) => {
      setError(err.detail || "Failed to save skill");
    },
  });

  function handleSave() {
    setError(null);
    const parsedTools = allowedToolsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    saveMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      allowed_tools: parsedTools,
      body,
      is_active: isActive,
    });
  }

  function handleCancel() {
    router.push("/skills");
  }

  // Keyboard shortcut: Ctrl/Cmd+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && !saveMutation.isPending) {
          handleSave();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (isLoading) {
    return (
      <div>
        <Header title="Edit Skill" />
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-coral-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (fetchError || !skill) {
    return (
      <div>
        <Header title="Edit Skill" />
        <div className="p-6">
          <Link
            href="/skills"
            className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Skills
          </Link>
          <div className="card p-8 text-center">
            <p className="text-foreground-muted">
              Skill not found or failed to load.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={`Edit: ${skill.name}`}
        description={`SKILL.md editor for ${code}`}
      />

      <div className="p-6 space-y-6 max-w-5xl">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href="/skills"
            className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Skills
          </Link>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-xs text-warning">Unsaved changes</span>
            )}
            <button
              onClick={handleCancel}
              className="btn-ghost px-4 py-2 flex items-center gap-2 text-sm"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !hasChanges}
              className="btn-primary px-4 py-2 flex items-center gap-2 text-sm"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Success banner */}
        {saveMutation.isSuccess && !hasChanges && (
          <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
            Skill saved successfully
          </div>
        )}

        {/* Frontmatter fields */}
        <div className="card p-6">
          <h3 className="text-md font-semibold text-foreground mb-4">
            Frontmatter
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  markChanged();
                }}
                placeholder="Skill display name"
                className="input w-full"
              />
            </div>

            {/* Active toggle */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Status
              </label>
              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsActive(!isActive);
                    markChanged();
                  }}
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
                <span className="text-sm text-foreground-muted">
                  {isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {/* Description (full width) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markChanged();
                }}
                rows={2}
                placeholder="What does this skill do?"
                className="input w-full"
              />
            </div>

            {/* Allowed Tools (full width) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">
                <Wrench className="w-3.5 h-3.5 inline mr-1" />
                Allowed Tools
              </label>
              <input
                type="text"
                value={allowedToolsText}
                onChange={(e) => {
                  setAllowedToolsText(e.target.value);
                  markChanged();
                }}
                placeholder="tool1, tool2, tool3"
                className="input w-full"
              />
              <p className="text-xs text-foreground-muted mt-1">
                Comma-separated list of tool names this skill is allowed to use
              </p>
            </div>
          </div>
        </div>

        {/* Monaco Editor for body */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-foreground">
              Body (SKILL.md content)
            </h3>
            <span className="text-xs text-foreground-muted font-mono">
              Markdown
            </span>
          </div>
          <div className="rounded-lg overflow-hidden border border-border">
            <MonacoEditor
              height="500px"
              language="markdown"
              theme="vs-dark"
              value={body}
              onChange={(value) => {
                setBody(value ?? "");
                markChanged();
              }}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                lineNumbers: "on",
                fontSize: 14,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </div>
        </div>

        {/* Resource files (read-only listing) */}
        {resources.length > 0 && (
          <div className="card p-6">
            <h3 className="text-md font-semibold text-foreground mb-4">
              Resource Files
            </h3>
            <div className="flex flex-wrap gap-2">
              {resources.map((f) => (
                <span
                  key={f}
                  className="text-xs font-mono bg-background-tertiary px-3 py-1.5 rounded text-foreground-muted flex items-center gap-1.5"
                >
                  <FileText className="w-3 h-3" />
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bottom save bar */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button
            onClick={handleCancel}
            className="btn-ghost px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !hasChanges}
            className="btn-primary px-4 py-2 flex items-center gap-2 text-sm"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
