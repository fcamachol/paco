"""create global_settings table

Stores persistent key-value settings (API keys, etc.) managed via the UI.

Revision ID: 009_create_global_settings
Revises: 008_add_managed_mcp_columns
Create Date: 2026-02-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "009_create_global_settings"
down_revision = "008_add_managed_mcp_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "global_settings" not in tables:
        op.create_table(
            "global_settings",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("key", sa.String(255), unique=True, nullable=False),
            sa.Column("value", sa.Text, nullable=False),
            sa.Column("is_secret", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("global_settings")
