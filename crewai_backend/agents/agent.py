"""
CrewAI Backend Server
FastAPI server to handle CrewAI multi-agent operations
Previously main.py
"""

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uvicorn
import json
from crewai import Agent, Task, Crew
from tts.tts import text_to_speech_stream
from agents.example_agents import (
    create_classroom_crew,
    create_debate_crew,
    create_discussion_task,
    create_debate_task,
    create_explanation_task,
    add_user_question_flow,
)

app = FastAPI(title="CrewAI Backend API", version="1.0.0")

# Configure CORS to allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],  # Next.js default ports
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


# Classroom-specific request/response models
class ClassroomDiscussionRequest(BaseModel):
    topic: str
    subject: str = "mathematics"
    user_message: Optional[str] = None
    conversation_history: Optional[List[Dict[str, str]]] = None
    whiteboard_state: Optional[Dict[str, Any]] = None
    agents_config: Optional[Dict[str, Any]] = None


class ClassroomDiscussionResponse(BaseModel):
    success: bool
    responses: Optional[List[Dict[str, Any]]] = (
        None  # [{agent: "...", message: "..."}, ...]
    )
    error: Optional[str] = None
    execution_time: Optional[float] = None


class DebateRequest(BaseModel):
    proposition: str
    subject: str = "general"
    agents_config: Optional[Dict[str, Any]] = None


class DebateResponse(BaseModel):
    success: bool
    debate_transcript: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None


# Study Help Request/Response models
class StudyHelpRequest(BaseModel):
    """
    Request model for study help endpoint.
    This is where user input is RECEIVED - when frontend sends a POST request.
    """

    user_question: str  # The user's study question or problem
    subject: str = "general"  # Subject area (e.g., "mathematics", "physics")
    conversation_history: Optional[List[Dict[str, str]]] = (
        None  # Previous messages for context
    )
    help_type: str = "explanation"  # "explanation", "discussion", or "debate"
    preferred_agent_role: Optional[str] = (
        None  # Optional: route question to a specific agent role
    )


class StudyHelpResponse(BaseModel):
    """
    Response model for study help endpoint.
    This is what gets sent back to the frontend.
    """

    success: bool
    answer: Optional[str] = None  # Main answer from expert
    agent_responses: Optional[List[Dict[str, str]]] = None  # Multiple agent responses
    visual_suggestions: Optional[Dict[str, Any]] = (
        None  # Whiteboard content suggestions
    )
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
            role=request.agent_config.get("role", "Assistant")
            if request.agent_config
            else "Assistant",
            goal=request.agent_config.get("goal", "Complete the given task")
            if request.agent_config
            else "Complete the given task",
            backstory=request.agent_config.get(
                "backstory", "You are a helpful assistant"
            )
            if request.agent_config
            else "You are a helpful assistant",
            verbose=True,
            allow_delegation=False,
        )

        # Create task
        task = Task(
            description=request.task,
            agent=agent,
            expected_output="A concise response to the task (under 200 words, approximately 1 minute when spoken)",
        )

        # Execute task
        result = agent.execute_task(task)

        execution_time = time.time() - start_time

        return AgentResponse(
            success=True,
            result=str(result) if result else "Task completed",
            execution_time=execution_time,
        )
    except Exception as e:
        return AgentResponse(success=False, error=str(e), execution_time=None)


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
                    backstory=agent_config.get(
                        "backstory", "You are a helpful assistant"
                    ),
                    verbose=True,
                    allow_delegation=agent_config.get("allow_delegation", True),
                )
                agents.append(agent)
        else:
            # Default agent configuration
            agent = Agent(
                role="Assistant",
                goal="Complete assigned tasks",
                backstory="You are a helpful assistant",
                verbose=True,
                allow_delegation=True,
            )
            agents.append(agent)

        # Create tasks
        tasks = []
        for i, task_description in enumerate(request.tasks):
            task = Task(
                description=task_description,
                agent=agents[i % len(agents)],  # Distribute tasks among agents
                expected_output="A concise response to the task (under 200 words, approximately 1 minute when spoken)",
            )
            tasks.append(task)

        # Create and run crew
        crew = Crew(agents=agents, tasks=tasks, verbose=True)

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
            success=True, results=results, execution_time=execution_time
        )
    except Exception as e:
        return CrewResponse(success=False, error=str(e), execution_time=None)


# ============================================================================
# CLASSROOM ENDPOINTS - Using the new classroom agents
# ============================================================================


@app.post("/api/classroom/discuss", response_model=ClassroomDiscussionResponse)
async def classroom_discussion(request: ClassroomDiscussionRequest):
    """
    Start a classroom discussion with multiple agents responding to a topic.
    This demonstrates agent-to-agent interaction as agents can see each other's responses.
    """
    try:
        import time

        start_time = time.time()

        # Create classroom crew
        crew = create_classroom_crew(
            subject=request.subject,
            agents_config=request.agents_config,
        )

        # Build context from conversation history and user message
        context = {}
        if request.user_message:
            context["user_message"] = request.user_message
        if request.conversation_history:
            context["conversation_history"] = request.conversation_history
        if request.whiteboard_state:
            context["whiteboard_state"] = request.whiteboard_state

        # Find agents by role (more robust than assuming order)
        professor_agent = next(
            (a for a in crew.agents if "Professor" in a.role), crew.agents[0]
        )
        expert_agent = next(
            (a for a in crew.agents if "Expert" in a.role),
            crew.agents[1] if len(crew.agents) > 1 else crew.agents[0],
        )
        devil_advocate_agent = next(
            (a for a in crew.agents if "Devil" in a.role or "Critical" in a.role),
            crew.agents[2] if len(crew.agents) > 2 else crew.agents[0],
        )

        # Create tasks for different agents to participate in the discussion
        # Agents will see each other's outputs and can respond to them
        # whiteboard_aware is auto-determined based on topic/context
        tasks = [
            create_discussion_task(
                topic=f"{request.topic}"
                + (
                    f"\nUser said: {request.user_message}"
                    if request.user_message
                    else ""
                ),
                agent=professor_agent,
                context=context,
                whiteboard_aware=None,  # Auto-detect
                subject=request.subject,
            ),
            create_discussion_task(
                topic=request.topic,
                agent=expert_agent,
                context=context,
                whiteboard_aware=None,  # Auto-detect
                subject=request.subject,
            ),
            create_discussion_task(
                topic=request.topic,
                agent=devil_advocate_agent,
                context=context,
                whiteboard_aware=None,  # Auto-detect
                subject=request.subject,
            ),
        ]

        # Add peer student if exists
        peer_agent = next((a for a in crew.agents if "Peer Student" in a.role), None)
        if peer_agent:
            tasks.append(
                create_discussion_task(
                    topic=request.topic,
                    agent=peer_agent,
                    context=context,
                    whiteboard_aware=None,  # Auto-detect
                    subject=request.subject,
                )
            )

        # Update crew with new tasks
        crew.tasks = tasks

        # Execute - agents will interact with each other through CrewAI's task system
        result = crew.kickoff()

        execution_time = time.time() - start_time

        # Parse results - CrewAI returns results from each task
        responses = []
        if isinstance(result, dict):
            for task_desc, output in result.items():
                # Extract agent name from task if possible
                agent_name = "Unknown Agent"
                for task in tasks:
                    if task.description == task_desc or task_desc in task.description:
                        agent_name = task.agent.role
                        break
                responses.append(
                    {
                        "agent": agent_name,
                        "message": str(output),
                        "task": task_desc[:100],  # Truncate for display
                    }
                )
        elif hasattr(result, "tasks_output"):
            # Handle CrewAI result object
            for i, task in enumerate(crew.tasks):
                responses.append(
                    {
                        "agent": task.agent.role,
                        "message": "Response generated",  # CrewAI format may vary
                    }
                )

        return ClassroomDiscussionResponse(
            success=True, responses=responses, execution_time=execution_time
        )
    except Exception as e:
        import traceback

        return ClassroomDiscussionResponse(
            success=False,
            error=f"{str(e)}\n{traceback.format_exc()}",
            execution_time=None,
        )


@app.post("/api/classroom/debate", response_model=DebateResponse)
async def start_debate(request: DebateRequest):
    """
    Start a debate session where agents argue different positions.
    This explicitly tests agent-to-agent interaction in a debate format.
    """
    try:
        import time

        start_time = time.time()

        # Create debate crew - agents will respond to each other
        crew = create_debate_crew(
            topic=request.proposition,
            subject=request.subject,
            agents_config=request.agents_config,
        )

        # Execute debate - agents will see each other's arguments
        result = crew.kickoff()

        execution_time = time.time() - start_time

        # Format debate transcript
        debate_transcript = []
        if isinstance(result, dict):
            for task_desc, output in result.items():
                # Match task to agent
                agent_name = "Moderator"
                position = "neutral"
                for task in crew.tasks:
                    if task.description == task_desc or task_desc in task.description:
                        agent_name = task.agent.role
                        # Determine position from task
                        if (
                            "argue" in task.description.lower()
                            or "favor" in task.description.lower()
                        ):
                            position = "for"
                        elif (
                            "counter" in task.description.lower()
                            or "against" in task.description.lower()
                        ):
                            position = "against"
                        break

                debate_transcript.append(
                    {"agent": agent_name, "position": position, "argument": str(output)}
                )

        return DebateResponse(
            success=True,
            debate_transcript=debate_transcript,
            execution_time=execution_time,
        )
    except Exception as e:
        import traceback

        return DebateResponse(
            success=False,
            error=f"{str(e)}\n{traceback.format_exc()}",
            execution_time=None,
        )


@app.post("/api/classroom/explain", response_model=ClassroomDiscussionResponse)
async def explain_concept(request: ClassroomDiscussionRequest):
    """
    Get an explanation from the expert agent, with optional visual suggestions.
    """
    try:
        import time

        start_time = time.time()

        # Create crew with expert (agents have whiteboard tool available)
        crew = create_classroom_crew(
            subject=request.subject,
            agents_config=request.agents_config,
        )

        expert_agent = next(
            (a for a in crew.agents if "Expert" in a.role), crew.agents[1]
        )

        # Create explanation task (expert will use whiteboard tool if needed)
        # include_visuals is auto-determined based on topic/context/subject
        tasks = [
            create_explanation_task(
                concept=request.topic,
                agent=expert_agent,
                audience_level="intermediate",
                include_visuals=None,  # Auto-detect
                context=None,
                subject=request.subject,
            )
        ]

        # Execute
        crew.tasks = tasks
        result = crew.kickoff()

        execution_time = time.time() - start_time

        # Format response
        responses = []
        if isinstance(result, dict):
            for task_desc, output in result.items():
                # Determine agent name from task
                agent_name = "Expert"
                for task in tasks:
                    if task.description == task_desc or task_desc in task.description:
                        agent_name = task.agent.role
                        break
                responses.append({"agent": agent_name, "message": str(output)})

        return ClassroomDiscussionResponse(
            success=True, responses=responses, execution_time=execution_time
        )
    except Exception as e:
        import traceback

        return ClassroomDiscussionResponse(
            success=False,
            error=f"{str(e)}\n{traceback.format_exc()}",
            execution_time=None,
        )


# ============================================================================
# STUDY HELP ENDPOINT - Main endpoint for user study questions
# ============================================================================


@app.post("/api/study/help", response_model=StudyHelpResponse)
async def study_help(request: StudyHelpRequest):
    """
    Main endpoint for study help requests.

    WHERE USER INPUT IS RECEIVED:
    ------------------------------
    User input comes in via the `request` parameter (StudyHelpRequest object).
    FastAPI automatically parses the JSON request body into this model.

    The frontend sends a POST request like:
    POST /api/study/help
    {
        "user_question": "How do I solve quadratic equations?",
        "subject": "mathematics",
        "help_type": "explanation"
    }

    WHERE USER INPUT IS HANDLED:
    ------------------------------
    The user's question is handled in this function (lines below).
    - request.user_question contains the user's input
    - We create appropriate agents based on the subject
    - We create tasks that use the user's question
    - Agents process the question and generate responses
    """
    try:
        import time

        start_time = time.time()

        # ========================================================================
        # STEP 1: EXTRACT USER INPUT
        # ========================================================================
        # This is where we read what the user sent us
        user_question = request.user_question
        subject = request.subject
        help_type = request.help_type
        conversation_history = request.conversation_history or []
        preferred_agent_role = request.preferred_agent_role

        print(f"[STUDY HELP] User asked: {user_question}")
        print(f"[STUDY HELP] Subject: {subject}, Help type: {help_type}")

        # ========================================================================
        # STEP 2: BUILD CONTEXT FROM USER INPUT
        # ========================================================================
        # Create context object that includes user's question and history
        context = {
            "user_question": user_question,
            "conversation_history": conversation_history,
            "subject": subject,
        }

        # ========================================================================
        # STEP 3: CREATE APPROPRIATE CREW BASED ON HELP TYPE
        # ========================================================================
        # Map agent name from run_agent args to actual agent roles
        agent_role_map = {
            "expert": "Problem Analyst",
            "professor": "Socratic Mentor",
            "challenger": "Critical Thinker",
            "student": "Peer Student",
            "connector": "Interdisciplinary Connector",
        }
        
        # Normalize preferred_agent_role if it's a short name
        actual_agent_role = preferred_agent_role
        if preferred_agent_role and preferred_agent_role.lower() in agent_role_map:
            actual_agent_role = agent_role_map[preferred_agent_role.lower()]
        
        # Handle different types of help requests
        if help_type == "explanation":
            # For explanations: ONLY the specified agent runs
            # Create crew to get access to agent creation functions
            crew = create_classroom_crew(subject=subject)
            
            # Find the specific agent to use
            from agents.example_agents import find_agent_by_role
            target_agent = None
            
            if actual_agent_role:
                target_agent = find_agent_by_role(crew, actual_agent_role)
            
            # Fallback to expert if agent not found or not specified
            if not target_agent:
                target_agent = find_agent_by_role(crew, "Problem Analyst")
                if not target_agent:
                    target_agent = crew.agents[0] if crew.agents else None
            
            # Create crew with ONLY the target agent
            from crewai import Crew
            crew = Crew(
                agents=[target_agent],
                tasks=[],
                verbose=True,
                process="sequential",  # Sequential even for single agent
            )
            
            # Create a single task for this agent only
            tasks = [
                create_explanation_task(
                    concept=user_question,
                    agent=target_agent,
                    audience_level="intermediate",
                    include_visuals=None,
                    context=context,
                    subject=subject,
                )
            ]

        elif help_type == "discussion":
            # For discussions: ALL agents participate sequentially
            crew = create_classroom_crew(subject=subject)
            
            # Create tasks for ALL agents to participate in the discussion
            from agents.example_agents import find_agent_by_role, create_discussion_task
            
            tasks = []
            
            # Find all available agents
            professor = find_agent_by_role(crew, "Socratic Mentor")
            expert = find_agent_by_role(crew, "Problem Analyst")
            challenger = find_agent_by_role(crew, "Critical Thinker")
            student = find_agent_by_role(crew, "Peer Student")
            connector = find_agent_by_role(crew, "Interdisciplinary Connector")
            
            # Order agents: Start with primary if specified, then others
            agent_order = []
            
            # Primary agent (if specified) goes first
            if actual_agent_role:
                primary = find_agent_by_role(crew, actual_agent_role)
                if primary:
                    agent_order.append(primary)
            
            # Add all other agents in a logical order
            for agent in [professor, expert, challenger, student, connector]:
                if agent and agent not in agent_order:
                    agent_order.append(agent)
            
            # If no primary specified, default order: professor, expert, challenger, student, connector
            if not agent_order:
                agent_order = [a for a in [professor, expert, challenger, student, connector] if a]
            
            # Create discussion tasks for each agent sequentially
            for agent in agent_order:
                tasks.append(
                    create_discussion_task(
                        topic=user_question,
                        agent=agent,
                        context=context,
                        whiteboard_aware=None,
                        subject=subject,
                    )
                )
            
            # Ensure sequential process to avoid overlap (tasks run one after another)
            crew.process = "sequential"

        else:  # Default to explanation
            # Default: single agent explanation
            crew = create_classroom_crew(subject=subject)
            
            from agents.example_agents import find_agent_by_role
            target_agent = find_agent_by_role(crew, "Problem Analyst")
            if not target_agent:
                target_agent = crew.agents[0] if crew.agents else None
            
            # Create crew with ONLY the target agent
            from crewai import Crew
            crew = Crew(
                agents=[target_agent],
                tasks=[],
                verbose=True,
                process="sequential",
            )
            
            tasks = [
                create_explanation_task(
                    concept=user_question,
                    agent=target_agent,
                    audience_level="intermediate",
                    include_visuals=None,
                    context=context,
                    subject=subject,
                )
            ]

        # ========================================================================
        # STEP 4: EXECUTE AGENTS WITH USER'S QUESTION
        # ========================================================================
        # Update crew with tasks that address user's question
        crew.tasks = tasks

        # Execute - this is where agents actually process the user's input
        result = crew.kickoff()

        execution_time = time.time() - start_time

        # ========================================================================
        # STEP 5: PARSE AGENT RESPONSES AND RETURN TO USER
        # ========================================================================
        # Format the responses for the frontend
        agent_responses = []
        main_answer = None
        visual_suggestions = None

        # Debug: Log result type and attributes for troubleshooting
        print(f"[STUDY HELP] Result type: {type(result)}")
        if hasattr(result, "__dict__"):
            print(f"[STUDY HELP] Result attributes: {list(result.__dict__.keys())}")

        # Try multiple ways to extract task outputs from CrewAI result
        if isinstance(result, list):
            # Format: List of outputs, one per task
            for i, output in enumerate(result):
                agent_name = tasks[i].agent.role if i < len(tasks) and hasattr(tasks[i], "agent") else "Expert"
                response_text = str(output)
                agent_responses.append(
                    {
                        "agent": agent_name,
                        "message": response_text,
                    }
                )
                
                if main_answer is None and "Expert" in agent_name:
                    main_answer = response_text
        
        elif isinstance(result, dict):
            # Format: {task_description: output}
            for task_desc, output in result.items():
                # Extract agent name
                agent_name = "Expert"
                for task in tasks:
                    if task.description == task_desc or task_desc in task.description:
                        agent_name = task.agent.role
                        break

                response_text = str(output)
                agent_responses.append(
                    {
                        "agent": agent_name,
                        "message": response_text,
                    }
                )

                # First expert response becomes the main answer
                if main_answer is None and "Expert" in agent_name:
                    main_answer = response_text

                # Extract visual suggestions
                if visual_suggestions is None and (
                    "visual" in task_desc.lower() or "whiteboard" in task_desc.lower()
                ):
                    visual_suggestions = {
                        "description": response_text,
                        "type": "graph",  # Could be extracted from response
                    }
        
        elif hasattr(result, "tasks_output"):
            # Format: CrewAI result object with tasks_output attribute
            tasks_output = result.tasks_output
            if isinstance(tasks_output, dict):
                for task_desc, output in tasks_output.items():
                    agent_name = "Expert"
                    for task in tasks:
                        if task.description == task_desc or task_desc in task.description:
                            agent_name = task.agent.role
                            break
                    
                    response_text = str(output)
                    agent_responses.append(
                        {
                            "agent": agent_name,
                            "message": response_text,
                        }
                    )
                    
                    if main_answer is None and "Expert" in agent_name:
                        main_answer = response_text
            elif isinstance(tasks_output, list):
                # If tasks_output is a list
                for i, output in enumerate(tasks_output):
                    agent_name = tasks[i].agent.role if i < len(tasks) and hasattr(tasks[i], "agent") else "Expert"
                    response_text = str(output)
                    agent_responses.append(
                        {
                            "agent": agent_name,
                            "message": response_text,
                        }
                    )
                    
                    if main_answer is None and "Expert" in agent_name:
                        main_answer = response_text
        
        # Check for raw attribute (sometimes CrewAI stores raw output here)
        if not agent_responses and hasattr(result, "raw"):
            raw_output = result.raw
            if raw_output:
                response_text = str(raw_output)
                agent_name = tasks[0].agent.role if tasks and hasattr(tasks[0], "agent") else "Expert"
                agent_responses.append(
                    {
                        "agent": agent_name,
                        "message": response_text,
                    }
                )
                if main_answer is None:
                    main_answer = response_text
        
        # Check if tasks have output attributes (after execution)
        if not agent_responses and tasks:
            for task in tasks:
                task_output = None
                # Try multiple ways to get task output
                if hasattr(task, "output"):
                    task_output = task.output
                elif hasattr(task, "result"):
                    task_output = task.result
                elif hasattr(task, "raw_output"):
                    task_output = task.raw_output
                
                if task_output and str(task_output).strip():
                    agent_name = task.agent.role if hasattr(task, "agent") and task.agent else "Unknown Agent"
                    response_text = str(task_output).strip()
                    agent_responses.append(
                        {
                            "agent": agent_name,
                            "message": response_text,
                        }
                    )
                    
                    if main_answer is None and "Expert" in agent_name:
                        main_answer = response_text
        
        # Fallback: if result is a string or single value, treat as single response
        if not agent_responses:
            response_text = str(result)
            if response_text and response_text.strip():
                # Try to find the first task's agent
                agent_name = tasks[0].agent.role if tasks and hasattr(tasks[0], "agent") else "Expert"
                agent_responses.append(
                    {
                        "agent": agent_name,
                        "message": response_text,
                    }
                )
                if main_answer is None:
                    main_answer = response_text

        # If no main answer, use first response
        if main_answer is None and agent_responses:
            main_answer = agent_responses[0]["message"]

        return StudyHelpResponse(
            success=True,
            answer=main_answer,
            agent_responses=agent_responses,
            visual_suggestions=visual_suggestions,
            execution_time=execution_time,
        )

    except Exception as e:
        import traceback

        return StudyHelpResponse(
            success=False,
            error=f"{str(e)}\n{traceback.format_exc()}",
            execution_time=None,
        )


# ============================================================================
# WEBSOCKET ENDPOINTS - Audio streaming
# ============================================================================

from fastapi import WebSocket
import json


@app.websocket("/ws/audio")
async def websocket_audio_stream(websocket: WebSocket):
    """
    WebSocket endpoint for streaming audio responses
    """
    try:
        await websocket.accept()
        # Send connected message
        await websocket.send_json({"type": "connected"})

        # Initialize variables
        agent = None
        voice_id = None

        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "config":
                # Configure agent and voice
                agent_config = data.get("agent_config", {})
                agent = Agent(
                    role=agent_config.get("role", "Assistant"),
                    goal="Complete tasks and provide audio responses",
                    backstory="You are a helpful AI assistant who responds via audio.",
                    verbose=True,
                    allow_delegation=False,
                )
                voice_id = agent_config.get("voice_id")
                await websocket.send_json({"type": "config_received"})

            elif msg_type == "text":
                if not agent:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "error": "Agent not configured. Send config message first.",
                        }
                    )
                    continue

                text = data.get("text", "")
                await websocket.send_json({"type": "text_received"})

                # Generate agent's response
                task = Task(
                    description=text,
                    agent=agent,
                    expected_output="A helpful and concise response",
                )
                response = agent.execute_task(task)

                # Send response text first
                await websocket.send_json({"type": "response_text", "text": response})

                # Then stream audio
                await websocket.send_json({"type": "audio_start"})
                for chunk in text_to_speech_stream(response, voice_id=voice_id):
                    await websocket.send_bytes(chunk)
                await websocket.send_json({"type": "audio_end"})

    except Exception as e:
        # If connection is still open, send error
        try:
            await websocket.send_json({"type": "error", "error": str(e)})
        except Exception:
            # Connection is already closed
            pass


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
