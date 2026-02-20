/**
 * Tests for generateTypeScriptCode function
 *
 * These tests verify that WorkflowIR is correctly transformed into valid
 * TypeScript code using Claude Agent SDK patterns.
 */
import { generateTypeScriptCode } from './ir-to-typescript';
import { WorkflowIR, AgentIR, McpServerIR, KnowledgeSourceIR } from './ir';

// Helper to create a minimal WorkflowIR
const createMinimalIR = (overrides: Partial<WorkflowIR> = {}): WorkflowIR => ({
  name: 'Test Workflow',
  description: undefined,
  agent: {
    name: 'TestAgent',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: undefined,
    temperature: undefined,
    maxTokens: undefined,
    topP: undefined,
    topK: undefined,
    stopSequences: undefined,
  },
  mcpServers: [],
  allowedTools: [],
  knowledgeSources: [],
  permissionMode: 'acceptEdits',
  ...overrides,
});

// Helper to create an agent IR with overrides
const createAgentIR = (overrides: Partial<AgentIR> = {}): AgentIR => ({
  name: 'TestAgent',
  model: 'claude-sonnet-4-20250514',
  ...overrides,
});

// Helper to create an MCP server IR
const createMcpServerIR = (overrides: Partial<McpServerIR> = {}): McpServerIR => ({
  name: 'test-server',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@test/server'],
  enabledTools: [],
  ...overrides,
});

// Helper to create a knowledge source IR
const createKnowledgeSourceIR = (overrides: Partial<KnowledgeSourceIR> = {}): KnowledgeSourceIR => ({
  name: 'Test Knowledge',
  type: 'document',
  sources: ['doc1.pdf', 'doc2.md'],
  ...overrides,
});

describe('generateTypeScriptCode', () => {
  describe('Test Case 1: Minimal IR (agent only)', () => {
    it('should generate valid TS with model and permissionMode', () => {
      const ir = createMinimalIR();
      const code = generateTypeScriptCode(ir);

      // Should have import statement
      expect(code).toContain('import { query } from "@anthropic-ai/claude-agent-sdk"');

      // Should have async main function with for await pattern
      expect(code).toContain('async function main()');
      expect(code).toContain('for await (const message of query({');

      // Should have permissionMode
      expect(code).toContain('permissionMode: "acceptEdits"');

      // Should have workflow header comment
      expect(code).toContain('Test Workflow');

      // Should call main()
      expect(code).toContain('main().catch(console.error)');
    });
  });

  describe('Test Case 2: IR with systemPrompt', () => {
    it('should include systemPrompt in options', () => {
      const ir = createMinimalIR({
        agent: createAgentIR({
          systemPrompt: 'You are a helpful coding assistant.',
        }),
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('systemPrompt:');
      expect(code).toContain('You are a helpful coding assistant.');
    });
  });

  describe('Test Case 3: IR with stdio MCP server', () => {
    it('should generate mcpServers with command/args', () => {
      const ir = createMinimalIR({
        mcpServers: [
          createMcpServerIR({
            name: 'github',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('mcpServers:');
      expect(code).toContain('"github":');
      expect(code).toContain('command: "npx"');
      expect(code).toContain('args: ["-y","@modelcontextprotocol/server-github"]');
    });
  });

  describe('Test Case 4: IR with SSE MCP server', () => {
    it('should generate mcpServers with type/url', () => {
      const ir = createMinimalIR({
        mcpServers: [
          createMcpServerIR({
            name: 'remote-api',
            type: 'sse',
            url: 'https://api.example.com/mcp/sse',
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('mcpServers:');
      expect(code).toContain('"remote-api":');
      expect(code).toContain('type: "sse"');
      expect(code).toContain('url: "https://api.example.com/mcp/sse"');
    });
  });

  describe('Test Case 5: IR with multiple MCP servers', () => {
    it('should include all servers in config', () => {
      const ir = createMinimalIR({
        mcpServers: [
          createMcpServerIR({
            name: 'github',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
          }),
          createMcpServerIR({
            name: 'remote-api',
            type: 'sse',
            url: 'https://api.example.com/mcp',
          }),
          createMcpServerIR({
            name: 'internal',
            type: 'http',
            url: 'http://localhost:8080/mcp',
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('"github":');
      expect(code).toContain('"remote-api":');
      expect(code).toContain('"internal":');
    });
  });

  describe('Test Case 6: IR with enabledTools (specific tools)', () => {
    it('should generate mcp__servername__toolname in allowedTools', () => {
      const ir = createMinimalIR({
        mcpServers: [
          createMcpServerIR({
            name: 'github',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            enabledTools: ['list_repos', 'create_issue'],
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('allowedTools:');
      expect(code).toContain('"mcp__github__list_repos"');
      expect(code).toContain('"mcp__github__create_issue"');
    });
  });

  describe('Test Case 7: IR with enabledTools=[] (wildcard)', () => {
    it('should generate mcp__servername__* in allowedTools when no specific tools', () => {
      const ir = createMinimalIR({
        mcpServers: [
          createMcpServerIR({
            name: 'github',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            enabledTools: [],
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('allowedTools:');
      expect(code).toContain('"mcp__github__*"');
    });
  });

  describe('Test Case 8: SystemPrompt with backticks and $', () => {
    it('should properly escape backticks and $ in systemPrompt', () => {
      const ir = createMinimalIR({
        agent: createAgentIR({
          systemPrompt: 'Use `code` blocks and ${variables} carefully.',
        }),
      });
      const code = generateTypeScriptCode(ir);

      // Backticks should be escaped
      expect(code).toContain('\\`code\\`');
      // $ should be escaped
      expect(code).toContain('\\${variables}');
    });
  });

  describe('Test Case 9: Full IR (all fields)', () => {
    it('should generate complete valid TypeScript', () => {
      const ir: WorkflowIR = {
        name: 'Complete Workflow',
        description: 'A fully configured workflow',
        agent: {
          name: 'CompleteAgent',
          model: 'claude-opus-4-20250514',
          systemPrompt: 'You are an expert assistant.',
          temperature: 0.7,
          maxTokens: 4096,
          topP: 0.95,
          topK: 40,
          stopSequences: ['END', 'STOP'],
        },
        mcpServers: [
          {
            name: 'github',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: 'xxx' },
            enabledTools: ['list_repos'],
          },
          {
            name: 'api',
            type: 'sse',
            url: 'https://api.example.com/mcp',
            enabledTools: [],
          },
        ],
        allowedTools: ['Read', 'Edit', 'Bash'],
        knowledgeSources: [
          {
            name: 'Company Docs',
            type: 'document',
            sources: ['readme.md', 'api.md'],
          },
        ],
        permissionMode: 'bypassPermissions',
      };

      const code = generateTypeScriptCode(ir);

      // Header
      expect(code).toContain('Complete Workflow');
      expect(code).toContain('A fully configured workflow');

      // Import
      expect(code).toContain('import { query } from "@anthropic-ai/claude-agent-sdk"');

      // Async pattern
      expect(code).toContain('async function main()');
      expect(code).toContain('for await (const message of query({');

      // SystemPrompt
      expect(code).toContain('systemPrompt:');
      expect(code).toContain('You are an expert assistant.');

      // Model
      expect(code).toContain('model: "claude-opus-4-20250514"');

      // MCP Servers
      expect(code).toContain('mcpServers:');
      expect(code).toContain('"github":');
      expect(code).toContain('"api":');

      // Env vars
      expect(code).toContain('env:');
      expect(code).toContain('GITHUB_TOKEN');

      // Allowed tools (built-in + MCP)
      expect(code).toContain('allowedTools:');
      expect(code).toContain('"Read"');
      expect(code).toContain('"Edit"');
      expect(code).toContain('"Bash"');
      expect(code).toContain('"mcp__github__list_repos"');
      expect(code).toContain('"mcp__api__*"');

      // Permission mode
      expect(code).toContain('permissionMode: "bypassPermissions"');

      // Main call
      expect(code).toContain('main().catch(console.error)');
    });
  });

  describe('Test Case 10: IR with knowledgeSources', () => {
    it('should render knowledge sources as documentation comment block', () => {
      const ir = createMinimalIR({
        knowledgeSources: [
          createKnowledgeSourceIR({
            name: 'internal-docs',
            type: 'document',
            sources: ['doc1.pdf', 'doc2.md'],
          }),
          createKnowledgeSourceIR({
            name: 'api-reference',
            type: 'url',
            sources: ['https://api.example.com/docs'],
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      // Should have knowledge sources comment block
      expect(code).toContain('Knowledge Sources (for manual RAG integration):');
      expect(code).toContain('Document: internal-docs');
      expect(code).toContain('doc1.pdf, doc2.md');
      expect(code).toContain('Url: api-reference');
      expect(code).toContain('https://api.example.com/docs');
      expect(code).toContain('Note: Claude Agent SDK does not include built-in RAG.');
    });

    it('should not include knowledge comment block when no sources', () => {
      const ir = createMinimalIR({
        knowledgeSources: [],
      });
      const code = generateTypeScriptCode(ir);

      expect(code).not.toContain('Knowledge Sources');
    });
  });

  describe('Edge cases', () => {
    it('should handle agent with no optional fields', () => {
      const ir = createMinimalIR({
        agent: {
          name: 'MinimalAgent',
          model: 'claude-sonnet-4-20250514',
        },
      });
      const code = generateTypeScriptCode(ir);

      // Should still generate valid code
      expect(code).toContain('import { query }');
      expect(code).toContain('async function main()');
      expect(code).toContain('for await');
      expect(code).toContain('permissionMode');
    });

    it('should handle MCP server with env vars', () => {
      const ir = createMinimalIR({
        mcpServers: [
          createMcpServerIR({
            name: 'github',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
              GITHUB_TOKEN: 'process.env.GITHUB_TOKEN',
              API_KEY: 'secret',
            },
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('env:');
      expect(code).toContain('GITHUB_TOKEN');
      expect(code).toContain('API_KEY');
    });

    it('should combine built-in tools with MCP tools in allowedTools', () => {
      const ir = createMinimalIR({
        allowedTools: ['Read', 'Edit'],
        mcpServers: [
          createMcpServerIR({
            name: 'server',
            enabledTools: ['tool1'],
          }),
        ],
      });
      const code = generateTypeScriptCode(ir);

      // Should have both built-in and MCP tools
      expect(code).toContain('"Read"');
      expect(code).toContain('"Edit"');
      expect(code).toContain('"mcp__server__tool1"');
    });

    it('should handle description in workflow header', () => {
      const ir = createMinimalIR({
        name: 'My Workflow',
        description: 'Does amazing things',
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('My Workflow');
      expect(code).toContain('Does amazing things');
    });

    it('should use default description when not provided', () => {
      const ir = createMinimalIR({
        name: 'My Workflow',
        description: undefined,
      });
      const code = generateTypeScriptCode(ir);

      expect(code).toContain('Generated by PACO Visual Agent Builder');
    });
  });
});
