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
        import concurrent.futures

        try:
            # Check if there's a running event loop (from FastAPI async context)
            try:
                loop = asyncio.get_running_loop()
                # If we're in an async context, we can't use asyncio.run()
                # Run the async function in a new thread with its own event loop
                def run_in_thread():
                    new_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(new_loop)
                    try:
                        return new_loop.run_until_complete(study_help(req))
                    finally:
                        new_loop.close()
                
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(run_in_thread)
                    resp = future.result(timeout=300)  # 5 minute timeout
            except RuntimeError:
                # No running loop, safe to use asyncio.run()
                resp = asyncio.run(study_help(req))
            except Exception as e:
                print(f"[agent_runner] Error running async study_help: {e}")
                raise

            # resp should be a StudyHelpResponse Pydantic model
            answer = None
            try:
                # Pydantic model -> dict
                resp_dict = resp.dict() if hasattr(resp, "dict") else dict(resp)
                
                # Debug: print response structure
                print(f"[agent_runner] Response dict keys: {list(resp_dict.keys()) if isinstance(resp_dict, dict) else 'Not a dict'}")
                if isinstance(resp_dict, dict):
                    print(f"[agent_runner] Response has 'answer': {resp_dict.get('answer')}")
                    print(f"[agent_runner] Response has 'agent_responses': {resp_dict.get('agent_responses')}")
                
                answer = _extract_answer_from_response(resp_dict)
                
                # If answer is None, try direct extraction from StudyHelpResponse structure
                if not answer:
                    answer = resp_dict.get("answer")
                    if not answer and resp_dict.get("agent_responses"):
                        # Get first agent response message
                        agent_responses = resp_dict.get("agent_responses")
                        if isinstance(agent_responses, list) and len(agent_responses) > 0:
                            first_response = agent_responses[0]
                            if isinstance(first_response, dict):
                                answer = first_response.get("message")
                
                # If still no answer, try to get from any string value in response
                if not answer and isinstance(resp_dict, dict):
                    # Look for final_output or any string value
                    for key in ["final_output", "output", "result"]:
                        val = resp_dict.get(key)
                        if val:
                            answer = str(val)
                            break

                # Save JSON output for debugging / audit
                fd, json_path = tempfile.mkstemp(suffix=".json")
                with open(json_path, "w", encoding="utf-8") as jf:
                    json.dump(resp_dict, jf, ensure_ascii=False, indent=2)
                print(f"[agent_runner] Wrote response JSON to {json_path}")

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
                    "response": resp_dict,
                    "json_path": json_path,
                    "ogg_path": ogg_path,
                    "played": played,
                }

            except Exception as e:
                print(f"[agent_runner] Failed to process direct response: {e}")
                return None
        except Exception as e:
            print(f"[agent_runner] Exception in direct mode: {e}")
        return
    elif mode == "http":
        # HTTP request mode
        import requests

        try:
            resp = requests.post(http_url, json=payload, timeout=60)
            resp.raise_for_status()

            resp_dict = resp.json()

            # save JSON
            fd, json_path = tempfile.mkstemp(suffix=".json")
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(resp_dict, jf, ensure_ascii=False, indent=2)
            print(f"[agent_runner] Wrote response JSON to {json_path}")

            answer = _extract_answer_from_response(resp_dict)

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
                "response": resp_dict,
                "json_path": json_path,
                "ogg_path": ogg_path,
                "played": played,
            }

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
