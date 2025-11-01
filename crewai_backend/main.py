"""
CrewAI Backend Server
FastAPI server to handle CrewAI multi-agent operations
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Gemini SDK (for simple drawing endpoint - no CrewAI needed)
try:
    import google.generativeai as genai  # type: ignore
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if gemini_api_key:
        genai.configure(api_key=gemini_api_key)
        print("✅ Gemini SDK configured successfully")
    else:
        print("⚠️  GEMINI_API_KEY not found. Simple drawing endpoint will not work.")
        print("⚠️  Set GEMINI_API_KEY in .env file to use the drawing features.")
except ImportError:
    print("⚠️  google-generativeai not installed. Install with: pip install google-generativeai")
except Exception as e:
    print(f"⚠️  Error configuring Gemini SDK: {e}")

# Optional: Initialize Gemini LLM for CrewAI endpoints (only if CrewAI is used)
gemini_llm = None
try:
    from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if gemini_api_key:
        gemini_llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash-exp",
            google_api_key=gemini_api_key,
            temperature=0.7
        )
        print("✅ Gemini LLM initialized for CrewAI (optional)")
except ImportError:
    print("ℹ️  langchain-google-genai not installed - CrewAI endpoints will use default LLM")
    print("ℹ️  Install with: pip install langchain-google-genai (only needed for CrewAI)")
except Exception as e:
    print(f"ℹ️  CrewAI Gemini LLM not available: {e}")

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


class DrawRequest(BaseModel):
    task: str
    agents: List[Dict[str, Any]]
    board_id: str = "default"


class DrawResponse(BaseModel):
    success: bool
    drawing_instructions: Optional[List[Dict[str, Any]]] = None
    result: Optional[str] = None
    error: Optional[str] = None


class SimpleDrawRequest(BaseModel):
    prompt: str
    agent_name: Optional[str] = "AI Agent"
    agent_color: Optional[str] = "#3b82f6"
    agent_role: Optional[str] = "student"


class SimpleDrawResponse(BaseModel):
    success: bool
    drawing_instructions: Optional[str] = None
    error: Optional[str] = None


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
        # Try to import CrewAI (optional dependency)
        try:
            from crewai import Agent, Task
        except ImportError:
            return AgentResponse(
                success=False,
                error="CrewAI is not installed. This endpoint requires CrewAI. Install with: pip install crewai langchain-google-genai",
                result=None,
                execution_time=None
            )
        import time
        
        start_time = time.time()
        
        # Create agent (you can customize this based on your needs)
        agent_kwargs = {
            "role": request.agent_config.get("role", "Assistant") if request.agent_config else "Assistant",
            "goal": request.agent_config.get("goal", "Complete the given task") if request.agent_config else "Complete the given task",
            "backstory": request.agent_config.get("backstory", "You are a helpful assistant") if request.agent_config else "You are a helpful assistant",
            "verbose": True,
            "allow_delegation": False
        }
        
        # Use Gemini LLM if available
        if gemini_llm:
            agent_kwargs["llm"] = gemini_llm
        
        agent = Agent(**agent_kwargs)
        
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
        # Try to import CrewAI (optional dependency)
        try:
            from crewai import Crew, Agent, Task
        except ImportError:
            return CrewResponse(
                success=False,
                error="CrewAI is not installed. This endpoint requires CrewAI. Install with: pip install crewai langchain-google-genai",
                results=None,
                execution_time=None
            )
        import time
        
        start_time = time.time()
        
        # Create agents (default configuration if not provided)
        agents = []
        if request.agents_config:
            for agent_config in request.agents_config:
                agent_kwargs = {
                    "role": agent_config.get("role", "Assistant"),
                    "goal": agent_config.get("goal", "Complete assigned tasks"),
                    "backstory": agent_config.get("backstory", "You are a helpful assistant"),
                    "verbose": True,
                    "allow_delegation": agent_config.get("allow_delegation", True)
                }
                
                # Use Gemini LLM if available
                if gemini_llm:
                    agent_kwargs["llm"] = gemini_llm
                
                agent = Agent(**agent_kwargs)
                agents.append(agent)
        else:
            # Default agent configuration
            agent_kwargs = {
                "role": "Assistant",
                "goal": "Complete assigned tasks",
                "backstory": "You are a helpful assistant",
                "verbose": True,
                "allow_delegation": True
            }
            
            # Use Gemini LLM if available
            if gemini_llm:
                agent_kwargs["llm"] = gemini_llm
            
            agent = Agent(**agent_kwargs)
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


# Simple drawing endpoint - Direct Gemini API (no CrewAI)
@app.post("/api/draw/simple", response_model=SimpleDrawResponse)
async def execute_simple_drawing(request: SimpleDrawRequest):
    """
    Simple drawing endpoint that directly uses Gemini API
    Takes a prompt and returns drawing instructions in JSON format
    """
    try:
        import google.generativeai as genai  # type: ignore
        import time
        import json
        import re
        
        start_time = time.time()
        
        # Get Gemini API key
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            return SimpleDrawResponse(
                success=False,
                error="GEMINI_API_KEY not found in environment variables"
            )
        
        # Configure Gemini
        genai.configure(api_key=gemini_api_key)
        
        # Create the model
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        
        # Create the prompt for drawing instructions
        system_prompt = f"""You are an AI assistant that generates drawing instructions for a whiteboard canvas.

The user wants to draw: "{request.prompt}"

Generate specific drawing instructions in JSON format with this structure:
{{
  "shapes": [
    {{
      "type": "circle|rectangle|line|arrow|text",
      "x": <number>,
      "y": <number>,
      "width": <number> (for rectangles),
      "height": <number> (for rectangles),
      "radius": <number> (for circles),
      "x1": <number> (for lines/arrows),
      "y1": <number> (for lines/arrows),
      "x2": <number> (for lines/arrows),
      "y2": <number> (for lines/arrows),
      "text": "<text content>" (for text shapes),
      "color": "{request.agent_color}"
    }}
  ]
}}

Guidelines:
- Use coordinates between 100-1000 for positioning
- For arrows, use type "arrow" with x1, y1 (start) and x2, y2 (end)
- For circles, use type "circle" with x, y (center) and radius
- For rectangles, use type "rectangle" with x, y (top-left), width, height
- For lines, use type "line" with x1, y1, x2, y2
- For text, use type "text" with x, y (position) and text content
- Use the color {request.agent_color} for all shapes
- Ensure shapes don't overlap (spread them out)
- Return ONLY valid JSON, no markdown code blocks or extra text

Generate the drawing instructions now:"""
        
        # Call Gemini
        response = model.generate_content(system_prompt)
        
        # Extract JSON from response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if '```json' in response_text:
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response_text)
            if json_match:
                response_text = json_match.group(1)
        elif '```' in response_text:
            json_match = re.search(r'```\s*([\s\S]*?)\s*```', response_text)
            if json_match:
                response_text = json_match.group(1)
        
        # Validate JSON
        try:
            json.loads(response_text)
        except json.JSONDecodeError:
            return SimpleDrawResponse(
                success=False,
                error=f"Invalid JSON returned from Gemini: {response_text[:200]}"
            )
        
        execution_time = time.time() - start_time
        print(f"✅ Simple drawing completed in {execution_time:.2f}s")
        
        return SimpleDrawResponse(
            success=True,
            drawing_instructions=response_text
        )
    except Exception as e:
        return SimpleDrawResponse(
            success=False,
            error=f"Error generating drawing: {str(e)}"
        )


# Drawing endpoint for AI agents (CrewAI-based - optional/alternative)
@app.post("/api/draw/execute", response_model=DrawResponse)
async def execute_drawing(request: DrawRequest):
    """
    Execute a drawing task using AI agents
    Agents can be students or teachers, each with their own drawing style
    """
    try:
        # Try to import CrewAI (optional dependency)
        try:
            from crewai import Agent, Task, Crew
        except ImportError:
            return DrawResponse(
                success=False,
                error="CrewAI is not installed. This endpoint requires CrewAI. Install with: pip install crewai langchain-google-genai. Note: The frontend uses /api/draw/simple by default.",
                drawing_instructions=None,
                result=None
            )
        import time
        
        start_time = time.time()
        
        # Create agents based on the request
        crew_agents = []
        for agent_info in request.agents:
            role_name = agent_info.get("role", "student")
            agent_name = agent_info.get("name", "AI Agent")
            agent_color = agent_info.get("color", "#3b82f6")
            
            if role_name == "teacher":
                backstory = f"You are a teacher AI agent named {agent_name}. You draw educational diagrams, explain concepts visually, and guide students. Use color {agent_color} for your drawings."
                goal = "Create clear, educational drawings that help students learn"
            else:
                backstory = f"You are a student AI agent named {agent_name}. You draw to practice and learn. Use color {agent_color} for your drawings."
                goal = "Create drawings based on learning tasks and practice"
            
            agent_kwargs = {
                "role": agent_name,
                "goal": goal,
                "backstory": backstory,
                "verbose": True,
                "allow_delegation": False
            }
            
            # Use Gemini LLM if available
            if gemini_llm:
                agent_kwargs["llm"] = gemini_llm
            
            agent = Agent(**agent_kwargs)
            crew_agents.append(agent)
        
        # Create drawing task
        drawing_instructions = []
        for i, agent in enumerate(crew_agents):
            agent_info = request.agents[i]
            task_description = f"""
            {request.task}
            
            As {agent_info.get("name")} (a {agent_info.get("role")}), you need to draw something on the board.
            Consider what shapes, lines, or diagrams would best represent this task.
            Your drawing should use the color {agent_info.get("color", "#3b82f6")}.
            
            Provide specific drawing instructions in JSON format describing:
            - shapes to draw (circles, rectangles, lines, arrows, text)
            - positions (x, y coordinates)
            - colors
            - sizes
            - any text labels
            """
            
            task = Task(
                description=task_description,
                agent=agent,
                expected_output="A JSON object describing the drawing instructions with shapes, positions, colors, and labels"
            )
            
            # Execute task for each agent
            result = agent.execute_task(task)
            
            drawing_instructions.append({
                "agent_id": agent_info.get("id"),
                "agent_name": agent_info.get("name"),
                "agent_role": agent_info.get("role"),
                "color": agent_info.get("color"),
                "instructions": str(result),
                "task": request.task
            })
        
        execution_time = time.time() - start_time
        
        return DrawResponse(
            success=True,
            drawing_instructions=drawing_instructions,
            result=f"Generated drawing instructions for {len(crew_agents)} agent(s)",
            error=None
        )
    except Exception as e:
        return DrawResponse(
            success=False,
            error=str(e),
            result=None,
            drawing_instructions=None
        )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
