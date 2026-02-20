"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { InfraStatusBadge } from "@/components/infrastructure/InfraStatusBadge";
import { InfraAgent } from "@/types/infrastructure";

export default function InfraAgentsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: infra } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["infra-agents", id],
    queryFn: () => api.getInfraAgents(id),
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => api.deleteInfraAgent(id, slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infra-agents", id] });
      queryClient.invalidateQueries({ queryKey: ["infrastructure", id] });
    },
  });

  return (
    <div>
      <Header
        title="Agents"
        description={infra?.display_name || "Infrastructure agents"}
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground-muted">
            {(agents as InfraAgent[]).length} agent(s) configured
          </p>
          <Link
            href={`/infrastructures/${id}/agents/new`}
            className="btn-primary btn-md"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Agent
          </Link>
        </div>

        {(agents as InfraAgent[]).length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-foreground-muted">No agents configured yet.</p>
            <Link
              href={`/infrastructures/${id}/agents/new`}
              className="btn-primary btn-md mt-4 inline-flex"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add First Agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(agents as InfraAgent[]).map((agent) => (
              <div key={agent.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <Link
                    href={`/infrastructures/${id}/agents/${agent.agent_id_slug}`}
                    className="hover:text-coral-500"
                  >
                    <h3 className="font-semibold">
                      {agent.display_name || agent.agent_id_slug}
                    </h3>
                  </Link>
                  <span className="text-xs bg-background-secondary px-1.5 py-0.5 rounded">
                    [{agent.category_code}]
                  </span>
                </div>

                {agent.description && (
                  <p className="text-sm text-foreground-muted mb-3 line-clamp-2">
                    {agent.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <InfraStatusBadge status={agent.status} />
                  {agent.port && (
                    <span className="text-xs text-foreground-muted">
                      Port {agent.port}
                    </span>
                  )}
                  <span className="text-xs text-foreground-muted">
                    v{agent.version}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {agent.task_types?.map((t) => (
                    <span
                      key={t}
                      className="text-xs bg-background-secondary px-1.5 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/infrastructures/${id}/agents/${agent.agent_id_slug}`}
                      className="text-xs text-coral-500 hover:text-coral-400"
                    >
                      Configure
                    </Link>
                    <Link
                      href={`/infrastructures/${id}/agents/${agent.agent_id_slug}/prompts`}
                      className="text-xs text-foreground-muted hover:text-foreground"
                    >
                      Prompts
                    </Link>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete agent "${agent.display_name || agent.agent_id_slug}"?`)) {
                        deleteMutation.mutate(agent.agent_id_slug);
                      }
                    }}
                    className="text-error/60 hover:text-error p-1 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
