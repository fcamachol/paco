"""
Migrate skills from DB-only to filesystem source of truth.

Reads existing skills from the database, writes SKILL.md files for each,
and writes resource_files from JSONB to actual files on disk.

Usage:
    python -m scripts.migrate_skills_to_filesystem
"""

import asyncio
import sys
from pathlib import Path

# Ensure app is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.core.config import settings
from app.db.session import async_session_maker, engine
from app.services.skill_filesystem import SkillFilesystemService


async def migrate():
    fs = SkillFilesystemService()
    migrated = 0
    resource_files_written = 0

    async with async_session_maker() as db:
        # Read all skills with old columns (if they still exist)
        result = await db.execute(text("""
            SELECT
                code, name, description, base_prompt,
                required_tool_names, allowed_tools, resource_files,
                is_active
            FROM skills
        """))
        rows = result.fetchall()

        for row in rows:
            code = row[0]
            name = row[1] or code
            description = row[2] or ""
            base_prompt = row[3] or ""
            required_tool_names = row[4] or []
            allowed_tools_json = row[5] or []
            resource_files_json = row[6] or {}
            is_active = row[7]

            # Merge required_tool_names + allowed_tools into allowed_tools
            all_tools = list(dict.fromkeys(
                (allowed_tools_json if isinstance(allowed_tools_json, list) else [])
                + (required_tool_names if isinstance(required_tool_names, list) else [])
            ))

            # Build body from base_prompt
            body = base_prompt.strip() if base_prompt else ""

            # Write SKILL.md
            if not fs.skill_exists(code):
                fs.write_skill_md(code, name, description, all_tools, body)
                print(f"  Created SKILL.md for '{code}'")
                migrated += 1
            else:
                print(f"  SKILL.md already exists for '{code}' — skipping")

            # Write resource files from JSONB to actual files
            if isinstance(resource_files_json, dict):
                for rpath, rcontent in resource_files_json.items():
                    if isinstance(rcontent, str) and rcontent.strip():
                        fs.write_resource_file(code, rpath, rcontent)
                        resource_files_written += 1
                        print(f"    Resource: {code}/{rpath}")

        # Update skill_path column for all skills
        for row in rows:
            code = row[0]
            skill_path = str(fs._skill_md_path(code))
            await db.execute(
                text("UPDATE skills SET skill_path = :path WHERE code = :code"),
                {"path": skill_path, "code": code},
            )

        await db.commit()

    print(f"\nMigration complete: {migrated} SKILL.md files created, {resource_files_written} resource files written")
    print(f"Skills base path: {settings.skills_base_path}")


if __name__ == "__main__":
    asyncio.run(migrate())
