"""
PACO Builder Agent - Main Orchestrator

Uses Anthropic's Claude Agent SDK to power the agent builder.
Follows the official SDK patterns from:
https://github.com/anthropics/claude-agent-sdk-python
"""

import asyncio
from pathlib import Path
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    tool,
    create_sdk_mcp_server,
    AssistantMessage,
    UserMessage,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
)
from typing import AsyncIterator, Optional
import json

# Import our tool definitions
from .tools.discovery import discovery_tool_handlers
from .tools.creation import creation_tool_handlers
from .tools.workflow import workflow_tool_handlers
from .tools.guardrails import guardrail_tool_handlers
from .tools.testing import testing_tool_handlers
from .tools.deployment import deployment_tool_handlers


# ============================================
# DISCOVERY TOOLS (using @tool decorator)
# ============================================

@tool("list_connectors", "List all available data source connectors", {
    "status": str,  # optional: connected, pending, error, all
    "type": str,    # optional: rest, soap, database, mcp, all
})
async def list_connectors(args: dict) -> dict:
    """List all available connectors for this account."""
    result = await discovery_tool_handlers.list_connectors(
        status=args.get("status", "all"),
        type=args.get("type", "all")
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("discover_tools", "Discover available tools from a connector", {
    "connector_id": str,
    "refresh": bool,  # optional
})
async def discover_tools(args: dict) -> dict:
    """Auto-introspect a connector to find available tools."""
    result = await discovery_tool_handlers.discover_tools(
        connector_id=args["connector_id"],
        refresh=args.get("refresh", False)
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("list_skills", "List available skills (behaviors, prompts, guards)", {
    "category": str,  # optional
    "type": str,      # optional
})
async def list_skills(args: dict) -> dict:
    """List available skills for agents."""
    result = await discovery_tool_handlers.list_skills(
        category=args.get("category"),
        type=args.get("type")
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


# ============================================
# CREATION TOOLS
# ============================================

@tool("create_agent", "Create a new agent with basic metadata", {
    "name": str,
    "type": str,  # customer, ticket_intel, copilot, custom
    "description": str,  # optional
})
async def create_agent(args: dict) -> dict:
    """Initialize a new draft agent."""
    result = await creation_tool_handlers.create_agent(
        name=args["name"],
        type=args["type"],
        description=args.get("description")
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("set_persona", "Define agent personality and communication style", {
    "agent_id": str,
    "system_prompt": str,
    "personality_traits": list,  # optional
    "language": str,  # optional, default es-MX
    "formality": str,  # optional: formal, casual, adaptive
})
async def set_persona(args: dict) -> dict:
    """Set the agent's persona."""
    result = await creation_tool_handlers.set_persona(
        agent_id=args["agent_id"],
        system_prompt=args["system_prompt"],
        personality_traits=args.get("personality_traits", []),
        language=args.get("language", "es-MX"),
        formality=args.get("formality", "adaptive")
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("add_tool_to_agent", "Attach a tool to an agent", {
    "agent_id": str,
    "tool_id": str,
    "config": dict,  # optional
    "auto_execute": bool,  # optional
})
async def add_tool_to_agent(args: dict) -> dict:
    """Add a tool to an agent."""
    result = await creation_tool_handlers.add_tool_to_agent(
        agent_id=args["agent_id"],
        tool_id=args["tool_id"],
        config=args.get("config"),
        auto_execute=args.get("auto_execute", False)
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("add_skill_to_agent", "Attach a skill to an agent", {
    "agent_id": str,
    "skill_id": str,
    "priority": int,  # optional
})
async def add_skill_to_agent(args: dict) -> dict:
    """Add a skill to an agent."""
    result = await creation_tool_handlers.add_skill_to_agent(
        agent_id=args["agent_id"],
        skill_id=args["skill_id"],
        priority=args.get("priority", 0)
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("get_agent_preview", "Get current state of agent being built", {
    "agent_id": str,
})
async def get_agent_preview(args: dict) -> dict:
    """Get agent preview for display."""
    result = await creation_tool_handlers.get_agent_preview(
        agent_id=args["agent_id"]
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


# ============================================
# WORKFLOW TOOLS
# ============================================

@tool("create_workflow", "Create a conversation workflow", {
    "agent_id": str,
    "name": str,
    "trigger": str,
    "steps": list,
})
async def create_workflow(args: dict) -> dict:
    """Create a workflow for an agent."""
    result = await workflow_tool_handlers.create_workflow(
        agent_id=args["agent_id"],
        name=args["name"],
        trigger=args["trigger"],
        steps=args["steps"]
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("add_intent", "Add an intent the agent should recognize", {
    "agent_id": str,
    "intent_name": str,
    "examples": list,
    "workflow_id": str,  # optional
})
async def add_intent(args: dict) -> dict:
    """Add an intent to an agent."""
    result = await workflow_tool_handlers.add_intent(
        agent_id=args["agent_id"],
        intent_name=args["intent_name"],
        examples=args["examples"],
        workflow_id=args.get("workflow_id")
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


# ============================================
# GUARDRAIL TOOLS
# ============================================

@tool("add_guardrail", "Add a safety guardrail to an agent", {
    "agent_id": str,
    "name": str,
    "type": str,  # block, escalate, warn, require_approval
    "trigger": str,
    "action": str,
    "message": str,  # optional
})
async def add_guardrail(args: dict) -> dict:
    """Add a guardrail to an agent."""
    result = await guardrail_tool_handlers.add_guardrail(
        agent_id=args["agent_id"],
        name=args["name"],
        type=args["type"],
        trigger=args["trigger"],
        action=args["action"],
        message=args.get("message")
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("set_escalation_rules", "Define escalation rules for an agent", {
    "agent_id": str,
    "rules": list,
})
async def set_escalation_rules(args: dict) -> dict:
    """Set escalation rules for an agent."""
    result = await guardrail_tool_handlers.set_escalation_rules(
        agent_id=args["agent_id"],
        rules=args["rules"]
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


# ============================================
# TESTING TOOLS
# ============================================

@tool("simulate_conversation", "Run a simulated conversation to test agent", {
    "agent_id": str,
    "scenario": str,
    "expected_outcome": str,  # optional
    "max_turns": int,  # optional
})
async def simulate_conversation(args: dict) -> dict:
    """Simulate a conversation with the agent."""
    result = await testing_tool_handlers.simulate_conversation(
        agent_id=args["agent_id"],
        scenario=args["scenario"],
        expected_outcome=args.get("expected_outcome"),
        max_turns=args.get("max_turns", 10)
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("validate_agent", "Validate agent configuration", {
    "agent_id": str,
})
async def validate_agent(args: dict) -> dict:
    """Validate an agent's configuration."""
    result = await testing_tool_handlers.validate_agent(
        agent_id=args["agent_id"]
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("run_test_suite", "Run comprehensive tests on agent", {
    "agent_id": str,
    "include_edge_cases": bool,  # optional
})
async def run_test_suite(args: dict) -> dict:
    """Run test suite on an agent."""
    result = await testing_tool_handlers.run_test_suite(
        agent_id=args["agent_id"],
        include_edge_cases=args.get("include_edge_cases", True)
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


# ============================================
# DEPLOYMENT TOOLS
# ============================================

@tool("deploy_agent", "Deploy agent to an environment", {
    "agent_id": str,
    "environment": str,  # sandbox, beta, production
    "channels": list,  # optional
})
async def deploy_agent(args: dict) -> dict:
    """Deploy an agent."""
    result = await deployment_tool_handlers.deploy_agent(
        agent_id=args["agent_id"],
        environment=args["environment"],
        channels=args.get("channels", ["web"])
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


@tool("create_agent_version", "Create a versioned snapshot of agent", {
    "agent_id": str,
    "version_name": str,
    "notes": str,  # optional
})
async def create_agent_version(args: dict) -> dict:
    """Create a version snapshot."""
    result = await deployment_tool_handlers.create_agent_version(
        agent_id=args["agent_id"],
        version_name=args["version_name"],
        notes=args.get("notes")
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}


# ============================================
# BUILDER AGENT MCP SERVER
# ============================================

def create_builder_mcp_server():
    """Create the MCP server with all builder tools."""
    return create_sdk_mcp_server(
        name="paco-builder",
        version="1.0.0",
        tools=[
            # Discovery
            list_connectors,
            discover_tools,
            list_skills,
            # Creation
            create_agent,
            set_persona,
            add_tool_to_agent,
            add_skill_to_agent,
            get_agent_preview,
            # Workflow
            create_workflow,
            add_intent,
            # Guardrails
            add_guardrail,
            set_escalation_rules,
            # Testing
            simulate_conversation,
            validate_agent,
            run_test_suite,
            # Deployment
            deploy_agent,
            create_agent_version,
        ]
    )


# ============================================
# BUILDER AGENT CLASS
# ============================================

class PACOBuilderAgent:
    """
    The PACO Builder Agent - helps users create AI agents through conversation.
    
    Uses the Claude Agent SDK with custom MCP tools for agent building.
    """
    
    def __init__(
        self,
        account_id: str,
        model: str = "claude-sonnet-4-20250514",
        cwd: Optional[Path] = None
    ):
        self.account_id = account_id
        self.model = model
        self.cwd = cwd or Path.cwd()
        self.mcp_server = create_builder_mcp_server()
        self.client: Optional[ClaudeSDKClient] = None
        
        # Load system prompt
        self.system_prompt = self._load_system_prompt()
    
    def _load_system_prompt(self) -> str:
        """Load the builder agent system prompt."""
        prompt_path = Path(__file__).parent / "prompts" / "system.md"
        if prompt_path.exists():
            return prompt_path.read_text()
        return "You are PACO Builder Agent, an expert AI agent architect."
    
    def _get_options(self) -> ClaudeAgentOptions:
        """Get Claude Agent SDK options."""
        return ClaudeAgentOptions(
            model=self.model,
            system_prompt=self.system_prompt,
            cwd=str(self.cwd),
            mcp_servers={"builder": self.mcp_server},
            allowed_tools=[
                # All builder tools
                "mcp__builder__list_connectors",
                "mcp__builder__discover_tools",
                "mcp__builder__list_skills",
                "mcp__builder__create_agent",
                "mcp__builder__set_persona",
                "mcp__builder__add_tool_to_agent",
                "mcp__builder__add_skill_to_agent",
                "mcp__builder__get_agent_preview",
                "mcp__builder__create_workflow",
                "mcp__builder__add_intent",
                "mcp__builder__add_guardrail",
                "mcp__builder__set_escalation_rules",
                "mcp__builder__simulate_conversation",
                "mcp__builder__validate_agent",
                "mcp__builder__run_test_suite",
                "mcp__builder__deploy_agent",
                "mcp__builder__create_agent_version",
            ],
            permission_mode="acceptEdits",
        )
    
    async def start(self):
        """Start the builder agent session."""
        self.client = ClaudeSDKClient(options=self._get_options())
        await self.client.__aenter__()
    
    async def stop(self):
        """Stop the builder agent session."""
        if self.client:
            await self.client.__aexit__(None, None, None)
            self.client = None
    
    async def query(self, prompt: str) -> AsyncIterator[dict]:
        """
        Send a query to the builder agent.
        
        Yields message dictionaries with type and content.
        """
        if not self.client:
            raise RuntimeError("Builder agent not started. Call start() first.")
        
        await self.client.query(prompt)
        
        async for message in self.client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        yield {"type": "text", "content": block.text}
                    elif isinstance(block, ToolUseBlock):
                        yield {
                            "type": "tool_use",
                            "tool": block.name,
                            "input": block.input,
                            "id": block.id,
                        }
                    elif isinstance(block, ToolResultBlock):
                        yield {
                            "type": "tool_result",
                            "tool_use_id": block.tool_use_id,
                            "content": block.content,
                        }
            elif isinstance(message, UserMessage):
                yield {"type": "user", "content": str(message.content)}
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.stop()


# ============================================
# CONVENIENCE FUNCTION
# ============================================

async def create_builder_session(
    account_id: str,
    model: str = "claude-sonnet-4-20250514"
) -> PACOBuilderAgent:
    """
    Create and start a PACO Builder Agent session.
    
    Usage:
        async with create_builder_session("account_123") as builder:
            async for msg in builder.query("Build María, a customer service agent"):
                print(msg)
    """
    agent = PACOBuilderAgent(account_id=account_id, model=model)
    await agent.start()
    return agent
