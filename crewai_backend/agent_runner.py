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

from typing import Optional, Dict, Any, List
import json
import tempfile
import sys
import os
import re

# Add utils to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def truncate_to_word_limit(text: str, max_words: int = 100) -> str:
    """Truncate text to a maximum word count, preserving sentence boundaries.

    Args:
        text: The text to truncate
        max_words: Maximum number of words (default 100 words ≈ 25-30 seconds of speech)

    Returns:
        Truncated text ending at a sentence boundary if possible
    """
    if not text:
        return ""

    words = text.split()
    if len(words) <= max_words:
        return text

    # Truncate to max_words
    truncated_words = words[:max_words]
    truncated_text = " ".join(truncated_words)

    # Try to end at a sentence boundary (., !, ?)
    # Look backwards from the end for the last sentence-ending punctuation
    last_period = max(
        truncated_text.rfind("."), truncated_text.rfind("!"), truncated_text.rfind("?")
    )

    if (
        last_period > len(truncated_text) * 0.5
    ):  # Only if we're not cutting off more than half
        return truncated_text[: last_period + 1].strip()

    # Otherwise just add ellipsis
    return truncated_text.strip() + "..."


def clean_text_for_tts(text: str, max_length: Optional[int] = None) -> str:
    """Clean text for TTS by removing nonsensical symbols but keeping meaningful ones.

    Keeps:
    - Math symbols that can be spoken: +, -, ×, ÷, =, <, >, %, π, √
    - Punctuation: . , ! ? ; :
    - Parentheses and brackets for grouping
    - Numbers and letters

    Removes:
    - Markdown formatting: **, *, _, `, #
    - Code blocks and inline code
    - URLs
    - Excessive special characters
    """
    if not text:
        return ""

    # Remove markdown bold/italic
    text = re.sub(r"\*\*([^\*]+)\*\*", r"\1", text)  # **bold**
    text = re.sub(r"__([^_]+)__", r"\1", text)  # __bold__
    text = re.sub(r"(?<!\*)\*([^\*\n]+)\*(?!\*)", r"\1", text)  # *italic*
    text = re.sub(r"(?<!_)_([^_\n]+)_(?!_)", r"\1", text)  # _italic_

    # Remove inline code
    text = re.sub(r"`([^`]+)`", r"\1", text)

    # Remove code blocks
    text = re.sub(r"```[^\n]*\n(.*?)```", r"\1", text, flags=re.DOTALL)

    # Remove markdown headers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)

    # Remove URLs
    text = re.sub(r"https?://[^\s]+", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)  # [text](url)

    # Remove horizontal rules
    text = re.sub(r"^[-*_]{3,}$", "", text, flags=re.MULTILINE)

    # Clean up list markers but keep the content
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)

    # Remove excessive newlines
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)

    # Clean up multiple spaces
    text = re.sub(r" +", " ", text)

    # Truncate if needed (character-based, for backward compatibility)
    if max_length and len(text) > max_length:
        text = text[:max_length] + "..."

    return text.strip()


# TTS helpers - import both functions
try:
    from tts.tts import text_to_speech_ogg  # Generates OGG without playing
except Exception:
    text_to_speech_ogg = None


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
        req = StudyHelpRequest(
            user_question=topic,
            subject=subject,
            help_type=help_type,
            conversation_history=None,
            preferred_agent_role=agent,  # Pass agent as preferred_agent_role
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
                    "execution_time": resp_dict.get("execution_time"),
                }

                # Include error if present
                if not success and resp_dict.get("error"):
                    json_output["error"] = resp_dict.get("error")

                # Debug: print response structure
                print(
                    f"[agent_runner] Response dict keys: {list(resp_dict.keys()) if isinstance(resp_dict, dict) else 'Not a dict'}"
                )
                if isinstance(resp_dict, dict):
                    print(
                        f"[agent_runner] Response has 'answer': {resp_dict.get('answer')}"
                    )
                    print(
                        f"[agent_runner] Response has 'agent_responses': {resp_dict.get('agent_responses')}"
                    )

                answer = _extract_answer_from_response(resp_dict)

                # If answer is None, try direct extraction from StudyHelpResponse structure
                if not answer:
                    answer = resp_dict.get("answer")
                    if not answer and resp_dict.get("agent_responses"):
                        # Get first agent response message
                        agent_responses = resp_dict.get("agent_responses")
                        if (
                            isinstance(agent_responses, list)
                            and len(agent_responses) > 0
                        ):
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

                # Generate TTS for ALL agent responses sequentially (no overlapping)
                ogg_paths = []
                if text_to_speech_ogg and agent_responses:
                    print(
                        f"[agent_runner] Generating TTS for {len(agent_responses)} agent(s)..."
                    )
                    for i, resp in enumerate(agent_responses):
                        if isinstance(resp, dict):
                            agent_name = resp.get("agent", "Unknown Agent")
                            message = resp.get("message", "")

                            if message and message.strip():
                                # First truncate to word limit (100 words ≈ 25 seconds)
                                truncated_message = truncate_to_word_limit(
                                    str(message), max_words=100
                                )

                                # Then clean text for TTS (remove markdown, etc.)
                                cleaned_message = clean_text_for_tts(truncated_message)

                                word_count = len(cleaned_message.split())

                                if cleaned_message:
                                    try:
                                        print(
                                            f"[agent_runner] Generating TTS for {agent_name} ({word_count} words, ~{word_count / 3:.0f}s)..."
                                        )
                                        # Generate OGG bytes without playing
                                        ogg_bytes = text_to_speech_ogg(cleaned_message)

                                        if ogg_bytes:
                                            # Save to temp file
                                            fd_ogg, ogg_path = tempfile.mkstemp(
                                                suffix=f"_agent{i + 1}.ogg"
                                            )
                                            with open(ogg_path, "wb") as f:
                                                f.write(ogg_bytes)
                                            ogg_paths.append(
                                                {
                                                    "agent": agent_name,
                                                    "path": ogg_path,
                                                    "index": i,
                                                }
                                            )
                                            print(
                                                f"[agent_runner] ✓ TTS saved for {agent_name}: {ogg_path}"
                                            )
                                    except Exception as e:
                                        print(
                                            f"[agent_runner] TTS generation failed for {agent_name}: {e}"
                                        )
                elif not text_to_speech_ogg:
                    print(
                        "[agent_runner] text_to_speech_ogg not available; install dependencies or check tts module."
                    )

                print(f"[agent_runner] Generated {len(ogg_paths)} TTS file(s)")
                return {
                    "response": json_output,
                    "json_path": json_path,
                    "ogg_paths": ogg_paths,  # List of all TTS files generated
                    "num_tts_files": len(ogg_paths),
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
                    "ogg_paths": [],
                    "num_tts_files": 0,
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

            # Generate TTS for ALL agent responses sequentially (no overlapping)
            ogg_paths = []
            if text_to_speech_ogg and agent_responses:
                print(
                    f"[agent_runner] Generating TTS for {len(agent_responses)} agent(s)..."
                )
                for i, resp in enumerate(agent_responses):
                    if isinstance(resp, dict):
                        agent_name = resp.get("agent", "Unknown Agent")
                        message = resp.get("message", "")

                        if message and message.strip():
                            # First truncate to word limit (100 words ≈ 25 seconds)
                            truncated_message = truncate_to_word_limit(
                                str(message), max_words=100
                            )

                            # Then clean text for TTS (remove markdown, etc.)
                            cleaned_message = clean_text_for_tts(truncated_message)

                            word_count = len(cleaned_message.split())

                            if cleaned_message:
                                try:
                                    print(
                                        f"[agent_runner] Generating TTS for {agent_name} ({word_count} words, ~{word_count / 3:.0f}s)..."
                                    )
                                    # Generate OGG bytes without playing
                                    ogg_bytes = text_to_speech_ogg(cleaned_message)

                                    if ogg_bytes:
                                        # Save to temp file
                                        fd_ogg, ogg_path = tempfile.mkstemp(
                                            suffix=f"_agent{i + 1}.ogg"
                                        )
                                        with open(ogg_path, "wb") as f:
                                            f.write(ogg_bytes)
                                        ogg_paths.append(
                                            {
                                                "agent": agent_name,
                                                "path": ogg_path,
                                                "index": i,
                                            }
                                        )
                                        print(
                                            f"[agent_runner] ✓ TTS saved for {agent_name}: {ogg_path}"
                                        )
                                except Exception as e:
                                    print(
                                        f"[agent_runner] TTS generation failed for {agent_name}: {e}"
                                    )
            elif not text_to_speech_ogg:
                print(
                    "[agent_runner] text_to_speech_ogg not available; install dependencies or check tts module."
                )

            print(f"[agent_runner] Generated {len(ogg_paths)} TTS file(s)")
            return {
                "response": json_output,
                "json_path": json_path,
                "ogg_paths": ogg_paths,  # List of all TTS files generated
                "num_tts_files": len(ogg_paths),
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
                "ogg_paths": [],
                "num_tts_files": 0,
            }
    else:
        print(f"[agent_runner] Unknown mode: {mode}")
        return None


if __name__ == "__main__":
    # Example usage - Test with discussion mode to generate TTS for multiple agents
    # Each agent's response is limited to 100 words (≈25 seconds of audio)
    result = run_agent(
        mode="direct",
        topic="What is a derivative?",
        subject="mathematics",
        help_type="discussion",  # Multiple agents will respond
        agent="expert",  # Primary agent
    )

    if result:
        print("\n" + "=" * 60)
        print("TTS Generation Summary:")
        print(f"  - JSON saved to: {result['json_path']}")
        print(f"  - Generated {result['num_tts_files']} TTS file(s)")
        print("  - Each response limited to 100 words (~25 seconds)")
        if result["ogg_paths"]:
            for ogg_info in result["ogg_paths"]:
                print(f"    • {ogg_info['agent']}: {ogg_info['path']}")
        print("=" * 60 + "\n")
