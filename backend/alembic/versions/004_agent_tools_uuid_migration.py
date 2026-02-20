"""agent tools uuid migration

Migrates the agent_tools table from a composite primary key (agent_id, tool_id)
to a UUID primary key with a unique constraint on (agent_id, tool_id).
Renames is_enabled to is_required.

Revision ID: 004_agent_tools_uuid
Revises: 003_create_hive_tables
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "004_agent_tools_uuid"
down_revision = "003_create_hive_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if the table already has a UUID 'id' column (migration already applied).
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'agent_tools' AND column_name = 'id'"
        )
    )
    if result.first():
        # Already migrated -- nothing to do.
        return

    # 1. Rename old table
    op.rename_table("agent_tools", "agent_tools_old")

    # 2. Create new table with UUID PK
    op.create_table(
        "agent_tools",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tool_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tools.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_required", sa.Boolean, server_default="true"),
        sa.Column("config_overrides", JSONB, server_default="'{}'"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("agent_id", "tool_id", name="uq_agent_tool"),
    )

    # 3. Copy data (map old is_enabled -> new is_required)
    op.execute(
        """
        INSERT INTO agent_tools (agent_id, tool_id, is_required, config_overrides, created_at)
        SELECT agent_id, tool_id, COALESCE(is_enabled, true), config_overrides, created_at
        FROM agent_tools_old
        """
    )

    # 4. Drop legacy table
    op.drop_table("agent_tools_old")


def downgrade() -> None:
    # Recreate the old composite-PK table
    op.rename_table("agent_tools", "agent_tools_new")

    op.create_table(
        "agent_tools",
        sa.Column(
            "agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tool_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tools.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("is_enabled", sa.Boolean, server_default="true"),
        sa.Column("config_overrides", JSONB, server_default="'{}'"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    op.execute(
        """
        INSERT INTO agent_tools (agent_id, tool_id, is_enabled, config_overrides, created_at)
        SELECT agent_id, tool_id, is_required, config_overrides, created_at
        FROM agent_tools_new
        """
    )

    op.drop_table("agent_tools_new")
