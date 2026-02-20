"use client";

import { Bot, Play, Square, RotateCw, MoreVertical } from "lucide-react";
import { Agent } from "@/lib/api";
import { cn, formatRelativeTime, getStatusColor } from "@/lib/utils";

interface AgentCardProps {
  agent: Agent;
  liveStatus?: string;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onClick?: () => void;
  isLoading?: boolean;
}

export function AgentCard({
  agent,
  liveStatus,
  onStart,
  onStop,
  onRestart,
  onClick,
  isLoading,
}: AgentCardProps) {
  const effectiveStatus = liveStatus || agent.status;
  const isRunning = effectiveStatus === "running" || effectiveStatus === "online";
  const isStopped = effectiveStatus === "stopped";
  const isTransitioning =
    effectiveStatus === "starting" || effectiveStatus === "stopping";

  return (
    <div
      className={cn(
        "card p-4 hover:border-coral-500/50 transition-colors cursor-pointer",
        isRunning && "border-success/30"
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              isRunning ? "bg-success/20" : "bg-background-tertiary"
            )}
          >
            <Bot
              className={cn(
                "w-5 h-5",
                isRunning ? "text-success" : "text-foreground-muted"
              )}
            />
          </div>
          <div>
            <h3 className="font-medium text-foreground">
              {agent.display_name || agent.name}
            </h3>
            <p className="text-xs text-foreground-muted">{agent.type}</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-1.5">
          {liveStatus && (
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                isRunning ? "bg-green-400 animate-pulse" : isStopped ? "bg-gray-400" : "bg-yellow-400 animate-pulse"
              )}
              title="Live status"
            />
          )}
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              getStatusColor(effectiveStatus)
            )}
          >
            {effectiveStatus === "online" ? "running" : effectiveStatus}
          </span>
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-sm text-foreground-muted mb-3 line-clamp-2">
          {agent.description}
        </p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-foreground-muted mb-3">
        {agent.port && (
          <span className="flex items-center gap-1">
            Port: {agent.port}
          </span>
        )}
        <span>v{agent.version}</span>
        {agent.last_health_check && (
          <span>Checked {formatRelativeTime(agent.last_health_check)}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {isStopped && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStart?.();
            }}
            disabled={isLoading}
            className="btn-primary btn-sm flex-1"
          >
            <Play className="w-3 h-3 mr-1" />
            Start
          </button>
        )}

        {isRunning && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStop?.();
              }}
              disabled={isLoading}
              className="btn-secondary btn-sm flex-1"
            >
              <Square className="w-3 h-3 mr-1" />
              Stop
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestart?.();
              }}
              disabled={isLoading}
              className="btn-secondary btn-sm"
            >
              <RotateCw className="w-3 h-3" />
            </button>
          </>
        )}

        {isTransitioning && (
          <div className="flex-1 flex items-center justify-center py-1">
            <div className="animate-spin w-4 h-4 border-2 border-coral-500 border-t-transparent rounded-full" />
            <span className="ml-2 text-sm text-foreground-muted">
              {agent.status}...
            </span>
          </div>
        )}

        <button
          onClick={(e) => e.stopPropagation()}
          className="btn-ghost btn-sm p-1"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
