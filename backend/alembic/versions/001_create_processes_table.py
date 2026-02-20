"""create processes table

Revision ID: 001_create_processes
Revises: None
Create Date: 2026-02-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "001_create_processes"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("department", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="analyzing"),
        sa.Column("extraction_md", sa.Text, nullable=True),
        sa.Column("as_is_analysis_md", sa.Text, nullable=True),
        sa.Column("compliance_audit_md", sa.Text, nullable=True),
        sa.Column("to_be_optimization_md", sa.Text, nullable=True),
        sa.Column("implementation_plan_md", sa.Text, nullable=True),
        sa.Column("executive_summary_md", sa.Text, nullable=True),
        sa.Column("diagram_as_is", sa.Text, nullable=True),
        sa.Column("diagram_to_be_digital", sa.Text, nullable=True),
        sa.Column("diagram_to_be_hybrid", sa.Text, nullable=True),
        sa.Column("run_metadata", JSONB, nullable=True),
        sa.Column("model_used", sa.String(100), nullable=True),
        sa.Column("source_files", JSONB, nullable=True),
        sa.Column("tags", JSONB, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("processes")
