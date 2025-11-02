"""
Text-to-Speech utility using ElevenLabs
"""

import base64
import os
import platform
import subprocess
import shutil
import tempfile
from typing import Optional, Iterator, Tuple
from io import BytesIO
from elevenlabs import ElevenLabs
from elevenlabs.types import VoiceSettings
from pathlib import Path
from dotenv import load_dotenv

# pathlib import Path
root = Path(__file__).resolve().parent.parent.parent  # -> repo root (uncookd)
env_path = root / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    # helpful debug output in CI/local dev
    print(f"[conftest] .env not found at {env_path}")

try:
    # Optional conversion support
    from pydub import AudioSegment
except Exception:
    AudioSegment = None

# Get API key from environment
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# Initialize client if API key is available
client = None
if ELEVENLABS_API_KEY:
    try:
        client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
    except Exception as e:
        print(f"Warning: Failed to initialize ElevenLabs client: {e}")
        client = None


def text_to_speech(
    text: str,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",  # Default Rachel voice
    model_id: str = "eleven_monolingual_v1",
    stability: float = 0.5,
    similarity_boost: float = 0.75,
    style: float = 0.0,
    use_speaker_boost: bool = True,
) -> Optional[bytes]:
    """
    Convert text to speech using ElevenLabs

    Args:
        text: Text to convert to speech
        voice_id: ElevenLabs voice ID (default: Rachel)
        model_id: ElevenLabs model ID
        stability: Voice stability (0.0-1.0)
        similarity_boost: Similarity boost (0.0-1.0)
        style: Style setting (0.0-1.0)
        use_speaker_boost: Enable speaker boost

    Returns:
        Audio bytes (OGG format) or None if API key not set
    """
    if not ELEVENLABS_API_KEY or not client:
        print("Warning: ELEVENLABS_API_KEY not set. TTS will not work.")
        return None

    try:
        if client:
            # Use client.text_to_speech.convert for newer API
            # convert() returns an Iterator[bytes], so we need to join all chunks
            audio_chunks = client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id=model_id,
                voice_settings=VoiceSettings(
                    stability=stability,
                    similarity_boost=similarity_boost,
                    style=style,
                    use_speaker_boost=use_speaker_boost,
                ),
            )
            # Join all audio chunks into single bytes
            return b"".join(audio_chunks)
        else:
            print("Warning: ElevenLabs client not initialized")
            return None
    except Exception as e:
        print(f"ElevenLabs TTS error: {e}")
        return None


def text_to_speech_stream(
    text: str,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    model_id: str = "eleven_monolingual_v1",
) -> Iterator[bytes]:
    """
    Convert text to speech using ElevenLabs streaming

    Args:
        text: Text to convert to speech
        voice_id: ElevenLabs voice ID
        model_id: ElevenLabs model ID

    Yields:
        Audio chunks as bytes
    """
    if not ELEVENLABS_API_KEY or not client:
        print("Warning: ELEVENLABS_API_KEY not set. TTS streaming will not work.")
        return

    try:
        if client:
            # Use client.text_to_speech.convert for streaming (returns Iterator[bytes])
            # convert() already returns chunks, so we can stream them
            audio_stream = client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id=model_id,
            )
            for chunk in audio_stream:
                yield bytes(chunk)
        else:
            print("Warning: ElevenLabs client not initialized")
            return
    except Exception as e:
        print(f"ElevenLabs TTS streaming error: {e}")


def _convert_bytes_to_ogg(input_bytes: bytes) -> Optional[bytes]:
    """
    Convert audio bytes (mp3/wav/etc) to OGG using pydub if available.
    Returns OGG bytes or None if conversion failed or pydub not installed.
    """
    if not AudioSegment:
        print("pydub not available; cannot convert to OGG")
        return None

    try:
        bio = BytesIO(input_bytes)
        # Let pydub detect format automatically where possible
        seg = AudioSegment.from_file(bio)
        out = BytesIO()
        seg.export(out, format="ogg")
        return out.getvalue()
    except Exception as e:
        print(f"Failed to convert audio to OGG: {e}")
        return None


def text_to_speech_ogg(
    text: str,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    model_id: str = "eleven_monolingual_v1",
):
    """
    Convenience wrapper that returns OGG audio bytes. Falls back to returning
    the original bytes if conversion is not possible.
    """
    mp3_bytes = text_to_speech(text, voice_id=voice_id, model_id=model_id)
    if not mp3_bytes:
        return None

    ogg = _convert_bytes_to_ogg(mp3_bytes)
    return ogg if ogg is not None else mp3_bytes


def text_to_base64_audio(
    text: str, voice_id: str = "21m00Tcm4TlvDq8ikWAM"
) -> Optional[str]:
    """
    Convert text to base64-encoded audio string for JSON responses

    Args:
        text: Text to convert
        voice_id: ElevenLabs voice ID

    Returns:
        Base64 string or None
    """
    audio_bytes = text_to_speech(text, voice_id=voice_id)
    if audio_bytes:
        return base64.b64encode(audio_bytes).decode("utf-8")
    return None


def _play_file_with_fallback(path: str) -> bool:
    """Attempt to play an audio file using pydub, playsound, or OS default opener.

    Returns True if playback was started/succeeded, False otherwise.
    """
    # Try programmatic playback with pydub if available
    try:
        if AudioSegment:
            from pydub.playback import play

            seg = AudioSegment.from_file(path)
            play(seg)
            return True
    except Exception:
        pass

    # Try playsound
    try:
        from playsound import playsound

        playsound(path)
        return True
    except Exception:
        pass

    # Fallback: open with system default application (may play audio)
    system = platform.system()
    opener = "xdg-open"
    if system == "Darwin":
        opener = "open"
    elif system == "Windows":
        opener = "start"

    try:
        # On Windows, shell=True helps `start` behave as expected
        if system == "Windows":
            subprocess.Popen([opener, path], shell=True)
        else:
            subprocess.Popen([opener, path])
        return True
    except Exception:
        return False


def speak_text_native(text: str) -> bool:
    """Use native platform TTS (say/spd-say/espeak/PowerShell) as a fallback.

    Returns True if a native TTS command was executed.
    """
    system = platform.system()
    try:
        if system == "Darwin" and shutil.which("say"):
            subprocess.run(["say", text])
            return True
        if system == "Windows":
            # Use PowerShell SAPI
            # Escape single quotes in text for PowerShell
            escaped_text = text.replace("'", "''")
            cmd = [
                "powershell",
                "-Command",
                f"Add-Type –AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('{escaped_text}')",
            ]
            subprocess.run(cmd, shell=True)
            return True
        # Linux: try spd-say or espeak
        if shutil.which("spd-say"):
            subprocess.run(["spd-say", text])
            return True
        if shutil.which("espeak"):
            subprocess.run(["espeak", text])
            return True
    except Exception:
        return False
    return False


def play_ogg_bytes(ogg_bytes: bytes) -> Tuple[Optional[str], bool]:
    """Write OGG bytes to a temp file and attempt to play them.

    Returns (path, played_bool). Path may be None on failure to write.
    """
    try:
        fd, path = tempfile.mkstemp(suffix=".ogg")
        # If pydub is available, try to convert the incoming bytes to a proper OGG file
        if AudioSegment:
            try:
                bio = BytesIO(ogg_bytes)
                seg = AudioSegment.from_file(bio)
                # Export as OGG to the temp path
                seg.export(path, format="ogg")
            except Exception:
                # If conversion fails, fall back to writing raw bytes
                with os.fdopen(fd, "wb") as f:
                    f.write(ogg_bytes)
        else:
            # No pydub: write raw bytes
            with os.fdopen(fd, "wb") as f:
                f.write(ogg_bytes)
    except Exception as e:
        print(f"Failed to write OGG temp file: {e}")
        return (None, False)

    played = _play_file_with_fallback(path)
    return (path, played)


def speak_text_ogg(
    text: str,
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    model_id: str = "eleven_monolingual_v1",
) -> Tuple[Optional[str], bool]:
    """High-level helper: synthesize `text` to OGG (if possible), play it, and return (path, played).

    Behavior:
    - If ElevenLabs + text_to_speech_ogg available, use that bytes and play via pydub/playsound/OS.
    - If only raw text_to_speech (mp3 bytes) available, try to convert to OGG via pydub and play.
    - If no ElevenLabs client available, fall back to native platform TTS (say/espeak/powershell).
    """
    # Try preferred OGG-producing function if present
    ogg_bytes = None
    if globals().get("text_to_speech_ogg"):
        try:
            ogg_bytes = text_to_speech_ogg(text, voice_id=voice_id, model_id=model_id)
        except Exception as e:
            print(f"text_to_speech_ogg failed: {e}")

    # Fallback to raw text_to_speech then convert
    if ogg_bytes is None and globals().get("text_to_speech"):
        try:
            raw_bytes = text_to_speech(text, voice_id=voice_id, model_id=model_id)
            if raw_bytes:
                # convert mp3/wav bytes to ogg if pydub is available
                if AudioSegment:
                    try:
                        bio = BytesIO(raw_bytes)
                        seg = AudioSegment.from_file(bio)
                        out = BytesIO()
                        seg.export(out, format="ogg")
                        ogg_bytes = out.getvalue()
                    except Exception as e:
                        print(f"Conversion to OGG failed: {e}")
                        ogg_bytes = raw_bytes
                else:
                    ogg_bytes = raw_bytes
        except Exception as e:
            print(f"text_to_speech failed: {e}")

    # If we have bytes, play them
    if ogg_bytes:
        path, played = play_ogg_bytes(ogg_bytes)
        return (path, played)

    # Last resort: native TTS
    native_played = speak_text_native(text)
    return (None, native_played)
