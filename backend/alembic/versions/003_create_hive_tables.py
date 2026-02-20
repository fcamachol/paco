"""create hive tables

Creates the hive_coordinators, hive_tasks, and hive_messages tables
for the Hive multi-agent coordination system.

Revision ID: 003_create_hive_tables
Revises: 002_add_schema_columns
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "003_create_hive_tables"
down_revision = "002_add_schema_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hive_coordinators",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "coordinator_model",
            sa.String(255),
            server_default="claude-sonnet-4-5-20250929",
        ),
        sa.Column(
            "coordinator_temperature",
            sa.Float,
            server_default="0.1",
        ),
        sa.Column("decomposition_prompt", sa.Text, nullable=True),
        sa.Column("max_concurrent_tasks", sa.Integer, server_default="5"),
        sa.Column("task_timeout", sa.Integer, server_default="300"),
        sa.Column("max_retries", sa.Integer, server_default="2"),
        sa.Column(
            "aggregation_strategy", sa.String(50), server_default="merge"
        ),
        sa.Column("aggregation_prompt", sa.Text, nullable=True),
        sa.Column("plan_mode_enabled", sa.Boolean, server_default="true"),
        sa.Column("status", sa.String(50), server_default="stopped"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "hive_tasks",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("execution_id", sa.String(255), nullable=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("active_form", sa.String(500), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("assigned_agent_slug", sa.String(255), nullable=True),
        sa.Column("priority", sa.Integer, server_default="0"),
        sa.Column("result", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("blocked_by", JSONB, server_default="'[]'"),
        sa.Column("blocks", JSONB, server_default="'[]'"),
        sa.Column("metadata", JSONB, server_default="'{}'"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "hive_messages",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("execution_id", sa.String(255), nullable=True),
        sa.Column("message_type", sa.String(50), server_default="message"),
        sa.Column("sender_slug", sa.String(255), nullable=True),
        sa.Column("recipient_slug", sa.String(255), nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("summary", sa.String(500), nullable=True),
        sa.Column("metadata", JSONB, server_default="'{}'"),
        sa.Column("status", sa.String(50), server_default="sent"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("hive_messages")
    op.drop_table("hive_tasks")
    op.drop_table("hive_coordinators")
