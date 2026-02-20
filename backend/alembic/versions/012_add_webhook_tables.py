"""add webhook tables for bidirectional webhooks

Creates inbound_webhooks, inbound_webhook_events, webhooks, and
webhook_deliveries tables for the bidirectional webhook system.

Revision ID: 012_add_webhook_tables
Revises: 011_add_a2a_tables
Create Date: 2026-02-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "012_add_webhook_tables"
down_revision = "011_add_a2a_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # --- inbound_webhooks table ---
    if "inbound_webhooks" not in tables:
        op.create_table(
            "inbound_webhooks",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("token", sa.String(64), unique=True, nullable=False),
            sa.Column("source", sa.String(100), nullable=True),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("processing_mode", sa.String(20), server_default="async", nullable=False),
            sa.Column("secret", sa.String(255), nullable=True),
            sa.Column("signature_header", sa.String(100), nullable=True),
            sa.Column("prompt_template", sa.Text, nullable=True),
            sa.Column("total_events", sa.Integer, server_default="0", nullable=False),
            sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # --- inbound_webhook_events table ---
    if "inbound_webhook_events" not in tables:
        op.create_table(
            "inbound_webhook_events",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("webhook_id", UUID(as_uuid=True), sa.ForeignKey("inbound_webhooks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("source_ip", sa.String(45), nullable=True),
            sa.Column("headers", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("payload", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("prompt_sent", sa.Text, nullable=True),
            sa.Column("status", sa.String(50), server_default="received", nullable=False),
            sa.Column("agent_response", JSONB, nullable=True),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("processing_ms", sa.Integer, nullable=True),
            sa.Column("signature_valid", sa.Boolean, nullable=True),
            sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_inbound_webhook_events_webhook_id", "inbound_webhook_events", ["webhook_id"])
        op.create_index("ix_inbound_webhook_events_received_at", "inbound_webhook_events", ["received_at"])

    # --- webhooks table (outbound) ---
    if "webhooks" not in tables:
        op.create_table(
            "webhooks",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("url", sa.String(2048), nullable=False),
            sa.Column("secret", sa.Text, nullable=True),
            sa.Column("events", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
            sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=True),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", "name", name="uq_webhook_user_name"),
        )

    # --- webhook_deliveries table ---
    if "webhook_deliveries" not in tables:
        op.create_table(
            "webhook_deliveries",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("webhook_id", UUID(as_uuid=True), sa.ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(100), nullable=False),
            sa.Column("payload", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("status", sa.String(50), server_default="pending", nullable=False),
            sa.Column("response_status_code", sa.Integer, nullable=True),
            sa.Column("response_body", sa.Text, nullable=True),
            sa.Column("attempts", sa.Integer, server_default="0", nullable=False),
            sa.Column("max_attempts", sa.Integer, server_default="5", nullable=False),
            sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_webhook_deliveries_webhook_id", "webhook_deliveries", ["webhook_id"])
        op.create_index("ix_webhook_deliveries_created_at", "webhook_deliveries", ["created_at"])


def downgrade() -> None:
    op.drop_table("webhook_deliveries")
    op.drop_table("webhooks")
    op.drop_table("inbound_webhook_events")
    op.drop_table("inbound_webhooks")
