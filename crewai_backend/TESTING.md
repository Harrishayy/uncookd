# Testing Agent Interaction

This guide helps you test whether your agents can respond to users and interact with each other.

## Quick Start

### 1. Start the Backend Server

```bash
cd crewai_backend
python main.py
```

The server will run on `http://localhost:8000`

### 2. Run the Test Script

In a **new terminal**:

```bash
cd crewai_backend
python test_agent_interaction.py
```

## What Gets Tested

The test script verifies:

1. **Classroom Discussion**: Multiple agents respond to a topic and user input
2. **Debate**: Agents argue different positions (for/against)
3. **Visual Suggestions**: Expert explains concepts and visual assistant suggests whiteboard content

## Understanding Agent Interaction

### How Agents Interact in CrewAI

1. **Sequential Tasks**: When agents have sequential tasks, each agent can see previous agents' outputs
2. **Delegation**: Agents with `allow_delegation=True` can delegate to other agents
3. **Shared Context**: All agents in a crew share the same execution context

### In Your Current Implementation

- **Discussion Endpoint** (`/api/classroom/discuss`): 
  - Multiple agents get tasks for the same topic
  - They see each other's outputs through CrewAI's task system
  - This demonstrates agent-to-agent interaction

- **Debate Endpoint** (`/api/classroom/debate`):
  - Agents are assigned different positions (argue/counter/moderate)
  - They see each other's arguments and can respond
  - This explicitly tests debate-style interaction

### Current Limitations

⚠️ **Important**: The current implementation uses CrewAI's built-in task system, which means:
- Agents complete their tasks sequentially
- Interaction happens through task outputs, not real-time chat
- For **true conversational** interaction, you'll need:
  - WebSocket support (for real-time)
  - Dynamic task creation based on responses
  - Conversation state management

## Testing Individual Endpoints

### Test Discussion Endpoint

```bash
curl -X POST "http://localhost:8000/api/classroom/discuss" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "How do we solve quadratic equations?",
    "subject": "mathematics",
    "user_message": "I'm confused about completing the square method"
  }'
```

### Test Debate Endpoint

```bash
curl -X POST "http://localhost:8000/api/classroom/debate" \
  -H "Content-Type: application/json" \
  -d '{
    "proposition": "Artificial intelligence will replace human teachers",
    "subject": "education"
  }'
```

### Test Explanation Endpoint

```bash
curl -X POST "http://localhost:8000/api/classroom/explain" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Graphing quadratic functions",
    "subject": "mathematics"
  }'
```

## What to Look For

✅ **Success Indicators**:
- Multiple agents respond in discussion
- Different agents take different positions in debate
- Agents reference each other's points (shows they see previous outputs)
- Visual assistant suggests graph/whiteboard content

❌ **Warning Signs**:
- Only one agent responds
- Agents don't reference each other
- Same response from all agents
- Error messages about API keys or LLM access

## Troubleshooting

### Server Not Running
```
❌ ERROR: Could not connect to server
```
**Solution**: Start the server first: `python main.py`

### API Key Issues
```
❌ Error: API key not found
```
**Solution**: Create `.env` file with your OpenAI/Anthropic API key:
```
OPENAI_API_KEY=your-key-here
# or
ANTHROPIC_API_KEY=your-key-here
```

### Import Errors
```
❌ Error: No module named 'agents'
```
**Solution**: Make sure you're in the `crewai_backend` directory and the `agents` folder exists

## Next Steps After Testing

Once you confirm agents can interact:

1. **Implement WebSocket Support** for real-time conversations
2. **Add Conversation State Management** to maintain context
3. **Create Frontend Integration** to display agent messages
4. **Add Streaming** for token-by-token responses

See `agents/example_agents.py` for the implementation roadmap.

