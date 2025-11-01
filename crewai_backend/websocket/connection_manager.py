"""
WebSocket connection manager for handling multiple client connections
"""

from typing import Dict, Set
from fastapi import WebSocket
import json
import asyncio


class ConnectionManager:
    """Manages WebSocket connections and broadcasts"""

    def __init__(self):
        # Active connections: {session_id: WebSocket}
        self.active_connections: Dict[str, WebSocket] = {}
        # Connection metadata: {session_id: {user_id, created_at, etc.}}
        self.connection_metadata: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, session_id: str = None):
        """
        Accept a WebSocket connection

        Args:
            websocket: WebSocket connection
            session_id: Optional session ID, will generate if not provided
        """
        await websocket.accept()

        if not session_id:
            import uuid

            session_id = str(uuid.uuid4())

        self.active_connections[session_id] = websocket
        self.connection_metadata[session_id] = {
            "connected_at": asyncio.get_event_loop().time(),
        }

        return session_id

    def disconnect(self, session_id: str):
        """Remove a WebSocket connection"""
        if session_id in self.active_connections:
            del self.active_connections[session_id]
        if session_id in self.connection_metadata:
            del self.connection_metadata[session_id]

    async def send_personal_message(self, message: dict, session_id: str):
        """
        Send a message to a specific client

        Args:
            message: Dictionary to send (will be JSON encoded)
            session_id: Session ID of recipient
        """
        if session_id in self.active_connections:
            try:
                websocket = self.active_connections[session_id]
                await websocket.send_json(message)
            except Exception as e:
                print(f"Error sending message to {session_id}: {e}")
                self.disconnect(session_id)

    async def send_audio_chunk(
        self, audio_bytes: bytes, session_id: str, metadata: dict = None
    ):
        """
        Send audio chunk to a specific client

        Args:
            audio_bytes: Audio data as bytes
            session_id: Session ID of recipient
            metadata: Optional metadata dict to include
        """
        if session_id in self.active_connections:
            try:
                websocket = self.active_connections[session_id]
                # Send as binary with optional JSON metadata first
                if metadata:
                    await websocket.send_json({"type": "audio_metadata", **metadata})
                await websocket.send_bytes(audio_bytes)
            except Exception as e:
                print(f"Error sending audio to {session_id}: {e}")
                self.disconnect(session_id)

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients"""
        disconnected = []
        for session_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"Error broadcasting to {session_id}: {e}")
                disconnected.append(session_id)

        # Clean up disconnected clients
        for session_id in disconnected:
            self.disconnect(session_id)

    def is_connected(self, session_id: str) -> bool:
        """Check if a session is connected"""
        return session_id in self.active_connections
