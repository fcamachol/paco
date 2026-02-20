"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

export default function NewAgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [taskTypes, setTaskTypes] = useState("general_inquiry, create_ticket, check_status");
  const [keywords, setKeywords] = useState("");
  const [confidentiality, setConfidentiality] = useState("INTERNAL");

  const createMutation = useMutation({
    mutationFn: () =>
      api.createInfraAgent(id, {
        agent_id_slug: slug,
        display_name: displayName || slug,
        description,
        category_code: categoryCode,
        task_types: taskTypes.split(",").map((t) => t.trim()).filter(Boolean),
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        confidentiality_level: confidentiality,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-agents", id] });
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
      router.push(`/infrastructures/${id}/agents`);
    },
  });

  return (
    <div>
      <Header title="Add Agent" description="Add a new specialist agent to the infrastructure" />

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Slug ID</label>
              <input
                className="input w-full"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="water-service"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category Code</label>
              <input
                className="input w-full"
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value.toUpperCase())}
                placeholder="WAT"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Display Name</label>
            <input
              className="input w-full"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Water Service Agent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="input w-full"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Handles water service inquiries, billing, leak reports..."
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
              placeholder="water, leak, pipe, bill, meter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Confidentiality Level</label>
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

          {createMutation.isError && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {(createMutation.error as any)?.detail || "Failed to create agent"}
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => router.push(`/infrastructures/${id}/agents`)}
            className="btn-secondary btn-md"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!slug || !categoryCode || createMutation.isPending}
            className="btn-primary btn-md"
          >
            {createMutation.isPending ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add Agent
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
