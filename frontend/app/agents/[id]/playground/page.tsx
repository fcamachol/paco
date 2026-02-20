"use client";

import React, { useMemo, useEffect, useCallback, useState } from "react";
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
import { Play, ArrowLeft, Bot, Wrench, BookOpen } from "lucide-react";
import Link from "next/link";
import { api, Tool } from "@/lib/api";
import { ChatPanel } from "@/components/playground/ChatPanel";
import { StepTimeline } from "@/components/playground/StepTimeline";
import { usePlayground, StepEvent } from "@/components/playground/usePlayground";
import { playgroundNodeTypes } from "@/components/playground/PlaygroundNodes";
import { PlaygroundDetailModal } from "@/components/playground/PlaygroundDetailModal";
import "@/components/playground/animations.css";

const AGENT_NODE_ID = "agent";
const TOOLS_NODE_ID = "tools";
const SKILLS_NODE_ID = "skills";

/**
 * Apply highlight classes to nodes based on the current active step.
 */
function getNodeClassName(nodeId: string, step: StepEvent | null): string | undefined {
  if (!step) return undefined;

  if (step.step === "agent_start" && (nodeId === AGENT_NODE_ID || nodeId === SKILLS_NODE_ID)) {
    return "node-active";
  }
  if (step.step === "tool_call") {
    if (nodeId === AGENT_NODE_ID || nodeId === TOOLS_NODE_ID) {
      return "node-tool-running";
    }
  }
  if (step.step === "tool_result") {
    if (nodeId === AGENT_NODE_ID || nodeId === TOOLS_NODE_ID) {
      return "node-completed";
    }
  }
  if (step.step === "response" && nodeId === AGENT_NODE_ID) {
    return "node-completed";
  }
  if (step.step === "error" && nodeId === AGENT_NODE_ID) {
    return "node-error";
  }

  return undefined;
}

/**
 * Build a 3-tier React Flow graph: Agent -> Skills + Tools, with skill->tool connections
 */
function buildAgentGraph(
  agentName: string,
  categoryCode: string,
  tools: { name: string }[],
  skills: { code: string; name: string; is_enabled: boolean; allowed_tools: string[] }[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: AGENT_NODE_ID,
    type: "agent",
    position: { x: 0, y: 0 },
    data: {
      categoryCode,
      displayName: agentName,
      toolCount: tools.length,
      skillCount: skills.length,
    },
  });

  if (tools.length > 0) {
    nodes.push({
      id: TOOLS_NODE_ID,
      type: "toolGroup",
      position: { x: skills.length > 0 ? 15 : -15, y: 170 },
      data: { tools },
    });

    edges.push({
      id: "agent-tools",
      source: AGENT_NODE_ID,
      target: TOOLS_NODE_ID,
      animated: false,
      style: {
        stroke: "#262626",
        strokeWidth: 1.5,
        strokeDasharray: "6 4",
      },
    });
  }

  if (skills.length > 0) {
    nodes.push({
      id: SKILLS_NODE_ID,
      type: "skillGroup",
      position: { x: -200, y: 170 },
      data: { skills },
    });

    edges.push({
      id: "agent-skills",
      source: AGENT_NODE_ID,
      target: SKILLS_NODE_ID,
      animated: false,
      style: {
        stroke: "#262626",
        strokeWidth: 1.5,
        strokeDasharray: "6 4",
      },
    });

    // Per-skill -> per-tool connection edges
    if (tools.length > 0) {
      const visibleToolNames = new Set(tools.slice(0, 5).map((t) => t.name));
      const visibleSkills = skills.slice(0, 5);
      for (const skill of visibleSkills) {
        if (!skill.is_enabled) continue;
        for (const toolName of skill.allowed_tools) {
          if (!visibleToolNames.has(toolName)) continue;
          edges.push({
            id: `st-${skill.code}-${toolName}`,
            source: SKILLS_NODE_ID,
            target: TOOLS_NODE_ID,
            sourceHandle: `skill-${skill.code}`,
            targetHandle: `tool-${toolName}`,
            type: "smoothstep",
            animated: false,
            style: {
              stroke: "#3f3f46",
              strokeWidth: 1,
              strokeDasharray: "3 3",
              opacity: 0.5,
            },
          });
        }
      }
    }
  }

  return { nodes, edges };
}

export default function AgentPlaygroundPage() {
  const { id } = useParams<{ id: string }>();

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id),
  });

  const { data: allTools, isLoading: toolsLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: () => api.getTools(),
  });

  const isLoading = agentLoading || toolsLoading;

  // Filter tools to only those allowed by this agent
  const agentTools = useMemo(() => {
    if (!agent || !allTools) return [];
    const allowedSet = new Set(agent.allowed_tools || []);
    if (allowedSet.size === 0) return [];
    return allTools.filter((t) => allowedSet.has(t.name));
  }, [agent, allTools]);

  // Build configs for the playground API
  const agentConfig = useMemo(() => {
    if (!agent) return null;
    return {
      name: agent.display_name || agent.name,
      model: agent.model,
      systemPrompt: agent.system_prompt,
    };
  }, [agent]);

  const toolsConfig = useMemo(() => {
    return agentTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }, [agentTools]);

  // Build the React Flow graph
  const initialGraph = useMemo(() => {
    if (!agent) return { nodes: [], edges: [] };
    const categoryCode = agent.type || agent.name.slice(0, 3).toUpperCase();
    const tools = agentTools.map((t) => ({ name: t.name }));
    const skills = (agent.skills || []).map((s) => ({
      code: s.code,
      name: s.name,
      is_enabled: s.is_enabled,
      allowed_tools: s.allowed_tools || [],
    }));
    return buildAgentGraph(
      agent.display_name || agent.name,
      categoryCode,
      tools,
      skills
    );
  }, [agent, agentTools]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);

  const { messages, steps, isRunning, runAgent, clearConversation, stopRun, activeStep } =
    usePlayground();

  // Modal state for detail views
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [selectedSkillCode, setSelectedSkillCode] = useState<string | null>(null);

  // Reset graph when data loads — attach click callbacks to tool/skill group nodes
  useEffect(() => {
    if (agent) {
      const categoryCode = agent.type || agent.name.slice(0, 3).toUpperCase();
      const tools = agentTools.map((t) => ({ name: t.name }));
      const skills = (agent.skills || []).map((s) => ({
        code: s.code,
        name: s.name,
        is_enabled: s.is_enabled,
        allowed_tools: s.allowed_tools || [],
      }));
      const { nodes: n, edges: e } = buildAgentGraph(
        agent.display_name || agent.name,
        categoryCode,
        tools,
        skills
      );

      // Inject click handlers into group node data
      const nodesWithCallbacks = n.map((node) => {
        if (node.id === TOOLS_NODE_ID) {
          return {
            ...node,
            data: {
              ...node.data,
              onToolClick: (name: string) => {
                const found = agentTools.find((t) => t.name === name);
                if (found) setSelectedTool(found);
              },
            },
          };
        }
        if (node.id === SKILLS_NODE_ID) {
          return {
            ...node,
            data: {
              ...node.data,
              onSkillClick: (code: string) => setSelectedSkillCode(code),
            },
          };
        }
        return node;
      });

      setNodes(nodesWithCallbacks);
      setEdges(e);
    }
  }, [agent, agentTools, setNodes, setEdges]);

  // Apply node highlights based on active step
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const className = getNodeClassName(node.id, activeStep);
        if (className !== node.className) {
          return { ...node, className };
        }
        return node;
      })
    );
  }, [activeStep, setNodes]);

  // Animate edges when tool_call or agent_start happens
  useEffect(() => {
    if (activeStep?.step === "agent_start") {
      setEdges((prev) =>
        prev.map((edge) => {
          if (edge.id.startsWith("st-")) {
            return {
              ...edge,
              style: { ...edge.style, stroke: "#a78bfa", opacity: 0.8 },
            };
          }
          return edge;
        })
      );
    } else if (activeStep?.step === "tool_call") {
      const calledTool = activeStep.tool_name;
      setEdges((prev) =>
        prev.map((edge) => {
          if (edge.id === "agent-tools") {
            return {
              ...edge,
              animated: true,
              style: { ...edge.style, stroke: "#f59e0b", strokeWidth: 3 },
            };
          }
          if (edge.id.startsWith("st-")) {
            const isActive = calledTool && edge.id.endsWith(`-${calledTool}`);
            return {
              ...edge,
              animated: !!isActive,
              style: {
                ...edge.style,
                stroke: isActive ? "#f59e0b" : "#3f3f46",
                strokeWidth: isActive ? 2 : 1,
                opacity: isActive ? 1 : 0.25,
              },
            };
          }
          return edge;
        })
      );
    } else if (!activeStep || activeStep.step === "response") {
      setEdges((prev) =>
        prev.map((edge) => {
          if (edge.id.startsWith("st-")) {
            return {
              ...edge,
              animated: false,
              style: {
                ...edge.style,
                stroke: "#3f3f46",
                strokeWidth: 1,
                opacity: 0.5,
              },
            };
          }
          return {
            ...edge,
            animated: false,
            style: {
              ...edge.style,
              stroke: "#262626",
              strokeWidth: 1.5,
            },
          };
        })
      );
    }
  }, [activeStep, setEdges]);

  // Clear highlights after run completes
  useEffect(() => {
    if (!isRunning && steps.length > 0) {
      const timer = setTimeout(() => {
        setNodes((prev) => prev.map((node) => ({ ...node, className: undefined })));
        setEdges((prev) =>
          prev.map((edge) => {
            if (edge.id.startsWith("st-")) {
              return {
                ...edge,
                animated: false,
                style: {
                  ...edge.style,
                  stroke: "#3f3f46",
                  strokeWidth: 1,
                  opacity: 0.5,
                },
              };
            }
            return {
              ...edge,
              animated: false,
              style: {
                ...edge.style,
                stroke: "#262626",
                strokeWidth: 1.5,
              },
            };
          })
        );
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isRunning, steps.length, setNodes, setEdges]);

  const handleSend = useCallback(
    (message: string) => {
      if (agentConfig) {
        runAgent(message, agentConfig, toolsConfig);
      }
    },
    [runAgent, agentConfig, toolsConfig]
  );

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
          href={`/agents/${id}`}
          className="p-1.5 hover:bg-background-tertiary rounded-md transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground-muted" />
        </Link>
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-success" />
          <h1 className="text-sm font-semibold">
            Playground — {agent?.display_name || agent?.name || "Agent"}
          </h1>
        </div>
        <div className="flex items-center gap-3 ml-auto text-xs text-foreground-muted">
          <span className="flex items-center gap-1">
            <Bot className="w-3 h-3" />
            {agent?.model || "unknown"}
          </span>
          <span className="flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            {agentTools.length} tool{agentTools.length !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {agent?.skills?.length || 0} skill{(agent?.skills?.length || 0) !== 1 ? "s" : ""}
          </span>
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
            <MiniMap
              nodeColor="#262626"
              maskColor="rgba(13, 13, 13, 0.8)"
              style={{ backgroundColor: "#141414" }}
            />
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
              <p className="text-xs font-medium text-foreground-muted mb-1">
                Execution Trace
              </p>
              <StepTimeline steps={steps} />
            </div>
          )}
        </div>
      </div>

      {/* Detail modals */}
      {selectedTool && (
        <PlaygroundDetailModal
          type="tool"
          tool={selectedTool}
          onClose={() => setSelectedTool(null)}
        />
      )}
      {selectedSkillCode && (
        <PlaygroundDetailModal
          type="skill"
          skillCode={selectedSkillCode}
          onClose={() => setSelectedSkillCode(null)}
        />
      )}
    </div>
  );
}
