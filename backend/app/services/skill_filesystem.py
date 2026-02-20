"""
Skill Filesystem Service

Source of truth for skill content. Skills live as SKILL.md files on disk
with YAML frontmatter (name, description, allowed-tools) + markdown body.
"""

import re
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from app.core.config import settings

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


class SkillFilesystemService:
    """Reads and writes SKILL.md files on the filesystem."""

    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or settings.skills_base_path)

    def _skill_dir(self, code: str) -> Path:
        return self.base_path / code

    def _skill_md_path(self, code: str) -> Path:
        return self._skill_dir(code) / "SKILL.md"

    # ------------------------------------------------------------------
    # SKILL.md read/write
    # ------------------------------------------------------------------

    def read_skill_md(self, code: str) -> Dict[str, Any]:
        """Parse a skill's SKILL.md into frontmatter + body.

        Returns:
            {"name": str, "description": str, "allowed_tools": list[str], "body": str}
        """
        path = self._skill_md_path(code)
        if not path.exists():
            raise FileNotFoundError(f"SKILL.md not found for skill '{code}'")

        content = path.read_text(encoding="utf-8")
        match = _FRONTMATTER_RE.match(content)
        if not match:
            # Treat entire content as body with no frontmatter
            return {"name": code, "description": "", "allowed_tools": [], "body": content.strip()}

        fm = yaml.safe_load(match.group(1)) or {}
        body = content[match.end():].strip()

        # Parse allowed-tools (space-delimited string or list)
        allowed_raw = fm.get("allowed-tools", "")
        if isinstance(allowed_raw, str):
            allowed_tools = allowed_raw.split() if allowed_raw else []
        else:
            allowed_tools = list(allowed_raw)

        return {
            "name": fm.get("name", code),
            "description": fm.get("description", ""),
            "allowed_tools": allowed_tools,
            "body": body,
        }

    def write_skill_md(
        self,
        code: str,
        name: str,
        description: str,
        allowed_tools: List[str],
        body: str,
    ) -> Path:
        """Write a SKILL.md file for a skill.

        Returns the path to the written file.
        """
        skill_dir = self._skill_dir(code)
        skill_dir.mkdir(parents=True, exist_ok=True)

        fm: Dict[str, Any] = {"name": name, "description": description}
        if allowed_tools:
            fm["allowed-tools"] = " ".join(allowed_tools)

        yaml_block = yaml.dump(fm, default_flow_style=False, sort_keys=False).strip()
        content = f"---\n{yaml_block}\n---\n\n{body}\n"

        path = self._skill_md_path(code)
        path.write_text(content, encoding="utf-8")
        return path

    # ------------------------------------------------------------------
    # Resource files
    # ------------------------------------------------------------------

    def list_resource_files(self, code: str) -> List[str]:
        """List resource file paths (relative to skill dir), excluding SKILL.md."""
        skill_dir = self._skill_dir(code)
        if not skill_dir.exists():
            return []
        return sorted(
            str(p.relative_to(skill_dir))
            for p in skill_dir.rglob("*")
            if p.is_file() and p.name != "SKILL.md"
        )

    def read_resource_file(self, code: str, path: str) -> str:
        """Read a resource file's content."""
        self._validate_resource_path(path)
        full_path = self._skill_dir(code) / path
        if not full_path.exists():
            raise FileNotFoundError(f"Resource '{path}' not found in skill '{code}'")
        return full_path.read_text(encoding="utf-8")

    def write_resource_file(self, code: str, path: str, content: str) -> None:
        """Write a resource file."""
        self._validate_resource_path(path)
        full_path = self._skill_dir(code) / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")

    def delete_resource_file(self, code: str, path: str) -> None:
        """Delete a resource file."""
        self._validate_resource_path(path)
        full_path = self._skill_dir(code) / path
        if full_path.exists():
            full_path.unlink()

    # ------------------------------------------------------------------
    # Skill lifecycle
    # ------------------------------------------------------------------

    def delete_skill(self, code: str) -> None:
        """Remove a skill's entire directory."""
        skill_dir = self._skill_dir(code)
        if skill_dir.exists():
            shutil.rmtree(skill_dir)

    def scan_skills(self) -> List[Dict[str, Any]]:
        """Scan the filesystem for all SKILL.md files.

        Returns a list of parsed skill data dicts with 'code' added.
        """
        if not self.base_path.exists():
            return []

        results = []
        for skill_dir in sorted(self.base_path.iterdir()):
            if not skill_dir.is_dir():
                continue
            md_path = skill_dir / "SKILL.md"
            if not md_path.exists():
                continue
            code = skill_dir.name
            try:
                data = self.read_skill_md(code)
                data["code"] = code
                data["skill_path"] = str(md_path)
                data["resource_files"] = self.list_resource_files(code)
                results.append(data)
            except Exception:
                continue  # skip malformed skills

        return results

    def skill_exists(self, code: str) -> bool:
        """Check if a skill directory with SKILL.md exists."""
        return self._skill_md_path(code).exists()

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_resource_path(path: str) -> None:
        if not path or path.startswith("/") or ".." in path.split("/"):
            raise ValueError(f"Invalid resource path: '{path}'. Must be relative, no '..'")
