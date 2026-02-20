"""create company tables

Creates the company_configs, company_departments, company_roles,
company_schedules, company_tasks, and company_work_logs tables
for the Company infrastructure type (agent employees with heartbeat).

Revision ID: 005_create_company_tables
Revises: 004_agent_tools_uuid_migration
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "005_create_company_tables"
down_revision = "004_agent_tools_uuid_migration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- CompanyConfig (one per infrastructure) --
    op.create_table(
        "company_configs",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("heartbeat_interval_seconds", sa.Integer, server_default="1800"),
        sa.Column(
            "default_model",
            sa.String(255),
            server_default="claude-haiku-4-5-20251001",
        ),
        sa.Column("timezone", sa.String(100), server_default="America/Mexico_City"),
        sa.Column("active_hours_start", sa.String(10), server_default="08:00"),
        sa.Column("active_hours_end", sa.String(10), server_default="20:00"),
        sa.Column("working_days", JSONB, server_default="'[1,2,3,4,5]'"),
        sa.Column("heartbeat_prompt", sa.Text, nullable=True),
        sa.Column("status", sa.String(50), server_default="stopped"),
        sa.Column("config", JSONB, server_default="'{}'"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # -- CompanyDepartment --
    op.create_table(
        "company_departments",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "parent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("company_departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("manager_agent_slug", sa.String(255), nullable=True),
        sa.Column("config", JSONB, server_default="'{}'"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("infrastructure_id", "name", name="uq_company_dept_name"),
    )

    # -- CompanyRole --
    op.create_table(
        "company_roles",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_slug", sa.String(255), nullable=False),
        sa.Column(
            "department_id",
            UUID(as_uuid=True),
            sa.ForeignKey("company_departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("role_type", sa.String(50), server_default="employee"),
        sa.Column("reports_to_slug", sa.String(255), nullable=True),
        sa.Column("goals", JSONB, server_default="'{}'"),
        sa.Column("working_hours", JSONB, server_default="'{}'"),
        sa.Column("checklist_md", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("hired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "infrastructure_id", "agent_slug", name="uq_company_role_agent"
        ),
    )

    # -- CompanySchedule --
    op.create_table(
        "company_schedules",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_slug", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("schedule_type", sa.String(50), nullable=False),
        sa.Column("cron_expression", sa.String(255), nullable=True),
        sa.Column("interval_seconds", sa.Integer, nullable=True),
        sa.Column("checklist_md", sa.Text, nullable=True),
        sa.Column("prompt_template", sa.Text, nullable=True),
        sa.Column("active_hours_start", sa.String(10), nullable=True),
        sa.Column("active_hours_end", sa.String(10), nullable=True),
        sa.Column("timezone", sa.String(100), nullable=True),
        sa.Column("is_enabled", sa.Boolean, server_default="true"),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_trigger_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config", JSONB, server_default="'{}'"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # -- CompanyTask --
    op.create_table(
        "company_tasks",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "schedule_id",
            UUID(as_uuid=True),
            sa.ForeignKey("company_schedules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("agent_slug", sa.String(255), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("task_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("priority", sa.Integer, server_default="5"),
        sa.Column("input_data", JSONB, server_default="'{}'"),
        sa.Column("result", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("input_tokens", sa.Integer, nullable=True),
        sa.Column("output_tokens", sa.Integer, nullable=True),
        sa.Column("langfuse_trace_id", sa.String(255), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # -- CompanyWorkLog --
    op.create_table(
        "company_work_logs",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "infrastructure_id",
            UUID(as_uuid=True),
            sa.ForeignKey("infrastructures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_slug", sa.String(255), nullable=False),
        sa.Column("log_date", sa.Date, nullable=False),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("entries", JSONB, server_default="'[]'"),
        sa.Column("memory_notes", sa.Text, nullable=True),
        sa.Column("tasks_completed", sa.Integer, server_default="0"),
        sa.Column("tasks_failed", sa.Integer, server_default="0"),
        sa.Column("total_cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("total_tokens", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "infrastructure_id",
            "agent_slug",
            "log_date",
            name="uq_company_worklog_agent_date",
        ),
    )


def downgrade() -> None:
    op.drop_table("company_work_logs")
    op.drop_table("company_tasks")
    op.drop_table("company_schedules")
    op.drop_table("company_roles")
    op.drop_table("company_departments")
    op.drop_table("company_configs")
