'use client';

import { CustomNode, CustomEdge } from '../types';
import { ValidationResult, ValidationError } from './types';
import {
  isAgentComponent,
  isMcpServerComponent,
  isKnowledgeComponent,
  isLogicComponent,
} from '@/types/guards';
import { AgentConfig, McpServerConfig, KnowledgeConfig, LogicConfig } from '@/types/datamodel';

/**
 * Validates an entire workflow including all nodes and edges.
 * Returns validation result with errors and warnings.
 */
export function validateWorkflow(
  nodes: CustomNode[],
  edges: CustomEdge[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let errorId = 0;

  // Validate each node
  for (const node of nodes) {
    const nodeErrors = validateNode(node, nodes, edges);
    errors.push(...nodeErrors.map(e => ({ ...e, id: `err-${errorId++}` })));
  }

  // Validate connections
  const connectionErrors = validateConnections(nodes, edges);
  errors.push(...connectionErrors.map(e => ({ ...e, id: `err-${errorId++}` })));

  // Check for orphan nodes (not connected to anything)
  const orphanWarnings = checkOrphanNodes(nodes, edges);
  warnings.push(...orphanWarnings.map(w => ({ ...w, id: `warn-${errorId++}` })));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a single node based on its component type.
 */
function validateNode(
  node: CustomNode,
  allNodes: CustomNode[],
  edges: CustomEdge[]
): Omit<ValidationError, 'id'>[] {
  const errors: Omit<ValidationError, 'id'>[] = [];
  const component = node.data.component;

  if (isAgentComponent(component)) {
    const config = component.config as AgentConfig;
    if (!config.name || config.name.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'name',
        message: 'Agent name is required',
        severity: 'error',
      });
    }
    if (!config.model) {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'model',
        message: 'Agent model is required',
        severity: 'error',
      });
    }
  }

  if (isMcpServerComponent(component)) {
    const config = component.config as McpServerConfig;
    if (!config.name || config.name.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'name',
        message: 'MCP server name is required',
        severity: 'error',
      });
    }
    if (config.serverType === 'stdio' && !config.command) {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'command',
        message: 'Command is required for stdio MCP server',
        severity: 'error',
      });
    }
    if ((config.serverType === 'sse' || config.serverType === 'http') && !config.url) {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'url',
        message: 'URL is required for SSE/HTTP MCP server',
        severity: 'error',
      });
    }
  }

  if (isKnowledgeComponent(component)) {
    const config = component.config as KnowledgeConfig;
    if (!config.name || config.name.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'name',
        message: 'Knowledge base name is required',
        severity: 'error',
      });
    }
    if (!config.sources || config.sources.length === 0) {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'sources',
        message: 'At least one source is required',
        severity: 'error',
      });
    }
  }

  if (isLogicComponent(component)) {
    const config = component.config as LogicConfig;
    if (!config.name || config.name.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'name',
        message: 'Logic node name is required',
        severity: 'error',
      });
    }
    if ((config.logicType === 'condition' || config.logicType === 'loop') && !config.condition) {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: 'condition',
        message: 'Condition expression is required',
        severity: 'error',
      });
    }
  }

  return errors;
}

/**
 * Validates edge connections for integrity.
 */
function validateConnections(
  nodes: CustomNode[],
  edges: CustomEdge[]
): Omit<ValidationError, 'id'>[] {
  const errors: Omit<ValidationError, 'id'>[] = [];

  // Check for edges with missing source or target
  for (const edge of edges) {
    const sourceExists = nodes.some(n => n.id === edge.source);
    const targetExists = nodes.some(n => n.id === edge.target);

    if (!sourceExists || !targetExists) {
      errors.push({
        message: 'Invalid connection: source or target node not found',
        severity: 'error',
      });
    }
  }

  // Check for self-loops
  for (const edge of edges) {
    if (edge.source === edge.target) {
      const node = nodes.find(n => n.id === edge.source);
      errors.push({
        nodeId: edge.source,
        nodeName: node?.data.label,
        message: 'Self-referencing connections are not allowed',
        severity: 'error',
      });
    }
  }

  return errors;
}

/**
 * Identifies nodes that are not connected to anything (orphans).
 */
function checkOrphanNodes(
  nodes: CustomNode[],
  edges: CustomEdge[]
): Omit<ValidationError, 'id'>[] {
  const warnings: Omit<ValidationError, 'id'>[] = [];
  const connectedNodes = new Set<string>();

  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }

  // Skip team nodes (root nodes don't need connections)
  for (const node of nodes) {
    if (node.data.component.component_type === 'team') continue;

    if (!connectedNodes.has(node.id)) {
      warnings.push({
        nodeId: node.id,
        nodeName: node.data.label,
        message: `"${node.data.label || 'Node'}" is not connected to any other node`,
        severity: 'warning',
      });
    }
  }

  return warnings;
}
