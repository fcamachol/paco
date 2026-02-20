"""
PACO Agent Code Generator

Generates standalone agent projects at maria-v3 complexity.
Supports multiple runtimes: TypeScript/Claude SDK and Python/LangGraph.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from jinja2 import Environment, FileSystemLoader
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.models import Agent, AgentSkill, AgentTool, Tool
from app.db.session import async_session_maker


@dataclass
class FilePreview:
    path: str
    content: str
    language: str = "typescript"


@dataclass
class GenerationResult:
    success: bool
    project_path: str
    files_generated: List[str] = field(default_factory=list)
    error: Optional[str] = None


# Template directories
TEMPLATES_BASE = Path(__file__).parent.parent.parent / "templates" / "agents"

# Jinja2 environments per runtime
_jinja_envs: Dict[str, Environment] = {}


def _get_jinja_env(runtime: str) -> Environment:
    if runtime not in _jinja_envs:
        template_dir = TEMPLATES_BASE / runtime
        if not template_dir.exists():
            raise ValueError(f"No templates found for runtime '{runtime}' at {template_dir}")
        _jinja_envs[runtime] = Environment(
            loader=FileSystemLoader(str(template_dir)),
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=True,
        )
    return _jinja_envs[runtime]


def _get_language(path: str) -> str:
    ext = Path(path).suffix
    return {
        ".ts": "typescript",
        ".js": "javascript",
        ".json": "json",
        ".py": "python",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".txt": "text",
        ".cjs": "javascript",
        ".md": "markdown",
    }.get(ext, "text")


def _merge_subcategories(
    base: List[Dict[str, Any]],
    overrides: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Merge base subcategories with agent-specific overrides."""
    result = list(base or [])
    if not overrides:
        return result

    remove_codes = set(overrides.get("remove", []))
    if remove_codes:
        result = [s for s in result if s.get("code") not in remove_codes]

    for item in overrides.get("add", []):
        result.append(item)

    return result


class AgentGenerator:
    """Generates standalone agent projects from DB configuration."""

    async def _load_agent(self, agent_id: UUID) -> Agent:
        async with async_session_maker() as db:
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
            return agent

    def _build_context(self, agent: Agent) -> Dict[str, Any]:
        """Build template context with resolved skills and tools."""
        # Merge base skill + agent overrides
        resolved_skills = []
        for agent_skill in agent.agent_skills:
            if not agent_skill.is_enabled:
                continue
            skill = agent_skill.skill
            resolved_skills.append({
                "code": skill.code,
                "name": skill.name,
                "description": skill.description or "",
                "prompt": (skill.base_prompt or "") + (
                    "\n\n" + agent_skill.prompt_override if agent_skill.prompt_override else ""
                ),
                "tool_names": skill.required_tool_names or [],
                "subcategories": _merge_subcategories(
                    skill.subcategories, agent_skill.subcategory_overrides
                ),
                "priority": agent_skill.priority_override or skill.default_priority,
                "keywords": (skill.keywords or []) + (agent_skill.keyword_overrides or []),
                # Anthropic Agent Skills spec
                "resource_files": skill.resource_files or {},
                "license": skill.license,
                "compatibility": skill.compatibility,
                "skill_metadata": skill.skill_metadata or {},
                "allowed_tools": skill.allowed_tools or [],
            })

        # Resolve tools with MCP server URLs
        resolved_tools = []
        mcp_servers = {}
        for agent_tool in agent.agent_tools:
            tool = agent_tool.tool
            server = tool.mcp_server
            tool_dict = {
                "name": tool.name,
                "description": tool.description or "",
                "input_schema": tool.input_schema or {},
                "mcp_server_name": server.name if server else None,
                "mcp_server_url": server.url if server else None,
                "config_overrides": agent_tool.config_overrides or {},
                "is_required": agent_tool.is_required,
            }
            resolved_tools.append(tool_dict)

            if server and server.name not in mcp_servers:
                mcp_servers[server.name] = {
                    "name": server.name,
                    "url": server.url,
                    "transport": server.transport,
                    "auth_config": server.auth_config or {},
                }

        return {
            "agent": {
                "name": agent.name,
                "display_name": agent.display_name or agent.name,
                "description": agent.description or "",
                "type": agent.type,
                "version": agent.version,
                "port": agent.port or 3010,
                "confidentiality_level": agent.confidentiality_level or "INTERNAL",
                "model": agent.model or "claude-sonnet-4-5-20250929",
                "system_prompt": agent.system_prompt or "",
                "max_budget_usd": agent.max_budget_usd,
            },
            "env_vars": agent.env_vars or {},
            "skills": resolved_skills,
            "tools": resolved_tools,
            "mcp_servers": mcp_servers,
            "classifier": agent.classifier_config or {},
            "memory": agent.memory_config or {"type": "sqlite", "retention_days": 30, "max_messages": 20},
            "cache": agent.cache_config or {"ttl_seconds": 300, "cleanup_interval": 60},
            "rate_limits": agent.rate_limit_config or {"conversation": 20, "api": 100, "budget": 50},
            "metrics": agent.metrics_config or {"prometheus": True, "health_error_threshold": 0.1},
            "webhooks": agent.webhook_config or {},
            "conversation_rules": agent.conversation_rules or "",
            "lightning": agent.lightning_config if hasattr(agent, 'lightning_config') and agent.lightning_config else {"enabled": True, "store_type": "in_memory", "auto_rewards": True},
        }

    def _get_file_list(self, runtime: str, context: Dict[str, Any]) -> List[tuple]:
        """Return (template_path, output_path) tuples based on runtime."""
        if runtime == "typescript-claude-sdk":
            return self._get_typescript_files(context)
        elif runtime == "python-langgraph":
            return self._get_python_files(context)
        else:
            raise ValueError(f"Unsupported runtime: {runtime}")

    def _get_typescript_files(self, context: Dict[str, Any]) -> List[tuple]:
        files = [
            ("src/agent.ts.j2", "src/agent.ts"),
            ("src/tools.ts.j2", "src/tools.ts"),
            ("src/server.ts.j2", "src/server.ts"),
            ("src/types.ts.j2", "src/types.ts"),
            ("src/config/index.ts.j2", "src/config/index.ts"),
            ("src/config/config-manager.ts.j2", "src/config/config-manager.ts"),
            ("src/config/response-templates.ts.j2", "src/config/response-templates.ts"),
            ("src/skills/base.ts.j2", "src/skills/base.ts"),
            ("src/skills/index.ts.j2", "src/skills/index.ts"),
            ("src/utils/classifier.ts.j2", "src/utils/classifier.ts"),
            ("src/utils/memory.ts.j2", "src/utils/memory.ts"),
            ("src/utils/cache.ts.j2", "src/utils/cache.ts"),
            ("src/utils/rate-limiter.ts.j2", "src/utils/rate-limiter.ts"),
            ("src/utils/metrics.ts.j2", "src/utils/metrics.ts"),
            ("package.json.j2", "package.json"),
            ("tsconfig.json.j2", "tsconfig.json"),
            ("Dockerfile.j2", "Dockerfile"),
            ("ecosystem.config.cjs.j2", "ecosystem.config.cjs"),
            # Agent Lightning tracing
            ("src/utils/tracing.ts.j2", "src/utils/tracing.ts"),
        ]

        # Add one file per skill
        for skill in context.get("skills", []):
            code = skill["code"]
            files.append(("src/skills/skill.ts.j2", f"src/skills/{code}.ts"))
            # Generate SKILL.md per skill
            files.append(("src/skills/skill-md.j2", f"src/skills/{code}/SKILL.md"))
            # Resource files (raw content, no template rendering)
            for rpath in skill.get("resource_files", {}):
                files.append((None, f"src/skills/{code}/{rpath}"))

        return files

    def _get_python_files(self, context: Dict[str, Any]) -> List[tuple]:
        files = [
            ("agent.py.j2", "agent.py"),
            ("tools.py.j2", "tools.py"),
            ("skills.py.j2", "skills.py"),
            ("prompts.py.j2", "prompts.py"),
            ("classifier.py.j2", "classifier.py"),
            ("config.py.j2", "config.py"),
            ("main.py.j2", "main.py"),
            ("requirements.txt.j2", "requirements.txt"),
            ("Dockerfile.j2", "Dockerfile"),
            # Agent Lightning tracing
            ("tracing/__init__.py.j2", "tracing/__init__.py"),
            ("tracing/setup.py.j2", "tracing/setup.py"),
        ]

        # Generate SKILL.md and resource files per skill
        for skill in context.get("skills", []):
            code = skill["code"]
            files.append(("skill-md.j2", f"skills/{code}/SKILL.md"))
            for rpath in skill.get("resource_files", {}):
                files.append((None, f"skills/{code}/{rpath}"))

        return files

    @staticmethod
    def _extract_skill_code(template_name: str, output_path: str) -> Optional[str]:
        """Extract skill code from an output path based on template type."""
        parts = Path(output_path).parts
        if template_name == "skill-md.j2":
            # e.g. src/skills/{code}/SKILL.md or skills/{code}/SKILL.md
            try:
                skills_idx = list(parts).index("skills")
                return parts[skills_idx + 1] if len(parts) > skills_idx + 1 else None
            except ValueError:
                return None
        else:
            # e.g. src/skills/{code}.ts
            return Path(output_path).stem

    @staticmethod
    def _resolve_raw_content(context: Dict[str, Any], output_path: str) -> Optional[str]:
        """Resolve raw content for resource files (no template rendering).

        Handles both TS (src/skills/{code}/{path}) and Python (skills/{code}/{path}).
        """
        parts = Path(output_path).parts
        # Find the 'skills' segment and extract code + resource path after it
        try:
            skills_idx = list(parts).index("skills")
        except ValueError:
            return None
        if len(parts) < skills_idx + 3:
            return None
        skill_code = parts[skills_idx + 1]
        resource_path = str(Path(*parts[skills_idx + 2:]))
        for skill in context.get("skills", []):
            if skill["code"] == skill_code:
                return skill.get("resource_files", {}).get(resource_path)
        return None

    def _render_file(
        self,
        runtime: str,
        template_path: str,
        context: Dict[str, Any],
        skill_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        jinja_env = _get_jinja_env(runtime)
        template = jinja_env.get_template(template_path)

        render_ctx = dict(context)
        if skill_context:
            render_ctx["current_skill"] = skill_context

        return template.render(**render_ctx)

    async def generate(self, agent_id: UUID) -> GenerationResult:
        """Generate the full agent project to disk."""
        agent = await self._load_agent(agent_id)
        runtime = agent.runtime or "typescript-claude-sdk"
        context = self._build_context(agent)

        project_dir = Path(settings.generated_projects_path) / agent.name
        project_dir.mkdir(parents=True, exist_ok=True)

        files_generated = []
        file_list = self._get_file_list(runtime, context)

        for template_path, output_path in file_list:
            # Raw resource files (no template rendering)
            if template_path is None:
                raw_content = self._resolve_raw_content(context, output_path)
                if raw_content is None:
                    continue
                full_path = project_dir / output_path
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(raw_content)
                files_generated.append(output_path)
                continue

            # For skill-specific templates, inject the current skill
            skill_ctx = None
            template_name = Path(template_path).name
            if template_name in ("skill.ts.j2", "skill-md.j2"):
                skill_code = self._extract_skill_code(template_name, output_path)
                skill_ctx = next(
                    (s for s in context["skills"] if s["code"] == skill_code),
                    None,
                ) if skill_code else None
                if not skill_ctx:
                    continue

            try:
                content = self._render_file(runtime, template_path, context, skill_ctx)
            except Exception as e:
                return GenerationResult(
                    success=False,
                    project_path=str(project_dir),
                    files_generated=files_generated,
                    error=f"Error rendering {template_path}: {e}",
                )

            full_path = project_dir / output_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content)
            files_generated.append(output_path)

        # Update agent record
        async with async_session_maker() as db:
            result = await db.execute(select(Agent).where(Agent.id == agent_id))
            agent_record = result.scalar_one()
            agent_record.project_path = str(project_dir)
            agent_record.status = "generated"
            await db.commit()

        return GenerationResult(
            success=True,
            project_path=str(project_dir),
            files_generated=files_generated,
        )

    async def preview(self, agent_id: UUID) -> List[FilePreview]:
        """Render templates in-memory without writing to disk."""
        agent = await self._load_agent(agent_id)
        runtime = agent.runtime or "typescript-claude-sdk"
        context = self._build_context(agent)

        previews = []
        file_list = self._get_file_list(runtime, context)

        for template_path, output_path in file_list:
            # Raw resource files
            if template_path is None:
                raw_content = self._resolve_raw_content(context, output_path)
                if raw_content is not None:
                    previews.append(FilePreview(
                        path=output_path,
                        content=raw_content,
                        language=_get_language(output_path),
                    ))
                continue

            skill_ctx = None
            template_name = Path(template_path).name
            if template_name in ("skill.ts.j2", "skill-md.j2"):
                skill_code = self._extract_skill_code(template_name, output_path)
                skill_ctx = next(
                    (s for s in context["skills"] if s["code"] == skill_code),
                    None,
                ) if skill_code else None
                if not skill_ctx:
                    continue

            try:
                content = self._render_file(runtime, template_path, context, skill_ctx)
                previews.append(FilePreview(
                    path=output_path,
                    content=content,
                    language=_get_language(output_path),
                ))
            except Exception as e:
                previews.append(FilePreview(
                    path=output_path,
                    content=f"// Error rendering: {e}",
                    language="text",
                ))

        return previews

    async def list_files(self, agent_id: UUID) -> List[str]:
        """List generated files for an agent."""
        agent = await self._load_agent(agent_id)
        if not agent.project_path:
            return []

        project_dir = Path(agent.project_path)
        if not project_dir.exists():
            return []

        files = []
        for path in sorted(project_dir.rglob("*")):
            if path.is_file():
                files.append(str(path.relative_to(project_dir)))
        return files

    async def read_file(self, agent_id: UUID, file_path: str) -> str:
        """Read a specific generated file."""
        agent = await self._load_agent(agent_id)
        if not agent.project_path:
            raise ValueError("Project not yet generated")

        full_path = Path(agent.project_path) / file_path
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        try:
            full_path.resolve().relative_to(Path(agent.project_path).resolve())
        except ValueError:
            raise ValueError("Invalid file path")

        return full_path.read_text()
