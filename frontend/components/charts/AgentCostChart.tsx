"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { AgentTokenMetrics } from "@/lib/api";
import { formatCost, formatTokens } from "@/lib/utils";

interface AgentCostChartProps {
  data: AgentTokenMetrics[];
}

const COLORS = [
  "#FF6B4A",
  "#FF8F75",
  "#FFB8A8",
  "#22c55e",
  "#f59e0b",
  "#6366f1",
];

export function AgentCostChart({ data }: AgentCostChartProps) {
  const chartData = data.slice(0, 6).map((item) => ({
    name: item.agent_name,
    cost: item.total_cost,
    tokens: item.total_tokens,
    executions: item.execution_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          type="number"
          stroke="#a3a3a3"
          fontSize={12}
          tickFormatter={(value) => formatCost(value)}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#a3a3a3"
          fontSize={12}
          width={100}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#141414",
            border: "1px solid #262626",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "#f5f5f5" }}
          formatter={(value: number, name: string) => {
            if (name === "cost") return [formatCost(value), "Total Cost"];
            if (name === "tokens") return [formatTokens(value), "Total Tokens"];
            if (name === "executions") return [value, "Executions"];
            return [value, name];
          }}
        />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
