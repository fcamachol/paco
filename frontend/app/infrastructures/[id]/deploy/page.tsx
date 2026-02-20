"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RefreshCw, RotateCcw, Clock } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { InfraStatusBadge } from "@/components/infrastructure/InfraStatusBadge";
import { InfraDeployment } from "@/types/infrastructure";

export default function DeployPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: infra } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const { data: deployments = [] } = useQuery({
    queryKey: ["deployments", id],
    queryFn: () => api.getInfraDeployments(id),
    refetchInterval: 10000,
  });

  const deployMutation = useMutation({
    mutationFn: () => api.deployInfrastructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
      queryClient.invalidateQueries({ queryKey: ["deployments", id] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopInfrastructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
      queryClient.invalidateQueries({ queryKey: ["deployments", id] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restartInfrastructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
      queryClient.invalidateQueries({ queryKey: ["deployments", id] });
    },
  });

  const isLoading = deployMutation.isPending || stopMutation.isPending || restartMutation.isPending;

  return (
    <div>
      <Header
        title="Deployment"
        description={infra?.display_name || "Infrastructure deployment management"}
      />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">
                {infra?.display_name || infra?.name}
              </h2>
              <div className="mt-1">
                {infra && <InfraStatusBadge status={infra.status} />}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => deployMutation.mutate()}
                disabled={isLoading}
                className="btn-primary btn-md"
              >
                <Play className="w-4 h-4 mr-2" />
                {infra?.status === "running" ? "Redeploy" : "Deploy"}
              </button>
              <button
                onClick={() => stopMutation.mutate()}
                disabled={isLoading || infra?.status !== "running"}
                className="btn-secondary btn-md"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </button>
              <button
                onClick={() => restartMutation.mutate()}
                disabled={isLoading || infra?.status !== "running"}
                className="btn-secondary btn-md"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Restart
              </button>
            </div>
          </div>

          {(deployMutation.isError || stopMutation.isError || restartMutation.isError) && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              {((deployMutation.error || stopMutation.error || restartMutation.error) as any)?.detail || "Operation failed"}
            </div>
          )}
        </div>

        {/* Deployment History */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Deployment History</h2>

          {(deployments as InfraDeployment[]).length === 0 ? (
            <p className="text-sm text-foreground-muted">No deployments yet</p>
          ) : (
            <div className="space-y-3">
              {(deployments as InfraDeployment[]).map((dep) => (
                <div
                  key={dep.id}
                  className="flex items-center gap-4 p-3 bg-background-secondary rounded-lg"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      dep.status === "running" ? "bg-success" :
                      dep.status === "failed" ? "bg-error" :
                      dep.status === "building" || dep.status === "deploying" ? "bg-yellow-400 animate-pulse" :
                      "bg-foreground-muted"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">v{dep.version}</span>
                      <span className="text-xs text-foreground-muted capitalize">{dep.status}</span>
                    </div>
                    {dep.changes_summary && (
                      <p className="text-xs text-foreground-muted truncate">{dep.changes_summary}</p>
                    )}
                    {dep.error_message && (
                      <p className="text-xs text-error truncate">{dep.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-foreground-muted">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(dep.started_at).toLocaleString()}
                  </div>
                  {dep.status === "running" && (
                    <button
                      onClick={() => api.rollbackDeployment(id, dep.id)}
                      className="text-xs text-foreground-muted hover:text-foreground"
                      title="Rollback to this version"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
