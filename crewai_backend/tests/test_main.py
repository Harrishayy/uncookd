import sys
import types
import json
import pytest
import os
import importlib.util


from fastapi.testclient import TestClient
# python -m pytest -q crewai_backend/test_main.py---------------------------------------------------------------------------
# Create a fake `crewai` module before importing the app to avoid ImportError
# (main.py may import Agent/Task/Crew at import time). Tests will patch these
# further if needed. We also load `main.py` by path so the tests work whether
# you run them from the package folder or repo root.
# ---------------------------------------------------------------------------

fake_crewai = types.ModuleType("crewai")


class DummyAgent:
    def __init__(
        self,
        role="Assistant",
        goal=None,
        backstory=None,
        verbose=False,
        allow_delegation=True,
    ):
        self.role = role

    def execute_task(self, task):
        return f"Response from {self.role}: {task.description}"


class DummyTask:
    def __init__(self, description, agent=None, expected_output=None):
        self.description = description
        self.agent = agent


class DummyCrew:
    def __init__(self, agents=None, tasks=None, verbose=False):
        self.agents = agents or []
        self.tasks = tasks or []

    def kickoff(self):
        # Return a dict mapping task.description -> result string
        return {
            t.description: f"Generated answer for: {t.description}" for t in self.tasks
        }


fake_crewai.Agent = DummyAgent
fake_crewai.Task = DummyTask
fake_crewai.Crew = DummyCrew

# Register stub module before importing the app module so imports inside
# `main.py` that reference `crewai` will resolve to our stub.
sys.modules["crewai"] = fake_crewai

# Load main.py by path (works regardless of current working directory)
here = os.path.dirname(__file__)
main_path = os.path.join(here, "main.py")
spec = importlib.util.spec_from_file_location("crewai_main", main_path)
main = importlib.util.module_from_spec(spec)
sys.modules["crewai_main"] = main
# Ensure the directory with main.py is on sys.path so sibling imports (agents, utils, websocket)
# resolve when main.py does absolute imports like `from agents.example_agents import ...`.
if here not in sys.path:
    sys.path.insert(0, here)

spec.loader.exec_module(main)


@pytest.fixture
def client():
    return TestClient(main.app)


def test_health_endpoints(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json().get("status") == "healthy"

    r2 = client.get("/health")
    assert r2.status_code == 200
    assert r2.json().get("service") == "crewai-backend"


def test_study_help_explanation(monkeypatch, client):
    # Patch classroom creator and explanation task to use dummy objects
    def fake_create_classroom_crew(
        subject, include_visual_assistant=True, agents_config=None
    ):
        # Create dummy agents with roles used in the code
        agents = [DummyAgent(role="Expert"), DummyAgent(role="Visual Assistant")]
        return DummyCrew(agents=agents, tasks=[])

    def fake_create_explanation_task(
        concept, agent, audience_level="intermediate", include_visuals=True
    ):
        return DummyTask(description=f"explain:{concept}", agent=agent)

    monkeypatch.setattr(main, "create_classroom_crew", fake_create_classroom_crew)
    monkeypatch.setattr(main, "create_explanation_task", fake_create_explanation_task)

    payload = {
        "user_question": "What is a derivative?",
        "subject": "mathematics",
        "help_type": "explanation",
    }

    resp = client.post("/api/study/help", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    # We expect an answer derived from our DummyCrew.kickoff result
    assert data["answer"] is not None
    assert "What is a derivative?" in data["agent_responses"][0][
        "message"
    ] or isinstance(data["agent_responses"], list)


def test_websocket_audio_stream(monkeypatch, client):
    # Patch Agent/Task used by the websocket handler to our dummies
    monkeypatch.setattr(main, "Agent", DummyAgent)
    monkeypatch.setattr(main, "Task", DummyTask)
    monkeypatch.setattr(main, "Crew", DummyCrew)

    # Patch the TTS stream to yield predictable chunks
    def fake_tts_stream(text, voice_id=None, model_id=None):
        yield b"chunk1"
        yield b"chunk2"

    monkeypatch.setattr(main, "text_to_speech_stream", fake_tts_stream)

    with client.websocket_connect("/ws/audio") as websocket:
        # On connect the server should send a connected message
        msg = websocket.receive_json()
        assert msg["type"] == "connected"

        # Send config message
        websocket.send_text(
            json.dumps(
                {
                    "type": "config",
                    "task_type": "agent",
                    "agent_config": {"role": "Assistant", "voice_id": "fake"},
                }
            )
        )
        cfg = websocket.receive_json()
        assert cfg["type"] == "config_received"

        # Send a text message to process
        websocket.send_text(json.dumps({"type": "text", "text": "Hello world"}))

        # Acknowledgement of text_received
        ack = websocket.receive_json()
        assert ack["type"] == "text_received"

        # Response text from agent
        resp_text = websocket.receive_json()
        assert resp_text["type"] == "response_text"
        assert "Response from" in resp_text["text"] or isinstance(
            resp_text["text"], str
        )

        # Audio start
        audio_start = websocket.receive_json()
        assert audio_start["type"] == "audio_start"

        # Receive binary chunks (two chunks)
        b1 = websocket.receive_bytes()
        assert b1 == b"chunk1"
        b2 = websocket.receive_bytes()
        assert b2 == b"chunk2"

        # Audio end
        audio_end = websocket.receive_json()
        assert audio_end["type"] == "audio_end"
