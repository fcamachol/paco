"""add external_services table

Revision ID: 014_add_external_services
Revises: 013_add_skill_body_column
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "014_add_external_services"
down_revision = "013_add_skill_body_column"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "external_services" in inspector.get_table_names():
        return

    op.create_table(
        "external_services",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), unique=True, nullable=False),
        sa.Column("service_type", sa.String(50), nullable=False, server_default="custom"),
        sa.Column("provider", sa.String(50), nullable=False, server_default="custom"),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("api_key_env_var", sa.String(255), nullable=True),
        sa.Column("auth_config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("health_check_endpoint", sa.String(500), nullable=True),
        sa.Column("health_check_method", sa.String(10), nullable=False, server_default="GET"),
        sa.Column("status", sa.String(50), nullable=False, server_default="unknown"),
        sa.Column("last_health_check", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_time_ms", sa.Integer, nullable=True),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.Column("is_auto_seeded", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_external_services_provider", "external_services", ["provider"])
    op.create_index("ix_external_services_service_type", "external_services", ["service_type"])


def downgrade() -> None:
    op.drop_index("ix_external_services_service_type")
    op.drop_index("ix_external_services_provider")
    op.drop_table("external_services")
