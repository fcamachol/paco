"""add managed MCP server and handler columns

Adds columns to mcp_servers for container management (deployment_mode,
container_id, container_name, host_port, image_tag, deploy_status,
deploy_error, last_deployed_at) and to tools for handler configuration
(handler_type, handler_config, output_transform, retry_config, timeout_ms).

Revision ID: 008_add_managed_mcp_columns
Revises: 007_add_proxy_config
Create Date: 2026-02-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "008_add_managed_mcp_columns"
down_revision = "007_add_proxy_config"
branch_labels = None
depends_on = None


def _has_column(table, column):
    return column in [c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)]


def upgrade() -> None:
    # McpServer - managed deployment columns
    if not _has_column("mcp_servers", "deployment_mode"):
        op.add_column("mcp_servers", sa.Column("deployment_mode", sa.String(50), server_default="external", nullable=False))
    if not _has_column("mcp_servers", "container_id"):
        op.add_column("mcp_servers", sa.Column("container_id", sa.String(100), nullable=True))
    if not _has_column("mcp_servers", "container_name"):
        op.add_column("mcp_servers", sa.Column("container_name", sa.String(255), nullable=True))
    if not _has_column("mcp_servers", "host_port"):
        op.add_column("mcp_servers", sa.Column("host_port", sa.Integer, nullable=True))
    if not _has_column("mcp_servers", "image_tag"):
        op.add_column("mcp_servers", sa.Column("image_tag", sa.String(255), server_default="latest", nullable=False))
    if not _has_column("mcp_servers", "deploy_status"):
        op.add_column("mcp_servers", sa.Column("deploy_status", sa.String(50), server_default="undeployed", nullable=False))
    if not _has_column("mcp_servers", "deploy_error"):
        op.add_column("mcp_servers", sa.Column("deploy_error", sa.Text, nullable=True))
    if not _has_column("mcp_servers", "last_deployed_at"):
        op.add_column("mcp_servers", sa.Column("last_deployed_at", sa.DateTime(timezone=True), nullable=True))

    # Tool - handler configuration columns
    if not _has_column("tools", "handler_type"):
        op.add_column("tools", sa.Column("handler_type", sa.String(50), nullable=True))
    if not _has_column("tools", "handler_config"):
        op.add_column("tools", sa.Column("handler_config", JSONB, nullable=True))
    if not _has_column("tools", "output_transform"):
        op.add_column("tools", sa.Column("output_transform", sa.Text, nullable=True))
    if not _has_column("tools", "retry_config"):
        op.add_column("tools", sa.Column("retry_config", JSONB, nullable=True))
    if not _has_column("tools", "timeout_ms"):
        op.add_column("tools", sa.Column("timeout_ms", sa.Integer, nullable=True))


def downgrade() -> None:
    # Tool columns
    op.drop_column("tools", "timeout_ms")
    op.drop_column("tools", "retry_config")
    op.drop_column("tools", "output_transform")
    op.drop_column("tools", "handler_config")
    op.drop_column("tools", "handler_type")

    # McpServer columns
    op.drop_column("mcp_servers", "last_deployed_at")
    op.drop_column("mcp_servers", "deploy_error")
    op.drop_column("mcp_servers", "deploy_status")
    op.drop_column("mcp_servers", "image_tag")
    op.drop_column("mcp_servers", "host_port")
    op.drop_column("mcp_servers", "container_name")
    op.drop_column("mcp_servers", "container_id")
    op.drop_column("mcp_servers", "deployment_mode")
