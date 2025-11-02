"""
Unified Study Help Runner

This module provides a single function `run_agent` that abstracts over direct FastAPI function calls and HTTP requests, and allows agent selection and flexible input for study help tasks.

Usage:
    from agent_runner import run_agent
    result = run_agent(
        mode="direct" or "http",
        topic="What is a derivative?",
        subject="mathematics",
        help_type="explanation" or "discussion",
        agent="expert" or "professor" or ...
    )

    # Result contains:
    # - response: JSON with agent_responses, answer, etc.
    # - json_path: Path to saved JSON file
    # - ogg_path: Path to generated TTS audio file
    # - played: Whether audio was played

The function automatically:
1. Generates agent responses using CrewAI
2. Saves response to JSON file
3. Generates TTS audio using tts.py
"""

from typing import Optional, Dict, Any
import json
import tempfile

# TTS helper
try:
    from tts.tts import speak_text_ogg
except Exception:
    speak_text_ogg = None


def _extract_answer_from_response(resp_dict: dict) -> Optional[str]:
    """Robustly extract a human-readable answer string from various response shapes.

    Handles Pydantic model dicts from `study_help`, HTTP JSON responses, and
    several common keys (`answer`, `agent_responses`, `responses`, `results`, `response`).
    """
    if not resp_dict:
        return None

    # Prefer explicit 'answer' key
    ans = resp_dict.get("answer")
    if isinstance(ans, str) and ans.strip():
        return ans

    # Common containers that hold agent messages
    for key in ("agent_responses", "responses", "results", "response", "data"):
        val = resp_dict.get(key)
        if isinstance(val, str) and val.strip():
            return val
        if isinstance(val, list) and val:
            first = val[0]
            if isinstance(first, dict):
                for candidate in ("message", "answer", "result", "text"):
                    if (
                        candidate in first
                        and isinstance(first[candidate], str)
                        and first[candidate].strip()
                    ):
                        return first[candidate]
            elif isinstance(first, str) and first.strip():
                return first

    # Last resort: find any top-level string value
    for k, v in resp_dict.items():
        if isinstance(v, str) and v.strip():
            return v

    return None


def run_agent(
    mode: str,
    topic: str,
    subject: str = "general",
    help_type: str = "explanation",
    agent: Optional[str] = None,
    http_url: str = "http://localhost:8000/api/study/help",
    extra: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
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
        Dict containing:
            - response: JSON-formatted response with agent_responses, answer, etc.
            - json_path: Path to saved JSON file
            - ogg_path: Path to generated audio file (if TTS succeeded)
            - played: Boolean indicating if audio was played
        Returns None only if mode is invalid
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
            from agents.agent import study_help, StudyHelpRequest
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
            # Run the async study_help and capture the response
            resp = asyncio.run(study_help(req))

            # resp should be a StudyHelpResponse Pydantic model
            answer = None
            try:
                # Pydantic model -> dict
                resp_dict = resp.dict() if hasattr(resp, "dict") else dict(resp)

                # Extract agent responses for JSON output
                agent_responses = resp_dict.get("agent_responses", [])
                main_answer = resp_dict.get("answer")
                success = resp_dict.get("success", False)

                # Build clean JSON output with agent responses
                json_output = {
                    "topic": topic,
                    "subject": subject,
                    "help_type": help_type,
                    "mode": mode,
                    "success": success,
                    "agent_responses": agent_responses,
                    "answer": main_answer,
                    "visual_suggestions": resp_dict.get("visual_suggestions"),
                    "execution_time": resp_dict.get("execution_time"),
                }

                # Include error if present
                if not success and resp_dict.get("error"):
                    json_output["error"] = resp_dict.get("error")

                # Save JSON output for debugging / audit
                fd, json_path = tempfile.mkstemp(suffix=".json")
                with open(json_path, "w", encoding="utf-8") as jf:
                    json.dump(json_output, jf, ensure_ascii=False, indent=2)
                print(f"[agent_runner] Wrote response JSON to {json_path}")

                # Extract answer for TTS - prefer main answer, then first agent response
                answer = main_answer
                if not answer and agent_responses:
                    answer = (
                        agent_responses[0].get("message")
                        if isinstance(agent_responses[0], dict)
                        else str(agent_responses[0])
                    )

                # If we have an answer, try to synthesize and play it using TTS
                ogg_path = None
                played = False
                if answer:
                    if speak_text_ogg:
                        try:
                            ogg_path, played = speak_text_ogg(answer)
                        except Exception as e:
                            print(f"[agent_runner] speak_text_ogg failed: {e}")
                    else:
                        print(
                            "[agent_runner] speak_text_ogg not available; install dependencies or check tts module."
                        )

                print(
                    f"[agent_runner] Answer: {answer}\nOGG path: {ogg_path}\nPlayed: {played}"
                )
                return {
                    "response": json_output,
                    "json_path": json_path,
                    "ogg_path": ogg_path,
                    "played": played,
                }

            except Exception as e:
                print(f"[agent_runner] Failed to process direct response: {e}")
                # Create error JSON output
                error_json = {
                    "topic": topic,
                    "subject": subject,
                    "help_type": help_type,
                    "mode": mode,
                    "success": False,
                    "agent_responses": None,
                    "answer": None,
                    "error": str(e),
                    "execution_time": None,
                }
                fd, json_path = tempfile.mkstemp(suffix=".json")
                with open(json_path, "w", encoding="utf-8") as jf:
                    json.dump(error_json, jf, ensure_ascii=False, indent=2)
                print(f"[agent_runner] Wrote error JSON to {json_path}")
                return {
                    "response": error_json,
                    "json_path": json_path,
                    "ogg_path": None,
                    "played": False,
                }
        except Exception as e:
            print(f"[agent_runner] Exception in direct mode: {e}")
            # Create error JSON output for outer exception
            error_json = {
                "topic": topic,
                "subject": subject,
                "help_type": help_type,
                "mode": mode,
                "success": False,
                "agent_responses": None,
                "answer": None,
                "error": str(e),
                "execution_time": None,
            }
            fd, json_path = tempfile.mkstemp(suffix=".json")
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(error_json, jf, ensure_ascii=False, indent=2)
            print(f"[agent_runner] Wrote error JSON to {json_path}")
            return {
                "response": error_json,
                "json_path": json_path,
                "ogg_path": None,
                "played": False,
            }
    elif mode == "http":
        # HTTP request mode
        import requests

        try:
            resp = requests.post(http_url, json=payload, timeout=60)
            resp.raise_for_status()

            resp_dict = resp.json()

            # Extract agent responses for JSON output
            agent_responses = resp_dict.get("agent_responses", [])
            main_answer = resp_dict.get("answer")
            success = resp_dict.get("success", False)

            # Build clean JSON output with agent responses
            json_output = {
                "topic": topic,
                "subject": subject,
                "help_type": help_type,
                "mode": mode,
                "success": success,
                "agent_responses": agent_responses,
                "answer": main_answer,
                "visual_suggestions": resp_dict.get("visual_suggestions"),
                "execution_time": resp_dict.get("execution_time"),
            }

            # Include error if present
            if not success and resp_dict.get("error"):
                json_output["error"] = resp_dict.get("error")

            # Save JSON
            fd, json_path = tempfile.mkstemp(suffix=".json")
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(json_output, jf, ensure_ascii=False, indent=2)
            print(f"[agent_runner] Wrote response JSON to {json_path}")

            # Extract answer for TTS - prefer main answer, then first agent response
            answer = main_answer
            if not answer and agent_responses:
                answer = (
                    agent_responses[0].get("message")
                    if isinstance(agent_responses[0], dict)
                    else str(agent_responses[0])
                )

            ogg_path = None
            played = False
            if answer and speak_text_ogg:
                try:
                    ogg_path, played = speak_text_ogg(answer)
                except Exception as e:
                    print(f"[agent_runner] speak_text_ogg failed (http mode): {e}")

            print(
                f"[agent_runner] Answer: {answer}\nOGG path: {ogg_path}\nPlayed: {played}"
            )
            return {
                "response": json_output,
                "json_path": json_path,
                "ogg_path": ogg_path,
                "played": played,
            }

        except Exception as e:
            print(f"[agent_runner] HTTP request failed: {e}")
            # Create error JSON output
            error_json = {
                "topic": topic,
                "subject": subject,
                "help_type": help_type,
                "mode": mode,
                "success": False,
                "agent_responses": None,
                "answer": None,
                "error": str(e),
                "execution_time": None,
            }
            fd, json_path = tempfile.mkstemp(suffix=".json")
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(error_json, jf, ensure_ascii=False, indent=2)
            print(f"[agent_runner] Wrote error JSON to {json_path}")
            return {
                "response": error_json,
                "json_path": json_path,
                "ogg_path": None,
                "played": False,
            }
    else:
        print(f"[agent_runner] Unknown mode: {mode}")
        return None


if __name__ == "__main__":
    # Example usage
    run_agent(
        mode="direct",
        topic="What is a derivative?",
        subject="mathematics",
        help_type="explanation",
        agent="expert",
    )
