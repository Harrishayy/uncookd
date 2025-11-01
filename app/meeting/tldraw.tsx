'use client'

import React, { useState } from 'react'
import TldrawBoardEmbedded from "./components/TldrawBoardEmbedded";
import { AgentInput } from '@/shared/types/AgentInput'

export default function Page() {
  const [agentPrompt, setAgentPrompt] = useState<AgentInput | null>(null)

  const handleAgentComplete = () => {
    console.log('Agent completed task')
    // Clear prompt after completion
    setAgentPrompt(null)
  }

  const handleAgentError = (error: any) => {
    console.error('Agent error:', error)
  }

  const handlePromptSubmit = (prompt: string) => {
    setAgentPrompt({ message: prompt, type: 'user' })
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1>Tldraw AI Agent Whiteboard</h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          An AI agent that can draw, create diagrams, solve math problems, and more on the whiteboard.
        </p>
      </div>

      {/* Tldraw Board with AI Agent */}
      <div style={{ 
        width: '100%', 
        height: '600px', 
        border: '2px solid #e0e0e0', 
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'white'
      }}>
        <TldrawBoardEmbedded
          boardId="default-board"
          agentPrompt={agentPrompt}
          showAgentUI={true}
          onAgentComplete={handleAgentComplete}
          onAgentError={handleAgentError}
          onPromptSubmit={handlePromptSubmit}
        />
      </div>
    </div>
  );
}
