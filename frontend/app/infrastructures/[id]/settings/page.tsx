"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Trash2, FileCode } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { Infrastructure } from "@/types/infrastructure";

export default function InfraSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: infra } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [portRangeStart, setPortRangeStart] = useState(8000);
  const [dbName, setDbName] = useState("");

  useEffect(() => {
    if (infra) {
      const i = infra as Infrastructure;
      setDisplayName(i.display_name || "");
      setDescription(i.description || "");
      setPortRangeStart(i.port_range_start);
      setDbName(i.db_name || "");
    }
  }, [infra]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateInfrastructure(id, {
        display_name: displayName,
        description,
        port_range_start: portRangeStart,
        db_name: dbName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteInfrastructure(id),
    onSuccess: () => {
      router.push("/infrastructures");
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.generateInfrastructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
    },
  });

  return (
    <div>
      <Header
        title="Settings"
        description={infra?.display_name || "Infrastructure settings"}
      />

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* General settings */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">General</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Display Name</label>
            <input
              className="input w-full"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
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
            <label className="block text-sm font-medium mb-1">Port Range Start</label>
            <input
              className="input w-32"
              type="number"
              value={portRangeStart}
              onChange={(e) => setPortRangeStart(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Database Name</label>
            <input
              className="input w-full"
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
            />
          </div>

          {updateMutation.isSuccess && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
              Settings saved successfully
            </div>
          )}

          {updateMutation.isError && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {(updateMutation.error as any)?.detail || "Failed to save"}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="btn-primary btn-md"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Regenerate */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Code Generation</h2>
          <p className="text-sm text-foreground-muted">
            Regenerate all infrastructure scaffolding from the current configuration.
            This will overwrite existing generated files.
          </p>

          {regenerateMutation.isSuccess && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
              Code regenerated successfully
            </div>
          )}

          {regenerateMutation.isError && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {(regenerateMutation.error as any)?.detail || "Regeneration failed"}
            </div>
          )}

          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="btn-secondary btn-md"
          >
            <FileCode className="w-4 h-4 mr-2" />
            {regenerateMutation.isPending ? "Regenerating..." : "Regenerate Code"}
          </button>
        </div>

        {/* Danger zone */}
        <div className="card p-6 border-error/30">
          <h2 className="text-lg font-semibold text-error mb-2">Danger Zone</h2>
          <p className="text-sm text-foreground-muted mb-4">
            Permanently delete this infrastructure and all its agents, orchestrator,
            deployments, and generated files. This action cannot be undone.
          </p>
          <button
            onClick={() => {
              if (
                confirm(
                  "Are you sure you want to delete this infrastructure? This cannot be undone."
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="btn-md bg-error text-white hover:bg-error/90"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleteMutation.isPending ? "Deleting..." : "Delete Infrastructure"}
          </button>
        </div>
      </div>
    </div>
  );
}
