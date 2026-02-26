"""add keywords column to skills table

Stores deterministic routing keywords per skill for keyword-first
classification in the playground (keyword → sticky → LLM fallback).

Revision ID: 016_add_skill_keywords
Revises: 015_add_session_runs_tables
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "016_add_skill_keywords"
down_revision = "015_add_session_runs_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [c["name"] for c in inspector.get_columns("skills")]

    if "keywords" not in existing_columns:
        op.add_column(
            "skills",
            sa.Column("keywords", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        )


def downgrade() -> None:
    op.drop_column("skills", "keywords")
