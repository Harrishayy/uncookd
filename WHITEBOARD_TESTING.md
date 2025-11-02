# Whiteboard Tool Output Testing Guide

This guide explains how to test the whiteboard tool output extraction and rendering functionality.

## Prerequisites

1. **Backend server running** on `http://localhost:8000`
2. **Frontend server running** on `http://localhost:3000`
3. **API keys configured** in `.env`:
   - `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`)
   - `ELEVENLABS_API_KEY` (optional, for TTS)

## Quick Start

### 1. Start Backend Server

```bash
cd crewai_backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
python server.py
# OR
uvicorn server:app --reload --port 8000
```

### 2. Start Frontend Server

```bash
# In a new terminal
npm run dev
```

### 3. Open Meeting Page

Navigate to: `http://localhost:3000/meeting`

## Testing Methods

### Method 1: Direct API Testing (Recommended for Initial Testing)

Test the backend extraction directly using curl or a REST client:

```bash
curl -X POST "http://localhost:8000/api/study/help" \
  -H "Content-Type: application/json" \
  -d '{
    "user_question": "Graph the equation y = x^2 - 4x + 4",
    "subject": "mathematics",
    "help_type": "explanation",
    "preferred_agent_role": "professor"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "answer": "...",
  "agent_responses": [...],
  "whiteboard_data": {
    "type": "graph",
    "description": "Graph visualization for: y = x^2 - 4x + 4",
    "specifications": {...},
    "instructions": "...",
    "render_engine": "desmos",
    "expression": "y = x^2 - 4x + 4",
    "desmos": true
  },
  "execution_time": 5.23
}
```

**What to check:**
- ✅ `whiteboard_data` field exists
- ✅ `whiteboard_data.type` is present (e.g., "graph", "diagram")
- ✅ `whiteboard_data.expression` or `whiteboard_data.instructions` present
- ✅ Backend logs show: `[study_help] Extracted whiteboard data from professor agent`

### Method 2: Test via Transcript API (Full Flow)

Test the complete flow through the transcript endpoint:

```bash
curl -X POST "http://localhost:8000/api/generate-response" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Can you graph y equals x squared minus 4x plus 4?",
    "timestamp": 1234567890,
    "isFinal": true
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "transcript": "Can you graph y equals x squared minus 4x plus 4?",
  "response_text": "...",
  "response_transcript": "...",
  "audio": "base64_encoded_audio...",
  "whiteboard_data": {
    "type": "graph",
    ...
  }
}
```

### Method 3: Frontend UI Testing (End-to-End)

1. **Open the meeting page**: `http://localhost:3000/meeting`
2. **Open browser DevTools** (F12) to view console logs
3. **Enable microphone** if prompted
4. **Speak a question** that should trigger whiteboard usage:
   - "Graph the function y = x squared minus 4x plus 4"
   - "Show me a diagram of photosynthesis"
   - "Draw a graph of y = sin(x)"
   - "Can you visualize the quadratic formula?"

5. **Watch for:**
   - Console logs showing whiteboard data received
   - Whiteboard automatically appearing
   - Agent drawing on the whiteboard

**Console logs to look for:**
```
[Transcript API] Whiteboard data received: {type: "graph", ...}
[Transcript API] Generated whiteboard prompt: Draw a graph showing: ...
[Agent] Processing new prompt: Draw a graph...
[Agent] Prompt completed
```

### Method 4: Using Python Script (Detailed Testing)

Create a test script:

```python
# test_whiteboard.py
import requests
import json

url = "http://localhost:8000/api/study/help"

payload = {
    "user_question": "Graph the quadratic equation y = x^2 - 5x + 6",
    "subject": "mathematics",
    "help_type": "explanation",
    "preferred_agent_role": "professor"  # Important: professor has whiteboard tool access
}

response = requests.post(url, json=payload)
data = response.json()

print(f"Success: {data.get('success')}")
print(f"\nWhiteboard Data Found: {data.get('whiteboard_data') is not None}")

if data.get('whiteboard_data'):
    wb_data = data['whiteboard_data']
    print(f"\nWhiteboard Type: {wb_data.get('type')}")
    print(f"Expression: {wb_data.get('expression')}")
    print(f"Render Engine: {wb_data.get('render_engine')}")
    print(f"\nFull Whiteboard Data:")
    print(json.dumps(wb_data, indent=2))
else:
    print("\n⚠️  No whiteboard data found in response")
    print("\nAgent Responses:")
    for resp in data.get('agent_responses', [])[:3]:
        print(f"  - {resp.get('agent')}: {resp.get('message')[:100]}...")
```

Run it:
```bash
cd crewai_backend
python test_whiteboard.py
```

## Questions That Should Trigger Whiteboard

Questions that typically trigger the whiteboard tool (professor agent):

### Mathematics:
- "Graph y = x^2 - 4x + 4"
- "Show me the graph of sin(x)"
- "Visualize the quadratic formula"
- "Draw a parabola"

### Science:
- "Show me a diagram of photosynthesis"
- "Draw the water cycle"
- "Visualize the solar system"

### General:
- "Can you create a graph for [equation]?"
- "Draw a diagram showing [concept]"
- "Visualize [mathematical/physical concept]"

## Debugging Tips

### Backend Logs

Check backend terminal for:
```
[study_help] Checking X tasks for outputs...
[study_help] Extracted whiteboard data from professor agent (task output)
[study_help] Whiteboard data extracted: True
```

If you see:
- `Whiteboard data extracted: False` → Tool output not found in response
- No extraction logs → Professor agent might not have used the tool

### Frontend Console

Check browser DevTools console for:
```
[Transcript API] Whiteboard data received: ...
[Transcript API] Generated whiteboard prompt: ...
[Agent] Processing new prompt: ...
```

### Common Issues

#### Issue 1: No whiteboard_data in response

**Possible causes:**
- Question doesn't trigger whiteboard tool usage
- Wrong agent was used (only professor has access)
- Tool output not in expected format

**Solution:**
```bash
# Test with explicit professor agent
curl -X POST "http://localhost:8000/api/study/help" \
  -H "Content-Type: application/json" \
  -d '{
    "user_question": "Graph y = x^2",
    "subject": "mathematics",
    "help_type": "explanation",
    "preferred_agent_role": "professor"
  }'
```

#### Issue 2: Whiteboard appears but doesn't draw

**Possible causes:**
- TldrawBoardEmbedded agent not processing prompt
- Prompt format incorrect

**Check:**
1. Browser console for agent errors
2. Whiteboard component logs
3. Network tab for WebSocket connections

#### Issue 3: Whiteboard tool output not extracted

**Debug:**
1. Check backend logs for task outputs
2. Verify professor agent was used (check `agent_responses`)
3. Check if tool output is in JSON format

Add debug logging:
```python
# In crewai_backend/agents/agent.py, around line 825
print(f"[DEBUG] Task output: {output_str[:200]}")
print(f"[DEBUG] Contains JSON: {'{' in output_str and '}' in output_str}")
```

## Testing Checklist

- [ ] Backend server running on port 8000
- [ ] Frontend server running on port 3000
- [ ] API keys configured in `.env`
- [ ] Can access `/api/study/help` endpoint
- [ ] Response includes `whiteboard_data` field
- [ ] `whiteboard_data` contains valid JSON
- [ ] Frontend receives `whiteboard_data` from transcript API
- [ ] Whiteboard component appears automatically
- [ ] Agent prompt is generated correctly
- [ ] TldrawBoardEmbedded processes the prompt
- [ ] Drawing appears on whiteboard

## Manual Testing Steps

1. **Backend Test:**
   ```bash
   curl -X POST "http://localhost:8000/api/study/help" \
     -H "Content-Type: application/json" \
     -d '{"user_question": "Graph y = x^2", "subject": "mathematics", "help_type": "explanation", "preferred_agent_role": "professor"}'
   ```

2. **Frontend Test:**
   - Open `http://localhost:3000/meeting`
   - Open DevTools → Console
   - Speak or type: "Graph y equals x squared"
   - Watch for whiteboard to appear and draw

3. **Verify:**
   - Whiteboard panel opens automatically
   - Console shows whiteboard data received
   - Agent starts drawing on whiteboard
   - Drawing matches the requested graph/diagram

## Advanced: Testing Tool Output Format

To test different whiteboard tool output formats:

```python
# test_tool_outputs.py
from crewai_backend.agents.tools.whiteboard_tool import WhiteboardVisualTool

tool = WhiteboardVisualTool()

# Test graph output
result = tool._run(
    topic="y = x^2 - 4x + 4",
    content_type="graph",
    context="Plot and mark vertex and roots",
    desmos=True
)

print("Tool Output:")
print(result)

import json
parsed = json.loads(result)
print("\nParsed JSON:")
print(json.dumps(parsed, indent=2))
```

This helps verify the tool output format matches what the extraction function expects.

