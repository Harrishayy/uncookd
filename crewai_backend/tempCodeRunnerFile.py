"""
Unified Study Help Runner

This module provides a single function `run_agent` that abstracts over direct FastAPI function calls and HTTP requests, and allows agent selection and flexible input for study help tasks.

Usage:
    from agent_runner import run_agent
    run_agent(
        mode="direct" or "http",
        topic="What is a derivative?",
        subject="mathematics",
        help_type="explanation" or "discussion",
        agent="expert" or "professor" or ...
    )

Returns: None (for now)
"""

from typing import Optional


def run_agent(
    mode: str,
    topic: str,
    subject: str = "general",
    help_type: str = "explanation",
    agent: Optional[str] = None,
    http_url: str = "http://localhost:8000/api/study/help",
    extra: Optional[dict] = None,
) -> None:
    """
    Unified entry point for study help requests.

    Args:
        mode: 'direct' (call FastAPI function) or 'http' (send HTTP request)
        topic: The user's question or topic
        subject: Subject area (default: 'general')
        help_type: 'explanation' or 'discussion' (default: 'explanation')
        agent: Optional agent selector (e.g., 'expert', 'professor')
        http_url: URL for HTTP mode (default: local FastAPI endpoint)
        extra: Optional dict for future extensibility
    Returns:
        None (for now)
    """
    payload = {
        "user_question": topic,
        "subject": subject,
        "help_type": help_type,
    }
    if agent:
        payload["agent"] = agent
    if extra:
        payload.update(extra)

    if mode == "direct":
        # Direct function call (bypasses HTTP)
        import sys
        import os

        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            from .agents.agent import study_help, StudyHelpRequest
        except ImportError:
            print("[agent_runner] Could not import FastAPI app for direct mode.")
            return
        req = StudyHelpRequest(
            user_question=topic,
            subject=subject,
            help_type=help_type,
            conversation_history=None,
        )
        # Optionally pass agent if supported
        if hasattr(req, "agent") and agent:
            req.agent = agent
        # Await the async endpoint
        import asyncio

        try:
            asyncio.run(study_help(req))
        except Exception as e:
            print(f"[agent_runner] Exception in direct mode: {e}")
        return
    elif mode == "http":
        # HTTP request mode
        import requests

        try:
            resp = requests.post(http_url, json=payload, timeout=60)
            resp.raise_for_status()
        except Exception as e:
            print(f"[agent_runner] HTTP request failed: {e}")
        return
    else:
        print(f"[agent_runner] Unknown mode: {mode}")
        return


if __name__ == "__main__":
    # Example usage
    run_agent(
        mode="direct",
        topic="What is a derivative?",
        subject="mathematics",
        help_type="explanation",
        agent="expert",
    )
