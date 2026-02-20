"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DailyTokenMetrics } from "@/lib/api";
import { formatTokens, formatCost } from "@/lib/utils";

interface TokenUsageChartProps {
  data: DailyTokenMetrics[];
}

export function TokenUsageChart({ data }: TokenUsageChartProps) {
  // Reverse data to show oldest first (left to right)
  const chartData = [...data].reverse().map((item) => ({
    date: item.date,
    tokens: item.total_tokens,
    cost: item.total_cost,
    input: item.total_input_tokens,
    output: item.total_output_tokens,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FF6B4A" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#FF6B4A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey="date"
          stroke="#a3a3a3"
          fontSize={12}
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
          }}
        />
        <YAxis
          stroke="#a3a3a3"
          fontSize={12}
          tickFormatter={(value) => formatTokens(value)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#141414",
            border: "1px solid #262626",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "#f5f5f5" }}
          formatter={(value: number, name: string) => {
            if (name === "tokens") return [formatTokens(value), "Total Tokens"];
            if (name === "cost") return [formatCost(value), "Cost"];
            if (name === "input") return [formatTokens(value), "Input Tokens"];
            if (name === "output") return [formatTokens(value), "Output Tokens"];
            return [value, name];
          }}
          labelFormatter={(label) => {
            const date = new Date(label);
            return date.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            });
          }}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          stroke="#FF6B4A"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorTokens)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
