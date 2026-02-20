"use client";

import React, { useMemo, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  MiniMap,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { InfraDetail } from "@/types/infrastructure";
import { ChatPanel } from "@/components/playground/ChatPanel";
import { StepTimeline } from "@/components/playground/StepTimeline";
import { usePlayground, StepEvent } from "@/components/playground/usePlayground";
import { playgroundNodeTypes } from "@/components/playground/PlaygroundNodes";
import { buildPlaygroundGraph } from "@/components/playground/graph-builder";
import "@/components/playground/animations.css";

/**
 * Apply highlight classes to nodes based on the current active step.
 */
const TOP_NODE_IDS = new Set(["orchestrator", "coordinator"]);

function getNodeClassName(nodeId: string, step: StepEvent | null): string | undefined {
  if (!step) return undefined;

  const isTopNode = TOP_NODE_IDS.has(nodeId);

  // Orchestrator-type steps
  if (step.step === "classification" && isTopNode) {
    return "node-classifying";
  }
  if (step.step === "routing" && isTopNode) {
    return "node-active";
  }
  if (step.step === "routing" && step.agent_id === nodeId) {
    return "node-active";
  }

  // Hive-type steps
  if (step.step === "decomposition" && isTopNode) {
    return "node-decomposing";
  }
  if (step.step === "task_assigned" && isTopNode) {
    return "node-active";
  }
  if (step.step === "task_assigned" && step.agent_id === nodeId) {
    return "node-active";
  }
  if (step.step === "aggregation" && isTopNode) {
    return "node-decomposing";
  }

  // Shared steps
  if (step.step === "agent_start" && step.agent_id === nodeId) {
    return "node-active";
  }
  if (step.step === "tool_call" && step.agent_id === nodeId) {
    return "node-tool-running";
  }
  if (step.step === "tool_call" && nodeId === `tools-${step.agent_id}`) {
    return "node-tool-running";
  }
  if (step.step === "tool_result" && step.agent_id === nodeId) {
    return "node-completed";
  }
  if (step.step === "tool_result" && nodeId === `tools-${step.agent_id}`) {
    return "node-completed";
  }
  if (step.step === "response" && step.agent_id === nodeId) {
    return "node-completed";
  }
  if (step.step === "error") {
    if (step.agent_id === nodeId) return "node-error";
    if (!step.agent_id && isTopNode) return "node-error";
  }

  return undefined;
}

export default function InfraPlaygroundPage() {
  const { id } = useParams<{ id: string }>();

  const { data: infra, isLoading } = useQuery({
    queryKey: ["infrastructure", id],
    queryFn: () => api.getInfrastructure(id),
  });

  const detail = infra as InfraDetail | undefined;

  const initialGraph = useMemo(() => {
    if (!detail) return { nodes: [], edges: [] };
    return buildPlaygroundGraph(detail);
  }, [detail]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);

  // Reset graph when infra data loads
  useEffect(() => {
    if (detail) {
      const { nodes: n, edges: e } = buildPlaygroundGraph(detail);
      setNodes(n);
      setEdges(e);
    }
  }, [detail, setNodes, setEdges]);

  const { messages, steps, isRunning, runInfra, clearConversation, stopRun, activeStep } = usePlayground();

  // Apply node highlights based on active step
  useEffect(() => {
    setNodes(prev =>
      prev.map(node => {
        const className = getNodeClassName(node.id, activeStep);
        if (className !== node.className) {
          return { ...node, className };
        }
        return node;
      })
    );
  }, [activeStep, setNodes]);

  // Animate edges when routing/task_assigned or tool_call happens
  useEffect(() => {
    const isTopEdge = (edge: Edge) =>
      edge.source === "orchestrator" || edge.source === "coordinator";

    if (
      (activeStep?.step === "routing" || activeStep?.step === "task_assigned") &&
      activeStep.agent_id
    ) {
      // Find the edge from top node to the assigned agent
      setEdges(prev =>
        prev.map(edge => {
          if (isTopEdge(edge) && edge.target === activeStep.agent_id) {
            return { ...edge, animated: true, style: { ...edge.style, stroke: "#00ff88", strokeWidth: 3 } };
          }
          if (isTopEdge(edge)) {
            return { ...edge, animated: false, style: { ...edge.style, stroke: "#262626", strokeWidth: 2 } };
          }
          return edge;
        })
      );
    } else if (activeStep?.step === "tool_call" && activeStep.agent_id) {
      const toolEdgeId = `agent-tools-${activeStep.agent_id}`;
      setEdges(prev =>
        prev.map(edge => {
          if (edge.id === toolEdgeId) {
            return { ...edge, animated: true, style: { ...edge.style, stroke: "#f59e0b", strokeWidth: 3 } };
          }
          // Keep other edges in their current state (don't reset routing edge mid-flow)
          return edge;
        })
      );
    } else if (!activeStep || activeStep.step === "response") {
      // Reset all edges
      setEdges(prev =>
        prev.map(edge => ({
          ...edge,
          animated: false,
          style: {
            ...edge.style,
            stroke: "#262626",
            strokeWidth: edge.id.startsWith("agent-tools-") ? 1.5 : 2,
          },
        }))
      );
    }
  }, [activeStep, setEdges]);

  // Clear highlights after run completes
  useEffect(() => {
    if (!isRunning && steps.length > 0) {
      const timer = setTimeout(() => {
        setNodes(prev => prev.map(node => ({ ...node, className: undefined })));
        setEdges(prev =>
          prev.map(edge => ({
            ...edge,
            animated: false,
            style: {
              ...edge.style,
              stroke: "#262626",
              strokeWidth: edge.id.startsWith("agent-tools-") ? 1.5 : 2,
            },
          }))
        );
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isRunning, steps.length, setNodes, setEdges]);

  const handleSend = useCallback(
    (message: string) => {
      runInfra(message, id);
    },
    [runInfra, id]
  );

  // Compute tool count for header stats
  const totalTools = useMemo(() => {
    if (!detail?.agents) return 0;
    return detail.agents.reduce((sum, a) => sum + (a.tools_config?.length || 0), 0);
  }, [detail]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-background-secondary rounded w-1/3" />
          <div className="h-96 bg-background-secondary rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-background-secondary">
        <Link
          href={`/infrastructures/${id}`}
          className="p-1.5 hover:bg-background-tertiary rounded-md transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground-muted" />
        </Link>
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-success" />
          <h1 className="text-sm font-semibold">
            Playground — {detail?.display_name || detail?.name || "Infrastructure"}
          </h1>
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs text-foreground-muted">
          <span>{detail?.agents?.length || 0} agents</span>
          <span>{totalTools} tools</span>
          <span className="capitalize">{detail?.status}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* React Flow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={playgroundNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            panOnDrag
            zoomOnScroll
            nodesDraggable={true}
            nodesConnectable={false}
          >
            <Background color="#333333" gap={16} />
            <MiniMap nodeColor="#262626" maskColor="rgba(13, 13, 13, 0.8)" style={{ backgroundColor: '#141414' }} />
          </ReactFlow>
        </div>

        {/* Side Panel */}
        <div className="w-96 border-l border-border bg-background-secondary flex flex-col min-h-0">
          {/* Chat Panel */}
          <div className="flex-1 min-h-0">
            <ChatPanel
              messages={messages}
              isRunning={isRunning}
              onSend={handleSend}
              onClear={clearConversation}
              onStop={stopRun}
            />
          </div>

          {/* Live Step Timeline */}
          {steps.length > 0 && (
            <div className="border-t border-border p-3 max-h-60 overflow-y-auto bg-background-tertiary">
              <p className="text-xs font-medium text-foreground-muted mb-1">Execution Trace</p>
              <StepTimeline steps={steps} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
