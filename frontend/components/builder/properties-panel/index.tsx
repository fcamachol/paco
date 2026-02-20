'use client';

import React, { useCallback, useMemo } from 'react';
import { Button, Input } from 'antd';
import { X } from 'lucide-react';

import { useTeamBuilderStore } from '../store';
import { AgentConfigForm } from './agent-config-form';
import { McpServerForm } from './mcp-server-form';
import { KnowledgeForm } from './knowledge-form';
import { LogicForm } from './logic-form';
import { AgentFormValues } from './schemas/agent-schema';
import { McpServerFormValues } from './schemas/mcp-server-schema';
import { KnowledgeFormValues } from './schemas/knowledge-schema';
import { LogicFormValues } from './schemas/logic-schema';
import { isAgentComponent, isMcpServerComponent, isKnowledgeComponent, isLogicComponent } from '@/types/guards';
import { AgentConfig, McpServerConfig, KnowledgeConfig, LogicConfig, Component } from '@/types/datamodel';

interface PropertiesPanelProps {
  onClose: () => void;
}

/**
 * Fixed right sidebar properties panel for editing node configurations.
 * Reads from Zustand store and updates via updateNode for persistence.
 */
export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ onClose }) => {
  const { selectedNodeId, nodes, updateNode } = useTeamBuilderStore();

  // Find the selected node
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  // Extract component from node
  const component = selectedNode?.data?.component;
  const isAgent = component && isAgentComponent(component);
  const isMcpServer = component && isMcpServerComponent(component);
  const isKnowledge = component && isKnowledgeComponent(component);
  const isLogic = component && isLogicComponent(component);

  // Extract default values for agent form from component config
  const agentDefaultValues = useMemo<Partial<AgentFormValues>>(() => {
    if (!isAgent || !component) return {};

    const config = component.config as AgentConfig;
    return {
      name: config.name || component.label || '',
      model: config.model || 'claude-sonnet-4-20250514',
      systemPrompt: config.systemPrompt || config.system_message || '',
      temperature: config.temperature ?? 1.0,
      maxTokens: config.maxTokens,
      topP: (config as any).topP,
      topK: (config as any).topK,
      stopSequences: (config as any).stopSequences || [],
    };
  }, [isAgent, component]);

  // Extract default values for MCP server form from component config
  const mcpServerDefaultValues = useMemo<Partial<McpServerFormValues>>(() => {
    if (!isMcpServer || !component) return {};

    const config = component.config as McpServerConfig;
    return {
      name: config.name || component.label || '',
      serverType: config.serverType || 'stdio',
      command: config.command || '',
      args: config.args || [],
      url: config.url || '',
      env: config.env || {},
      headers: config.headers || {},
      enabledTools: config.enabledTools || [],
      serverId: (config as any).serverId, // If linked to PACO registry
    };
  }, [isMcpServer, component]);

  // Extract default values for knowledge form from component config
  const knowledgeDefaultValues = useMemo<Partial<KnowledgeFormValues>>(() => {
    if (!isKnowledge || !component) return {};

    const config = component.config as KnowledgeConfig;
    return {
      name: config.name || component.label || '',
      sourceType: config.sourceType || 'document',
      sources: config.sources || [],
      chunkSize: config.chunkSize ?? 1000,
      overlapSize: config.overlapSize ?? 200,
    };
  }, [isKnowledge, component]);

  // Extract default values for logic form from component config
  const logicDefaultValues = useMemo<Partial<LogicFormValues>>(() => {
    if (!isLogic || !component) return {};

    const config = component.config as LogicConfig;
    return {
      name: config.name || component.label || '',
      logicType: config.logicType || 'condition',
      condition: config.condition || '',
      maxIterations: config.maxIterations ?? 10,
    };
  }, [isLogic, component]);

  // Handle form changes - update node in store
  const handleAgentChange = useCallback(
    (values: AgentFormValues) => {
      if (!selectedNodeId || !component) return;

      // Map form values to AgentConfig
      const updatedConfig: Partial<AgentConfig> = {
        name: values.name,
        model: values.model === 'custom' ? (values.customModel as any) : (values.model as any),
        systemPrompt: values.systemPrompt,
        system_message: values.systemPrompt, // Keep legacy field in sync
        temperature: values.temperature,
        maxTokens: values.maxTokens,
      };

      // Add advanced parameters
      const extendedConfig = {
        ...component.config,
        ...updatedConfig,
        topP: values.topP,
        topK: values.topK,
        stopSequences: values.stopSequences,
      };

      // Create updated component
      const updatedComponent: Component<AgentConfig> = {
        ...component,
        label: values.name || component.label,
        config: extendedConfig as AgentConfig,
      };

      // Update node in store
      updateNode(selectedNodeId, {
        label: values.name || selectedNode?.data.label,
        component: updatedComponent,
      });
    },
    [selectedNodeId, component, selectedNode, updateNode]
  );

  // Handle MCP server form changes - update node in store
  const handleMcpServerChange = useCallback(
    (values: McpServerFormValues) => {
      if (!selectedNodeId || !component) return;

      // Map form values to McpServerConfig
      const updatedConfig: Partial<McpServerConfig> = {
        name: values.name,
        serverType: values.serverType,
        command: values.command,
        args: values.args,
        url: values.url,
        env: values.env,
        headers: values.headers,
        enabledTools: values.enabledTools,
      };

      // Preserve serverId if it exists
      if (values.serverId) {
        (updatedConfig as any).serverId = values.serverId;
      }

      // Create updated component
      const updatedComponent: Component<McpServerConfig> = {
        ...component,
        label: values.name || component.label,
        config: {
          ...component.config,
          ...updatedConfig,
        } as McpServerConfig,
      };

      // Update node in store
      updateNode(selectedNodeId, {
        label: values.name || selectedNode?.data.label,
        component: updatedComponent,
      });
    },
    [selectedNodeId, component, selectedNode, updateNode]
  );

  // Handle knowledge form changes - update node in store
  const handleKnowledgeChange = useCallback(
    (values: KnowledgeFormValues) => {
      if (!selectedNodeId || !component) return;

      // Map form values to KnowledgeConfig
      const updatedConfig: Partial<KnowledgeConfig> = {
        name: values.name,
        sourceType: values.sourceType,
        sources: values.sources,
        chunkSize: values.chunkSize,
        overlapSize: values.overlapSize,
      };

      // Create updated component
      const updatedComponent: Component<KnowledgeConfig> = {
        ...component,
        label: values.name || component.label,
        config: {
          ...component.config,
          ...updatedConfig,
        } as KnowledgeConfig,
      };

      // Update node in store
      updateNode(selectedNodeId, {
        label: values.name || selectedNode?.data.label,
        component: updatedComponent,
      });
    },
    [selectedNodeId, component, selectedNode, updateNode]
  );

  // Handle logic form changes - update node in store
  const handleLogicChange = useCallback(
    (values: LogicFormValues) => {
      if (!selectedNodeId || !component) return;

      // Map form values to LogicConfig
      const updatedConfig: Partial<LogicConfig> = {
        name: values.name,
        logicType: values.logicType,
        condition: values.condition,
        maxIterations: values.maxIterations,
      };

      // Create updated component
      const updatedComponent: Component<LogicConfig> = {
        ...component,
        label: values.name || component.label,
        config: {
          ...component.config,
          ...updatedConfig,
        } as LogicConfig,
      };

      // Update node in store
      updateNode(selectedNodeId, {
        label: values.name || selectedNode?.data.label,
        component: updatedComponent,
      });
    },
    [selectedNodeId, component, selectedNode, updateNode]
  );

  // Handle generic component updates (for non-agent nodes)
  const handleGenericChange = useCallback(
    (field: 'label' | 'description', value: string) => {
      if (!selectedNodeId || !component) return;

      const updates: any = {};
      if (field === 'label') {
        updates.label = value;
        updates.component = { ...component, label: value };
      } else {
        updates.component = { ...component, description: value };
      }

      updateNode(selectedNodeId, updates);
    },
    [selectedNodeId, component, updateNode]
  );

  if (!selectedNode || !component) {
    return null;
  }

  return (
    <div className="w-96 border-l border-secondary bg-primary h-full overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-secondary sticky top-0 bg-primary z-10">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-primary truncate">
            {selectedNode.data.label || 'Edit Node'}
          </h3>
          <p className="text-xs text-secondary capitalize">
            {component.component_type}
          </p>
        </div>
        <Button
          type="text"
          icon={<X className="w-4 h-4" />}
          onClick={onClose}
          className="ml-2 flex-shrink-0"
        />
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {isLogic ? (
          <LogicForm
            key={selectedNodeId} // Reset form when node changes
            defaultValues={logicDefaultValues}
            onChange={handleLogicChange}
          />
        ) : isMcpServer ? (
          <McpServerForm
            key={selectedNodeId} // Reset form when node changes
            defaultValues={mcpServerDefaultValues}
            onChange={handleMcpServerChange}
            serverId={mcpServerDefaultValues.serverId}
          />
        ) : isAgent ? (
          <AgentConfigForm
            key={selectedNodeId} // Reset form when node changes
            defaultValues={agentDefaultValues}
            onChange={handleAgentChange}
          />
        ) : isKnowledge ? (
          <KnowledgeForm
            key={selectedNodeId} // Reset form when node changes
            defaultValues={knowledgeDefaultValues}
            onChange={handleKnowledgeChange}
          />
        ) : (
          /* Generic fields for non-agent nodes */
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Label
              </label>
              <Input
                value={component.label || ''}
                onChange={(e) => handleGenericChange('label', e.target.value)}
                placeholder="Component label"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Description
              </label>
              <Input.TextArea
                value={component.description || ''}
                onChange={(e) => handleGenericChange('description', e.target.value)}
                placeholder="Component description"
                rows={3}
              />
            </div>
            <div className="p-4 bg-tertiary rounded-lg text-sm text-secondary">
              <p>Component type: {component.component_type}</p>
              <p>Provider: {component.provider}</p>
              <p className="mt-2 text-xs">
                Extended configuration form coming in future updates.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesPanel;
