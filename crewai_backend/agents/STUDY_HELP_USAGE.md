# Study Help Endpoint Usage Guide

## Overview

The `/api/study/help` endpoint is the main endpoint for handling user study questions. It receives user input and coordinates multiple agents to provide helpful responses.

## How User Input Flows

### 1. **User Input Reception** (Lines 94-98, 522-546)

**Where:** User input is received in the `StudyHelpRequest` model and the `study_help()` function.

**How:**
- Frontend sends POST request to `/api/study/help`
- FastAPI automatically parses JSON body into `StudyHelpRequest` object
- The `request` parameter contains all user input:
  - `request.user_question` - The user's question
  - `request.subject` - Subject area (default: "general")
  - `request.help_type` - Type of help needed (default: "explanation")
  - `request.conversation_history` - Previous messages (optional)

### 2. **User Input Handling** (Lines 548-683)

**Where:** User input is processed in the `study_help()` function.

**Steps:**
1. **Extract User Input** (Lines 557-563)
   - Extract `user_question`, `subject`, `help_type` from request
   - Log user input for debugging

2. **Build Context** (Lines 569-573)
   - Create context dictionary with user's question and history
   - This context is passed to agents

3. **Create Appropriate Crew** (Lines 579-674)
   - Based on `help_type`, create appropriate agents:
     - **"explanation"**: Expert + Visual Assistant
     - **"discussion"**: Professor + Expert + Devil's Advocate
   - Create tasks that use the user's question

4. **Execute Agents** (Lines 680-683)
   - Update crew with tasks
   - Call `crew.kickoff()` - this is where agents process user input
   - Agents generate responses based on the user's question

5. **Return Responses** (Lines 691-731)
   - Parse agent responses
   - Format for frontend
   - Return `StudyHelpResponse` with answers

## API Request Format

### Endpoint
```
POST http://localhost:8000/api/study/help
```

### Request Body
```json
{
  "user_question": "<user's question from speech-to-text or chat>",
  "subject": "mathematics",
  "help_type": "explanation",
  "conversation_history": [
    {"role": "user", "message": "Previous question..."},
    {"role": "agent", "message": "Previous answer..."}
  ]
}
```

### Response Format
```json
{
  "success": true,
  "answer": "Main explanation from expert...",
  "agent_responses": [
    {
      "agent": "Mathematics Expert",
      "message": "Detailed explanation..."
    },
    {
      "agent": "Visual Learning Assistant",
      "message": "Graph description..."
    }
  ],
  "visual_suggestions": {
    "description": "Graph description",
    "type": "graph"
  },
  "execution_time": 2.45,
  "error": null
}
```

## Example Usage

### Using cURL
```bash
curl -X POST "http://localhost:8000/api/study/help" \
  -H "Content-Type: application/json" \
  -d '{
    "user_question": "What is the derivative of x^2?",
    "subject": "mathematics",
    "help_type": "explanation"
  }'
```

### Using Python (requests)
```python
import requests

url = "http://localhost:8000/api/study/help"
payload = {
    "user_question": "How does photosynthesis work?",
    "subject": "biology",
    "help_type": "explanation"
}

response = requests.post(url, json=payload)
result = response.json()

if result["success"]:
    print(f"Answer: {result['answer']}")
    for agent_response in result["agent_responses"]:
        print(f"\n{agent_response['agent']}: {agent_response['message']}")
else:
    print(f"Error: {result['error']}")
```

### Using JavaScript (fetch)
```javascript
const response = await fetch('http://localhost:8000/api/study/help', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    user_question: "Explain quantum mechanics",
    subject: "physics",
    help_type: "explanation"
  })
});

const data = await response.json();
console.log(data.answer);
```

## Help Types

### "explanation" (Default)
- Uses: Expert + Visual Assistant
- Best for: Direct questions needing clear explanations
- Example: User's question from speech-to-text or chat input

### "discussion"
- Uses: Professor + Expert + Devil's Advocate
- Best for: Complex topics needing multiple perspectives
- Example: "Should we use renewable energy?"

## Key Code Locations

| What | Where | Line Numbers |
|------|-------|--------------|
| **Request Model** (Where input is defined) | `StudyHelpRequest` class | 94-102 |
| **Response Model** (Output format) | `StudyHelpResponse` class | 105-115 |
| **Endpoint Function** (Where input is received) | `study_help()` function | 522-740 |
| **Extract User Input** | Inside `study_help()` | 557-563 |
| **Create Agents** | Inside `study_help()` | 579-674 |
| **Process User Question** | `crew.kickoff()` call | 683 |
| **Return Response** | Return statement | 725-731 |

## Testing

Test the endpoint using the test script or curl:

```bash
# Start the server first
cd crewai_backend
python main.py

# In another terminal, test the endpoint
python test_agent_interaction.py
```

Or directly:
```bash
curl -X POST "http://localhost:8000/api/study/help" \
  -H "Content-Type: application/json" \
  -d '{"user_question": "Test question", "subject": "mathematics"}'
```

