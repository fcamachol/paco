import { Node, Edge } from "@xyflow/react";
import { InfraDetail } from "@/types/infrastructure";

const NODESEP = 50; // horizontal gap between nodes in same row
const RANKSEP = 100; // vertical gap between tiers

/**
 * Build a React Flow graph with a 3-tier top-down layout:
 *   Tier 0: Orchestrator or Coordinator (depending on infra type)
 *   Tier 1: Agents
 *   Tier 2: Tool groups (one per agent that has tools)
 */
export function buildPlaygroundGraph(infra: InfraDetail): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const agents = infra.agents || [];

  // --- Determine top-tier node ---
  const isHive = infra.type === "hive";
  const topNodeId = isHive ? "coordinator" : "orchestrator";
  const topNodeType = isHive ? "coordinator" : "orchestrator";
  const hasTopNode = isHive ? !!infra.coordinator : !!infra.orchestrator;

  // --- Build nodes + edges ---

  if (hasTopNode) {
    nodes.push({
      id: topNodeId,
      type: topNodeType,
      position: { x: 0, y: 0 }, // positioned below
      data: {},
    });
  }

  // Track which agents have tool groups so we can position them
  const agentToolMap: { slug: string; toolCount: number }[] = [];

  agents.forEach((agent) => {
    const slug = agent.agent_id_slug;
    const tools: { name: string }[] = (agent.tools_config || []).map(
      (t: any) => ({
        name: t.name || t.function?.name || "unknown",
      })
    );

    nodes.push({
      id: slug,
      type: "agent",
      position: { x: 0, y: 0 },
      data: {
        categoryCode: agent.category_code,
        displayName: agent.display_name || slug,
        toolCount: tools.length,
      },
    });

    if (hasTopNode) {
      edges.push({
        id: `${topNodeId}-${slug}`,
        source: topNodeId,
        target: slug,
        animated: false,
        style: { stroke: "#262626", strokeWidth: 2 },
      });
    }

    if (tools.length > 0) {
      const toolNodeId = `tools-${slug}`;
      nodes.push({
        id: toolNodeId,
        type: "toolGroup",
        position: { x: 0, y: 0 },
        data: { tools },
      });

      edges.push({
        id: `agent-tools-${slug}`,
        source: slug,
        target: toolNodeId,
        animated: false,
        style: {
          stroke: "#262626",
          strokeWidth: 1.5,
          strokeDasharray: "6 4",
        },
      });

      agentToolMap.push({ slug, toolCount: tools.length });
    }
  });

  // --- 3-tier layout ---

  // Tier 1: agents row
  const agentWidth = 160;
  const agentHeight = 70;
  const totalAgentWidth =
    agents.length * agentWidth + (agents.length - 1) * NODESEP;
  const agentStartX = -totalAgentWidth / 2;
  const agentY = hasTopNode ? RANKSEP + 50 : 0;

  agents.forEach((agent, idx) => {
    const agentNode = nodes.find((n) => n.id === agent.agent_id_slug);
    if (agentNode) {
      agentNode.position = {
        x: agentStartX + idx * (agentWidth + NODESEP),
        y: agentY,
      };
    }
  });

  // Tier 0: top node centered above agents
  const topNode = nodes.find((n) => n.id === topNodeId);
  if (topNode) {
    topNode.position = { x: -100, y: 0 }; // 200px wide, center at 0
  }

  // Tier 2: tool groups below their parent agents
  agentToolMap.forEach(({ slug, toolCount }) => {
    const agentNode = nodes.find((n) => n.id === slug);
    const toolNode = nodes.find((n) => n.id === `tools-${slug}`);
    if (agentNode && toolNode) {
      const toolHeight = 40 + Math.min(toolCount, 6) * 22;
      toolNode.position = {
        x: agentNode.position.x - 15, // slightly wider, offset to center
        y: agentY + agentHeight + RANKSEP,
      };
    }
  });

  return { nodes, edges };
}
