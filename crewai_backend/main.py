"""
CrewAI Backend Server
FastAPI server to handle CrewAI multi-agent operations
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uvicorn

app = FastAPI(title="CrewAI Backend API", version="1.0.0")

# Configure CORS to allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js default ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class AgentRequest(BaseModel):
    task: str
    context: Optional[Dict[str, Any]] = None
    agent_config: Optional[Dict[str, Any]] = None


class AgentResponse(BaseModel):
    success: bool
    result: Optional[str] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None


class CrewRequest(BaseModel):
    tasks: List[str]
    agents_config: Optional[List[Dict[str, Any]]] = None
    context: Optional[Dict[str, Any]] = None


class CrewResponse(BaseModel):
    success: bool
    results: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None


# Health check endpoint
@app.get("/")
async def root():
    return {"message": "CrewAI Backend API is running", "status": "healthy"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "crewai-backend"}


# Single agent task endpoint
@app.post("/api/agent/execute", response_model=AgentResponse)
async def execute_agent_task(request: AgentRequest):
    """
    Execute a task using a single CrewAI agent
    """
    try:
        # Import CrewAI components here to avoid issues if not installed
        from crewai import Agent, Task
        import time
        
        start_time = time.time()
        
        # Create agent (you can customize this based on your needs)
        agent = Agent(
            role=request.agent_config.get("role", "Assistant") if request.agent_config else "Assistant",
            goal=request.agent_config.get("goal", "Complete the given task") if request.agent_config else "Complete the given task",
            backstory=request.agent_config.get("backstory", "You are a helpful assistant") if request.agent_config else "You are a helpful assistant",
            verbose=True,
            allow_delegation=False
        )
        
        # Create task
        task = Task(
            description=request.task,
            agent=agent,
            expected_output="A detailed response to the task"
        )
        
        # Execute task
        result = agent.execute_task(task)
        
        execution_time = time.time() - start_time
        
        return AgentResponse(
            success=True,
            result=str(result) if result else "Task completed",
            execution_time=execution_time
        )
    except Exception as e:
        return AgentResponse(
            success=False,
            error=str(e),
            execution_time=None
        )


# Multi-agent crew endpoint
@app.post("/api/crew/execute", response_model=CrewResponse)
async def execute_crew(request: CrewRequest):
    """
    Execute tasks using a CrewAI crew with multiple agents
    """
    try:
        from crewai import Crew, Agent, Task
        import time
        
        start_time = time.time()
        
        # Create agents (default configuration if not provided)
        agents = []
        if request.agents_config:
            for agent_config in request.agents_config:
                agent = Agent(
                    role=agent_config.get("role", "Assistant"),
                    goal=agent_config.get("goal", "Complete assigned tasks"),
                    backstory=agent_config.get("backstory", "You are a helpful assistant"),
                    verbose=True,
                    allow_delegation=agent_config.get("allow_delegation", True)
                )
                agents.append(agent)
        else:
            # Default agent configuration
            agent = Agent(
                role="Assistant",
                goal="Complete assigned tasks",
                backstory="You are a helpful assistant",
                verbose=True,
                allow_delegation=True
            )
            agents.append(agent)
        
        # Create tasks
        tasks = []
        for i, task_description in enumerate(request.tasks):
            task = Task(
                description=task_description,
                agent=agents[i % len(agents)],  # Distribute tasks among agents
                expected_output="A detailed response to the task"
            )
            tasks.append(task)
        
        # Create and run crew
        crew = Crew(
            agents=agents,
            tasks=tasks,
            verbose=True
        )
        
        result = crew.kickoff()
        
        execution_time = time.time() - start_time
        
        # Format results
        results = []
        if isinstance(result, dict):
            results = [{"task": k, "result": str(v)} for k, v in result.items()]
        elif isinstance(result, list):
            results = [{"result": str(r)} for r in result]
        else:
            results = [{"result": str(result)}]
        
        return CrewResponse(
            success=True,
            results=results,
            execution_time=execution_time
        )
    except Exception as e:
        return CrewResponse(
            success=False,
            error=str(e),
            execution_time=None
        )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
