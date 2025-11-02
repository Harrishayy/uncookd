'use client';

/**
 * Tldraw Board Component with Multi-Agent Support
 * Allows multiple AI agents (students/teachers) to draw on a shared board
 */

import { Tldraw, useEditor } from 'tldraw';
import 'tldraw/tldraw.css';
import { useState, useEffect } from 'react';
import { applyDrawingInstructions } from '@/lib/tldraw-utils';

export interface Agent {
  id: string;
  name: string;
  role: 'student' | 'teacher';
  color: string;
  isActive: boolean;
  drawingPrompt?: string; // LLM prompt that determines what this agent draws
}

interface TldrawBoardProps {
  agents?: Agent[];
  onAgentsChange?: (agents: Agent[]) => void;
  boardId?: string;
  licenseKey?: string;
}

const DEFAULT_AGENTS: Agent[] = [
  { 
    id: '1', 
    name: 'AI Teacher', 
    role: 'teacher', 
    color: '#3b82f6', 
    isActive: true,
    drawingPrompt: 'Draw an educational diagram explaining a scientific concept with clear labels and arrows'
  },
  { 
    id: '2', 
    name: 'AI Student 1', 
    role: 'student', 
    color: '#10b981', 
    isActive: false,
    drawingPrompt: 'Draw a creative illustration or diagram related to learning and education'
  },
  { 
    id: '3', 
    name: 'AI Student 2', 
    role: 'student', 
    color: '#f59e0b', 
    isActive: false,
    drawingPrompt: 'Draw a flowchart or process diagram showing steps in a sequence'
  },
];

export default function TldrawBoard({ agents: initialAgents, onAgentsChange, boardId = 'default', licenseKey }: TldrawBoardProps) {
  // Get license key from prop, environment variable, or undefined
  const tldrawLicenseKey = licenseKey || process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
  const [agents, setAgents] = useState<Agent[]>(initialAgents || DEFAULT_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(agents[0]?.id || null);
  const [activeAgentPanel, setActiveAgentPanel] = useState<string | null>(null);
  const [drawingResults, setDrawingResults] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Update agents when prop changes
  useEffect(() => {
    if (initialAgents) {
      setAgents(initialAgents);
    }
  }, [initialAgents]);

  // Notify parent of agent changes
  useEffect(() => {
    onAgentsChange?.(agents);
  }, [agents, onAgentsChange]);

  const handleAddAgent = () => {
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: `AI Student ${agents.filter(a => a.role === 'student').length + 1}`,
      role: 'student',
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      isActive: false,
      drawingPrompt: 'Draw something creative and interesting',
    };
    setAgents([...agents, newAgent]);
  };

  const handleRemoveAgent = (agentId: string) => {
    setAgents(agents.filter(a => a.id !== agentId));
    if (selectedAgent === agentId) {
      setSelectedAgent(agents.find(a => a.id !== agentId)?.id || null);
    }
    if (activeAgentPanel === agentId) {
      setActiveAgentPanel(null);
    }
  };

  const handleAgentClick = (agentId: string) => {
    setActiveAgentPanel(activeAgentPanel === agentId ? null : agentId);
  };

  const handleAgentDraw = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent || !agent.drawingPrompt) {
      return;
    }

    setIsDrawing(true);
    try {
      // Try to call backend API first
      try {
        const response = await fetch('/api/crewai/draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: agent.drawingPrompt,
            agents: [{
              id: agent.id,
              name: agent.name,
              role: agent.role,
              color: agent.color,
            }],
            boardId,
          }),
        });

        const result = await response.json();
        console.log('Drawing API response:', result);
        
        if (result.success && result.drawing_instructions) {
          setDrawingResults(prev => [...prev, result]);
          setActiveAgentPanel(null);
          return;
        }
      } catch (backendError) {
        console.log('Backend not available, using fallback:', backendError);
      }

      // Fallback: Use prompt directly when backend is not available
      console.log('Processing drawing prompt directly (no backend):', agent.drawingPrompt);
      const fallbackResult = {
        success: true,
        drawing_instructions: [{
          agent_id: agent.id,
          agent_name: agent.name,
          agent_role: agent.role,
          color: agent.color,
          instructions: agent.drawingPrompt,
          task: agent.drawingPrompt,
        }],
      };
      
      setDrawingResults(prev => [...prev, fallbackResult]);
      setActiveAgentPanel(null);
    } catch (error) {
      console.error('Error executing agent drawing:', error);
    } finally {
      setIsDrawing(false);
    }
  };

  const handleUpdateAgentPrompt = (agentId: string, newPrompt: string) => {
    setAgents(agents.map(a => 
      a.id === agentId ? { ...a, drawingPrompt: newPrompt } : a
    ));
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50">
      {/* Compact Top Bar */}
      <div className="bg-white border-b border-gray-300 shadow-sm px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-gray-800">Whiteboard</h1>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex items-center gap-3">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleAgentClick(agent.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all cursor-pointer hover:shadow-md ${
                    activeAgentPanel === agent.id
                      ? 'border-indigo-500 bg-indigo-50 shadow-md' 
                      : agent.isActive 
                        ? 'border-blue-400 bg-blue-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full border border-gray-300"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="text-sm font-medium text-gray-700">{agent.name}</span>
                  {agent.isActive && (
                    <span className="text-xs text-blue-600 font-medium">●</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddAgent}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              + Add Agent
            </button>
          </div>
        </div>
      </div>

      {/* Agent Panel */}
      {activeAgentPanel && (() => {
        const agent = agents.find(a => a.id === activeAgentPanel);
        if (!agent) return null;
        return (
          <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-4 h-4 rounded-full border border-gray-300"
                    style={{ backgroundColor: agent.color }}
                  />
                  <h3 className="text-base font-semibold text-gray-800">{agent.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded ${
                    agent.role === 'teacher' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {agent.role}
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Drawing Prompt (LLM determines what this agent draws):
                  </label>
                  <textarea
                    value={agent.drawingPrompt || ''}
                    onChange={(e) => handleUpdateAgentPrompt(agent.id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={2}
                    placeholder="Enter the prompt that determines what this agent will draw..."
                  />
                  <p className="text-xs text-gray-500">
                    The LLM will use this prompt to generate drawing instructions for this agent.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleAgentDraw(agent.id)}
                  disabled={isDrawing || !agent.drawingPrompt}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {isDrawing ? 'Drawing...' : '🎨 Draw Now'}
                </button>
                <button
                  onClick={() => setActiveAgentPanel(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Whiteboard Canvas with Border */}
      <div className="flex-1 p-4">
        <div className="w-full h-full bg-white rounded-lg shadow-lg border-2 border-gray-300 overflow-hidden">
          <Tldraw
            persistenceKey={boardId}
            licenseKey={tldrawLicenseKey}
            onMount={(editor) => {
              // Set up whiteboard appearance
              editor.updateInstanceState({ 
                isGridMode: false,
                exportBackground: true 
              });
            }}
          >
            <AgentTools 
              agents={agents} 
              selectedAgent={selectedAgent} 
              onAgentSelect={setSelectedAgent}
              drawingResults={drawingResults}
            />
          </Tldraw>
        </div>
      </div>
    </div>
  );
}

/**
 * Custom Tools Component for Agent-Specific Drawing
 */
function AgentTools({ 
  agents, 
  selectedAgent, 
  onAgentSelect,
  drawingResults 
}: { 
  agents: Agent[]; 
  selectedAgent: string | null; 
  onAgentSelect: (id: string | null) => void;
  drawingResults?: any[];
}) {
  const editor = useEditor();
  const currentAgent = agents.find(a => a.id === selectedAgent);

  // Note: Agent color is applied when AI agents create shapes via drawing instructions
  // Manual drawing uses the default tldraw color palette

  // Process drawing results from AI agents
  useEffect(() => {
    if (drawingResults && drawingResults.length > 0 && editor) {
      // Get the latest drawing result
      const latestResult = drawingResults[drawingResults.length - 1];
      
      console.log('Processing drawing result:', latestResult);
      
      if (latestResult.success && latestResult.drawing_instructions) {
        console.log('Drawing instructions received:', latestResult.drawing_instructions);
        // Apply drawing instructions from AI agents
        applyDrawingInstructions(editor, latestResult.drawing_instructions);
      } else {
        console.warn('Drawing result missing success or instructions:', latestResult);
      }
    }
  }, [drawingResults, editor]);

  return (
    <div className="absolute top-3 right-3 z-50 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-2.5 border border-gray-200">
      <select
        value={selectedAgent || ''}
        onChange={(e) => onAgentSelect(e.target.value || null)}
        className="text-xs px-2 py-1.5 border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        <option value="">👤 You</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.role === 'teacher' ? '👨‍🏫' : '👨‍🎓'} {agent.name}
          </option>
        ))}
      </select>
    </div>
  );
}

