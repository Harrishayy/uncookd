# Audio Streaming Setup Guide

This guide explains how to set up and use the audio streaming features with TTS (Text-to-Speech) using ElevenLabs. Speech-to-Text is handled locally in the frontend.

## Prerequisites

1. **ElevenLabs API Key**: Sign up at [ElevenLabs](https://elevenlabs.io/) and get your API key
2. **Python 3.10+**: Required for the backend
3. **Node.js**: Required for the frontend

## Environment Variables

Create a `.env` file in the root directory

## Installation

The dependencies have already been installed via `uv`. They include:

- `elevenlabs`: For text-to-speech (TTS)
- `websockets`: For WebSocket support
- `aiofiles`: For async file handling

## Architecture

### Backend Components

1. **WebSocket Endpoint** (`/ws/audio`):

   - Receives text from frontend (transcribed locally)
   - Processes text with CrewAI agents
   - Generates audio using ElevenLabs TTS
   - Streams audio chunks back to frontend
   - Real-time processing

2. **HTTP Endpoints** (if needed):
   - Standard REST endpoints for text-based interactions
   - CrewAI processing endpoints

### Frontend Components

1. **AudioWebSocketClient** (`lib/audio-websocket-client.ts`):

   - Manages WebSocket connection
   - Handles audio chunk streaming
   - Provides callbacks for events

2. **Frontend Components** (handled by frontend team):
   - Speech-to-Text processing (local)
   - Audio recording
   - WebSocket client for sending text and receiving audio
   - Audio playback/output as MediaStream

## Usage

### Backend

Start the FastAPI server:

```bash
cd crewai_backend
uv run uvicorn main:app --reload --port 8000
```

### Frontend

The frontend component can be imported and used:

```tsx
import AudioCrewAI from "@/app/components/AudioCrewAI";

export default function Page() {
  return <AudioCrewAI />;
}
```

### WebSocket Flow

1. **Client connects** to `ws://localhost:8000/ws/audio`
2. **Client sends config**: `{"type": "config", "task_type": "agent", "agent_config": {...}}`
3. **Frontend transcribes speech locally** (handled in frontend)
4. **Client sends text**: `{"type": "text", "text": "user's question"}`
5. **Server processes** text with CrewAI agents
6. **Server generates audio** using ElevenLabs TTS
7. **Server streams audio chunks** (binary) back to client
8. **Client receives audio** and outputs as MediaStream

## Voice Configuration

Default voice ID: `21m00Tcm4TlvDq8ikWAM` (Rachel voice)

You can customize the voice in:

- WebSocket config: `agent_config.voice_id`
- HTTP requests: Pass `voice_id` in agent_config

Available ElevenLabs voices can be found in their dashboard.

## Troubleshooting

### "ELEVENLABS_API_KEY not set"

- Make sure `.env` file exists in `crewai_backend` directory
- Verify the API key is correct

### "No text provided" or "Invalid text"

- Ensure frontend is sending text in the correct format: `{"type": "text", "text": "..."}`
- Verify frontend STT is working correctly

### WebSocket connection fails

- Check that backend is running on port 8000
- Verify CORS settings allow WebSocket connections
- Check browser console for connection errors

### Audio not playing

- Check browser audio permissions
- Verify audio blob format is compatible
- Check browser console for audio errors

## Advanced Configuration

### TTS Voice Settings

In `utils/tts.py`, you can customize voice parameters:

```python
audio = text_to_speech(
    text,
    voice_id="custom_voice_id",
    stability=0.5,
    similarity_boost=0.75,
    style=0.0,
    use_speaker_boost=True,
)
```

## Notes

- ElevenLabs API has rate limits (check your plan)
- TTS requires an ElevenLabs API key
- WebSocket is used for real-time text-to-audio streaming
- Frontend handles Speech-to-Text locally (not in backend)
- Backend receives text and returns audio via WebSocket
