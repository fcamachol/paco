"""add session_runs and session_messages tables

Creates session_runs and session_messages tables for tracking
conversational sessions, and adds session_run_id to executions.

Revision ID: 015_add_session_runs_tables
Revises: 014_add_external_services
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "015_add_session_runs_tables"
down_revision = "014_add_external_services"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # --- session_runs table ---
    if "session_runs" not in tables:
        op.create_table(
            "session_runs",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
            sa.Column("user_id", sa.String(255), nullable=True),
            sa.Column("source", sa.String(50), server_default="playground", nullable=True),
            sa.Column("title", sa.String(500), nullable=True),
            sa.Column("status", sa.String(50), server_default="active", nullable=True),
            sa.Column("system_prompt", sa.Text, nullable=True),
            sa.Column("system_prompt_hash", sa.String(64), nullable=True),
            sa.Column("model", sa.String(255), nullable=True),
            sa.Column("message_count", sa.Integer, server_default="0", nullable=True),
            sa.Column("total_input_tokens", sa.Integer, server_default="0", nullable=True),
            sa.Column("total_output_tokens", sa.Integer, server_default="0", nullable=True),
            sa.Column("total_cost", sa.Numeric(10, 6), server_default="0", nullable=True),
            sa.Column("total_duration_ms", sa.Integer, server_default="0", nullable=True),
            sa.Column("integrity_hash", sa.String(64), nullable=True),
            sa.Column("metadata", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        )
        op.create_index("ix_session_runs_agent_id", "session_runs", ["agent_id"])
        op.create_index("ix_session_runs_user_id", "session_runs", ["user_id"])
        op.create_index("ix_session_runs_started_at", "session_runs", ["started_at"])
        op.create_index("ix_session_runs_status", "session_runs", ["status"])
        op.create_index("ix_session_runs_source", "session_runs", ["source"])

    # --- session_messages table ---
    if "session_messages" not in tables:
        op.create_table(
            "session_messages",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("session_run_id", UUID(as_uuid=True), sa.ForeignKey("session_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("execution_id", UUID(as_uuid=True), sa.ForeignKey("executions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("sequence_number", sa.Integer, nullable=False),
            sa.Column("role", sa.String(50), nullable=False),
            sa.Column("content_text", sa.Text, nullable=True),
            sa.Column("content_blocks", JSONB, nullable=True),
            sa.Column("tool_name", sa.String(255), nullable=True),
            sa.Column("tool_call_id", sa.String(255), nullable=True),
            sa.Column("input_tokens", sa.Integer, nullable=True),
            sa.Column("output_tokens", sa.Integer, nullable=True),
            sa.Column("cost", sa.Numeric(10, 6), nullable=True),
            sa.Column("latency_ms", sa.Integer, nullable=True),
            sa.Column("model", sa.String(255), nullable=True),
            sa.Column("stop_reason", sa.String(50), nullable=True),
            sa.Column("raw_request", JSONB, nullable=True),
            sa.Column("raw_response", JSONB, nullable=True),
            sa.Column("thinking_content", sa.Text, nullable=True),
            sa.Column("message_hash", sa.String(64), nullable=True),
            sa.Column("metadata", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        )
        op.create_index("ix_session_messages_session_run_id", "session_messages", ["session_run_id"])
        op.create_index("ix_session_messages_role", "session_messages", ["role"])
        op.create_index("ix_session_messages_created_at", "session_messages", ["created_at"])
        op.create_index("ix_session_messages_tool_name", "session_messages", ["tool_name"])
        op.execute(
            "CREATE INDEX ix_session_messages_content_fts ON session_messages "
            "USING GIN (to_tsvector('english', coalesce(content_text, '')))"
        )
        op.execute(
            "CREATE INDEX ix_session_messages_content_blocks ON session_messages "
            "USING GIN (content_blocks jsonb_path_ops)"
        )

    # --- immutability trigger on session_messages ---
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_session_message_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'session_messages rows are immutable — updates and deletes are not allowed';
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_session_messages_immutable'
            ) THEN
                CREATE TRIGGER trg_session_messages_immutable
                    BEFORE UPDATE OR DELETE ON session_messages
                    FOR EACH ROW EXECUTE FUNCTION prevent_session_message_mutation();
            END IF;
        END;
        $$;
    """)

    # --- add session_run_id column to executions ---
    columns = [col["name"] for col in inspector.get_columns("executions")]
    if "session_run_id" not in columns:
        op.add_column(
            "executions",
            sa.Column(
                "session_run_id",
                UUID(as_uuid=True),
                sa.ForeignKey("session_runs.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index("ix_executions_session_run_id", "executions", ["session_run_id"])


def downgrade() -> None:
    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS trg_session_messages_immutable ON session_messages")
    op.execute("DROP FUNCTION IF EXISTS prevent_session_message_mutation()")

    # Drop session_run_id column from executions
    op.drop_index("ix_executions_session_run_id", table_name="executions")
    op.drop_column("executions", "session_run_id")

    # Drop session_messages table
    op.drop_table("session_messages")

    # Drop session_runs table
    op.drop_table("session_runs")
