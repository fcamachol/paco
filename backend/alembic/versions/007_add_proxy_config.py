"""add proxy_config to mcp_servers and tools

Adds proxy_config JSONB column to both mcp_servers and tools tables.
Migrates existing proxy_url values into the new format.

Revision ID: 007_add_proxy_config
Revises: 006_add_company_messages
Create Date: 2026-02-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "007_add_proxy_config"
down_revision = "006_add_company_messages"
branch_labels = None
depends_on = None


def _has_column(table, column):
    return column in [c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)]


def upgrade() -> None:
    # Add proxy_config JSONB to mcp_servers
    if not _has_column("mcp_servers", "proxy_config"):
        op.add_column(
            "mcp_servers",
            sa.Column("proxy_config", JSONB, nullable=True),
        )

    # Add proxy_config JSONB to tools
    if not _has_column("tools", "proxy_config"):
        op.add_column(
            "tools",
            sa.Column("proxy_config", JSONB, nullable=True),
        )

    # Migrate existing proxy_url values into proxy_config
    if _has_column("mcp_servers", "proxy_url"):
        op.execute("""
            UPDATE mcp_servers
            SET proxy_config = jsonb_build_object(
                'enabled', true,
                'protocol', 'http',
                'url', proxy_url
            )
            WHERE proxy_url IS NOT NULL AND proxy_url != ''
              AND proxy_config IS NULL
        """)


def downgrade() -> None:
    op.drop_column("tools", "proxy_config")
    op.drop_column("mcp_servers", "proxy_config")
