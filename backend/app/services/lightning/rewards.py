"""
Agent Lightning Reward Functions

Grading functions that score agent outputs for RL optimization.
"""

import re
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings


async def llm_judge_reward(
    prompt: str,
    agent_output: str,
    expected_output: Optional[str] = None,
    config: Dict[str, Any] = {},
) -> float:
    """Use an LLM to judge agent output quality. Returns 0.0-1.0."""
    judge_prompt = config.get("judge_prompt", (
        "Rate the following agent response on a scale of 0 to 10.\n"
        "Only respond with a number.\n\n"
        "User prompt: {prompt}\n"
        "Agent response: {response}\n"
        "{expected}"
    ))

    expected_section = ""
    if expected_output:
        expected_section = f"Expected output: {expected_output}\n"

    formatted = judge_prompt.format(
        prompt=prompt,
        response=agent_output,
        expected=expected_section,
    )

    judge_model = config.get("judge_model", "claude-haiku-4-5-20251001")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": judge_model,
                "max_tokens": 10,
                "messages": [{"role": "user", "content": formatted}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["content"][0]["text"].strip()
        # Extract number
        match = re.search(r"(\d+(?:\.\d+)?)", text)
        if match:
            score = float(match.group(1))
            return min(score / 10.0, 1.0)  # Normalize to 0-1
        return 0.5  # Default if parsing fails


def keyword_match_reward(
    agent_output: str,
    config: Dict[str, Any] = {},
) -> float:
    """Score based on presence of required keywords."""
    keywords = config.get("keywords", [])
    if not keywords:
        return 0.5
    matches = sum(1 for kw in keywords if kw.lower() in agent_output.lower())
    return matches / len(keywords)


def regex_match_reward(
    agent_output: str,
    config: Dict[str, Any] = {},
) -> float:
    """Score based on regex pattern match."""
    pattern = config.get("pattern", "")
    if not pattern:
        return 0.5
    return 1.0 if re.search(pattern, agent_output) else 0.0
