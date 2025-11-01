'use client';

/**
 * Example React Component demonstrating CrewAI integration
 * This component shows how to use the CrewAI client in your Next.js app
 */

import { useState } from 'react';
import { executeAgentTask, executeCrew, checkBackendHealth, type AgentRequest, type CrewRequest } from '@/lib/crewai-client';

export default function CrewAIExample() {
  const [agentTask, setAgentTask] = useState('');
  const [crewTasks, setCrewTasks] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<boolean | null>(null);

  const checkHealth = async () => {
    const isHealthy = await checkBackendHealth();
    setBackendStatus(isHealthy);
  };

  const handleAgentExecute = async () => {
    if (!agentTask.trim()) return;

    setLoading(true);
    setResult(null);

    const request: AgentRequest = {
      task: agentTask,
      agent_config: {
        role: 'Assistant',
        goal: 'Complete the given task',
        backstory: 'You are a helpful AI assistant',
      },
    };

    try {
      const response = await executeAgentTask(request);
      setResult(response);
    } catch (error) {
      setResult({ success: false, error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleCrewExecute = async () => {
    if (!crewTasks.trim()) return;

    setLoading(true);
    setResult(null);

    const taskList = crewTasks.split('\n').filter((t) => t.trim());

    const request: CrewRequest = {
      tasks: taskList,
      agents_config: [
        {
          role: 'Researcher',
          goal: 'Research and gather information',
          backstory: 'You are an expert researcher',
        },
        {
          role: 'Writer',
          goal: 'Write comprehensive content',
          backstory: 'You are a professional writer',
        },
      ],
    };

    try {
      const response = await executeCrew(request);
      setResult(response);
    } catch (error) {
      setResult({ success: false, error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-6">CrewAI Integration Example</h1>

      {/* Backend Status */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <div className="flex items-center gap-4">
          <span>Backend Status:</span>
          {backendStatus === null && <span className="text-gray-500">Not checked</span>}
          {backendStatus === true && <span className="text-green-600">✓ Healthy</span>}
          {backendStatus === false && <span className="text-red-600">✗ Unavailable</span>}
          <button
            onClick={checkHealth}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Check Health
          </button>
        </div>
      </div>

      {/* Single Agent */}
      <div className="border p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Single Agent Task</h2>
        <textarea
          value={agentTask}
          onChange={(e) => setAgentTask(e.target.value)}
          placeholder="Enter a task for the agent..."
          className="w-full p-2 border rounded mb-4 min-h-[100px]"
        />
        <button
          onClick={handleAgentExecute}
          disabled={loading || !agentTask.trim()}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          Execute Agent Task
        </button>
      </div>

      {/* Multi-Agent Crew */}
      <div className="border p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Multi-Agent Crew</h2>
        <textarea
          value={crewTasks}
          onChange={(e) => setCrewTasks(e.target.value)}
          placeholder="Enter tasks (one per line)..."
          className="w-full p-2 border rounded mb-4 min-h-[100px]"
        />
        <button
          onClick={handleCrewExecute}
          disabled={loading || !crewTasks.trim()}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400"
        >
          Execute Crew Tasks
        </button>
      </div>

      {/* Results */}
      {loading && (
        <div className="text-center py-4">
          <p>Processing...</p>
        </div>
      )}

      {result && (
        <div className="border p-4 rounded-lg bg-gray-50">
          <h2 className="text-xl font-semibold mb-2">Result</h2>
          <pre className="whitespace-pre-wrap text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
