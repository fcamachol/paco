'use client';

import React, { useEffect, useMemo } from "react";
import { Drawer } from "antd";
import { Team, AgentConfig, Component, ComponentConfig } from "@/types/datamodel";
import { ChatPanel } from "@/components/playground/ChatPanel";
import { StepTimeline } from "@/components/playground/StepTimeline";
import { usePlayground, StepEvent } from "@/components/playground/usePlayground";
import { isAssistantAgent, isTeamComponent, isAnyStaticWorkbench } from "@/types/guards";
import { CustomNode, CustomEdge } from "./types";
import "@/components/playground/animations.css";

interface TestDrawerProps {
  isVisble: boolean;
  team: Team;
  onClose: () => void;
  nodes: CustomNode[];
  edges: CustomEdge[];
  setNodes: React.Dispatch<React.SetStateAction<CustomNode[]>>;
}

/**
 * Extracts agent config and tools config from the canvas nodes
 * so we can send them to the playground backend.
 */
function extractAgentConfig(nodes: CustomNode[]) {
  // Find the first agent node (or team node as fallback)
  const agentNode = nodes.find(n => n.data.component.component_type === 'agent');
  const teamNode = nodes.find(n => n.data.component.component_type === 'team');

  const targetNode = agentNode || teamNode;
  if (!targetNode) {
    return { agentConfig: { name: "Agent", systemPrompt: "You are a helpful assistant." }, toolsConfig: [] };
  }

  const component = targetNode.data.component;

  // Extract agent config
  const agentConfig: Record<string, any> = {
    name: component.label || (component as any).config?.name || "Agent",
    label: component.label,
    component_type: component.component_type,
    config: (component as any).config || {},
  };

  // Extract system prompt
  if (isAssistantAgent(component as Component<AgentConfig>)) {
    agentConfig.systemPrompt = (component as Component<AgentConfig>).config.system_message || "";
    const modelClient = (component as Component<AgentConfig>).config.model_client;
    if (modelClient?.config?.model) {
      agentConfig.model = modelClient.config.model;
    }
  }

  // Extract tools from workbenches
  const toolsConfig: any[] = [];
  if (isAssistantAgent(component as Component<AgentConfig>)) {
    const workbench = (component as Component<AgentConfig>).config.workbench;
    const workbenches = Array.isArray(workbench) ? workbench : workbench ? [workbench] : [];
    for (const wb of workbenches) {
      if (isAnyStaticWorkbench(wb)) {
        const tools = (wb as any).config?.tools || [];
        toolsConfig.push(...tools);
      }
    }
  }

  return { agentConfig, toolsConfig };
}

/**
 * Maps a step event to a node highlight class name.
 */
function getHighlightClass(step: StepEvent): string | undefined {
  switch (step.step) {
    case 'agent_start': return 'node-active';
    case 'tool_call': return 'node-tool-running';
    case 'tool_result': return 'node-completed';
    case 'response': return 'node-completed';
    case 'error': return 'node-error';
    default: return undefined;
  }
}

const TestDrawer: React.FC<TestDrawerProps> = ({
  isVisble,
  onClose,
  team,
  nodes,
  edges,
  setNodes,
}) => {
  const { messages, steps, isRunning, runAgent, clearConversation, stopRun, activeStep } = usePlayground();

  const { agentConfig, toolsConfig } = useMemo(() => extractAgentConfig(nodes), [nodes]);

  // Highlight nodes based on active step
  useEffect(() => {
    if (!activeStep) {
      // Clear all highlights
      setNodes(prev => prev.map(node =>
        node.className ? { ...node, className: undefined } : node
      ));
      return;
    }

    const highlightClass = getHighlightClass(activeStep);
    if (!highlightClass) return;

    setNodes(prev => prev.map(node => {
      // Highlight agent nodes on agent_start/response
      if (
        (activeStep.step === 'agent_start' || activeStep.step === 'response' || activeStep.step === 'error') &&
        node.data.component.component_type === 'agent'
      ) {
        return { ...node, className: highlightClass };
      }

      // Highlight the team node for classification
      if (activeStep.step === 'classification' && node.data.component.component_type === 'team') {
        return { ...node, className: 'node-classifying' };
      }

      // On tool events, highlight agent nodes (tools are shown inside agent nodes)
      if (
        (activeStep.step === 'tool_call' || activeStep.step === 'tool_result') &&
        node.data.component.component_type === 'agent'
      ) {
        return { ...node, className: highlightClass };
      }

      // Clear others
      return node.className ? { ...node, className: undefined } : node;
    }));
  }, [activeStep, setNodes]);

  // Clear highlights when drawer closes
  useEffect(() => {
    if (!isVisble) {
      setNodes(prev => prev.map(node =>
        node.className ? { ...node, className: undefined } : node
      ));
    }
  }, [isVisble, setNodes]);

  // Auto-clear highlight after completion
  useEffect(() => {
    if (!isRunning && steps.length > 0) {
      const timer = setTimeout(() => {
        setNodes(prev => prev.map(node =>
          node.className ? { ...node, className: undefined } : node
        ));
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isRunning, steps.length, setNodes]);

  const handleSend = (message: string) => {
    runAgent(message, agentConfig, toolsConfig);
  };

  return (
    <Drawer
      title={
        <span className="text-sm font-medium">
          Playground — {team.component?.label || "Agent"}
        </span>
      }
      width={480}
      placement="right"
      onClose={onClose}
      open={isVisble}
      styles={{ body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' } }}
    >
      <div className="flex flex-col h-full">
        {/* Main chat area */}
        <div className="flex-1 min-h-0">
          <ChatPanel
            messages={messages}
            isRunning={isRunning}
            onSend={handleSend}
            onClear={clearConversation}
            onStop={stopRun}
          />
        </div>

        {/* Live step timeline when running */}
        {isRunning && steps.length > 0 && (
          <div className="border-t border-gray-200 p-3 max-h-48 overflow-y-auto bg-gray-50">
            <p className="text-xs font-medium text-gray-500 mb-1">Live Steps</p>
            <StepTimeline steps={steps} />
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default TestDrawer;
