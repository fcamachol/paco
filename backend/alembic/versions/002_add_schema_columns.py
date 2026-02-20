"""add schema columns

Adds missing columns to mcp_servers, agents, skills, infra_agents, and
infrastructures tables.  Replaces the raw ALTER TABLE statements that
previously ran in main.py _ensure_schema_columns() on every startup.

Revision ID: 002_add_schema_columns
Revises: 001_create_processes
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "002_add_schema_columns"
down_revision = "001_create_processes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- mcp_servers ----------------------------------------------------------
    op.add_column(
        "mcp_servers",
        sa.Column("proxy_url", sa.String(500), nullable=True),
    )

    # -- agents (SDK-aligned fields) ------------------------------------------
    op.add_column(
        "agents",
        sa.Column("project_path", sa.Text, nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column(
            "model",
            sa.String(255),
            server_default="claude-sonnet-4-5-20250929",
            nullable=True,
        ),
    )
    op.add_column(
        "agents",
        sa.Column("system_prompt", sa.Text, nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column(
            "permission_mode",
            sa.String(50),
            server_default="default",
            nullable=True,
        ),
    )
    op.add_column(
        "agents",
        sa.Column("max_turns", sa.Integer, nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column("max_budget_usd", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column("max_thinking_tokens", sa.Integer, nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column("sdk_config", JSONB, server_default="{}", nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column("env_vars", JSONB, server_default="{}", nullable=True),
    )

    # -- agents (Agent Lightning) ---------------------------------------------
    op.add_column(
        "agents",
        sa.Column("lightning_config", JSONB, server_default="{}", nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column(
            "runtime",
            sa.String(100),
            server_default="typescript-claude-sdk",
            nullable=True,
        ),
    )

    # -- skills ---------------------------------------------------------------
    op.add_column(
        "skills",
        sa.Column("skill_path", sa.Text, nullable=True),
    )

    # -- infra_agents ---------------------------------------------------------
    op.add_column(
        "infra_agents",
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "infra_agents",
        sa.Column("role", sa.String(50), server_default="primary", nullable=True),
    )
    op.add_column(
        "infra_agents",
        sa.Column("port_override", sa.Integer, nullable=True),
    )
    op.add_column(
        "infra_agents",
        sa.Column("env_overrides", JSONB, server_default="{}", nullable=True),
    )

    # -- infrastructures (Agent Lightning) ------------------------------------
    op.add_column(
        "infrastructures",
        sa.Column("lightning_config", JSONB, server_default="{}", nullable=True),
    )

    # -- infrastructures (hive type) ------------------------------------------
    op.add_column(
        "infrastructures",
        sa.Column(
            "type",
            sa.String(50),
            server_default="orchestrator",
            nullable=True,
        ),
    )

    # -- Drop legacy constraint -----------------------------------------------
    op.execute("ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_type_check")


def downgrade() -> None:
    # -- infrastructures ------------------------------------------------------
    op.drop_column("infrastructures", "type")
    op.drop_column("infrastructures", "lightning_config")

    # -- infra_agents ---------------------------------------------------------
    op.drop_column("infra_agents", "env_overrides")
    op.drop_column("infra_agents", "port_override")
    op.drop_column("infra_agents", "role")
    op.drop_column("infra_agents", "agent_id")

    # -- skills ---------------------------------------------------------------
    op.drop_column("skills", "skill_path")

    # -- agents (Agent Lightning) ---------------------------------------------
    op.drop_column("agents", "runtime")
    op.drop_column("agents", "lightning_config")

    # -- agents (SDK-aligned fields) ------------------------------------------
    op.drop_column("agents", "env_vars")
    op.drop_column("agents", "sdk_config")
    op.drop_column("agents", "max_thinking_tokens")
    op.drop_column("agents", "max_budget_usd")
    op.drop_column("agents", "max_turns")
    op.drop_column("agents", "permission_mode")
    op.drop_column("agents", "system_prompt")
    op.drop_column("agents", "model")
    op.drop_column("agents", "project_path")

    # -- mcp_servers ----------------------------------------------------------
    op.drop_column("mcp_servers", "proxy_url")
