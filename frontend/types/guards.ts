'use client';

import {
  Component,
  ComponentConfig,
  AgentConfig,
  AssistantAgentConfig,
  McpServerConfig,
  ToolConfig,
  KnowledgeConfig,
  LogicConfig,
  WorkflowConfig,
  TeamConfig,
  SelectorTeamConfig,
  SwarmTeamConfig,
  WorkbenchConfig,
  StaticWorkbenchConfig,
  McpWorkbenchConfig,
  ModelConfig,
  TerminationConfig,
} from './datamodel';

// Provider constants for AutoGen Studio compatibility
export const PROVIDERS = {
  ASSISTANT_AGENT: 'autogen_agentchat.agents.AssistantAgent',
  WEB_SURFER_AGENT: 'autogen_agentchat.agents.WebSurferAgent',
  SELECTOR_TEAM: 'autogen_agentchat.teams.SelectorGroupChat',
  SWARM_TEAM: 'autogen_agentchat.teams.Swarm',
  ROUND_ROBIN_TEAM: 'autogen_agentchat.teams.RoundRobinGroupChat',
  STATIC_WORKBENCH: 'autogen_core.tools.StaticWorkbench',
  MCP_WORKBENCH: 'autogen_ext.tools.mcp.MCPWorkbench',
} as const;

// Core Type Guards
export function isAgentComponent(
  component: Component<ComponentConfig>
): component is Component<AgentConfig> {
  return component.component_type === 'agent';
}

export function isTeamComponent(
  component: Component<ComponentConfig>
): component is Component<TeamConfig> {
  return component.component_type === 'team';
}

export function isToolComponent(
  component: Component<ComponentConfig>
): component is Component<ToolConfig> {
  return component.component_type === 'tool';
}

export function isModelComponent(
  component: Component<ComponentConfig>
): component is Component<ModelConfig> {
  return component.component_type === 'model';
}

export function isTerminationComponent(
  component: Component<ComponentConfig>
): component is Component<TerminationConfig> {
  return component.component_type === 'termination';
}

export function isWorkbenchComponent(
  component: Component<ComponentConfig>
): component is Component<WorkbenchConfig> {
  return component.component_type === 'workbench';
}

// Team Type Guards
export function isSelectorTeam(
  component: Component<ComponentConfig>
): component is Component<SelectorTeamConfig> {
  return (
    isTeamComponent(component) &&
    component.provider === PROVIDERS.SELECTOR_TEAM
  );
}

export function isSwarmTeam(
  component: Component<ComponentConfig>
): component is Component<SwarmTeamConfig> {
  return (
    isTeamComponent(component) &&
    component.provider === PROVIDERS.SWARM_TEAM
  );
}

export function isRoundRobinTeam(
  component: Component<ComponentConfig>
): component is Component<TeamConfig> {
  return (
    isTeamComponent(component) &&
    component.provider === PROVIDERS.ROUND_ROBIN_TEAM
  );
}

// Agent Type Guards
export function isAssistantAgent(
  component: Component<ComponentConfig>
): component is Component<AssistantAgentConfig> {
  return (
    isAgentComponent(component) &&
    component.provider === PROVIDERS.ASSISTANT_AGENT
  );
}

export function isWebSurferAgent(
  component: Component<ComponentConfig>
): component is Component<AgentConfig> {
  return (
    isAgentComponent(component) &&
    component.provider === PROVIDERS.WEB_SURFER_AGENT
  );
}

export function isUserProxyAgent(
  component: Component<ComponentConfig>
): component is Component<AgentConfig> {
  return (
    isAgentComponent(component) &&
    component.provider.includes('UserProxy')
  );
}

// Workbench Type Guards
export function isStaticWorkbench(
  component: Component<ComponentConfig>
): component is Component<StaticWorkbenchConfig> {
  return (
    isWorkbenchComponent(component) &&
    component.provider === PROVIDERS.STATIC_WORKBENCH
  );
}

export function isAnyStaticWorkbench(
  component: Component<ComponentConfig>
): component is Component<StaticWorkbenchConfig> {
  return isStaticWorkbench(component);
}

export function isMcpWorkbench(
  component: Component<ComponentConfig>
): component is Component<McpWorkbenchConfig> {
  return (
    isWorkbenchComponent(component) &&
    component.provider === PROVIDERS.MCP_WORKBENCH
  );
}

// PACO-specific Type Guards (for future use)
export function isMcpServerComponent(
  component: Component<ComponentConfig>
): component is Component<McpServerConfig> {
  return component.component_type === 'mcp-server';
}

// Legacy MCP check for backward compat
export function isMcpWorkbenchOrServer(
  component: Component<ComponentConfig>
): component is Component<McpServerConfig> {
  return component.component_type === 'mcp-server' ||
    (component.component_type === 'workbench' && isMcpWorkbench(component));
}

export function isKnowledgeComponent(
  component: Component<ComponentConfig>
): component is Component<KnowledgeConfig> {
  return component.component_type === 'knowledge';
}

export function isLogicComponent(
  component: Component<ComponentConfig>
): component is Component<LogicConfig> {
  return component.component_type === 'logic';
}

export function isWorkflowComponent(
  component: Component<ComponentConfig>
): component is Component<WorkflowConfig> {
  return component.component_type === 'team';
}
