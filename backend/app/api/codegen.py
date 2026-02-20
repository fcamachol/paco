"""
PACO Code Generation API

Generates Claude Agent SDK code from WorkflowIR.
Supports Python (via Jinja2 templates) and TypeScript (via frontend).
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel

router = APIRouter(prefix="/codegen", tags=["Code Generation"])


# =============================================================================
# Pydantic Models - Match frontend WorkflowIR types
# =============================================================================


class AgentIRModel(BaseModel):
    """Agent configuration matching frontend AgentIR."""

    name: str
    model: Optional[str] = None
    systemPrompt: Optional[str] = None
    temperature: Optional[float] = None
    maxTokens: Optional[int] = None
    topP: Optional[float] = None
    topK: Optional[int] = None
    stopSequences: Optional[List[str]] = None


class McpServerIRModel(BaseModel):
    """MCP server configuration matching frontend McpServerIR."""

    name: str
    type: str = "stdio"  # 'stdio' | 'sse' | 'http'
    command: Optional[str] = None
    args: Optional[List[str]] = None
    url: Optional[str] = None
    env: Optional[Dict[str, str]] = None
    enabledTools: Optional[List[str]] = None


class KnowledgeSourceIRModel(BaseModel):
    """Knowledge source configuration matching frontend KnowledgeSourceIR."""

    name: str
    type: str  # 'document' | 'url' | 'database'
    sources: List[str]


class WorkflowIRModel(BaseModel):
    """Complete workflow IR matching frontend WorkflowIR."""

    name: str
    description: Optional[str] = None
    agent: AgentIRModel
    mcpServers: Optional[List[McpServerIRModel]] = None
    allowedTools: Optional[List[str]] = None
    knowledgeSources: Optional[List[KnowledgeSourceIRModel]] = None
    permissionMode: str = "acceptEdits"


class CodegenResponse(BaseModel):
    """Response containing generated code."""

    code: str
    filename: str


# =============================================================================
# Template Setup
# =============================================================================

# Get templates directory relative to this file
TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates" / "agent" / "python"

# Initialize Jinja2 environment
jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    trim_blocks=True,
    lstrip_blocks=True,
)


# =============================================================================
# Helper Functions
# =============================================================================


def compute_allowed_tools(ir: WorkflowIRModel) -> List[str]:
    """
    Compute the allowed_tools list including:
    - Built-in tools from agent config (allowedTools)
    - MCP tool wildcards or specific tools from MCP servers
    """
    tools: List[str] = []

    # Add built-in tools from workflow
    if ir.allowedTools:
        tools.extend(ir.allowedTools)

    # Add MCP tool references
    if ir.mcpServers:
        for server in ir.mcpServers:
            if server.enabledTools and len(server.enabledTools) > 0:
                # Add specific tools with mcp__servername__toolname format
                for tool in server.enabledTools:
                    tools.append(f"mcp__{server.name}__{tool}")
            else:
                # Add wildcard for all tools from this server
                tools.append(f"mcp__{server.name}__*")

    return tools


def to_python_filename(name: str) -> str:
    """Convert workflow name to valid Python filename."""
    # Replace spaces and hyphens with underscores
    safe_name = name.lower().replace(" ", "_").replace("-", "_")
    # Remove any non-alphanumeric characters except underscores
    safe_name = "".join(c for c in safe_name if c.isalnum() or c == "_")
    return f"{safe_name}_agent.py"


# =============================================================================
# Endpoints
# =============================================================================


@router.post("/python", response_model=CodegenResponse)
async def generate_python_code(ir: WorkflowIRModel) -> CodegenResponse:
    """
    Generate Python Claude Agent SDK code from WorkflowIR.

    Returns:
        CodegenResponse with generated Python code and suggested filename.
    """
    # Load template
    template = jinja_env.get_template("agent.py.j2")

    # Prepare template context
    allowed_tools = compute_allowed_tools(ir)

    # Convert Pydantic models to dicts for Jinja2
    ir_dict: Dict[str, Any] = {
        "name": ir.name,
        "description": ir.description,
        "agent": {
            "name": ir.agent.name,
            "model": ir.agent.model,
            "systemPrompt": ir.agent.systemPrompt,
            "temperature": ir.agent.temperature,
            "maxTokens": ir.agent.maxTokens,
            "topP": ir.agent.topP,
            "topK": ir.agent.topK,
            "stopSequences": ir.agent.stopSequences,
        },
        "mcpServers": (
            [
                {
                    "name": s.name,
                    "type": s.type,
                    "command": s.command,
                    "args": s.args or [],
                    "url": s.url,
                    "env": s.env,
                    "enabledTools": s.enabledTools or [],
                }
                for s in ir.mcpServers
            ]
            if ir.mcpServers
            else []
        ),
        "allowedTools": ir.allowedTools or [],
        "knowledgeSources": (
            [
                {"name": ks.name, "type": ks.type, "sources": ks.sources}
                for ks in ir.knowledgeSources
            ]
            if ir.knowledgeSources
            else []
        ),
        "permissionMode": ir.permissionMode,
    }

    # Render template
    code = template.render(ir=ir_dict, allowed_tools=allowed_tools if allowed_tools else None)

    return CodegenResponse(
        code=code,
        filename=to_python_filename(ir.name),
    )


@router.post("/python/requirements", response_model=CodegenResponse)
async def generate_python_requirements(ir: WorkflowIRModel) -> CodegenResponse:
    """
    Generate requirements.txt for Python Claude Agent SDK code.

    Returns:
        CodegenResponse with requirements.txt content.
    """
    # Load template
    template = jinja_env.get_template("requirements.txt.j2")

    # Render template
    code = template.render(ir={"name": ir.name})

    return CodegenResponse(
        code=code,
        filename="requirements.txt",
    )
