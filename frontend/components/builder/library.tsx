'use client';

import React, { useEffect, useState } from "react";
import { Input, Collapse, Badge, type CollapseProps } from "antd";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Brain,
  ChevronDown,
  Bot,
  Wrench,
  Timer,
  Maximize2,
  Minimize2,
  GripVertical,
  Package,
  Server,
  Database,
  BookOpen,
  GitBranch,
} from "lucide-react";
import Sider from "antd/es/layout/Sider";
import { ComponentTypes, Gallery, McpServerConfig, McpServerType, KnowledgeConfig, LogicConfig } from "@/types/datamodel";
import { api, McpServer } from "@/lib/api";

interface ComponentConfigTypes {
  [key: string]: any;
}

interface LibraryProps {
  defaultGallery: Gallery;
}

interface PresetItemProps {
  id: string;
  type: ComponentTypes;
  config: ComponentConfigTypes;
  label: string;
  icon: React.ReactNode;
  isTemplate?: boolean;
  isRegistered?: boolean;
  status?: string;
}

const PresetItem: React.FC<PresetItemProps> = ({
  id,
  type,
  config,
  label,
  icon,
  isTemplate,
  isRegistered,
  status,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: {
        type,
        config,
        label,
        icon,
      },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.8 : undefined,
  };

  // Determine status color for registered servers
  const getStatusColor = () => {
    if (!isRegistered) return undefined;
    switch (status) {
      case 'online': return 'green';
      case 'offline': return 'default';
      case 'error': return 'red';
      default: return 'default';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-2 text-primary mb-2 border rounded cursor-move bg-secondary transition-colors ${
        isRegistered ? 'border-blue-300' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 inline-block flex-shrink-0" />
        {isRegistered ? (
          <Database className="w-4 h-4 text-blue-500 flex-shrink-0" />
        ) : (
          icon
        )}
        <span className="text-sm flex-1 truncate">{label}</span>
        {isTemplate && (
          <span className="text-xs text-gray-400 flex-shrink-0">template</span>
        )}
        {isRegistered && (
          <Badge
            status={getStatusColor() as any}
            className="flex-shrink-0"
          />
        )}
      </div>
    </div>
  );
};

export const ComponentLibrary: React.FC<LibraryProps> = ({
  defaultGallery,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [apiServers, setApiServers] = useState<McpServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);

  // Fetch MCP servers from API on mount
  useEffect(() => {
    const fetchServers = async () => {
      setIsLoadingServers(true);
      try {
        const servers = await api.getMcpServers();
        setApiServers(servers);
      } catch (error) {
        console.error('Failed to fetch MCP servers:', error);
      } finally {
        setIsLoadingServers(false);
      }
    };
    fetchServers();
  }, []);

  // Map gallery components to sections format
  // Claude-oriented sections for PACO
  const sections = React.useMemo(
    () => [
      {
        title: "Agents",
        type: "agent" as ComponentTypes,
        items: [
          {
            label: "Claude Agent",
            config: {
              provider: "claude.agent.ClaudeAgent",
              component_type: "agent",
              version: 1,
              label: "Claude Agent",
              description: "A Claude-powered agent with tools and MCP support",
              config: {
                name: "my_agent",
                systemPrompt: "You are a helpful assistant.",
                model: "claude-sonnet-4-20250514",
                tools: [],
                mcpServers: [],
              },
            },
          },
          // Keep existing gallery agents if they exist
          ...defaultGallery.config.components.agents.map((agent) => ({
            label: agent.label || agent.config.name || "Agent",
            config: agent,
          })),
        ],
        icon: <Bot className="w-4 h-4" />,
      },
      {
        title: "MCP Servers",
        type: "mcp-server" as ComponentTypes,
        items: [
          // Static templates for creating new servers
          {
            label: "New Stdio Server",
            config: {
              provider: "claude.mcp.StdioServer",
              component_type: "mcp-server",
              version: 1,
              label: "Stdio MCP Server",
              description: "Local command-based MCP server",
              config: {
                name: "my_mcp_server",
                serverType: "stdio",
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-example"],
              } as McpServerConfig,
            },
            isTemplate: true,
          },
          {
            label: "New SSE Server",
            config: {
              provider: "claude.mcp.SSEServer",
              component_type: "mcp-server",
              version: 1,
              label: "SSE MCP Server",
              description: "Remote streaming MCP server",
              config: {
                name: "my_sse_server",
                serverType: "sse",
                url: "https://example.com/sse",
              } as McpServerConfig,
            },
            isTemplate: true,
          },
          // API-fetched registered servers from PACO registry
          ...apiServers.map((server) => ({
            label: server.name,
            config: {
              provider: server.transport === 'stdio'
                ? 'claude.mcp.StdioServer'
                : 'claude.mcp.SSEServer',
              component_type: 'mcp-server' as const,
              version: 1,
              label: server.name,
              description: server.description || `${server.transport} MCP server`,
              config: {
                name: server.name,
                serverType: server.transport as McpServerType,
                command: server.command || undefined,
                url: server.url || undefined,
                serverId: server.id, // Link to PACO registry for tool fetching
                enabledTools: [], // Start with no tools selected
              } as McpServerConfig,
            },
            isTemplate: false,
            isRegistered: true,
            status: server.status,
          })),
        ],
        icon: <Server className="w-4 h-4" />,
      },
      {
        title: "Knowledge Bases",
        type: "knowledge" as ComponentTypes,
        items: [
          {
            label: "Document Knowledge Base",
            config: {
              provider: "claude.knowledge.DocumentKB",
              component_type: "knowledge",
              version: 1,
              label: "Document Knowledge Base",
              description: "Knowledge base from local documents",
              config: {
                name: "my_knowledge_base",
                sourceType: "document",
                sources: [],
                chunkSize: 1000,
                overlapSize: 200,
              } as KnowledgeConfig,
            },
          },
          {
            label: "URL Knowledge Base",
            config: {
              provider: "claude.knowledge.UrlKB",
              component_type: "knowledge",
              version: 1,
              label: "URL Knowledge Base",
              description: "Knowledge base from web URLs",
              config: {
                name: "my_url_kb",
                sourceType: "url",
                sources: [],
                chunkSize: 1000,
                overlapSize: 200,
              } as KnowledgeConfig,
            },
          },
        ],
        icon: <BookOpen className="w-4 h-4" />,
      },
      {
        title: "Logic",
        type: "logic" as ComponentTypes,
        items: [
          {
            label: "Condition",
            config: {
              provider: "claude.logic.Condition",
              component_type: "logic",
              version: 1,
              label: "Condition",
              description: "Branch based on a condition",
              config: {
                name: "condition_1",
                logicType: "condition",
                condition: "",
              } as LogicConfig,
            },
          },
          {
            label: "Loop",
            config: {
              provider: "claude.logic.Loop",
              component_type: "logic",
              version: 1,
              label: "Loop",
              description: "Repeat until condition is met",
              config: {
                name: "loop_1",
                logicType: "loop",
                condition: "",
                maxIterations: 10,
              } as LogicConfig,
            },
          },
          {
            label: "Parallel",
            config: {
              provider: "claude.logic.Parallel",
              component_type: "logic",
              version: 1,
              label: "Parallel",
              description: "Execute branches in parallel",
              config: {
                name: "parallel_1",
                logicType: "parallel",
              } as LogicConfig,
            },
          },
          {
            label: "Human Approval",
            config: {
              provider: "claude.logic.Approval",
              component_type: "logic",
              version: 1,
              label: "Human Approval",
              description: "Wait for human approval before continuing",
              config: {
                name: "approval_1",
                logicType: "approval",
              } as LogicConfig,
            },
          },
        ],
        icon: <GitBranch className="w-4 h-4" />,
      },
      {
        title: "Built-in Tools",
        type: "tool" as ComponentTypes,
        items: [
          {
            label: "Bash",
            config: {
              provider: "claude.tools.Bash",
              component_type: "tool",
              version: 1,
              label: "Bash",
              description: "Execute bash commands",
              config: { name: "bash", toolType: "bash", enabled: true },
            },
          },
          {
            label: "File Editor",
            config: {
              provider: "claude.tools.FileEditor",
              component_type: "tool",
              version: 1,
              label: "File Editor",
              description: "Read, write, and edit files",
              config: { name: "file_editor", toolType: "file_editor", enabled: true },
            },
          },
          {
            label: "Web Search",
            config: {
              provider: "claude.tools.WebSearch",
              component_type: "tool",
              version: 1,
              label: "Web Search",
              description: "Search the web",
              config: { name: "web_search", toolType: "web_search", enabled: true },
            },
          },
          // Keep existing gallery tools
          ...defaultGallery.config.components.tools.map((tool) => ({
            label: tool.config?.name || tool.label || "Tool",
            config: tool,
          })),
        ],
        icon: <Wrench className="w-4 h-4" />,
      },
      // Legacy sections (collapsed by default, keep for backward compat)
      {
        title: "Legacy - Models",
        type: "model" as ComponentTypes,
        items: defaultGallery.config.components.models.map((model) => ({
          label: `${model.label || model.config.model}`,
          config: model,
        })),
        icon: <Brain className="w-4 h-4" />,
      },
      {
        title: "Legacy - Workbenches",
        type: "workbench" as ComponentTypes,
        items: defaultGallery.config.components.workbenches?.map((workbench) => ({
          label: workbench.label || workbench.provider.split('.').pop(),
          config: workbench,
        })) || [],
        icon: <Package className="w-4 h-4" />,
      },
      {
        title: "Legacy - Terminations",
        type: "termination" as ComponentTypes,
        items: defaultGallery.config.components.terminations.map(
          (termination) => ({
            label: `${termination.label}`,
            config: termination,
          })
        ),
        icon: <Timer className="w-4 h-4" />,
      },
    ],
    [defaultGallery, apiServers]
  );

  const items: CollapseProps["items"] = sections.map((section) => {
    const filteredItems = section.items.filter((item) =>
      item.label?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return {
      key: section.title,
      label: (
        <div className="flex items-center gap-2 font-medium">
          {section.icon}
          <span>{section.title}</span>
          <span className="text-xs text-gray-500">
            ({filteredItems.length})
          </span>
        </div>
      ),
      children: (
        <div className="space-y-2">
          {filteredItems.map((item: any, itemIndex) => (
            <PresetItem
              key={itemIndex}
              id={`${section.title.toLowerCase()}-${itemIndex}`}
              type={section.type}
              config={item.config}
              label={item.label || ""}
              icon={section.icon}
              isTemplate={item.isTemplate}
              isRegistered={item.isRegistered}
              status={item.status}
            />
          ))}
        </div>
      ),
    };
  });

  if (isMinimized) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        className="absolute group top-4 left-4 bg-primary shadow-md rounded px-4 pr-2 py-2 cursor-pointer transition-all duration-300 z-50 flex items-center gap-2"
      >
        <span>Show Component Library</span>
        <button
          onClick={() => setIsMinimized(false)}
          className="p-1 group-hover:bg-tertiary rounded transition-colors"
          title="Maximize Library"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <Sider
      width={300}
      className="bg-primary border z-10 mr-2 border-r border-secondary"
    >
      <div className="rounded p-2 pt-2">
        <div className="flex justify-between items-center mb-2">
          <div className="text-normal">Component Library</div>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-tertiary rounded transition-colors"
            title="Minimize Library"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4 text-secondary">
          Drag a component to add it to the team
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Input
            placeholder="Search components..."
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 p-2"
          />
        </div>

        <Collapse
          accordion
          items={items}
          defaultActiveKey={["Agents"]}
          bordered={false}
          expandIcon={({ isActive }) => (
            <ChevronDown
              strokeWidth={1}
              className={(isActive ? "transform rotate-180" : "") + " w-4 h-4"}
            />
          )}
        />
      </div>
    </Sider>
  );
};

export default ComponentLibrary;
