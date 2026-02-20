/**
 * Tests for workflowToIR transformation function
 *
 * These tests verify that React Flow canvas state is correctly transformed
 * into a language-agnostic Intermediate Representation (IR).
 */
import { workflowToIR } from './workflow-to-ir';
import { WorkflowIR } from './ir';
import { CustomNode, CustomEdge } from '../types';
import { Component, AgentConfig, McpServerConfig, KnowledgeConfig, TeamConfig } from '@/types/datamodel';

// Helper to create a team node (required container)
const createTeamNode = (id: string = 'team-1'): CustomNode => ({
  id,
  position: { x: 0, y: 0 },
  type: 'team',
  data: {
    label: 'Team',
    type: 'team',
    component: {
      provider: 'autogen_agentchat.teams.RoundRobinGroupChat',
      component_type: 'team',
      config: {
        name: 'Team',
      } as TeamConfig,
    } as Component<TeamConfig>,
  },
});

// Helper to create an agent node
const createAgentNode = (
  id: string,
  config: Partial<AgentConfig> = {}
): CustomNode => ({
  id,
  position: { x: 100, y: 100 },
  type: 'agent',
  data: {
    label: config.name || 'Agent',
    type: 'agent',
    component: {
      provider: 'autogen_agentchat.agents.AssistantAgent',
      component_type: 'agent',
      config: {
        name: config.name || 'Agent',
        model: config.model || 'claude-sonnet-4-20250514',
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        topP: config.topP,
        topK: config.topK,
        stopSequences: config.stopSequences,
        tools: config.tools,
      } as AgentConfig,
    } as Component<AgentConfig>,
  },
});

// Helper to create an MCP server node
const createMcpServerNode = (
  id: string,
  config: Partial<McpServerConfig> = {}
): CustomNode => ({
  id,
  position: { x: 200, y: 100 },
  type: 'mcp-server',
  data: {
    label: config.name || 'MCP Server',
    type: 'mcp-server',
    component: {
      provider: 'mcp-server',
      component_type: 'mcp-server',
      config: {
        name: config.name || 'mcp-server',
        serverType: config.serverType || 'stdio',
        command: config.command,
        args: config.args,
        url: config.url,
        env: config.env,
        enabledTools: config.enabledTools,
      } as McpServerConfig,
    } as Component<McpServerConfig>,
  },
});

// Helper to create a knowledge node
const createKnowledgeNode = (
  id: string,
  config: Partial<KnowledgeConfig> = {}
): CustomNode => ({
  id,
  position: { x: 300, y: 100 },
  type: 'knowledge',
  data: {
    label: config.name || 'Knowledge Base',
    type: 'knowledge',
    component: {
      provider: 'knowledge',
      component_type: 'knowledge',
      config: {
        name: config.name || 'Knowledge Base',
        sourceType: config.sourceType || 'document',
        sources: config.sources || [],
      } as KnowledgeConfig,
    } as Component<KnowledgeConfig>,
  },
});

// Helper to create an MCP connection edge
const createMcpEdge = (sourceId: string, targetId: string): CustomEdge => ({
  id: `edge-${sourceId}-${targetId}`,
  source: sourceId,
  target: targetId,
  type: 'mcp-connection',
});

// Helper to create a knowledge connection edge
const createKnowledgeEdge = (sourceId: string, targetId: string): CustomEdge => ({
  id: `edge-${sourceId}-${targetId}`,
  source: sourceId,
  target: targetId,
  type: 'knowledge-connection',
});

describe('workflowToIR', () => {
  describe('Error handling', () => {
    it('should throw error for empty workflow (only team node)', () => {
      const nodes: CustomNode[] = [createTeamNode()];
      const edges: CustomEdge[] = [];

      expect(() => workflowToIR(nodes, edges, 'Test Workflow')).toThrow(
        'Workflow must have exactly one agent node'
      );
    });

    it('should throw error for workflow with no nodes', () => {
      const nodes: CustomNode[] = [];
      const edges: CustomEdge[] = [];

      expect(() => workflowToIR(nodes, edges, 'Test Workflow')).toThrow(
        'Workflow must have exactly one agent node'
      );
    });
  });

  describe('Single agent workflow', () => {
    it('should return IR with agent config and empty mcpServers/knowledgeSources', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', {
          name: 'MyAgent',
          model: 'claude-opus-4-20250514',
          systemPrompt: 'You are a helpful assistant.',
          temperature: 0.7,
          maxTokens: 4096,
        }),
      ];
      const edges: CustomEdge[] = [];

      const result = workflowToIR(nodes, edges, 'Test Workflow', 'A test workflow');

      expect(result).toEqual<WorkflowIR>({
        name: 'Test Workflow',
        description: 'A test workflow',
        agent: {
          name: 'MyAgent',
          model: 'claude-opus-4-20250514',
          systemPrompt: 'You are a helpful assistant.',
          temperature: 0.7,
          maxTokens: 4096,
          topP: undefined,
          topK: undefined,
          stopSequences: undefined,
        },
        mcpServers: [],
        allowedTools: [],
        knowledgeSources: [],
        permissionMode: 'acceptEdits',
      });
    });

    it('should use default model if not specified', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'Agent' }),
      ];
      const edges: CustomEdge[] = [];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.agent.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('Agent with MCP servers', () => {
    it('should populate mcpServers when agent is connected to MCP server via edge', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'MyAgent' }),
        createMcpServerNode('mcp-1', {
          name: 'github',
          serverType: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'xxx' },
          enabledTools: ['list_repos', 'create_issue'],
        }),
      ];
      const edges: CustomEdge[] = [createMcpEdge('mcp-1', 'agent-1')];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.mcpServers).toHaveLength(1);
      expect(result.mcpServers[0]).toEqual({
        name: 'github',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        url: undefined,
        env: { GITHUB_TOKEN: 'xxx' },
        enabledTools: ['list_repos', 'create_issue'],
      });
    });

    it('should include all connected MCP servers when multiple are connected', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'MyAgent' }),
        createMcpServerNode('mcp-1', {
          name: 'github',
          serverType: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        }),
        createMcpServerNode('mcp-2', {
          name: 'remote-api',
          serverType: 'sse',
          url: 'https://api.example.com/mcp/sse',
        }),
        createMcpServerNode('mcp-3', {
          name: 'internal',
          serverType: 'http',
          url: 'http://localhost:8080/mcp',
        }),
      ];
      const edges: CustomEdge[] = [
        createMcpEdge('mcp-1', 'agent-1'),
        createMcpEdge('mcp-2', 'agent-1'),
        createMcpEdge('mcp-3', 'agent-1'),
      ];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.mcpServers).toHaveLength(3);
      expect(result.mcpServers.map((s) => s.name)).toEqual(['github', 'remote-api', 'internal']);
    });

    it('should not include unconnected MCP servers', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'MyAgent' }),
        createMcpServerNode('mcp-1', { name: 'connected' }),
        createMcpServerNode('mcp-2', { name: 'unconnected' }),
      ];
      const edges: CustomEdge[] = [createMcpEdge('mcp-1', 'agent-1')];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.mcpServers).toHaveLength(1);
      expect(result.mcpServers[0].name).toBe('connected');
    });
  });

  describe('Agent with knowledge sources', () => {
    it('should populate knowledgeSources when agent is connected to knowledge node', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'MyAgent' }),
        createKnowledgeNode('knowledge-1', {
          name: 'Company Docs',
          sourceType: 'document',
          sources: ['/docs/readme.md', '/docs/api.md'],
        }),
      ];
      const edges: CustomEdge[] = [createKnowledgeEdge('knowledge-1', 'agent-1')];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.knowledgeSources).toHaveLength(1);
      expect(result.knowledgeSources[0]).toEqual({
        name: 'Company Docs',
        type: 'document',
        sources: ['/docs/readme.md', '/docs/api.md'],
      });
    });

    it('should include all connected knowledge sources', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'MyAgent' }),
        createKnowledgeNode('knowledge-1', {
          name: 'Docs',
          sourceType: 'document',
          sources: ['/docs/readme.md'],
        }),
        createKnowledgeNode('knowledge-2', {
          name: 'URLs',
          sourceType: 'url',
          sources: ['https://example.com/api'],
        }),
      ];
      const edges: CustomEdge[] = [
        createKnowledgeEdge('knowledge-1', 'agent-1'),
        createKnowledgeEdge('knowledge-2', 'agent-1'),
      ];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.knowledgeSources).toHaveLength(2);
      expect(result.knowledgeSources.map((k) => k.name)).toEqual(['Docs', 'URLs']);
    });
  });

  describe('Full workflow', () => {
    it('should generate complete IR for workflow with agent, MCP, and knowledge', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', {
          name: 'FullAgent',
          model: 'claude-opus-4-20250514',
          systemPrompt: 'You are a coding assistant.',
          temperature: 0.5,
          maxTokens: 8192,
          tools: ['Read', 'Edit', 'Bash'],
        }),
        createMcpServerNode('mcp-1', {
          name: 'github',
          serverType: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          enabledTools: ['list_repos'],
        }),
        createKnowledgeNode('knowledge-1', {
          name: 'Project Docs',
          sourceType: 'document',
          sources: ['/docs/architecture.md'],
        }),
      ];
      const edges: CustomEdge[] = [
        createMcpEdge('mcp-1', 'agent-1'),
        createKnowledgeEdge('knowledge-1', 'agent-1'),
      ];

      const result = workflowToIR(nodes, edges, 'Full Workflow', 'Complete workflow test');

      expect(result.name).toBe('Full Workflow');
      expect(result.description).toBe('Complete workflow test');
      expect(result.agent.name).toBe('FullAgent');
      expect(result.agent.model).toBe('claude-opus-4-20250514');
      expect(result.mcpServers).toHaveLength(1);
      expect(result.knowledgeSources).toHaveLength(1);
      expect(result.allowedTools).toEqual(['Read', 'Edit', 'Bash']);
      expect(result.permissionMode).toBe('acceptEdits');
    });
  });

  describe('Agent with all optional fields', () => {
    it('should include topP, topK, and stopSequences in IR', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', {
          name: 'AdvancedAgent',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'Advanced configuration.',
          temperature: 0.8,
          maxTokens: 2048,
          topP: 0.95,
          topK: 40,
          stopSequences: ['END', 'STOP', '---'],
        }),
      ];
      const edges: CustomEdge[] = [];

      const result = workflowToIR(nodes, edges, 'Advanced Workflow');

      expect(result.agent.topP).toBe(0.95);
      expect(result.agent.topK).toBe(40);
      expect(result.agent.stopSequences).toEqual(['END', 'STOP', '---']);
    });
  });

  describe('MCP server with enabledTools filter', () => {
    it('should include enabledTools array in IR when specified', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'MyAgent' }),
        createMcpServerNode('mcp-1', {
          name: 'github',
          serverType: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          enabledTools: ['list_repos', 'create_issue', 'get_issue'],
        }),
      ];
      const edges: CustomEdge[] = [createMcpEdge('mcp-1', 'agent-1')];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.mcpServers[0].enabledTools).toEqual([
        'list_repos',
        'create_issue',
        'get_issue',
      ]);
    });

    it('should have empty enabledTools array when no tools specified', () => {
      const nodes: CustomNode[] = [
        createTeamNode(),
        createAgentNode('agent-1', { name: 'MyAgent' }),
        createMcpServerNode('mcp-1', {
          name: 'github',
          serverType: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        }),
      ];
      const edges: CustomEdge[] = [createMcpEdge('mcp-1', 'agent-1')];

      const result = workflowToIR(nodes, edges, 'Test Workflow');

      expect(result.mcpServers[0].enabledTools).toEqual([]);
    });
  });
});
