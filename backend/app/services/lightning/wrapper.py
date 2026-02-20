"""
Agent Lightning Wrapper

Wraps PACO agent executions as Agent Lightning rollouts for RL training.
Uses the Anthropic Python SDK directly for Python-based execution.
"""

from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.services.lightning.rewards import (
    keyword_match_reward,
    llm_judge_reward,
    regex_match_reward,
)


async def execute_agent_rollout(
    system_prompt: str,
    user_prompt: str,
    model: str = "claude-sonnet-4-5-20250929",
    max_tokens: int = 4096,
) -> str:
    """Execute a single agent turn via Anthropic API and return the response text."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


async def compute_reward(
    prompt: str,
    agent_output: str,
    expected_output: Optional[str],
    reward_function: str,
    reward_config: Dict[str, Any],
) -> float:
    """Compute reward score for an agent output."""
    if reward_function == "llm_judge":
        return await llm_judge_reward(prompt, agent_output, expected_output, reward_config)
    elif reward_function == "keyword_match":
        return keyword_match_reward(agent_output, reward_config)
    elif reward_function == "regex_match":
        return regex_match_reward(agent_output, reward_config)
    else:
        return 0.5  # Default fallback


async def run_training_epoch(
    system_prompt: str,
    model: str,
    dataset_items: List[Dict[str, Any]],
    reward_function: str,
    reward_config: Dict[str, Any],
) -> Dict[str, Any]:
    """Run one training epoch: execute agent on all dataset items, collect rewards."""
    results = []
    total_reward = 0.0

    for item in dataset_items:
        prompt = item["prompt"]
        expected = item.get("expected_output")

        output = await execute_agent_rollout(system_prompt, prompt, model)
        reward = await compute_reward(prompt, output, expected, reward_function, reward_config)

        results.append({
            "prompt": prompt,
            "output": output,
            "expected": expected,
            "reward": reward,
        })
        total_reward += reward

    avg_reward = total_reward / len(results) if results else 0.0
    return {
        "results": results,
        "avg_reward": avg_reward,
        "total_items": len(results),
    }
