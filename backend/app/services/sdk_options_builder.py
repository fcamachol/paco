"""
SDK Options Builder

Builds a ClaudeAgentOptions-shaped dict from agent + skills + MCP servers.
"""

from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.models import Agent, AgentSkill, AgentTool, Tool
from app.db.session import async_session_maker
from app.services.skill_filesystem import SkillFilesystemService


class SDKOptionsBuilder:
    """Builds a ClaudeAgentOptions dict from DB + filesystem."""

    def __init__(self):
        self.fs = SkillFilesystemService()

    async def build(self, agent_id: UUID, db=None) -> Dict[str, Any]:
        """Load agent + skills + MCP servers and return a ClaudeAgentOptions dict."""
        close_db = False
        if db is None:
            db = async_session_maker()
            close_db = True

        try:
            if close_db:
                async with db as session:
                    return await self._build_from_session(agent_id, session)
            else:
                return await self._build_from_session(agent_id, db)
        except Exception:
            raise

    async def _build_from_session(self, agent_id: UUID, db) -> Dict[str, Any]:
        result = await db.execute(
            select(Agent)
            .where(Agent.id == agent_id)
            .options(
                selectinload(Agent.agent_skills).selectinload(AgentSkill.skill),
                selectinload(Agent.agent_tools).selectinload(AgentTool.tool).selectinload(Tool.mcp_server),
            )
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")

        # Collect allowed_tools from skills
        allowed_tools: List[str] = []
        skills_data: List[Dict[str, Any]] = []

        for ask in agent.agent_skills:
            if not ask.is_enabled:
                continue
            skill = ask.skill
            try:
                fs_data = self.fs.read_skill_md(skill.code)
            except FileNotFoundError:
                fs_data = {"name": skill.name, "description": "", "allowed_tools": [], "body": ""}

            skill_tools = fs_data.get("allowed_tools", [])
            allowed_tools.extend(skill_tools)
            skills_data.append({
                "code": skill.code,
                "name": fs_data.get("name", skill.name),
                "description": fs_data.get("description", ""),
                "body": fs_data.get("body", ""),
                "allowed_tools": skill_tools,
                "resource_files": self.fs.list_resource_files(skill.code),
            })

        # Collect MCP server tools
        mcp_servers: Dict[str, Dict[str, Any]] = {}
        for at in agent.agent_tools:
            tool = at.tool
            server = tool.mcp_server
            if server and server.name not in mcp_servers:
                mcp_servers[server.name] = {
                    "name": server.name,
                    "transport": server.transport,
                    "url": server.url,
                    "command": server.command,
                    "args": server.args or [],
                    "env": server.env or {},
                }
            # Add tool to allowed_tools
            if server:
                allowed_tools.append(f"mcp__{server.name}__{tool.name}")
            else:
                allowed_tools.append(tool.name)

        # Deduplicate
        allowed_tools = list(dict.fromkeys(allowed_tools))

        options: Dict[str, Any] = {
            "model": agent.model,
            "permission_mode": agent.permission_mode,
        }
        if agent.system_prompt:
            options["system_prompt"] = agent.system_prompt
        if agent.max_turns:
            options["max_turns"] = agent.max_turns
        if agent.max_budget_usd:
            options["max_budget_usd"] = float(agent.max_budget_usd)
        if agent.max_thinking_tokens:
            options["max_thinking_tokens"] = agent.max_thinking_tokens
        if allowed_tools:
            options["allowed_tools"] = allowed_tools

        return {
            "agent": {
                "name": agent.name,
                "display_name": agent.display_name or agent.name,
                "description": agent.description or "",
            },
            "options": options,
            "skills": skills_data,
            "mcp_servers": list(mcp_servers.values()),
            "env_vars": agent.env_vars or {},
            "sdk_config": agent.sdk_config or {},
        }
