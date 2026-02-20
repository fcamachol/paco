"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Network,
  Play,
  Settings,
  Heart,
  Users,
  Cpu,
  Layers,
  FileCode,
  Rocket,
  Building2,
} from "lucide-react";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";
import { InfraStatusBadge } from "@/components/infrastructure/InfraStatusBadge";
import { InfraDetail } from "@/types/infrastructure";

export default function InfrastructureDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: infra, isLoading } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
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

  const detail = infra as InfraDetail;

  const navItems = [
    {
      label: "Playground",
      href: `/infrastructures/${id}/playground`,
      icon: Play,
      description: "Test agent routing in sandbox",
    },
    {
      label: "Agents",
      href: `/infrastructures/${id}/agents`,
      icon: Users,
      description: `${detail?.agents?.length || 0} specialist agents`,
    },
    detail?.type === "company"
      ? {
          label: "Company",
          href: `/infrastructures/${id}/company`,
          icon: Building2,
          description: "Heartbeat, schedules & org chart",
        }
      : detail?.type === "hive"
        ? {
            label: "Coordinator",
            href: `/infrastructures/${id}/coordinator`,
            icon: Layers,
            description: "Decomposition & aggregation config",
          }
        : {
            label: "Orchestrator",
            href: `/infrastructures/${id}/orchestrator`,
            icon: Cpu,
            description: "Classification & routing config",
          },
    {
      label: "Deploy",
      href: `/infrastructures/${id}/deploy`,
      icon: Rocket,
      description: "Build, deploy & manage containers",
    },
    {
      label: "Monitor",
      href: `/infrastructures/${id}/monitor`,
      icon: Heart,
      description: "Health, metrics & logs",
    },
    {
      label: "Files",
      href: `/infrastructures/${id}/files`,
      icon: FileCode,
      description: "Generated code & templates",
    },
    {
      label: "Settings",
      href: `/infrastructures/${id}/settings`,
      icon: Settings,
      description: "Infrastructure configuration",
    },
  ];

  return (
    <div>
      <Header
        title={detail?.display_name || detail?.name || "Infrastructure"}
        description={detail?.description || "Multi-agent system"}
      />

      <div className="p-6 space-y-6">
        {/* Status overview */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-coral-500/10 flex items-center justify-center">
                <Network className="w-6 h-6 text-coral-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{detail?.display_name || detail?.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  {detail && <InfraStatusBadge status={detail.status} />}
                  <span className="text-sm text-foreground-muted">
                    v{detail?.version}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    Port {detail?.port_range_start}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="p-3 bg-background-secondary rounded-lg text-center">
              <p className="text-2xl font-bold">{detail?.agents?.length || 0}</p>
              <p className="text-xs text-foreground-muted">Agents</p>
            </div>
            <div className="p-3 bg-background-secondary rounded-lg text-center">
              <p className="text-2xl font-bold capitalize">{detail?.type || "orchestrator"}</p>
              <p className="text-xs text-foreground-muted">Type</p>
            </div>
            <div className="p-3 bg-background-secondary rounded-lg text-center">
              <p className="text-2xl font-bold">
                {detail?.port_range_start || "—"}
              </p>
              <p className="text-xs text-foreground-muted">Base Port</p>
            </div>
            <div className="p-3 bg-background-secondary rounded-lg text-center">
              <p className="text-2xl font-bold capitalize">{detail?.status || "—"}</p>
              <p className="text-xs text-foreground-muted">Status</p>
            </div>
          </div>
        </div>

        {/* Navigation grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="card p-4 hover:border-coral-500/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <item.icon className="w-5 h-5 text-foreground-muted group-hover:text-coral-500 transition-colors" />
                <h3 className="font-medium">{item.label}</h3>
              </div>
              <p className="text-sm text-foreground-muted">
                {item.description}
              </p>
            </Link>
          ))}
        </div>

        {/* Agents preview */}
        {detail?.agents && detail.agents.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Agents</h2>
              <Link
                href={`/infrastructures/${id}/agents`}
                className="text-sm text-coral-500 hover:text-coral-400"
              >
                View All
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {detail.agents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/infrastructures/${id}/agents/${agent.agent_id_slug}`}
                  className="p-3 bg-background-secondary rounded-lg hover:bg-background-secondary/80 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">
                      {agent.display_name || agent.agent_id_slug}
                    </span>
                    <span className="text-xs bg-background rounded px-1.5 py-0.5">
                      [{agent.category_code}]
                    </span>
                  </div>
                  {agent.description && (
                    <p className="text-xs text-foreground-muted truncate">
                      {agent.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <InfraStatusBadge status={agent.status} />
                    {agent.port && (
                      <span className="text-xs text-foreground-muted">
                        :{agent.port}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
