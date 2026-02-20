'use client';

import React, { memo } from "react";
import {
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  getBezierPath,
  BaseEdge,
} from "@xyflow/react";
import {
  LucideIcon,
  Users,
  Wrench,
  Brain,
  Timer,
  Trash2Icon,
  Edit,
  Bot,
  Package,
  Server,
  BookOpen,
  GitBranch,
  Workflow,
} from "lucide-react";
import { CustomNode } from "./types";
import {
  AgentConfig,
  TeamConfig,
  WorkbenchConfig,
  StaticWorkbenchConfig,
  McpWorkbenchConfig,
  McpServerConfig,
  LogicConfig,
  LogicType,
  ComponentTypes,
  Component,
  ComponentConfig,
} from "@/types/datamodel";
import { useDroppable } from "@dnd-kit/core";
// TODO: Create TruncatableText component or use alternative
// import { TruncatableText } from "@/components/atoms";
import { useTeamBuilderStore } from "./store";
import {
  isAssistantAgent,
  isSelectorTeam,
  isSwarmTeam,
  isWebSurferAgent,
  isAnyStaticWorkbench,
  isMcpWorkbench,
} from "@/types/guards";

// Temporary TruncatableText replacement
const TruncatableText: React.FC<{ content: string; textThreshold?: number; showFullscreen?: boolean }> = ({ content, textThreshold = 150 }) => {
  const truncated = content.length > textThreshold ? content.substring(0, textThreshold) + "..." : content;
  return <span title={content}>{truncated}</span>;
};

// Icon mapping for different node types
export const iconMap: Record<
  Component<ComponentConfig>["component_type"],
  LucideIcon
> = {
  team: Users,
  agent: Bot,
  tool: Wrench,
  model: Brain,
  termination: Timer,
  workbench: Package,
  // PACO types
  "mcp-server": Server,
  knowledge: BookOpen,
  logic: GitBranch,
  workflow: Workflow,
};

interface DroppableZoneProps {
  accepts: ComponentTypes[];
  children?: React.ReactNode;
  className?: string;
  id: string; // Add this to make each zone uniquely identifiable
}

const DroppableZone = memo<DroppableZoneProps>(
  ({ accepts, children, className, id }) => {
    const { isOver, setNodeRef, active } = useDroppable({
      id,
      data: { accepts },
    });

    // Check if dragged item type is accepted by this zone
    const isValidDrop =
      isOver &&
      active?.data?.current?.type &&
      accepts.includes(active.data.current.type);

    return (
      <div
        ref={setNodeRef}
        className={`droppable-zone p-2 ${isValidDrop ? "can-drop" : ""} ${
          className || ""
        }`}
      >
        {children}
      </div>
    );
  }
);
DroppableZone.displayName = "DroppableZone";

// Base node layout component
interface BaseNodeProps extends NodeProps<CustomNode> {
  id: string;
  icon: LucideIcon;
  children?: React.ReactNode;
  headerContent?: React.ReactNode;
  descriptionContent?: React.ReactNode;
  className?: string;
  onEditClick?: (id: string) => void;
}

const BaseNode = memo<BaseNodeProps>(
  ({
    id,
    data,
    selected,
    dragHandle,
    icon: Icon,
    children,
    headerContent,
    descriptionContent,
    className,
    onEditClick,
  }) => {
    const removeNode = useTeamBuilderStore((state) => state.removeNode);
    const setSelectedNode = useTeamBuilderStore(
      (state) => state.setSelectedNode
    );
    const showDelete = data.type !== "team";

    return (
      <div
        ref={dragHandle}
        className={`
        bg-white text-primary relative rounded-lg shadow-lg w-72
        ${selected ? "ring-2 ring-accent" : ""}
        ${className || ""}
        transition-all duration-200
      `}
      >
        <div className="border-b p-3 bg-gray-50 rounded-t-lg">
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Icon className="flex-shrink-0 w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-800 truncate">
                {data.component.label}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs px-2 py-1 bg-gray-200 rounded text-gray-700">
                {data.component.component_type}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(id);
                }}
                className="p-1 hover:bg-secondary rounded"
              >
                <Edit className="w-4 h-4 text-accent" />
              </button>
              {showDelete && (
                <>
                  <button
                    onClick={(e) => {
                      console.log("remove node", id);
                      e.stopPropagation();
                      if (id) removeNode(id);
                    }}
                    className="p-1 hover:bg-red-100 rounded"
                  >
                    <Trash2Icon className="w-4 h-4 text-red-500" />
                  </button>
                </>
              )}
            </div>
          </div>
          {headerContent}
        </div>

        <div className="px-3 py-2 border-b text-sm text-gray-600">
          {descriptionContent}
        </div>

        <div className="p-3 space-y-2">{children}</div>
      </div>
    );
  }
);

BaseNode.displayName = "BaseNode";

// Reusable components
const NodeSection: React.FC<{
  title: string | React.ReactNode;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="space-y-1 relative">
    <h4 className="text-xs font-medium text-gray-500 uppercase">{title}</h4>
    <div className="bg-gray-50 rounded p-2">{children}</div>
  </div>
);

const ConnectionBadge: React.FC<{
  connected: boolean;
  label: string;
}> = ({ connected, label }) => (
  <span
    className={`
      text-xs px-2 py-1 rounded-full
      ${connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}
    `}
  >
    {label}
  </span>
);

// Team Node
export const TeamNode = memo<NodeProps<CustomNode>>((props) => {
  const component = props.data.component as Component<TeamConfig>;
  const hasModel = isSelectorTeam(component) && !!component.config.model_client;
  const participantCount = component.config.participants?.length || 0;

  // Get team type label
  const teamType = isSwarmTeam(component)
    ? "Swarm"
    : isSelectorTeam(component)
    ? "Selector"
    : "RoundRobin";

  return (
    <BaseNode
      {...props}
      icon={iconMap.team}
      headerContent={
        <div className="flex gap-2 mt-2">
          <ConnectionBadge connected={true} label={teamType} />
          {isSelectorTeam(component) && (
            <ConnectionBadge connected={hasModel} label="Model" />
          )}
          <ConnectionBadge
            connected={participantCount > 0}
            label={`${participantCount} Agent${
              participantCount > 1 ? "s" : ""
            }`}
          />
        </div>
      }
      descriptionContent={
        <div>
          <div>
            <TruncatableText
              content={component.description || component.label || ""}
              textThreshold={150}
              showFullscreen={false}
            />
          </div>
          {isSelectorTeam(component) && component.config.selector_prompt && (
            <div className="mt-1 text-xs">
              Selector:{" "}
              <TruncatableText
                content={component.config.selector_prompt}
                textThreshold={150}
                showFullscreen={false}
              />
            </div>
          )}
          {isSwarmTeam(component) && (
            <div className="mt-1 text-xs text-gray-600">
              Handoff-based agent coordination
            </div>
          )}
        </div>
      }
    >
      {isSelectorTeam(component) && (
        <NodeSection title="Model">
          {/* <Handle
            type="target"
            position={Position.Left}
            id={`${props.id}-model-input-handle`}
            className="my-left-handle"
          /> */}

          <div className="relative">
            {hasModel && component.config.model_client && (
              <div className="text-sm">
                {component.config.model_client.config.model}
              </div>
            )}
            <DroppableZone id={`${props.id}@@@model-zone`} accepts={["model"]}>
              <div className="text-secondary text-xs my-1 text-center">
                Drop model here
              </div>
            </DroppableZone>
          </div>
        </NodeSection>
      )}

      <NodeSection
        title={
          <div>
            Agents{" "}
            <span className="text-xs text-accent">({participantCount})</span>
          </div>
        }
      >
        <Handle
          type="source"
          position={Position.Right}
          id={`${props.id}-agent-output-handle`}
          className="my-right-handle"
        />
        <div className="space-y-1">
          {component.config.participants?.map((participant, index) => (
            <div
              key={index}
              className="relative text-sm py-1 px-2 bg-white rounded flex items-center gap-2"
            >
              <Brain className="w-4 h-4 text-gray-500" />
              <span>{participant.config.name}</span>
            </div>
          ))}
          <DroppableZone id={`${props.id}@@@agent-zone`} accepts={["agent"]}>
            <div className="text-secondary text-xs my-1 text-center">
              Drop agents here
            </div>
          </DroppableZone>
        </div>
      </NodeSection>

      <NodeSection title="Terminations">
        {/* {
          <Handle
            type="target"
            position={Position.Left}
            id={`${props.id}-termination-input-handle`}
            className="my-left-handle"
          />
        } */}
        <div className="space-y-1">
          {component.config.termination_condition && (
            <div className="text-sm py-1 px-2 bg-white rounded flex items-center gap-2">
              <Timer className="w-4 h-4 text-gray-500" />
              <span>
                {component.config.termination_condition.label ||
                  component.config.termination_condition.component_type}
              </span>
            </div>
          )}
          <DroppableZone
            id={`${props.id}@@@termination-zone`}
            accepts={["termination"]}
          >
            <div className="text-secondary text-xs my-1 text-center">
              Drop termination here
            </div>
          </DroppableZone>
        </div>
      </NodeSection>
    </BaseNode>
  );
});

TeamNode.displayName = "TeamNode";

export const AgentNode = memo<NodeProps<CustomNode>>((props) => {
  const component = props.data.component as Component<AgentConfig>;
  const hasModel =
    isAssistantAgent(component) && !!component.config.model_client;

  // Get workbench info instead of direct tools
  const workbenchInfos = (() => {
    if (!isAssistantAgent(component)) return [];

    const workbenchConfig = component.config.workbench;
    if (!workbenchConfig) return [];

    // Handle both single workbench object and array of workbenches
    const workbenches = Array.isArray(workbenchConfig)
      ? workbenchConfig
      : [workbenchConfig];

    return workbenches.map((workbench) => {
      if (!workbench) {
        return {
          hasWorkbench: false,
          toolCount: 0,
          workbenchType: "unknown" as const,
          serverType: null,
          workbench,
        };
      }

      if (isAnyStaticWorkbench(workbench)) {
        return {
          hasWorkbench: true,
          toolCount:
            (workbench as Component<StaticWorkbenchConfig>).config.tools
              ?.length || 0,
          workbenchType: "static" as const,
          serverType: null,
          workbench,
        };
      } else if (isMcpWorkbench(workbench)) {
        const serverType = workbench.config.server_params?.type || "unknown";
        return {
          hasWorkbench: true,
          toolCount: 0,
          workbenchType: "mcp" as const,
          serverType: serverType,
          workbench,
        };
      }

      return {
        hasWorkbench: true,
        toolCount: 0,
        workbenchType: "unknown" as const,
        serverType: null,
        workbench,
      };
    });
  })();

  const totalToolCount = workbenchInfos.reduce(
    (sum, info) => sum + (info.workbenchType === "static" ? info.toolCount : 0),
    0
  );

  return (
    <BaseNode
      {...props}
      icon={iconMap.agent}
      headerContent={
        <div className="flex gap-2 mt-2">
          {isAssistantAgent(component) && (
            <>
              <ConnectionBadge connected={hasModel} label="Model" />
              <ConnectionBadge
                connected={workbenchInfos.length > 0}
                label={`${workbenchInfos.length} Workbench${
                  workbenchInfos.length !== 1 ? "es" : ""
                } (${totalToolCount} Tool${totalToolCount !== 1 ? "s" : ""})`}
              />
            </>
          )}
        </div>
      }
      descriptionContent={
        <div>
          <div className="break-words truncate mb-1">
            {" "}
            {component.config.name}
          </div>
          <div className="break-words"> {component.description}</div>
        </div>
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        id={`${props.id}-agent-input-handle`}
        className="my-left-handle z-100"
      />

      {(isAssistantAgent(component) || isWebSurferAgent(component)) && (
        <>
          <NodeSection title="Model">
            <div className="relative">
              {component.config?.model_client && (
                <div className="text-sm">
                  {component.config?.model_client.config?.model}
                </div>
              )}
              <DroppableZone
                id={`${props.id}@@@model-zone`}
                accepts={["model"]}
              >
                <div className="text-secondary text-xs my-1 text-center">
                  Drop model here
                </div>
              </DroppableZone>
            </div>
          </NodeSection>

          {isAssistantAgent(component) && (
            <NodeSection title={`Workbenches (${workbenchInfos.length})`}>
              <Handle
                type="target"
                position={Position.Left}
                id={`${props.id}-workbench-input-handle`}
                className="my-left-handle"
              />
              <div className="space-y-3">
                {workbenchInfos.length > 0 ? (
                  workbenchInfos.map((workbenchInfo, index) => (
                    <div key={index} className="space-y-1">
                      <div className="text-sm py-1 px-2 bg-white rounded flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-500" />
                        <span>
                          {workbenchInfo.workbenchType === "static"
                            ? `Static Workbench (${
                                workbenchInfo.toolCount
                              } Tool${
                                workbenchInfo.toolCount !== 1 ? "s" : ""
                              })`
                            : workbenchInfo.workbenchType === "mcp"
                            ? `MCP Workbench (${workbenchInfo.serverType})`
                            : `Workbench (${
                                (workbenchInfo.workbench as any)?.provider ||
                                "Unknown"
                              })`}
                        </span>
                      </div>
                      {workbenchInfo.workbenchType === "static" &&
                        workbenchInfo.toolCount > 0 && (
                          <div className="ml-2">
                            {(
                              workbenchInfo.workbench as Component<StaticWorkbenchConfig>
                            ).config.tools.map((tool, toolIndex) => (
                              <div
                                key={toolIndex}
                                className="text-sm py-1 px-2 bg-white rounded flex items-center gap-2 mb-1"
                              >
                                <Wrench className="w-4 h-4 text-gray-500" />
                                <span className="truncate text-xs">
                                  {tool.config.name ||
                                    tool.label ||
                                    "Unnamed Tool"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-500 text-center p-2">
                    No workbenches connected
                  </div>
                )}
                <DroppableZone
                  id={`${props.id}@@@workbench-zone`}
                  accepts={["workbench"]}
                >
                  <div className="text-secondary text-xs my-1 text-center">
                    Drop workbench here
                  </div>
                </DroppableZone>
              </div>
            </NodeSection>
          )}
        </>
      )}
    </BaseNode>
  );
});

AgentNode.displayName = "AgentNode";

// Workbench Node
export const WorkbenchNode = memo<NodeProps<CustomNode>>((props) => {
  const component = props.data.component as Component<WorkbenchConfig>;

  const workbenchInfo = (() => {
    if (isAnyStaticWorkbench(component)) {
      const toolCount =
        (component as Component<StaticWorkbenchConfig>).config.tools?.length ||
        0;
      return {
        type: "static" as const,
        toolCount,
        subtitle: `${toolCount} static tool${toolCount !== 1 ? "s" : ""}`,
        hasContent: toolCount > 0,
      };
    } else if (isMcpWorkbench(component)) {
      const serverType = component.config.server_params?.type || "unknown";
      return {
        type: "mcp" as const,
        toolCount: 0, // Dynamic - unknown count
        subtitle: `MCP Server (${serverType})`,
        hasContent: true,
      };
    }
    return {
      type: "unknown" as const,
      toolCount: 0,
      subtitle: "Unknown workbench type",
      hasContent: false,
    };
  })();

  return (
    <BaseNode
      {...props}
      icon={iconMap.workbench}
      headerContent={
        <div className="flex gap-2 mt-2">
          <ConnectionBadge
            connected={workbenchInfo.hasContent}
            label={workbenchInfo.subtitle}
          />
        </div>
      }
      descriptionContent={
        <div>
          <div className="break-words truncate mb-1">
            {component.description || "Workbench for managing tools"}
          </div>
        </div>
      }
    >
      <Handle
        type="source"
        position={Position.Right}
        id={`${props.id}-workbench-output-handle`}
        className="my-right-handle"
      />

      {/* Static Workbench Content */}
      {workbenchInfo.type === "static" && (
        <NodeSection title={`Tools (${workbenchInfo.toolCount})`}>
          <div className="space-y-1">
            {workbenchInfo.toolCount > 0 ? (
              (component as Component<StaticWorkbenchConfig>).config.tools.map(
                (tool, index) => (
                  <div
                    key={index}
                    className="text-sm py-1 px-2 bg-white rounded flex items-center gap-2"
                  >
                    <Wrench className="w-4 h-4 text-gray-500" />
                    <span className="truncate text-xs">
                      {tool.config.name || tool.label || "Unnamed Tool"}
                    </span>
                  </div>
                )
              )
            ) : (
              <div className="text-xs text-gray-500 text-center p-2">
                No tools configured
              </div>
            )}
            <DroppableZone id={`${props.id}@@@tool-zone`} accepts={["tool"]}>
              <div className="text-secondary text-xs my-1 text-center">
                Drop tool here
              </div>
            </DroppableZone>
          </div>
        </NodeSection>
      )}

      {/* MCP Workbench Content */}
      {workbenchInfo.type === "mcp" && (
        <NodeSection title="MCP Configuration">
          <div className="space-y-1">
            <div className="text-sm py-1 px-2 bg-white rounded flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-500" />
              <span>Dynamic Tools</span>
            </div>
            <div className="text-xs text-gray-600 p-2">
              Tools provided by{" "}
              {
                (component as Component<McpWorkbenchConfig>).config
                  .server_params.type
              }{" "}
              server
            </div>
          </div>
        </NodeSection>
      )}
    </BaseNode>
  );
});

WorkbenchNode.displayName = "WorkbenchNode";

// MCP Server Node (Claude SDK)
export const McpServerNode = memo<NodeProps<CustomNode>>((props) => {
  const component = props.data.component as Component<McpServerConfig>;
  const config = component.config;

  const serverType = config.serverType || config.server_params?.type || "unknown";
  const isStdio = serverType === "stdio";
  const isSse = serverType === "sse";
  const enabledToolCount = config.enabledTools?.length || 0;

  return (
    <BaseNode
      {...props}
      icon={iconMap["mcp-server"]}
      headerContent={
        <div className="flex gap-2 mt-2">
          <ConnectionBadge
            connected={true}
            label={serverType.toUpperCase()}
          />
          {enabledToolCount > 0 && (
            <ConnectionBadge
              connected={true}
              label={`${enabledToolCount} Tool${enabledToolCount !== 1 ? 's' : ''}`}
            />
          )}
        </div>
      }
      descriptionContent={
        <div>
          <div className="break-words truncate mb-1">
            {component.description || `MCP Server (${serverType})`}
          </div>
          {isStdio && config.command && (
            <div className="text-xs text-gray-500">
              Command: {config.command}
            </div>
          )}
          {isSse && config.url && (
            <div className="text-xs text-gray-500 truncate">
              URL: {config.url}
            </div>
          )}
        </div>
      }
    >
      <Handle
        type="source"
        position={Position.Right}
        id={`${props.id}-mcp-output-handle`}
        className="my-right-handle"
      />

      <NodeSection title="Configuration">
        <div className="space-y-1">
          {isStdio && (
            <>
              <div className="text-sm py-1 px-2 bg-white rounded">
                <span className="text-gray-500">Command:</span> {config.command || "not set"}
              </div>
              {config.args && config.args.length > 0 && (
                <div className="text-sm py-1 px-2 bg-white rounded">
                  <span className="text-gray-500">Args:</span> {config.args.join(" ")}
                </div>
              )}
            </>
          )}
          {isSse && (
            <div className="text-sm py-1 px-2 bg-white rounded">
              <span className="text-gray-500">URL:</span> {config.url || "not set"}
            </div>
          )}
          {enabledToolCount > 0 ? (
            <div className="text-xs text-gray-600 p-2">
              {enabledToolCount} tool{enabledToolCount !== 1 ? 's' : ''} enabled
            </div>
          ) : (
            <div className="text-xs text-gray-500 text-center p-2">
              {config.serverId
                ? 'No tools selected - edit to enable tools'
                : 'Tools discovered at runtime'
              }
            </div>
          )}
        </div>
      </NodeSection>
    </BaseNode>
  );
});
McpServerNode.displayName = "McpServerNode";

// Knowledge Base Node
export const KnowledgeNode = memo<NodeProps<CustomNode>>((props) => {
  const component = props.data.component as Component<import("@/types/datamodel").KnowledgeConfig>;
  const config = component.config;

  const sourceType = config.sourceType || "document";
  const sourceCount = config.sources?.length || 0;

  return (
    <BaseNode
      {...props}
      icon={iconMap.knowledge}
      headerContent={
        <div className="flex gap-2 mt-2">
          <ConnectionBadge
            connected={true}
            label={sourceType.toUpperCase()}
          />
          {sourceCount > 0 && (
            <ConnectionBadge
              connected={true}
              label={`${sourceCount} Source${sourceCount !== 1 ? 's' : ''}`}
            />
          )}
        </div>
      }
      descriptionContent={
        <div>
          <div className="break-words truncate mb-1">
            {component.description || `Knowledge Base (${sourceType})`}
          </div>
          {sourceCount > 0 && (
            <div className="text-xs text-gray-500">
              {sourceCount} {sourceType === 'document' ? 'document' : 'URL'}{sourceCount !== 1 ? 's' : ''} configured
            </div>
          )}
        </div>
      }
    >
      <Handle
        type="source"
        position={Position.Right}
        id={`${props.id}-knowledge-output-handle`}
        className="my-right-handle"
      />

      <NodeSection title="Sources">
        <div className="space-y-1">
          {sourceCount > 0 ? (
            <>
              {config.sources.slice(0, 3).map((source, index) => (
                <div
                  key={index}
                  className="text-sm py-1 px-2 bg-white rounded flex items-center gap-2"
                >
                  <BookOpen className="w-4 h-4 text-gray-500" />
                  <span className="truncate text-xs" title={source}>
                    {source.length > 30 ? `...${source.slice(-30)}` : source}
                  </span>
                </div>
              ))}
              {sourceCount > 3 && (
                <div className="text-xs text-gray-500 text-center p-1">
                  +{sourceCount - 3} more source{sourceCount - 3 !== 1 ? 's' : ''}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-gray-500 text-center p-2">
              No sources configured - edit to add sources
            </div>
          )}
        </div>
      </NodeSection>

      {/* Advanced settings preview */}
      {(config.chunkSize || config.overlapSize) && (
        <NodeSection title="Processing">
          <div className="text-xs text-gray-600 p-2">
            {config.chunkSize && <div>Chunk size: {config.chunkSize}</div>}
            {config.overlapSize && <div>Overlap: {config.overlapSize}</div>}
          </div>
        </NodeSection>
      )}
    </BaseNode>
  );
});
KnowledgeNode.displayName = "KnowledgeNode";

// Logic labels for display
const LOGIC_TYPE_LABELS: Record<LogicType, string> = {
  condition: "CONDITION",
  loop: "LOOP",
  parallel: "PARALLEL",
  approval: "APPROVAL",
};

const LOGIC_TYPE_DESCRIPTIONS: Record<LogicType, string> = {
  condition: "Branch based on a condition",
  loop: "Repeat until condition is met",
  parallel: "Execute branches in parallel",
  approval: "Wait for human approval",
};

// Logic Node
export const LogicNode = memo<NodeProps<CustomNode>>((props) => {
  const component = props.data.component as Component<LogicConfig>;
  const config = component.config;

  const logicType = config.logicType || "condition";
  const hasCondition = !!config.condition && config.condition.trim().length > 0;

  return (
    <BaseNode
      {...props}
      icon={iconMap.logic}
      headerContent={
        <div className="flex gap-2 mt-2">
          <ConnectionBadge
            connected={true}
            label={LOGIC_TYPE_LABELS[logicType]}
          />
          {logicType === "loop" && config.maxIterations && (
            <ConnectionBadge
              connected={true}
              label={`Max ${config.maxIterations}`}
            />
          )}
        </div>
      }
      descriptionContent={
        <div>
          <div className="break-words truncate mb-1">
            {component.description || LOGIC_TYPE_DESCRIPTIONS[logicType]}
          </div>
          {hasCondition && (
            <div className="text-xs text-gray-500 truncate">
              Condition: {config.condition!.length > 40 ? `${config.condition!.slice(0, 40)}...` : config.condition}
            </div>
          )}
        </div>
      }
    >
      {/* Input handle for incoming flow */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${props.id}-logic-input-handle`}
        className="my-left-handle"
      />

      {/* Output handle for outgoing flow */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${props.id}-logic-output-handle`}
        className="my-right-handle"
      />

      {/* Configuration section */}
      {(logicType === "condition" || logicType === "loop") && (
        <NodeSection title="Condition">
          <div className="space-y-1">
            {hasCondition ? (
              <div className="text-sm py-1 px-2 bg-white rounded">
                <span className="text-xs text-gray-600 break-words">
                  {config.condition!.length > 60 ? `${config.condition!.slice(0, 60)}...` : config.condition}
                </span>
              </div>
            ) : (
              <div className="text-xs text-gray-500 text-center p-2">
                No condition set - edit to configure
              </div>
            )}
          </div>
        </NodeSection>
      )}

      {logicType === "loop" && (
        <NodeSection title="Loop Settings">
          <div className="text-xs text-gray-600 p-2">
            <div>Max iterations: {config.maxIterations || 10}</div>
          </div>
        </NodeSection>
      )}

      {logicType === "parallel" && (
        <NodeSection title="Parallel Execution">
          <div className="text-xs text-gray-500 text-center p-2">
            Connected nodes will execute in parallel
          </div>
        </NodeSection>
      )}

      {logicType === "approval" && (
        <NodeSection title="Human Approval">
          <div className="text-xs text-gray-500 text-center p-2">
            Workflow will pause until approved
          </div>
        </NodeSection>
      )}
    </BaseNode>
  );
});
LogicNode.displayName = "LogicNode";

// Export all node types
export const nodeTypes = {
  team: TeamNode,
  agent: AgentNode,
  workbench: WorkbenchNode,
  "mcp-server": McpServerNode,
  knowledge: KnowledgeNode,
  logic: LogicNode,
};

const EDGE_STYLES = {
  "model-connection": { stroke: "rgb(220,220,220)" },
  "tool-connection": { stroke: "rgb(220,220,220)" },
  "workbench-connection": { stroke: "rgb(34, 197, 94)" }, // Green for workbench connections
  "agent-connection": { stroke: "rgb(220,220,220)" },
  "termination-connection": { stroke: "rgb(220,220,220)" },
  "mcp-connection": { stroke: "rgb(59, 130, 246)" }, // Blue for MCP server connections
  "knowledge-connection": { stroke: "rgb(168, 85, 247)" }, // Purple for knowledge connections
  "logic-connection": { stroke: "rgb(249, 115, 22)" }, // Orange for logic connections
} as const;

type EdgeType = keyof typeof EDGE_STYLES;
type CustomEdgeProps = EdgeProps & {
  type: EdgeType;
};

export const CustomEdge = ({
  type,
  data,
  deletable,
  ...props
}: CustomEdgeProps) => {
  const [edgePath] = getBezierPath(props);
  const edgeType = type || "model-connection";

  // Extract only the SVG path properties we want to pass
  const { style: baseStyle, ...pathProps } = props;
  const {
    // Filter out the problematic props
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    sourceHandleId,
    targetHandleId,
    pathOptions,
    selectable,
    ...validPathProps
  } = pathProps;

  return (
    <BaseEdge
      path={edgePath}
      style={{ ...EDGE_STYLES[edgeType], strokeWidth: 2 }}
      {...validPathProps}
    />
  );
};

export const edgeTypes = {
  "model-connection": CustomEdge,
  "tool-connection": CustomEdge,
  "workbench-connection": CustomEdge,
  "agent-connection": CustomEdge,
  "termination-connection": CustomEdge,
  "mcp-connection": CustomEdge,
  "knowledge-connection": CustomEdge,
  "logic-connection": CustomEdge,
};
