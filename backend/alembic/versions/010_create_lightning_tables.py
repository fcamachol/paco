"""create lightning_datasets and lightning_training_runs tables

Tables for Agent Lightning RL optimization: datasets and training runs.

Revision ID: 010_create_lightning_tables
Revises: 009_create_global_settings
Create Date: 2026-02-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "010_create_lightning_tables"
down_revision = "009_create_global_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()

    if "lightning_datasets" not in tables:
        op.create_table(
            "lightning_datasets",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
            sa.Column("items", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
            sa.Column("item_count", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "lightning_training_runs" not in tables:
        op.create_table(
            "lightning_training_runs",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
            sa.Column("dataset_id", UUID(as_uuid=True), sa.ForeignKey("lightning_datasets.id", ondelete="SET NULL"), nullable=True),
            sa.Column("algorithm", sa.String(50), server_default=sa.text("'apo'"), nullable=False),
            sa.Column("status", sa.String(50), server_default=sa.text("'pending'"), nullable=False),
            sa.Column("reward_function", sa.String(50), server_default=sa.text("'llm_judge'"), nullable=False),
            sa.Column("reward_config", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("current_epoch", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("max_epochs", sa.Integer, server_default=sa.text("10"), nullable=False),
            sa.Column("best_reward", sa.Numeric(10, 6), nullable=True),
            sa.Column("metrics", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("optimized_prompt", sa.Text, nullable=True),
            sa.Column("config", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("lightning_training_runs")
    op.drop_table("lightning_datasets")
