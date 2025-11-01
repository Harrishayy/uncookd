# Tldraw Board Component with Multi-Agent Support

This component provides a collaborative drawing board powered by tldraw, with support for multiple AI agents (students/teachers) that can draw on the board.

## Features

- **Interactive Drawing Board**: Full tldraw functionality with drawing, shapes, text, and more
- **Multi-Agent Support**: Add and manage multiple AI agents (students or teachers)
- **AI-Powered Drawing**: Agents can automatically draw based on text instructions
- **Color-Coded Agents**: Each agent has a unique color for their drawings
- **Real-time Collaboration**: Multiple agents can work on the same board

## Usage

### Basic Example

```tsx
import TldrawBoard from '@/app/components/TldrawBoard';

export default function MyPage() {
  return (
    <div className="h-screen w-screen">
      <TldrawBoard 
        boardId="my-board"
      />
    </div>
  );
}
```

### With Custom Agents

```tsx
import TldrawBoard, { Agent } from '@/app/components/TldrawBoard';
import { useState } from 'react';

export default function MyPage() {
  const [agents, setAgents] = useState<Agent[]>([
    { 
      id: '1', 
      name: 'AI Teacher', 
      role: 'teacher', 
      color: '#3b82f6', 
      isActive: true 
    },
    { 
      id: '2', 
      name: 'AI Student 1', 
      role: 'student', 
      color: '#10b981', 
      isActive: false 
    },
  ]);

  return (
    <div className="h-screen w-screen">
      <TldrawBoard 
        agents={agents}
        onAgentsChange={setAgents}
        boardId="custom-board"
      />
    </div>
  );
}
```

## Component Props

- `agents?: Agent[]` - Array of AI agents (optional, defaults to 3 default agents)
- `onAgentsChange?: (agents: Agent[]) => void` - Callback when agents are modified
- `boardId?: string` - Unique ID for the board (defaults to 'default', used for persistence)

## Agent Interface

```tsx
interface Agent {
  id: string;
  name: string;
  role: 'student' | 'teacher';
  color: string;  // Hex color code
  isActive: boolean;
}
```

## How It Works

1. **Add Agents**: Click "Add Agent" to create new AI agents (students or teachers)
2. **Activate Agents**: Toggle agents active/inactive to include them in drawing tasks
3. **Create Drawing Tasks**: Click "AI Draw Task" and enter instructions (e.g., "Draw a circle" or "Create a diagram showing the water cycle")
4. **AI Drawing**: Active agents will receive the task, process it, and automatically draw on the board

## Backend Integration

The component communicates with the CrewAI Python backend through:
- `/api/crewai/draw` - Sends drawing tasks to AI agents
- Agents process instructions and generate drawing commands
- Drawing instructions are automatically applied to the board

## Example Drawing Tasks

- "Draw a circle"
- "Create a rectangle in the center"
- "Draw an arrow pointing right"
- "Create a diagram showing photosynthesis"
- "Draw a flowchart with 3 boxes"
- "Label the parts of a cell"

## Notes

- The board state is persisted using the `boardId` prop
- Agents with role "teacher" create educational diagrams
- Agents with role "student" create practice drawings
- Each agent uses their assigned color for all drawings
- You can draw manually as a human user by selecting "Human User" in the agent dropdown

