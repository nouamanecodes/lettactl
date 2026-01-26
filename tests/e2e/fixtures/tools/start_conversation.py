def start_conversation(agent_name: str, message: str) -> str:
    """
    Start a conversation with another agent.

    Args:
        agent_name: Name of the agent to talk to
        message: Opening message

    Returns:
        Response from the other agent
    """
    return f"Started conversation with {agent_name}: {message}"
