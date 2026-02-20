"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Select } from "antd";
import { api } from "@/lib/api";

interface ToolSelectorProps {
  value: string[];
  onChange: (tools: string[]) => void;
}

export const ToolSelector: React.FC<ToolSelectorProps> = ({ value, onChange }) => {
  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: () => api.getTools(),
  });

  // Group tools by MCP server name
  const groupedOptions = React.useMemo(() => {
    const groups: Record<string, { label: string; value: string; description?: string }[]> = {};

    for (const tool of tools) {
      const group = tool.mcp_server_name || "Built-in";
      if (!groups[group]) groups[group] = [];
      groups[group].push({
        label: tool.name,
        value: tool.name,
        description: tool.description || undefined,
      });
    }

    // Sort groups alphabetically, "Built-in" first
    return Object.entries(groups)
      .sort(([a], [b]) => {
        if (a === "Built-in") return -1;
        if (b === "Built-in") return 1;
        return a.localeCompare(b);
      })
      .map(([groupName, options]) => ({
        label: <span className="font-semibold text-xs text-foreground-muted">{groupName}</span>,
        title: groupName,
        options: options.map((opt) => ({
          label: (
            <div className="flex flex-col py-0.5">
              <span>{opt.label}</span>
              {opt.description && (
                <span className="text-xs text-foreground-muted truncate">{opt.description}</span>
              )}
            </div>
          ),
          value: opt.value,
        })),
      }));
  }, [tools]);

  return (
    <Select
      mode="multiple"
      className="w-full"
      placeholder="Search and select tools..."
      value={value}
      onChange={onChange}
      options={groupedOptions}
      loading={isLoading}
      showSearch
      optionFilterProp="value"
      maxTagCount="responsive"
      notFoundContent={isLoading ? "Loading tools..." : "No tools found"}
    />
  );
};
