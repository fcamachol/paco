"use client";

import { Bot, Cpu, Layers, Network } from "lucide-react";
import { Infrastructure } from "@/types/infrastructure";
import { InfraStatusBadge } from "./InfraStatusBadge";

interface InfraCardProps {
  infra: Infrastructure;
  onClick: () => void;
}

export function InfraCard({ infra, onClick }: InfraCardProps) {
  return (
    <div
      onClick={onClick}
      className="card p-5 cursor-pointer hover:border-coral-500/50 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-coral-500/20 flex items-center justify-center">
            <Network className="w-5 h-5 text-coral-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {infra.display_name || infra.name}
            </h3>
            <p className="text-xs text-foreground-muted">{infra.name}</p>
          </div>
        </div>
        <InfraStatusBadge status={infra.status} />
      </div>

      {infra.description && (
        <p className="text-sm text-foreground-muted mb-3 line-clamp-2">
          {infra.description}
        </p>
      )}

      <div className="flex items-center gap-4 text-xs text-foreground-muted">
        <div className="flex items-center gap-1">
          <Bot className="w-3.5 h-3.5" />
          <span>{infra.agent_count} agents</span>
        </div>
        <div className="flex items-center gap-1">
          {infra.type === "hive" ? (
            <>
              <Layers className="w-3.5 h-3.5" />
              <span>Hive</span>
            </>
          ) : (
            <>
              <Cpu className="w-3.5 h-3.5" />
              <span>{infra.has_orchestrator ? "Orchestrator" : "No orchestrator"}</span>
            </>
          )}
        </div>
        <div>
          <span>v{infra.version}</span>
        </div>
      </div>
    </div>
  );
}
