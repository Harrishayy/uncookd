import sys
import types
import os
import json

"""
Interactive TTS playback test.

This script is intentionally interactive: when run it will prompt you for a topic,
generate an agent response (using a simple DummyAgent), then attempt to play the
response aloud. It prefers the ElevenLabs-backed `utils.tts.text_to_speech` bytes
if available; otherwise it will fall back to native system TTS (spd-say/say/PowerShell).

Note: because this is interactive and plays sound, run it locally (not in CI).
Run with: python -u test_tts_playback.py
"""

import sys
import tempfile
import platform
import subprocess
from typing import Optional


# crewai_backend/conftest.py
from pathlib import Path
from dotenv import load_dotenv


root = Path(__file__).resolve().parent.parent.parent  # -> crewi_backend
sys.path.insert(0, str(root))  # -> repo root (uncookd)

from crewai_backend.agents.agent import Agent

env_path = root / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    # helpful debug output in CI/local dev
    print(f"[conftest] .env not found at {env_path}")

try:
    # Prefer an OGG-producing wrapper if available
    from tts.tts import text_to_speech_ogg as text_to_speech
except Exception:
    try:
        from tts.tts import text_to_speech
    except Exception:
        text_to_speech = None


class DummyAgent:
    def __init__(self, role: str = "Assistant"):
        self.role = role

    def execute_task(self, task_description: str) -> str:
        return f"Response from {self.role}: {task_description}"


def play_audio_bytes(audio_bytes: bytes) -> str:
    """Save bytes to a temp OGG file (convert if needed) and play it.

    Conversion to OGG is attempted with pydub when available. If conversion
    fails, the original bytes are written to the OGG path (may not play).
    """
    # Default to .ogg
    fd, path = tempfile.mkstemp(suffix=".ogg")

    # Try to convert incoming bytes to ogg using pydub if available
    try:
        from pydub import AudioSegment
        from pydub.playback import play
        from io import BytesIO

        bio = BytesIO(audio_bytes)
        # Let pydub detect input format automatically
        seg = AudioSegment.from_file(bio)
        seg.export(path, format="ogg")

        # Play using pydub playback
        play(seg)
        return path
    except Exception:
        # Fall back to writing bytes directly
        with open(path, "wb") as f:
            f.write(audio_bytes)

    # If we get here, conversion/playback via pydub failed.
    # Try playsound on the written file
    try:
        from playsound import playsound

        playsound(path)
        return path
    except Exception:
        pass

    # Final fallback: open with system default (will play in external player)
    system = platform.system()
    if system == "Darwin":
        opener = "open"
    elif system == "Windows":
        opener = "start"
    else:
        opener = "xdg-open"

    try:
        if system == "Windows":
            subprocess.Popen([opener, path], shell=True)
        else:
            subprocess.Popen([opener, path])
        return path
    except Exception:
        print("Could not play audio automatically. Saved to:", path)
        return path


def speak_text_native(text: str) -> bool:
    """Use a native TTS command if available. Returns True if command executed."""
    system = platform.system()
    try:
        if system == "Darwin":
            subprocess.run(["say", text])
            return True
        elif system == "Windows":
            # Use PowerShell to speak
            cmd = [
                "powershell",
                "-Command",
                f"Add-Type –AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('{text.replace("'", "\\'")}')",
            ]
            subprocess.run(cmd, shell=True)
            return True
        else:
            # Try spd-say (common on Linux)
            import shutil

            if shutil.which("spd-say"):
                subprocess.run(["spd-say", text])
                return True
            if shutil.which("espeak"):
                subprocess.run(["espeak", text])
                return True
    except Exception:
        pass
    return False


def interactive_playback():
    print("\nInteractive TTS playback test")
    print("Enter a topic/question (or blank to exit):")
    try:
        topic = input("Topic: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nExiting")
        return

    if not topic:
        print("No topic provided, exiting.")
        return

    request = input("")

    agent = Agent(
        role=request.agent_config.get("role", "Assistant")
        if request.agent_config
        else "Assistant",
        goal=request.agent_config.get("goal", "Complete the given task")
        if request.agent_config
        else "Complete the given task",
        backstory=request.agent_config.get("backstory", "You are a helpful assistant")
        if request.agent_config
        else "You are a helpful assistant",
        verbose=True,
        allow_delegation=False,
    )

    response = agent.execute_task(topic)
    print("\nGenerated response:")
    print(response)

    # Try ElevenLabs-backed TTS if available
    audio_bytes: Optional[bytes] = None
    if text_to_speech:
        try:
            audio_bytes = text_to_speech(response)
        except Exception as e:
            print("TTS call failed:", e)

    # If we have audio bytes, play them
    if audio_bytes:
        path = play_audio_bytes(audio_bytes)
        print(f"Playing audio from: {path}")
        return

    # Else try native TTS on the platform
    print("No audio bytes from ElevenLabs TTS available; attempting native TTS...")
    # Use platform text-to-speech (espeak/spd-say/say/powershell)
    spoken = False
    try:
        import shutil

        if (
            shutil.which("say")
            or shutil.which("spd-say")
            or shutil.which("espeak")
            or shutil.which("powershell")
        ):
            spoken = speak_text_native(response)
    except Exception:
        spoken = False

    if not spoken:
        print(
            "Native TTS not available. To enable audio playback, either set ELEVENLABS_API_KEY for ElevenLabs TTS or install a local TTS (espeak/spd-say) or pydub+ffmpeg for programmatic playback."
        )


if __name__ == "__main__":
    interactive_playback()
