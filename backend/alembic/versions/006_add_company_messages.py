"""add company messages

Creates the company_messages table for inter-agent messaging.
Adds delegation fields to company_tasks (requested_by_slug, parent_task_id).
Adds supervisor mode fields to company_configs.

Revision ID: 006_add_company_messages
Revises: 005_create_company_tables
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "006_add_company_messages"
down_revision = "005_create_company_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- company_messages table ------------------------------------------------
    op.create_table(
        "company_messages",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), primary_key=True),
        sa.Column("infrastructure_id", UUID(as_uuid=True), sa.ForeignKey("infrastructures.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_slug", sa.String(255), nullable=False),
        sa.Column("recipient_slug", sa.String(255), nullable=True),
        sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("company_departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("message_type", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(50), server_default="sent"),
        sa.Column("parent_message_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_company_messages_infra_recipient", "company_messages", ["infrastructure_id", "recipient_slug"])
    op.create_index("ix_company_messages_infra_sender", "company_messages", ["infrastructure_id", "sender_slug"])
    op.create_index("ix_company_messages_status", "company_messages", ["status"])

    # -- company_tasks: add delegation fields ----------------------------------
    op.add_column("company_tasks", sa.Column("requested_by_slug", sa.String(255), nullable=True))
    op.add_column("company_tasks", sa.Column("parent_task_id", UUID(as_uuid=True), nullable=True))

    # -- company_configs: add supervisor mode fields ---------------------------
    op.add_column("company_configs", sa.Column("supervisor_mode", sa.Boolean, server_default=sa.text("true")))
    op.add_column("company_configs", sa.Column("missed_heartbeat_threshold", sa.Integer, server_default=sa.text("3")))
    op.add_column("company_configs", sa.Column("auto_recovery_enabled", sa.Boolean, server_default=sa.text("true")))
    op.add_column("company_configs", sa.Column("morning_standup_enabled", sa.Boolean, server_default=sa.text("true")))
    op.add_column("company_configs", sa.Column("standup_cron", sa.String(255), server_default="0 9 * * 1-5"))


def downgrade() -> None:
    # -- company_configs: remove supervisor mode fields
    op.drop_column("company_configs", "standup_cron")
    op.drop_column("company_configs", "morning_standup_enabled")
    op.drop_column("company_configs", "auto_recovery_enabled")
    op.drop_column("company_configs", "missed_heartbeat_threshold")
    op.drop_column("company_configs", "supervisor_mode")

    # -- company_tasks: remove delegation fields
    op.drop_column("company_tasks", "parent_task_id")
    op.drop_column("company_tasks", "requested_by_slug")

    # -- company_messages table
    op.drop_index("ix_company_messages_status")
    op.drop_index("ix_company_messages_infra_sender")
    op.drop_index("ix_company_messages_infra_recipient")
    op.drop_table("company_messages")
