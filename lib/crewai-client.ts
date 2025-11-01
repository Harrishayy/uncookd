/**
 * TypeScript Client for CrewAI Backend
 * Provides type-safe methods to interact with the CrewAI Python backend
 */

const CREWAI_API_URL = '/api/crewai';

export interface AgentConfig {
  role?: string;
  goal?: string;
  backstory?: string;
  allow_delegation?: boolean;
}

export interface AgentRequest {
  task: string;
  context?: Record<string, any>;
  agent_config?: AgentConfig;
}

export interface AgentResponse {
  success: boolean;
  result?: string;
  error?: string;
  execution_time?: number;
}

export interface CrewRequest {
  tasks: string[];
  agents_config?: AgentConfig[];
  context?: Record<string, any>;
}

export interface CrewResponse {
  success: boolean;
  results?: Array<{ task?: string; result: string }>;
  error?: string;
  execution_time?: number;
}

/**
 * Execute a task with a single agent
 */
export async function executeAgentTask(
  request: AgentRequest
): Promise<AgentResponse> {
  try {
    const response = await fetch(`${CREWAI_API_URL}/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute tasks with a multi-agent crew
 */
export async function executeCrew(
  request: CrewRequest
): Promise<CrewResponse> {
  try {
    const response = await fetch(`${CREWAI_API_URL}/crew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if the CrewAI backend is healthy
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${CREWAI_API_URL}?endpoint=/health`);
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}
