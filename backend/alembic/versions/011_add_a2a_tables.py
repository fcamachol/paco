"""add A2A protocol tables and agent columns

Creates a2a_tasks table for tracking inbound/outbound A2A tasks,
external_a2a_agents table for remote agent registry, and adds
a2a_enabled + a2a_skills columns to the agents table.

Revision ID: 011_add_a2a_tables
Revises: 010_create_lightning_tables
Create Date: 2026-02-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "011_add_a2a_tables"
down_revision = "010_create_lightning_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # --- a2a_tasks table ---
    if "a2a_tasks" not in tables:
        op.create_table(
            "a2a_tasks",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("a2a_task_id", sa.String(255), unique=True, nullable=False),
            sa.Column("direction", sa.String(20), nullable=False),
            sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String(50), server_default="submitted", nullable=False),
            sa.Column("input_message", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("artifacts", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
            sa.Column("history", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
            sa.Column("remote_agent_url", sa.String(1000), nullable=True),
            sa.Column("remote_agent_name", sa.String(255), nullable=True),
            sa.Column("hive_task_id", UUID(as_uuid=True), sa.ForeignKey("hive_tasks.id", ondelete="SET NULL"), nullable=True),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("metadata", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )

    # --- external_a2a_agents table ---
    if "external_a2a_agents" not in tables:
        op.create_table(
            "external_a2a_agents",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("url", sa.String(1000), nullable=False),
            sa.Column("name", sa.String(255), nullable=True),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("agent_card", JSONB, nullable=True),
            sa.Column("last_discovered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # --- Add A2A columns to agents table ---
    if "agents" in tables:
        columns = [col["name"] for col in inspector.get_columns("agents")]
        if "a2a_enabled" not in columns:
            op.add_column("agents", sa.Column("a2a_enabled", sa.Boolean, server_default=sa.text("false"), nullable=False))
        if "a2a_skills" not in columns:
            op.add_column("agents", sa.Column("a2a_skills", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("agents", "a2a_skills")
    op.drop_column("agents", "a2a_enabled")
    op.drop_table("external_a2a_agents")
    op.drop_table("a2a_tasks")
