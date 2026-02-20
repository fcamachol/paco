"""
PACO Infrastructure Code Generator

Generates complete multi-agent infrastructure projects from DB config
using Jinja2 templates derived from the gobierno-queretaro pattern.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from jinja2 import Environment, FileSystemLoader
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.models import Infrastructure, InfraAgent, InfraOrchestrator, HiveCoordinator
from app.db.session import async_session_maker


@dataclass
class FilePreview:
    path: str
    content: str
    language: str = "python"


@dataclass
class GenerationResult:
    success: bool
    project_path: str
    files_generated: List[str] = field(default_factory=list)
    error: Optional[str] = None


# Template directory
TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates" / "infrastructure"

# Jinja2 environment
jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)


def _get_language(path: str) -> str:
    ext = Path(path).suffix
    return {
        ".py": "python",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".sql": "sql",
        ".txt": "text",
        ".sh": "bash",
        ".env": "bash",
    }.get(ext, "text")


class InfraGenerator:
    """Generates infrastructure code from DB configuration."""

    async def _load_infra(self, infra_id: UUID) -> Infrastructure:
        async with async_session_maker() as db:
            result = await db.execute(
                select(Infrastructure)
                .where(Infrastructure.id == infra_id)
                .options(
                    selectinload(Infrastructure.orchestrator),
                    selectinload(Infrastructure.agents),
                    selectinload(Infrastructure.hive_coordinator),
                )
            )
            infra = result.scalar_one_or_none()
            if not infra:
                raise ValueError(f"Infrastructure {infra_id} not found")
            return infra

    def _build_context(self, infra: Infrastructure) -> Dict[str, Any]:
        """Build the template context from the infrastructure model."""
        agents = sorted(infra.agents, key=lambda a: a.agent_id_slug)

        # Build agent dicts for templates
        agent_dicts = []
        for i, agent in enumerate(agents):
            agent_dicts.append({
                "agent_id_slug": agent.agent_id_slug,
                "display_name": agent.display_name or agent.agent_id_slug,
                "description": agent.description or "",
                "category_code": agent.category_code,
                "system_prompts": agent.system_prompts or {},
                "tools_config": agent.tools_config or [],
                "task_types": agent.task_types or ["general_inquiry"],
                "keywords": agent.keywords or [],
                "confidentiality_level": agent.confidentiality_level or "INTERNAL",
                "capabilities": agent.capabilities or {},
                "port": infra.port_range_start + 1 + i,
            })

        orch_dict = {}
        if infra.orchestrator:
            orch = infra.orchestrator
            orch_dict = {
                "classification_model": orch.classification_model or "claude-sonnet-4-5-20250929",
                "classification_temperature": float(orch.classification_temperature or 0.1),
                "keyword_map": orch.keyword_map or {},
                "classification_prompt": orch.classification_prompt,
                "fallback_agent": orch.fallback_agent or (agent_dicts[0]["category_code"] if agent_dicts else "ATC"),
                "agent_timeout": float(orch.agent_timeout or 30.0),
                "circuit_breaker_config": orch.circuit_breaker_config or {},
            }

        infra_type = getattr(infra, 'type', 'orchestrator') or 'orchestrator'

        coordinator_dict = {}
        if hasattr(infra, 'hive_coordinator') and infra.hive_coordinator:
            coord = infra.hive_coordinator
            coordinator_dict = {
                "coordinator_model": coord.coordinator_model or "claude-sonnet-4-5-20250929",
                "coordinator_temperature": float(coord.coordinator_temperature or 0.1),
                "decomposition_prompt": coord.decomposition_prompt,
                "max_concurrent_tasks": coord.max_concurrent_tasks or 5,
                "task_timeout": coord.task_timeout or 300,
                "max_retries": coord.max_retries or 2,
                "aggregation_strategy": coord.aggregation_strategy or "merge",
                "aggregation_prompt": coord.aggregation_prompt,
                "plan_mode_enabled": coord.plan_mode_enabled if coord.plan_mode_enabled is not None else True,
            }

        return {
            "infra": {
                "name": infra.name,
                "display_name": infra.display_name or infra.name,
                "description": infra.description or "",
                "port_range_start": infra.port_range_start,
                "db_name": infra.db_name or infra.name.lower().replace("-", "_"),
                "env_config": infra.env_config or {},
                "security_config": infra.security_config or {},
                "redis_config": infra.redis_config or {},
            },
            "infra_type": infra_type,
            "orchestrator": orch_dict,
            "coordinator": coordinator_dict,
            "agents": agent_dicts,
            "lightning": infra.lightning_config if hasattr(infra, 'lightning_config') and infra.lightning_config else {
                "enabled": True, "store_type": "in_memory", "otlp_endpoint": None,
                "enable_store_server": True, "store_server_port": 4318,
                "auto_rewards": True, "feedback_endpoint": True, "training_scaffolding": True,
            },
        }

    def _get_file_list(self, context: Dict[str, Any]) -> List[tuple]:
        """Return list of (template_path, output_path) tuples."""
        files = []
        infra_type = context.get("infra_type", "orchestrator")

        # Root files
        files.append(("docker-compose.yml.j2", "docker-compose.yml"))
        files.append((".env.example.j2", ".env.example"))

        if infra_type == "hive":
            # Coordinator files
            coord_templates = [
                "__init__.py", "main.py", "config.py", "decomposer.py",
                "task_manager.py", "aggregator.py", "messenger.py",
                "Dockerfile", "requirements.txt",
            ]
            for t in coord_templates:
                files.append((f"hive/coordinator/{t}.j2", f"coordinator/{t}"))

            # Worker files (for each agent)
            worker_templates = [
                "__init__.py", "main.py", "config.py", "task_loop.py",
                "Dockerfile", "requirements.txt",
            ]
            for agent in context["agents"]:
                slug = agent["agent_id_slug"]
                for t in worker_templates:
                    files.append((f"hive/worker/{t}.j2", f"hive_worker/{slug}/{t}"))

            # Still generate agent files (reused by workers)
            agent_templates = [
                "__init__.py", "agent.py", "config.py", "main.py",
                "prompts.py", "tools.py", "Dockerfile", "requirements.txt",
            ]
            for agent in context["agents"]:
                slug = agent["agent_id_slug"]
                for t in agent_templates:
                    files.append((f"agent/{t}.j2", f"agents/{slug}/{t}"))
        else:
            # Orchestrator files
            orch_templates = [
                "__init__.py", "main.py", "config.py", "classifier.py",
                "router.py", "Dockerfile", "requirements.txt",
            ]
            for t in orch_templates:
                files.append((f"orchestrator/{t}.j2", f"orchestrator/{t}"))

            # Agent files (for each agent)
            agent_templates = [
                "__init__.py", "agent.py", "config.py", "main.py",
                "prompts.py", "tools.py", "Dockerfile", "requirements.txt",
            ]
            for agent in context["agents"]:
                slug = agent["agent_id_slug"]
                for t in agent_templates:
                    files.append((f"agent/{t}.j2", f"agents/{slug}/{t}"))

            # Feedback endpoint
            files.append(("orchestrator/feedback.py.j2", "orchestrator/feedback.py"))

        # Shared files (used by both types)
        shared_templates = [
            ("shared/__init__.py.j2", "shared/__init__.py"),
            ("shared/context/__init__.py.j2", "shared/context/__init__.py"),
            ("shared/context/session.py.j2", "shared/context/session.py"),
            ("shared/security/__init__.py.j2", "shared/security/__init__.py"),
            ("shared/security/manager.py.j2", "shared/security/manager.py"),
            ("shared/security/audit.py.j2", "shared/security/audit.py"),
            ("shared/utils/__init__.py.j2", "shared/utils/__init__.py"),
            ("shared/utils/http_client.py.j2", "shared/utils/http_client.py"),
            ("shared/db/__init__.py.j2", "shared/db/__init__.py"),
            ("shared/db/init.sql.j2", "shared/db/init.sql"),
        ]
        files.extend(shared_templates)

        # Agent Lightning tracing
        shared_templates.extend([
            ("shared/tracing/__init__.py.j2", "shared/tracing/__init__.py"),
            ("shared/tracing/setup.py.j2", "shared/tracing/setup.py"),
            ("shared/tracing/auto_rewards.py.j2", "shared/tracing/auto_rewards.py"),
        ])

        # Training scaffolding
        training_templates = [
            ("training/__init__.py.j2", "training/__init__.py"),
            ("training/requirements.txt.j2", "training/requirements.txt"),
            ("training/optimize_agent.py.j2", "training/optimize_agent.py"),
            ("training/optimize_classifier.py.j2", "training/optimize_classifier.py"),
            ("training/train_classifier_rl.py.j2", "training/train_classifier_rl.py"),
        ]
        files.extend(training_templates)

        return files

    def _render_file(
        self,
        template_path: str,
        context: Dict[str, Any],
        agent_context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Render a single template file."""
        template = jinja_env.get_template(template_path)

        render_ctx = dict(context)
        if agent_context:
            render_ctx["agent"] = agent_context

        return template.render(**render_ctx)

    async def generate(self, infra_id: UUID) -> GenerationResult:
        """Generate the full infrastructure project to disk."""
        infra = await self._load_infra(infra_id)
        context = self._build_context(infra)

        project_dir = Path(settings.generated_projects_path) / infra.name
        project_dir.mkdir(parents=True, exist_ok=True)

        files_generated = []
        file_list = self._get_file_list(context)

        for template_path, output_path in file_list:
            # Determine if this is an agent-specific template
            agent_ctx = None
            if template_path.startswith("agent/"):
                # Extract agent slug from output path
                parts = output_path.split("/")
                if len(parts) >= 2:
                    slug = parts[1]
                    agent_ctx = next(
                        (a for a in context["agents"] if a["agent_id_slug"] == slug),
                        None,
                    )
            elif template_path.startswith("hive/worker/"):
                # Extract agent slug from output path (hive_worker/{slug}/...)
                parts = output_path.split("/")
                if len(parts) >= 2:
                    slug = parts[1]
                    agent_ctx = next(
                        (a for a in context["agents"] if a["agent_id_slug"] == slug),
                        None,
                    )

            try:
                content = self._render_file(template_path, context, agent_ctx)
            except Exception as e:
                return GenerationResult(
                    success=False,
                    project_path=str(project_dir),
                    files_generated=files_generated,
                    error=f"Error rendering {template_path}: {e}",
                )

            # Write file
            full_path = project_dir / output_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content)
            files_generated.append(output_path)

        # Update infrastructure record
        async with async_session_maker() as db:
            result = await db.execute(
                select(Infrastructure).where(Infrastructure.id == infra_id)
            )
            infra_record = result.scalar_one()
            infra_record.project_path = str(project_dir)
            infra_record.status = "generated"
            await db.commit()

        return GenerationResult(
            success=True,
            project_path=str(project_dir),
            files_generated=files_generated,
        )

    async def preview(self, infra_id: UUID) -> List[FilePreview]:
        """Render templates in-memory without writing to disk."""
        infra = await self._load_infra(infra_id)
        context = self._build_context(infra)

        previews = []
        file_list = self._get_file_list(context)

        for template_path, output_path in file_list:
            agent_ctx = None
            if template_path.startswith("agent/"):
                parts = output_path.split("/")
                if len(parts) >= 2:
                    slug = parts[1]
                    agent_ctx = next(
                        (a for a in context["agents"] if a["agent_id_slug"] == slug),
                        None,
                    )
            elif template_path.startswith("hive/worker/"):
                parts = output_path.split("/")
                if len(parts) >= 2:
                    slug = parts[1]
                    agent_ctx = next(
                        (a for a in context["agents"] if a["agent_id_slug"] == slug),
                        None,
                    )

            try:
                content = self._render_file(template_path, context, agent_ctx)
                previews.append(FilePreview(
                    path=output_path,
                    content=content,
                    language=_get_language(output_path),
                ))
            except Exception as e:
                previews.append(FilePreview(
                    path=output_path,
                    content=f"# Error rendering: {e}",
                    language="text",
                ))

        return previews

    async def list_files(self, infra_id: UUID) -> List[str]:
        """List generated files for an infrastructure."""
        infra = await self._load_infra(infra_id)
        if not infra.project_path:
            return []

        project_dir = Path(infra.project_path)
        if not project_dir.exists():
            return []

        files = []
        for path in sorted(project_dir.rglob("*")):
            if path.is_file():
                files.append(str(path.relative_to(project_dir)))
        return files

    async def read_file(self, infra_id: UUID, file_path: str) -> str:
        """Read a specific generated file."""
        infra = await self._load_infra(infra_id)
        if not infra.project_path:
            raise ValueError("Project not yet generated")

        full_path = Path(infra.project_path) / file_path
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Security: ensure path doesn't escape project directory
        try:
            full_path.resolve().relative_to(Path(infra.project_path).resolve())
        except ValueError:
            raise ValueError("Invalid file path")

        return full_path.read_text()

    async def regenerate_agent(self, infra_id: UUID, slug: str) -> GenerationResult:
        """Regenerate only a specific agent's files."""
        infra = await self._load_infra(infra_id)
        if not infra.project_path:
            raise ValueError("Project not yet generated")

        context = self._build_context(infra)
        project_dir = Path(infra.project_path)

        agent_ctx = next(
            (a for a in context["agents"] if a["agent_id_slug"] == slug),
            None,
        )
        if not agent_ctx:
            return GenerationResult(
                success=False,
                project_path=str(project_dir),
                error=f"Agent '{slug}' not found in context",
            )

        agent_templates = [
            "__init__.py", "agent.py", "config.py", "main.py",
            "prompts.py", "tools.py", "Dockerfile", "requirements.txt",
        ]

        files_generated = []
        for t in agent_templates:
            template_path = f"agent/{t}.j2"
            output_path = f"agents/{slug}/{t}"

            try:
                content = self._render_file(template_path, context, agent_ctx)
                full_path = project_dir / output_path
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(content)
                files_generated.append(output_path)
            except Exception as e:
                return GenerationResult(
                    success=False,
                    project_path=str(project_dir),
                    files_generated=files_generated,
                    error=f"Error rendering {template_path}: {e}",
                )

        return GenerationResult(
            success=True,
            project_path=str(project_dir),
            files_generated=files_generated,
        )

    async def regenerate_orchestrator(self, infra_id: UUID) -> GenerationResult:
        """Regenerate only orchestrator files."""
        infra = await self._load_infra(infra_id)
        if not infra.project_path:
            raise ValueError("Project not yet generated")

        context = self._build_context(infra)
        project_dir = Path(infra.project_path)

        orch_templates = [
            "__init__.py", "main.py", "config.py", "classifier.py",
            "router.py", "Dockerfile", "requirements.txt",
        ]

        files_generated = []
        for t in orch_templates:
            template_path = f"orchestrator/{t}.j2"
            output_path = f"orchestrator/{t}"

            try:
                content = self._render_file(template_path, context)
                full_path = project_dir / output_path
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(content)
                files_generated.append(output_path)
            except Exception as e:
                return GenerationResult(
                    success=False,
                    project_path=str(project_dir),
                    files_generated=files_generated,
                    error=f"Error rendering {template_path}: {e}",
                )

        # Also regenerate docker-compose.yml (may have new service blocks)
        try:
            compose_content = self._render_file("docker-compose.yml.j2", context)
            (project_dir / "docker-compose.yml").write_text(compose_content)
            files_generated.append("docker-compose.yml")
        except Exception as e:
            return GenerationResult(
                success=False,
                project_path=str(project_dir),
                files_generated=files_generated,
                error=f"Error rendering docker-compose.yml: {e}",
            )

        return GenerationResult(
            success=True,
            project_path=str(project_dir),
            files_generated=files_generated,
        )
