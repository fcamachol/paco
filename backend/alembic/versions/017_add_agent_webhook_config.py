"""Add webhook_config, conversation_rules, classifier_config to agents

Revision ID: 017_add_agent_webhook_config
Revises: 016_add_skill_keywords
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "017_add_agent_webhook_config"
down_revision = "016_add_skill_keywords"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [c["name"] for c in inspector.get_columns("agents")]

    if "webhook_config" not in existing_columns:
        op.add_column(
            "agents",
            sa.Column("webhook_config", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=True),
        )
    if "conversation_rules" not in existing_columns:
        op.add_column(
            "agents",
            sa.Column("conversation_rules", sa.Text(), nullable=True),
        )
    if "classifier_config" not in existing_columns:
        op.add_column(
            "agents",
            sa.Column("classifier_config", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("agents", "classifier_config")
    op.drop_column("agents", "conversation_rules")
    op.drop_column("agents", "webhook_config")
