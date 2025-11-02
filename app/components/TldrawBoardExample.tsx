'use client';

/**
 * Example page component showing how to use TldrawBoard
 */

import TldrawBoard, { Agent } from './TldrawBoard';
import { useState } from 'react';

export default function TldrawBoardExample() {
  const [customAgents, setCustomAgents] = useState<Agent[]>([
    { id: '1', name: 'AI Teacher', role: 'teacher', color: '#3b82f6', isActive: true },
    { id: '2', name: 'AI Student 1', role: 'student', color: '#10b981', isActive: false },
  ]);

  // License key can be passed as prop or set via NEXT_PUBLIC_TLDRAW_LICENSE_KEY env variable
  // const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

  return (
    <div className="h-screen w-screen">
      <TldrawBoard 
        agents={customAgents}
        onAgentsChange={setCustomAgents}
        boardId="example-board"
        // licenseKey={licenseKey} // Optional: pass directly as prop
      />
    </div>
  );
}

