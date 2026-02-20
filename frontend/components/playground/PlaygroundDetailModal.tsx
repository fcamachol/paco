"use client";

import React, { useEffect, useState } from "react";
import { X, Wrench, BookOpen, Loader2 } from "lucide-react";
import { api, Tool, Skill } from "@/lib/api";

type Props =
  | { type: "tool"; tool: Tool; onClose: () => void }
  | { type: "skill"; skillCode: string; onClose: () => void };

export function PlaygroundDetailModal(props: Props) {
  const { onClose } = props;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (props.type === "tool") {
    return <ToolDetail tool={props.tool} onClose={onClose} />;
  }
  return <SkillDetail skillCode={props.skillCode} onClose={onClose} />;
}

function ToolDetail({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Wrench className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <h2 className="text-lg font-semibold text-foreground truncate">
          {tool.name}
        </h2>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
            tool.is_enabled
              ? "bg-green-500/10 text-green-400"
              : "bg-neutral-600/20 text-neutral-400"
          }`}
        >
          {tool.is_enabled ? "Enabled" : "Disabled"}
        </span>
        <button
          onClick={onClose}
          className="ml-auto text-foreground-muted hover:text-foreground flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
        {/* Description */}
        <Section label="Description">
          {tool.description ? (
            <p className="text-sm text-foreground">{tool.description}</p>
          ) : (
            <p className="text-sm text-foreground-muted italic">
              No description
            </p>
          )}
        </Section>

        {/* MCP Server */}
        {tool.mcp_server_name && (
          <Section label="MCP Server">
            <p className="text-sm text-foreground">{tool.mcp_server_name}</p>
          </Section>
        )}

        {/* Input Schema */}
        {tool.input_schema &&
          Object.keys(tool.input_schema).length > 0 && (
            <Section label="Input Schema">
              <pre className="text-xs text-neutral-300 bg-neutral-900 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(tool.input_schema, null, 2)}
              </pre>
            </Section>
          )}
      </div>
    </ModalShell>
  );
}

function SkillDetail({
  skillCode,
  onClose,
}: {
  skillCode: string;
  onClose: () => void;
}) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSkill(skillCode)
      .then((s) => {
        if (!cancelled) setSkill(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load skill");
      });
    return () => {
      cancelled = true;
    };
  }, [skillCode]);

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <BookOpen className="w-5 h-5 text-purple-400 flex-shrink-0" />
        {skill ? (
          <>
            <h2 className="text-lg font-semibold text-foreground truncate">
              {skill.name}
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300 font-mono flex-shrink-0">
              {skill.code}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                skill.is_active
                  ? "bg-green-500/10 text-green-400"
                  : "bg-neutral-600/20 text-neutral-400"
              }`}
            >
              {skill.is_active ? "Active" : "Inactive"}
            </span>
          </>
        ) : (
          <h2 className="text-lg font-semibold text-foreground">{skillCode}</h2>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-foreground-muted hover:text-foreground flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
        {error && (
          <p className="text-sm text-red-400">Error: {error}</p>
        )}

        {!skill && !error && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
          </div>
        )}

        {skill && (
          <>
            {/* Description */}
            <Section label="Description">
              {skill.description ? (
                <p className="text-sm text-foreground">{skill.description}</p>
              ) : (
                <p className="text-sm text-foreground-muted italic">
                  No description
                </p>
              )}
            </Section>

            {/* Allowed Tools */}
            {skill.allowed_tools.length > 0 && (
              <Section label="Allowed Tools">
                <div className="flex flex-wrap gap-1.5">
                  {skill.allowed_tools.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Body / Prompt */}
            {skill.body && (
              <Section label="Prompt Body">
                <pre className="text-xs text-neutral-300 bg-neutral-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {skill.body}
                </pre>
              </Section>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

/* Shared layout shell */
function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background-secondary border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4">
        {children}
      </div>
    </div>
  );
}

/* Small label + children wrapper */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground-muted mb-1">{label}</p>
      {children}
    </div>
  );
}
