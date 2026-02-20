"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, FileText, Wrench, Rocket } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { InfraStatusBadge } from "@/components/infrastructure/InfraStatusBadge";
import { InfraAgent } from "@/types/infrastructure";

export default function AgentDetailPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: agent, isLoading } = useQuery({
    queryKey: ["infra-agent", id, slug],
    queryFn: () => api.getInfraAgent(id, slug),
  });

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [taskTypes, setTaskTypes] = useState("");
  const [keywords, setKeywords] = useState("");
  const [confidentiality, setConfidentiality] = useState("INTERNAL");

  useEffect(() => {
    if (agent) {
      const a = agent as InfraAgent;
      setDisplayName(a.display_name || "");
      setDescription(a.description || "");
      setCategoryCode(a.category_code);
      setTaskTypes(a.task_types?.join(", ") || "");
      setKeywords(a.keywords?.join(", ") || "");
      setConfidentiality(a.confidentiality_level);
    }
  }, [agent]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateInfraAgent(id, slug, {
        display_name: displayName,
        description,
        category_code: categoryCode,
        task_types: taskTypes.split(",").map((t) => t.trim()).filter(Boolean),
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        confidentiality_level: confidentiality,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-agent", id, slug] });
      queryClient.invalidateQueries({ queryKey: ["infra-agents", id] });
    },
  });

  const deployMutation = useMutation({
    mutationFn: () => api.deployInfraAgent(id, slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-agent", id, slug] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-background-secondary rounded w-1/3" />
          <div className="h-4 bg-background-secondary rounded w-1/2" />
        </div>
      </div>
    );
  }

  const a = agent as InfraAgent;

  return (
    <div>
      <Header
        title={a?.display_name || slug}
        description={`Agent configuration — [${a?.category_code}]`}
      />

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Status & actions */}
        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <InfraStatusBadge status={a?.status || "stopped"} />
            <span className="text-sm text-foreground-muted">v{a?.version}</span>
            {a?.port && (
              <span className="text-sm text-foreground-muted">
                Port {a.port}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/infrastructures/${id}/agents/${slug}/prompts`}
              className="btn-secondary btn-sm"
            >
              <FileText className="w-3.5 h-3.5 mr-1" />
              Prompts
            </Link>
            <button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
              className="btn-secondary btn-sm"
            >
              <Rocket className="w-3.5 h-3.5 mr-1" />
              Deploy
            </button>
          </div>
        </div>

        {/* Edit form */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Configuration</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Display Name</label>
              <input
                className="input w-full"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category Code</label>
              <input
                className="input w-full"
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="input w-full"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Task Types (comma-separated)
            </label>
            <input
              className="input w-full"
              value={taskTypes}
              onChange={(e) => setTaskTypes(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Keywords (comma-separated)
            </label>
            <input
              className="input w-full"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Confidentiality</label>
            <select
              className="input w-full"
              value={confidentiality}
              onChange={(e) => setConfidentiality(e.target.value)}
            >
              <option value="PUBLIC">Public</option>
              <option value="INTERNAL">Internal</option>
              <option value="CONFIDENTIAL">Confidential</option>
              <option value="SECRET">Secret</option>
            </select>
          </div>

          {updateMutation.isError && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {(updateMutation.error as any)?.detail || "Failed to update agent"}
            </div>
          )}

          {updateMutation.isSuccess && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
              Agent updated successfully
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="btn-primary btn-md"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
