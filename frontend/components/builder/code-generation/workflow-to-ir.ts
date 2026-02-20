/**
 * Workflow to IR Transformation
 *
 * Converts React Flow canvas state (nodes and edges) into a language-agnostic
 * Intermediate Representation (IR) suitable for code generation.
 */
import { CustomNode, CustomEdge } from '../types';
import { WorkflowIR, AgentIR, McpServerIR, KnowledgeSourceIR } from './ir';
import {
  Component,
  ComponentConfig,
  AgentConfig,
  McpServerConfig,
  KnowledgeConfig,
} from '@/types/datamodel';
import {
  isAgentComponent,
  isMcpServerComponent,
  isKnowledgeComponent,
} from '@/types/guards';

/**
 * Transform React Flow nodes and edges into a WorkflowIR object.
 *
 * @param nodes - React Flow nodes from the canvas
 * @param edges - React Flow edges connecting nodes
 * @param workflowName - Name for the generated workflow
 * @param workflowDescription - Optional description for the workflow
 * @returns WorkflowIR object suitable for code generation
 * @throws Error if no agent node is found in the workflow
 */
export function workflowToIR(
  nodes: CustomNode[],
  edges: CustomEdge[],
  workflowName: string,
  workflowDescription?: string
): WorkflowIR {
  // Find the agent node (should be exactly one for v1)
  const agentNode = nodes.find((n) => isAgentComponent(n.data.component));

  if (!agentNode) {
    throw new Error('Workflow must have exactly one agent node');
  }

  const agentConfig = agentNode.data.component.config as AgentConfig;

  // Build agent IR
  const agent: AgentIR = {
    name: agentConfig.name,
    model: agentConfig.model || 'claude-sonnet-4-20250514',
    systemPrompt: agentConfig.systemPrompt,
    temperature: agentConfig.temperature,
    maxTokens: agentConfig.maxTokens,
    topP: agentConfig.topP,
    topK: agentConfig.topK,
    stopSequences: agentConfig.stopSequences,
  };

  // Find connected MCP server nodes via edges with type 'mcp-connection'
  const mcpServers = findConnectedMcpServers(nodes, edges, agentNode.id);

  // Find connected knowledge nodes via edges with type 'knowledge-connection'
  const knowledgeSources = findConnectedKnowledgeSources(nodes, edges, agentNode.id);

  // Get built-in tools from agent config
  const allowedTools = agentConfig.tools || [];

  return {
    name: workflowName,
    description: workflowDescription,
    agent,
    mcpServers,
    allowedTools,
    knowledgeSources,
    permissionMode: 'acceptEdits', // Default for generated agents
  };
}

/**
 * Find all MCP servers connected to the agent node via edges.
 */
function findConnectedMcpServers(
  nodes: CustomNode[],
  edges: CustomEdge[],
  agentNodeId: string
): McpServerIR[] {
  // Find edges where target is the agent and type is mcp-connection
  const mcpEdges = edges.filter(
    (e) => e.target === agentNodeId && e.type === 'mcp-connection'
  );

  return mcpEdges
    .map((edge) => {
      const mcpNode = nodes.find((n) => n.id === edge.source);
      if (!mcpNode || !isMcpServerComponent(mcpNode.data.component)) {
        return null;
      }

      const config = mcpNode.data.component.config as McpServerConfig;

      return {
        name: config.name || mcpNode.data.label || 'mcp-server',
        type: config.serverType || 'stdio',
        command: config.command,
        args: config.args,
        url: config.url,
        env: config.env,
        enabledTools: config.enabledTools || [],
      } as McpServerIR;
    })
    .filter((server): server is McpServerIR => server !== null);
}

/**
 * Find all knowledge sources connected to the agent node via edges.
 */
function findConnectedKnowledgeSources(
  nodes: CustomNode[],
  edges: CustomEdge[],
  agentNodeId: string
): KnowledgeSourceIR[] {
  // Find edges where target is the agent and type is knowledge-connection
  const knowledgeEdges = edges.filter(
    (e) => e.target === agentNodeId && e.type === 'knowledge-connection'
  );

  return knowledgeEdges
    .map((edge) => {
      const knowledgeNode = nodes.find((n) => n.id === edge.source);
      if (!knowledgeNode || !isKnowledgeComponent(knowledgeNode.data.component)) {
        return null;
      }

      const config = knowledgeNode.data.component.config as KnowledgeConfig;

      return {
        name: config.name || knowledgeNode.data.label || 'Knowledge Base',
        type: config.sourceType,
        sources: config.sources,
      } as KnowledgeSourceIR;
    })
    .filter((source): source is KnowledgeSourceIR => source !== null);
}
