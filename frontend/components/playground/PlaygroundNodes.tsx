"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Server, Bot, Wrench, BookOpen } from "lucide-react";

// --- Orchestrator Node ---

const OrchestratorNode = memo(({ data }: NodeProps) => (
  <div
    style={{
      background: "#1a1a1a",
      border: "2px solid #a855f7",
      borderRadius: "12px",
      padding: "10px 16px",
      minWidth: "180px",
      color: "#f5f5f5",
    }}
  >
    <div className="flex items-center gap-2">
      <Server className="w-4 h-4 text-purple-400" />
      <span className="font-medium text-sm">Orchestrator</span>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
));
OrchestratorNode.displayName = "OrchestratorNode";

// --- Coordinator Node (for hive-type infras) ---

const CoordinatorNode = memo(({ data }: NodeProps) => (
  <div
    style={{
      background: "#1a1a1a",
      border: "2px solid #22d3ee",
      borderRadius: "12px",
      padding: "10px 16px",
      minWidth: "180px",
      color: "#f5f5f5",
    }}
  >
    <div className="flex items-center gap-2">
      <Server className="w-4 h-4 text-cyan-400" />
      <span className="font-medium text-sm">Coordinator</span>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
));
CoordinatorNode.displayName = "CoordinatorNode";

// --- Agent Node ---

const AgentNode = memo(({ data }: NodeProps) => {
  const { categoryCode, displayName, toolCount, skillCount } = data as {
    categoryCode: string;
    displayName: string;
    toolCount: number;
    skillCount: number;
  };

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "2px solid #86efac",
        borderRadius: "12px",
        padding: "8px 12px",
        minWidth: "150px",
        color: "#f5f5f5",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-green-300" />
          <span className="text-xs bg-neutral-800 rounded px-1.5 py-0.5 font-mono text-green-300">
            [{categoryCode}]
          </span>
        </div>
        <span className="font-medium text-xs truncate max-w-[130px]">
          {displayName}
        </span>
        <div className="flex items-center gap-1.5">
          {toolCount > 0 && (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5">
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
          )}
          {skillCount > 0 && (
            <span className="text-[10px] text-purple-400 bg-purple-400/10 rounded px-1.5 py-0.5">
              {skillCount} skill{skillCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
AgentNode.displayName = "AgentNode";

// --- Layout constants for per-item handle positioning ---

const HEADER_H = 27; // padding 6+6 + ~14px content + 1px border-bottom
const LIST_PAD = 6; // list container padding-top
const ROW_H = 18; // py-0.5 (4px) + ~14px line height

// --- Tool Group Node ---

const MAX_VISIBLE_TOOLS = 5;

const ToolGroupNode = memo(({ data }: NodeProps) => {
  const { tools, onToolClick } = data as {
    tools: { name: string }[];
    onToolClick?: (toolName: string) => void;
  };
  const visibleTools = tools.slice(0, MAX_VISIBLE_TOOLS);
  const overflow = tools.length - MAX_VISIBLE_TOOLS;

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "2px solid #f59e0b",
        borderRadius: "12px",
        minWidth: "170px",
        color: "#f5f5f5",
        overflow: "visible",
      }}
    >
      <Handle type="target" position={Position.Top} />
      {visibleTools.map((tool, i) => (
        <Handle
          key={`tool-${tool.name}`}
          type="target"
          position={Position.Left}
          id={`tool-${tool.name}`}
          style={{ top: HEADER_H + LIST_PAD + i * ROW_H + ROW_H / 2 }}
        />
      ))}
      {/* Header */}
      <div
        style={{
          background: "rgba(245, 158, 11, 0.1)",
          borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
          padding: "6px 10px",
          borderRadius: "10px 10px 0 0",
        }}
        className="flex items-center gap-2"
      >
        <Wrench className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium text-amber-300">
          Tools ({tools.length})
        </span>
      </div>
      {/* Tool list */}
      <div style={{ padding: "6px 10px" }}>
        {visibleTools.map((tool, i) => (
          <button
            key={i}
            className="flex items-center gap-2 py-0.5 w-full text-left hover:bg-white/5 rounded cursor-pointer"
            onClick={() => onToolClick?.(tool.name)}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-[11px] text-neutral-300 truncate">
              {tool.name}
            </span>
          </button>
        ))}
        {overflow > 0 && (
          <div className="text-[10px] text-neutral-500 mt-1 pl-3.5">
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
});
ToolGroupNode.displayName = "ToolGroupNode";

// --- Skill Group Node ---

const MAX_VISIBLE_SKILLS = 5;

const SkillGroupNode = memo(({ data }: NodeProps) => {
  const { skills, onSkillClick } = data as {
    skills: { code: string; name: string; is_enabled: boolean; allowed_tools: string[] }[];
    onSkillClick?: (skillCode: string) => void;
  };
  const visibleSkills = skills.slice(0, MAX_VISIBLE_SKILLS);
  const overflow = skills.length - MAX_VISIBLE_SKILLS;

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "2px solid #a78bfa",
        borderRadius: "12px",
        minWidth: "170px",
        color: "#f5f5f5",
        overflow: "visible",
      }}
    >
      <Handle type="target" position={Position.Top} />
      {/* Header */}
      <div
        style={{
          background: "rgba(167, 139, 250, 0.1)",
          borderBottom: "1px solid rgba(167, 139, 250, 0.2)",
          padding: "6px 10px",
          borderRadius: "10px 10px 0 0",
        }}
        className="flex items-center gap-2"
      >
        <BookOpen className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs font-medium text-purple-300">
          Skills ({skills.length})
        </span>
      </div>
      {/* Skill list */}
      <div style={{ padding: "6px 10px" }}>
        {visibleSkills.map((skill, i) => (
          <button
            key={i}
            className="flex items-center gap-2 py-0.5 w-full text-left hover:bg-white/5 rounded cursor-pointer"
            onClick={() => onSkillClick?.(skill.code)}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                skill.is_enabled ? "bg-purple-400" : "bg-neutral-600"
              }`}
            />
            <span className="text-[11px] text-neutral-300 truncate">
              {skill.name}
            </span>
            <span className="text-[9px] text-neutral-500 font-mono ml-auto flex-shrink-0">
              {skill.code}
            </span>
          </button>
        ))}
        {overflow > 0 && (
          <div className="text-[10px] text-neutral-500 mt-1 pl-3.5">
            +{overflow} more
          </div>
        )}
      </div>
      {visibleSkills.map((skill, i) =>
        skill.is_enabled ? (
          <Handle
            key={`skill-${skill.code}`}
            type="source"
            position={Position.Right}
            id={`skill-${skill.code}`}
            style={{ top: HEADER_H + LIST_PAD + i * ROW_H + ROW_H / 2 }}
          />
        ) : null
      )}
    </div>
  );
});
SkillGroupNode.displayName = "SkillGroupNode";

// Exported at module level to avoid React Flow re-mounting
export const playgroundNodeTypes = {
  orchestrator: OrchestratorNode,
  coordinator: CoordinatorNode,
  agent: AgentNode,
  toolGroup: ToolGroupNode,
  skillGroup: SkillGroupNode,
};
