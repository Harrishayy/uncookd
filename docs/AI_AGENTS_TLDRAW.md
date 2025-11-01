# Programming AI Agents for Tldraw

This guide explains how to program AI agents to draw on the tldraw whiteboard using the CrewAI backend integration.

## Architecture Overview

The AI agent drawing system works in three layers:

1. **Frontend (React/Next.js)**: User interface and tldraw canvas
2. **API Layer**: Next.js API routes that proxy requests
3. **Backend (Python/CrewAI)**: AI agents process tasks and generate drawing instructions

## How It Works

### 1. Flow Diagram

```
User Input → Frontend → API Route → CrewAI Backend → Drawing Instructions → Frontend → Tldraw Canvas
```

### 2. Step-by-Step Process

1. **User creates a drawing task** (e.g., "Draw a house with a tree")
2. **Frontend sends request** to `/api/crewai/draw` with:
   - Task description
   - List of active agents
   - Board ID

3. **Backend processes the task**:
   - Each active agent receives the task
   - Agent generates drawing instructions
   - Instructions are formatted as JSON

4. **Frontend receives instructions** and applies them:
   - Parses JSON or text instructions
   - Creates shapes on tldraw canvas
   - Uses agent's assigned color

## Programming AI Agents

### Agent Configuration

Agents are defined in the frontend component:

```typescript
interface Agent {
  id: string;
  name: string;
  role: 'student' | 'teacher';
  color: string;  // Hex color for drawings
  isActive: boolean;
}
```

### Backend Agent Setup

In `crewai_backend/main.py`, agents are created with specific roles:

```python
if role_name == "teacher":
    backstory = f"You are a teacher AI agent... You draw educational diagrams..."
    goal = "Create clear, educational drawings"
else:
    backstory = f"You are a student AI agent... You draw to practice..."
    goal = "Create drawings based on learning tasks"
```

### Drawing Instruction Format

Agents should return instructions in JSON format:

```json
{
  "shapes": [
    {
      "type": "circle",
      "x": 100,
      "y": 100,
      "radius": 50
    },
    {
      "type": "rectangle",
      "x": 200,
      "y": 150,
      "width": 150,
      "height": 100
    },
    {
      "type": "text",
      "x": 250,
      "y": 200,
      "text": "House"
    }
  ]
}
```

## Supported Shape Types

### 1. Circle/Ellipse
```json
{
  "type": "circle",
  "x": 100,
  "y": 100,
  "radius": 50
}
```

### 2. Rectangle
```json
{
  "type": "rectangle",
  "x": 200,
  "y": 150,
  "width": 150,
  "height": 100
}
```

### 3. Line/Arrow
```json
{
  "type": "line",
  "x1": 50,
  "y1": 50,
  "x2": 200,
  "y2": 200
}
```

### 4. Text
```json
{
  "type": "text",
  "x": 100,
  "y": 100,
  "text": "Label text"
}
```

## Customizing Agent Behavior

### 1. Modify Agent Backstory

Edit `crewai_backend/main.py` to change how agents interpret tasks:

```python
backstory = f"""
You are an expert artist AI named {agent_name}.
Your drawing style: {style_description}
You specialize in: {specialization}
When drawing, you: {behavior_description}
"""
```

### 2. Change Output Format

Modify the task description to request specific formats:

```python
task_description = f"""
{request.task}

Return a JSON object with this exact structure:
{{
  "shapes": [
    {{
      "type": "circle|rectangle|line|text",
      "x": number,
      "y": number,
      ...
    }}
  ]
}}
"""
```

### 3. Add Shape Types

Extend `lib/tldraw-utils.ts` to support new shapes:

```typescript
switch (shape.type?.toLowerCase()) {
  case 'triangle':
    // Handle triangle creation
    break;
  case 'star':
    // Handle star creation
    break;
  // Add more cases...
}
```

## Best Practices

### 1. Clear Instructions

Provide specific, clear tasks:
- ✅ "Draw a house with a triangular roof, rectangular door, and two square windows"
- ❌ "Draw something nice"

### 2. Coordinate Planning

Encourage agents to plan coordinates:
- "Draw shapes arranged horizontally with 100px spacing"
- "Place text labels below corresponding shapes"

### 3. Color Usage

Agents automatically use their assigned color. You can instruct them:
- "Use your assigned color for all shapes"
- "Use lighter shades for backgrounds, darker for outlines"

### 4. Collaborative Drawing

Multiple agents can work together:
- Assign different regions: "Agent 1 draws left side, Agent 2 draws right side"
- Task division: "Agent 1 draws structure, Agent 2 adds labels"

## Example Agent Prompts

### Educational Diagram
```
Task: "Create a diagram showing the water cycle with evaporation, condensation, and precipitation"
Agent Role: teacher
Expected: Clear, labeled diagram with arrows showing flow
```

### Creative Drawing
```
Task: "Draw a cartoon character with big eyes, smile, and hat"
Agent Role: student
Expected: Fun, creative interpretation
```

### Technical Diagram
```
Task: "Draw a flowchart with three boxes: Start, Process, End, connected by arrows"
Agent Role: teacher
Expected: Clean, structured flowchart
```

## Troubleshooting

### Agents Don't Draw
1. Check if agents are active (green indicator)
2. Verify backend is running on port 8000
3. Check browser console for errors

### Shapes Don't Appear
1. Verify drawing instructions format (should be JSON)
2. Check coordinate values (should be positive numbers)
3. Ensure shape types match supported types

### Wrong Colors
1. Verify agent color is set correctly
2. Check if color is valid hex code
3. Ensure color is passed to `applyShape` function

## Advanced: Direct Tldraw API Usage

For more control, you can directly use tldraw's Editor API:

```typescript
import { Editor } from 'tldraw';

function createCustomShape(editor: Editor, agentColor: string) {
  editor.createShapes([{
    id: editor.createShapeId(),
    type: 'geo',
    x: 100,
    y: 100,
    props: {
      w: 200,
      h: 150,
      geo: 'rectangle',
      fill: 'solid',
      color: agentColor,
      // Add more props as needed
    },
  }]);
}
```

## Next Steps

1. **Experiment** with different agent configurations
2. **Test** various drawing tasks
3. **Customize** agent behavior for your use case
4. **Extend** shape support as needed
5. **Optimize** instruction parsing for better accuracy

## Resources

- [Tldraw API Documentation](https://tldraw.dev/docs)
- [CrewAI Documentation](https://docs.crewai.com/)
- [Drawing Instructions Format](./tldraw-utils.ts)

