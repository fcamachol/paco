"""
Task handler registration.

Each handler module exports a `register(dispatcher)` function.
"""

from app.services.queue.dispatcher import TaskDispatcher


def register_all(dispatcher: TaskDispatcher) -> None:
    """Register all task handlers with the dispatcher."""
    from app.services.queue.tasks import (
        agent_config_reload,
        agent_lifecycle,
        company_message_delivery,
        heartbeat_trigger,
        infra_health_check,
        tool_sync,
    )

    agent_config_reload.register(dispatcher)
    heartbeat_trigger.register(dispatcher)
    tool_sync.register(dispatcher)
    infra_health_check.register(dispatcher)
    agent_lifecycle.register(dispatcher)
    company_message_delivery.register(dispatcher)
