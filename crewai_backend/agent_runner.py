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
import sys
import os

# Add utils to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Text cleaning utility
try:
    from utils.text_utils import clean_text_for_tts, truncate_text
except ImportError:
    # Fallback if utils module not found
    def clean_text_for_tts(text: str, max_length: Optional[int] = None) -> str:
        return text if not max_length or len(text) <= max_length else text[:max_length]
    def truncate_text(text: str, max_words: int = 500, max_chars: Optional[int] = None) -> str:
        if max_chars and len(text) > max_chars:
            return text[:max_chars] + '...'
        words = text.split()
        if len(words) > max_words:
            return ' '.join(words[:max_words]) + '...'
        return text

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
        payload["preferred_agent_role"] = agent
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
        # Extract available_agent_roles from extra if provided
        available_agent_roles = None
        if extra and isinstance(extra, dict):
            available_agent_roles = extra.get("available_agent_roles")
        
        req = StudyHelpRequest(
            user_question=topic,
            subject=subject,
            help_type=help_type,
            conversation_history=None,
            preferred_agent_role=agent,  # Pass agent as preferred_agent_role
            available_agent_roles=available_agent_roles,  # Pass available agent roles
        )
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
                    "whiteboard_data": resp_dict.get("whiteboard_data"),  # Include whiteboard tool output
                    "execution_time": resp_dict.get("execution_time"),
                }

                # Include error if present
                if not success and resp_dict.get("error"):
                    json_output["error"] = resp_dict.get("error")
                
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
                    # Clean and truncate text for TTS (max ~3000 chars = ~3-4 min speech)
                    cleaned_answer = clean_text_for_tts(str(answer), max_length=3000)
                    if len(cleaned_answer) != len(str(answer)):
                        print(f"[agent_runner] Text cleaned for TTS: {len(str(answer))} -> {len(cleaned_answer)} chars")
                    
                    if speak_text_ogg:
                        try:
                            # Determine voice_id based on agent responses
                            voice_id = None
                            if agent_responses and len(agent_responses) > 0:
                                first_response = agent_responses[0]
                                if isinstance(first_response, dict):
                                    agent_name = first_response.get("agent", "")
                                    if agent_name:
                                        # Import voice mapping function
                                        try:
                                            from agents.agent import get_voice_id_for_agent
                                            voice_id = get_voice_id_for_agent(agent_name, agent_responses)
                                            print(f"[agent_runner] Using voice_id: {voice_id} for agent: {agent_name}")
                                        except ImportError:
                                            pass
                            
                            ogg_path, played = speak_text_ogg(cleaned_answer, voice_id=voice_id if voice_id else "21m00Tcm4TlvDq8ikWAM")
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
            if answer:
                # Clean and truncate text for TTS (max ~3000 chars = ~3-4 min speech)
                cleaned_answer = clean_text_for_tts(str(answer), max_length=3000)
                if len(cleaned_answer) != len(str(answer)):
                    print(f"[agent_runner] Text cleaned for TTS: {len(str(answer))} -> {len(cleaned_answer)} chars")
                
                if speak_text_ogg:
                    try:
                        # Determine voice_id based on agent responses
                        voice_id = None
                        if agent_responses and len(agent_responses) > 0:
                            first_response = agent_responses[0]
                            if isinstance(first_response, dict):
                                agent_name = first_response.get("agent", "")
                                if agent_name:
                                    # Import voice mapping function
                                    try:
                                        from agents.agent import get_voice_id_for_agent
                                        voice_id = get_voice_id_for_agent(agent_name, agent_responses)
                                        print(f"[agent_runner] Using voice_id: {voice_id} for agent: {agent_name}")
                                    except ImportError:
                                        pass
                        
                        ogg_path, played = speak_text_ogg(cleaned_answer, voice_id=voice_id if voice_id else "21m00Tcm4TlvDq8ikWAM")
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
