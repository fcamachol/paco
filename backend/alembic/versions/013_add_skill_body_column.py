"""add body and allowed_tools columns to skills table

Stores skill content in the DB as source of truth instead of relying
solely on filesystem SKILL.md files (which are lost in Docker deploys).

Revision ID: 013_add_skill_body_column
Revises: 012_add_webhook_tables
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "013_add_skill_body_column"
down_revision = "012_add_webhook_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [c["name"] for c in inspector.get_columns("skills")]

    if "body" not in existing_columns:
        op.add_column("skills", sa.Column("body", sa.Text, nullable=True))

    if "allowed_tools" not in existing_columns:
        op.add_column(
            "skills",
            sa.Column("allowed_tools", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        )

    # Best-effort backfill from filesystem SKILL.md files
    try:
        import re
        from pathlib import Path

        import yaml

        _FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
        skills_dir = Path("./skills")

        if skills_dir.exists():
            for skill_dir in skills_dir.iterdir():
                if not skill_dir.is_dir():
                    continue
                md_path = skill_dir / "SKILL.md"
                if not md_path.exists():
                    continue

                code = skill_dir.name
                content = md_path.read_text(encoding="utf-8")
                match = _FM_RE.match(content)
                if not match:
                    continue

                fm = yaml.safe_load(match.group(1)) or {}
                body = content[match.end():].strip()
                allowed_raw = fm.get("allowed-tools", "")
                if isinstance(allowed_raw, str):
                    allowed_tools = allowed_raw.split() if allowed_raw else []
                else:
                    allowed_tools = list(allowed_raw) if allowed_raw else []

                import json
                bind.execute(
                    sa.text(
                        "UPDATE skills SET body = :body, allowed_tools = :tools WHERE code = :code"
                    ),
                    {"body": body, "tools": json.dumps(allowed_tools), "code": code},
                )
    except Exception:
        # Backfill is best-effort; don't fail the migration
        pass


def downgrade() -> None:
    op.drop_column("skills", "allowed_tools")
    op.drop_column("skills", "body")
