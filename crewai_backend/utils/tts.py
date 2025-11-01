"""
Text-to-Speech utility using ElevenLabs
"""

import base64
import os
from typing import Optional, Iterator
from io import BytesIO
from elevenlabs import ElevenLabs
from elevenlabs.types import VoiceSettings

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
