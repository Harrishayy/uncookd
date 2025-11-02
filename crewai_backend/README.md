# CrewAI Backend

Python backend service for CrewAI multi-agent operations, connected to Next.js frontend.

## Setup

1. **Install Python dependencies:**

```bash
cd crewai_backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. **Configure environment variables:**

```bash
cp .env.example .env
# Edit .env and add your Gemini API key
```

   **Get your Gemini API Key:**
   - Visit [Google AI Studio](https://ai.google.dev/)
   - Sign in with your Google account
   - Click "Get API Key" and create a new key
   - Copy the key and add it to your `.env` file:
     ```
     GEMINI_API_KEY=your_api_key_here
     ```

   **Note:** The backend uses Google's official `google-generativeai` SDK with a minimal LangChain wrapper (`langchain-google-genai`) for CrewAI compatibility. If no `GEMINI_API_KEY` is provided, CrewAI will use its default LLM provider.

3. **Run the server:**

# must run the server

```bash
python main.py
# Or with uvicorn directly:
uvicorn agents.agent:app --reload --port 8000
```

The server will run on `http://localhost:8000`

## API Endpoints

### Health Check

- `GET /` - Root endpoint
- `GET /health` - Health check

### Agent Operations

- `POST /api/agent/execute` - Execute a task with a single agent
  - Request body:
    ```json
    {
      "task": "Your task description",
      "context": {},
      "agent_config": {
        "role": "Assistant",
        "goal": "Complete the task",
        "backstory": "You are a helpful assistant"
      }
    }
    ```

### Crew Operations

- `POST /api/crew/execute` - Execute tasks with multiple agents
  - Request body:
    ```json
    {
      "tasks": ["Task 1", "Task 2"],
      "agents_config": [
        {
          "role": "Researcher",
          "goal": "Research the topic",
          "backstory": "You are an expert researcher"
        }
      ],
      "context": {}
    }
    ```

## Connecting with Next.js

The backend is configured with CORS to allow connections from `http://localhost:3000` (Next.js default port).

Use the Next.js API routes in `app/api/crewai/` to communicate with this backend.
