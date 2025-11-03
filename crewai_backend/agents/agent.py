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
import os
import sys
import base64
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

# Import agent_runner for transcript processing
# Ensure we can import from parent directory
_backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

try:
    from agent_runner import run_agent, _extract_answer_from_response
except ImportError as e:
    print(f"[agent.py] Warning: Could not import agent_runner: {e}")
    print(f"[agent.py] Backend root: {_backend_root}")
    print(f"[agent.py] Python path: {sys.path[:3]}")
    run_agent = None
    _extract_answer_from_response = None

# Import TTS functions
try:
    from tts.tts import text_to_speech
except ImportError as e:
    print("[agent.py] Warning: Could not import TTS functions. Audio features may not work.")
    text_to_speech = None

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
    available_agent_roles: Optional[List[str]] = None  # List of agent roles available (based on meeting users)


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
    whiteboard_data: Optional[Dict[str, Any]] = None  # Whiteboard tool output JSON (for TldrawBoardEmbedded)
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
        "user_question": "<user's actual question from speech-to-text>",
        "subject": "mathematics",
        "help_type": "explanation"
    }
    
    Note: user_question should always come from user input (microphone speech-to-text or typed message).

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
        
        # Extract available agent roles from request (for user-based filtering)
        available_agent_roles = request.available_agent_roles
        
        # Handle different types of help requests
        if help_type == "explanation":
            # For explanations: ONLY the specified agent runs
            # Create crew to get access to agent creation functions
            crew = create_classroom_crew(subject=subject, available_agent_roles=available_agent_roles)
            
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
            crew = create_classroom_crew(subject=subject, available_agent_roles=available_agent_roles)
            
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
            crew = create_classroom_crew(subject=subject, available_agent_roles=available_agent_roles)
            
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
        # Wrap in try-catch to handle CrewAI parsing errors gracefully with content extraction
        try:
            result = crew.kickoff()
        except Exception as crew_error:
            error_str = str(crew_error).lower()
            # Check if it's a parsing/format error
            if "parsing" in error_str or "invalid format" in error_str or "retry" in error_str:
                print(f"[study_help] CrewAI parsing error: {crew_error}")
                
                # Try to extract usable content from error message as fallback
                error_msg = str(crew_error)
                extracted_answer = None
                
                # Look for "Thought:" content in error message
                if "thought:" in error_msg.lower():
                    import re
                    # Try to find thought content
                    thought_match = re.search(r'thought:\s*(.+?)(?:\n\n|final answer|action:|$)', error_msg, re.IGNORECASE | re.DOTALL)
                    if thought_match:
                        extracted_thought = thought_match.group(1).strip()
                        # Clean up common error text
                        extracted_thought = re.sub(r'i did it wrong.*?invalid format.*?', '', extracted_thought, flags=re.IGNORECASE | re.DOTALL)
                        extracted_thought = re.sub(r'i missed.*?', '', extracted_thought, flags=re.IGNORECASE)
                        extracted_thought = extracted_thought.strip()
                        if extracted_thought and len(extracted_thought) > 10:
                            extracted_answer = extracted_thought
                
                # If we extracted usable content, use it as fallback
                if extracted_answer:
                    execution_time = time.time() - start_time
                    return StudyHelpResponse(
                        success=True,
                        answer=extracted_answer,
                        agent_responses=[{"agent": "assistant", "message": extracted_answer}],
                        visual_suggestions=None,
                        whiteboard_data=None,
                        execution_time=execution_time,
                    )
                
                # If no usable content, return user-friendly error
                execution_time = time.time() - start_time
                return StudyHelpResponse(
                    success=False,
                    answer="I encountered a formatting issue. Please try rephrasing your question.",
                    agent_responses=None,
                    visual_suggestions=None,
                    whiteboard_data=None,
                    error="Format parsing error",
                    execution_time=execution_time,
                )
            else:
                # Re-raise if it's a different type of error
                raise

        execution_time = time.time() - start_time

        # ========================================================================
        # STEP 5: PARSE AGENT RESPONSES AND RETURN TO USER
        # ========================================================================
        # Format the responses for the frontend
        agent_responses = []
        main_answer = None
        visual_suggestions = None
        whiteboard_data = None  # Whiteboard tool output JSON

        def wrap_tool_output_in_robust_prompt(tool_data: Dict[str, Any], agent_name: str = "teaching agent") -> str:
            """
            Wrap agent tool output in a concise, action-focused prompt (max 2 sentences).
            """
            if not tool_data or not isinstance(tool_data, dict):
                return ""
            
            tool_type = tool_data.get("type", "visual")
            topic = tool_data.get("description", "").replace(
                "Graph visualization for: ", ""
            ).replace("Diagram visualization for: ", "").replace(
                "Concept map for: ", ""
            ).replace("Step-by-step visual solution for: ", "") or ""
            instructions = tool_data.get("instructions", "")
            expression = tool_data.get("expression", "")
            specifications = tool_data.get("specifications", {})
            
            # Extract essential action verb and target
            action = ""
            target = ""
            
            if tool_type == "graph" and expression:
                action = "Graph"
                target = expression
            elif tool_type == "diagram":
                action = "Draw diagram"
                target = topic or instructions or "diagram"
            elif tool_type == "concept_map":
                action = "Create concept map"
                target = topic or instructions or "concepts"
            elif tool_type == "step_by_step":
                action = "Draw steps"
                target = topic or instructions or "solution"
            else:
                action = f"Draw {tool_type}"
                target = topic or instructions or ""
            
            # Build first sentence: action + target
            sentence1 = f"{action} {target}".strip()
            
            # Build second sentence: specifications only (if any)
            spec_parts = []
            if specifications.get("axes") and tool_type == "graph":
                spec_parts.append("labeled axes")
            if specifications.get("grid") and tool_type == "graph":
                spec_parts.append("grid")
            if specifications.get("labels") and tool_type != "graph":
                spec_parts.append("labels")
            
            if spec_parts:
                sentence2 = f"Include {', '.join(spec_parts)}."
            else:
                sentence2 = ""
            
            # Combine: max 2 sentences
            if sentence2:
                return f"{sentence1}. {sentence2}"
            else:
                return sentence1
        
        # Helper function to extract whiteboard tool output from text
        def extract_whiteboard_tool_output(text: str) -> Optional[Dict[str, Any]]:
            """Extract whiteboard tool output JSON from agent response text."""
            if not text:
                return None
            import json
            import re
            
            # First, try to parse the entire text as JSON (tool might return JSON directly)
            try:
                parsed = json.loads(text.strip())
                if isinstance(parsed, dict) and (
                    "type" in parsed or 
                    "render_engine" in parsed or
                    parsed.get("type") in ["graph", "diagram", "concept_map", "step_by_step"]
                ):
                    print(f"[study_help] Found whiteboard tool output (direct JSON): {parsed.get('type', 'unknown')}")
                    return parsed
            except (json.JSONDecodeError, ValueError):
                pass
            
            # Try to find JSON blocks in the text (common patterns)
            # Pattern 1: JSON code block ```json ... ```
            json_pattern = r'```json\s*(\{.*?\})\s*```'
            matches = re.findall(json_pattern, text, re.DOTALL)
            
            # Pattern 2: Code block without language tag ``` ... ```
            if not matches:
                json_pattern = r'```\s*(\{.*?\})\s*```'
                matches = re.findall(json_pattern, text, re.DOTALL)
            
            # Pattern 3: Plain JSON object (more sophisticated pattern)
            if not matches:
                # Find JSON objects that might span multiple lines
                json_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
                matches = re.findall(json_pattern, text, re.DOTALL)
            
            # Try to parse each match as whiteboard tool output
            for match in matches:
                try:
                    # Clean up the match (remove extra whitespace)
                    cleaned = match.strip()
                    parsed = json.loads(cleaned)
                    # Check if it looks like whiteboard tool output
                    if isinstance(parsed, dict) and (
                        "type" in parsed or 
                        "render_engine" in parsed or
                        parsed.get("type") in ["graph", "diagram", "concept_map", "step_by_step"] or
                        "specifications" in parsed or
                        "instructions" in parsed
                    ):
                        print(f"[study_help] Found whiteboard tool output: {parsed.get('type', 'unknown')}")
                        return parsed
                except (json.JSONDecodeError, ValueError) as e:
                    continue
            
            # Last resort: check if text contains whiteboard tool indicators
            # Sometimes the tool output might be partially in text format
            if any(keyword in text.lower() for keyword in ["render_engine", "visualization_spec", "generate_whiteboard_visual"]):
                print(f"[study_help] Warning: Text contains whiteboard keywords but couldn't parse JSON")
            
            return None

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
                
                # Extract whiteboard tool output from any agent response
                if whiteboard_data is None:
                    extracted = extract_whiteboard_tool_output(response_text)
                    if extracted:
                        whiteboard_data = extracted
                        print(f"[study_help] Extracted whiteboard data from {agent_name} (list format)")
                
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
            # Debug: print result type and structure
            print(f"[study_help] Result type: {type(result)}")
            print(f"[study_help] Result dict keys: {list(result.keys())}")
            for key, val in result.items():
                val_str = str(val) if val else "None"
                print(f"[study_help] Key '{key[:50]}' -> Value (preview): {val_str[:150]}")
            
            # Also check tasks for outputs after execution
            print(f"[study_help] Checking {len(tasks)} tasks for outputs...")
            for i, task in enumerate(tasks):
                task_output = None
                # Try multiple possible attributes
                for attr in ['output', 'raw_output', 'result', 'final_output']:
                    if hasattr(task, attr):
                        val = getattr(task, attr, None)
                        if val:
                            task_output = val
                            print(f"[study_help] Task {i} found output in '{attr}': {str(val)[:100]}...")
                            break
                
                if task_output:
                    output_str = str(task_output).strip()
                    # Skip empty outputs
                    if output_str and output_str != "```" and output_str.replace("`", "").strip():
                        agent_name = task.agent.role if hasattr(task, 'agent') and task.agent else "Assistant"
                        
                        # Extract whiteboard tool output from any task output
                        if whiteboard_data is None:
                            extracted = extract_whiteboard_tool_output(output_str)
                            if extracted:
                                whiteboard_data = extracted
                                print(f"[study_help] Extracted whiteboard data from {agent_name} task output")
                        
                        # Add to agent_responses if not already present
                        if not any(resp.get("message") == output_str for resp in agent_responses):
                            agent_responses.append({
                                "agent": agent_name,
                                "message": output_str,
                            })
                        # Use as main_answer if we don't have one
                        if main_answer is None or main_answer.strip() == "":
                            main_answer = output_str
                else:
                    print(f"[study_help] Task {i} ({task.description[:50]}...) has no output attribute")
                
                # Also check for intermediate_steps (where tool outputs might be stored)
                if hasattr(task, 'intermediate_steps') and task.intermediate_steps and whiteboard_data is None:
                    print(f"[study_help] Task {i} has intermediate_steps ({len(task.intermediate_steps)} steps), checking for whiteboard tool output...")
                    agent_name = task.agent.role if hasattr(task, 'agent') and task.agent else "Assistant"
                    for step_idx, step in enumerate(task.intermediate_steps):
                        tool_name = None
                        tool_output = None
                        
                        # Handle different step formats
                        if isinstance(step, (list, tuple)) and len(step) >= 2:
                            # Format: (action/tool_name, observation/output) or (tool_name, tool_input, output)
                            tool_name = step[0] if len(step) > 0 else None
                            tool_output = step[1] if len(step) > 1 else None
                        elif isinstance(step, dict):
                            # Format: {"tool": "...", "input": "...", "output": "..."} or {"action": "...", "observation": "..."}
                            tool_name = step.get("tool") or step.get("action") or step.get("name")
                            tool_output = step.get("output") or step.get("observation") or step.get("result")
                        elif hasattr(step, 'tool'):
                            # Object with attributes
                            tool_name = getattr(step, 'tool', None) or getattr(step, 'action', None)
                            tool_output = getattr(step, 'output', None) or getattr(step, 'observation', None)
                        
                        # Check if this is a whiteboard tool by name
                        if tool_name:
                            tool_name_str = str(tool_name).lower()
                            if "whiteboard" in tool_name_str or "generate_whiteboard" in tool_name_str:
                                if tool_output:
                                    tool_output_str = str(tool_output)
                                    extracted = extract_whiteboard_tool_output(tool_output_str)
                                    if extracted:
                                        whiteboard_data = extracted
                                        print(f"[study_help] Extracted whiteboard data from whiteboard tool in intermediate_steps (step {step_idx}, tool: {tool_name})")
                                        break
                        
                        # Also try parsing any output for whiteboard data (in case tool name isn't recognized)
                        if tool_output and whiteboard_data is None:
                            tool_output_str = str(tool_output)
                            extracted = extract_whiteboard_tool_output(tool_output_str)
                            if extracted:
                                whiteboard_data = extracted
                                print(f"[study_help] Extracted whiteboard data from intermediate_steps output (step {step_idx})")
                                break
            
            # Parse the result dict
            for task_desc, output in result.items():
                # Extract agent name by matching task
                agent_name = "Assistant"
                for task in tasks:
                    # Try matching by description
                    if task_desc == task.description or (hasattr(task, 'description') and task_desc in task.description):
                        if hasattr(task, 'agent') and task.agent:
                            agent_name = task.agent.role
                        break

                response_text = str(output).strip()
                
                # Extract whiteboard tool output from any agent response
                if whiteboard_data is None:
                    extracted = extract_whiteboard_tool_output(response_text)
                    if extracted:
                        whiteboard_data = extracted
                        print(f"[study_help] Extracted whiteboard data from {agent_name} response")
                
                # Skip empty responses or markdown code blocks with no content
                if not response_text or response_text == "```" or response_text.replace("`", "").strip() == "":
                    print(f"[study_help] Skipping empty output for task: {task_desc[:50]}")
                    continue
                
                # Only add if not already added from task.output
                # Check if we already have this response
                is_duplicate = False
                for existing in agent_responses:
                    if existing.get("message") == response_text:
                        is_duplicate = True
                        break
                
                if not is_duplicate:
                    agent_responses.append(
                        {
                            "agent": agent_name,
                            "message": response_text,
                        }
                    )

                # Use any non-empty response as main answer if we don't have one
                if main_answer is None or main_answer.strip() == "":
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
                    
                    # Extract whiteboard tool output from any agent response
                    if whiteboard_data is None:
                        extracted = extract_whiteboard_tool_output(response_text)
                        if extracted:
                            whiteboard_data = extracted
                            print(f"[study_help] Extracted whiteboard data from {agent_name} (tasks_output dict)")
                    
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
                    
                    # Extract whiteboard tool output from any agent response
                    if whiteboard_data is None:
                        extracted = extract_whiteboard_tool_output(response_text)
                        if extracted:
                            whiteboard_data = extracted
                            print(f"[study_help] Extracted whiteboard data from {agent_name} (tasks_output list)")
                    
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
                    
                    # Extract whiteboard tool output from any task output
                    if whiteboard_data is None:
                        extracted = extract_whiteboard_tool_output(response_text)
                        if extracted:
                            whiteboard_data = extracted
                            print(f"[study_help] Extracted whiteboard data from {agent_name} (fallback task output)")
                    
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
        elif result is not None:
            # Handle case where result is a string or other type
            result_str = str(result).strip()
            if result_str and result_str != "```" and result_str.replace("`", "").strip():
                main_answer = result_str
                agent_responses.append({
                    "agent": "Assistant",
                    "message": result_str,
                })

        # If no main answer, use first response
        if main_answer is None and agent_responses:
            main_answer = agent_responses[0]["message"]
        
        # If still no answer, try to get from tasks' outputs
        if main_answer is None or main_answer.strip() == "":
            # Check if tasks have outputs
            for task in tasks:
                if hasattr(task, 'output') and task.output:
                    output_str = str(task.output).strip()
                    if output_str and output_str != "```" and output_str.replace("`", "").strip():
                        main_answer = output_str
                        if not any(resp.get("message") == output_str for resp in agent_responses):
                            agent_name = task.agent.role if hasattr(task, 'agent') and task.agent else "Assistant"
                            agent_responses.append({
                                "agent": agent_name,
                                "message": output_str,
                            })
                        break
        
        # Final fallback: If we still don't have an answer but have agent_responses, use the longest one
        if (main_answer is None or main_answer.strip() == "") and agent_responses:
            # Find the longest response
            longest_response = max(agent_responses, key=lambda x: len(x.get("message", "")))
            main_answer = longest_response.get("message", "")
            print(f"[study_help] Using longest response as fallback: {len(main_answer)} chars")
        
        # Last resort: If completely empty, construct a helpful message
        if main_answer is None or main_answer.strip() == "":
            print(f"[study_help] WARNING: No answer extracted from crew result!")
            print(f"[study_help] Result was: {result}")
            main_answer = "I processed your question, but couldn't extract a clear answer. The crew executed successfully."
        
        # Final fallback: If we still haven't found whiteboard data, check all collected responses
        if whiteboard_data is None and agent_responses:
            print(f"[study_help] Final check: Searching all {len(agent_responses)} agent responses for whiteboard data...")
            for resp in agent_responses:
                message = resp.get("message", "")
                if message:
                    extracted = extract_whiteboard_tool_output(message)
                    if extracted:
                        whiteboard_data = extracted
                        print(f"[study_help] Extracted whiteboard data from final fallback check (agent: {resp.get('agent', 'Unknown')})")
                        break
        
        # Also check the main_answer if we haven't found whiteboard data yet
        if whiteboard_data is None and main_answer:
            extracted = extract_whiteboard_tool_output(main_answer)
            if extracted:
                whiteboard_data = extracted
                print(f"[study_help] Extracted whiteboard data from main_answer")
        
        # Wrap whiteboard tool output in robust prompt if present
        if whiteboard_data:
            # Find the agent name that generated this tool output
            tool_agent_name = "teaching agent"
            for resp in agent_responses:
                if resp.get("message") and isinstance(resp.get("message"), str):
                    # Check if this response likely contains the tool output
                    try:
                        if "type" in whiteboard_data or "render_engine" in whiteboard_data:
                            tool_agent_name = resp.get("agent", "teaching agent")
                            break
                    except:
                        pass
            
            wrapped_whiteboard_prompt = wrap_tool_output_in_robust_prompt(whiteboard_data, tool_agent_name)
            # Store the wrapped prompt in whiteboard_data for frontend use
            if isinstance(whiteboard_data, dict):
                whiteboard_data["wrapped_prompt"] = wrapped_whiteboard_prompt
                print(f"[study_help] Wrapped whiteboard tool output in robust prompt (length: {len(wrapped_whiteboard_prompt)})")
        
        print(f"[study_help] Final main_answer length: {len(main_answer) if main_answer else 0} chars")
        print(f"[study_help] Final agent_responses count: {len(agent_responses)}")
        print(f"[study_help] Whiteboard data extracted: {whiteboard_data is not None}")

        return StudyHelpResponse(
            success=True,
            answer=main_answer,
            agent_responses=agent_responses,
            visual_suggestions=visual_suggestions,
            whiteboard_data=whiteboard_data,
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
# TRANSCRIPT / GENERATE RESPONSE ENDPOINT - For meeting page transcript API
# ============================================================================

class TranscriptRequest(BaseModel):
    transcript: str
    timestamp: Optional[int] = None
    isFinal: Optional[bool] = True
    speaking_user: Optional[str] = None  # User name who is speaking
    meeting_users: Optional[List[str]] = None  # List of users currently in the meeting


class WhiteboardUpdateRequest(BaseModel):
    boardId: str
    update: Dict[str, Any]  # Tldraw board update data


class WhiteboardPromptTransformRequest(BaseModel):
    prompt: str  # Original prompt to transform


# Agent-to-user mapping
AGENT_USER_MAPPING = {
    "professor": "Thomas",
    "subject_expert": "Tara", 
    "devils_advocate": "Ethan",
    "peer_student": "Harrish",
}

# Reverse mapping: user -> agent role
USER_AGENT_MAPPING = {v: k for k, v in AGENT_USER_MAPPING.items()}

# Agent-to-voice mapping for ElevenLabs TTS
# Voice IDs from ElevenLabs API
AGENT_VOICE_MAPPING = {
    # Thomas (Professor/Socratic Mentor) -> Male voice
    "Thomas": "pNInz6obpgDQGcFmaJgB",  # Adam - male voice
    "professor": "pNInz6obpgDQGcFmaJgB",  # Adam - male voice
    "Socratic Mentor": "pNInz6obpgDQGcFmaJgB",  # Adam - male voice
    
    # Tara (Subject Expert/Problem Analyst) -> Female voice
    "Tara": "EXAVITQu4vr4xnSDxMaL",  # Bella - female voice
    "subject_expert": "EXAVITQu4vr4xnSDxMaL",  # Bella - female voice
    "Problem Analyst": "EXAVITQu4vr4xnSDxMaL",  # Bella - female voice
    
    # Ethan (Devil's Advocate/Critical Thinker) -> Male voice
    "Ethan": "TxGEqnHWrfWFTfGW9XjX",  # Josh - male voice
    "devils_advocate": "TxGEqnHWrfWFTfGW9XjX",  # Josh - male voice
    "Critical Thinker": "TxGEqnHWrfWFTfGW9XjX",  # Josh - male voice
}

def get_voice_id_for_agent(agent_name: Optional[str], agent_responses: Optional[List[Dict[str, Any]]] = None) -> str:
    """
    Get the appropriate ElevenLabs voice_id for an agent.
    
    Args:
        agent_name: Name or role of the agent
        agent_responses: List of agent responses to determine primary speaker
    
    Returns:
        voice_id string for ElevenLabs TTS
    """
    # Default voice (Rachel - female)
    default_voice = "21m00Tcm4TlvDq8ikWAM"
    
    # If agent_responses provided, try to find the primary agent
    if agent_responses and len(agent_responses) > 0:
        # Use the first agent response to determine voice
        first_response = agent_responses[0]
        if isinstance(first_response, dict):
            agent_name = first_response.get("agent", agent_name)
    
    if not agent_name:
        return default_voice
    
    agent_name_lower = agent_name.lower()
    
    # Check for exact matches first
    if agent_name in AGENT_VOICE_MAPPING:
        return AGENT_VOICE_MAPPING[agent_name]
    
    # Check for partial matches in role names
    for key, voice_id in AGENT_VOICE_MAPPING.items():
        if key.lower() in agent_name_lower or agent_name_lower in key.lower():
            return voice_id
    
    # Check for user names
    if agent_name in USER_AGENT_MAPPING:
        agent_role = USER_AGENT_MAPPING[agent_name]
        if agent_role in AGENT_VOICE_MAPPING:
            return AGENT_VOICE_MAPPING[agent_role]
    
    # Fallback to default
    return default_voice


@app.post("/api/generate-response")
async def generate_response(body: TranscriptRequest):
    """
    Receives transcript from frontend and returns audio response.
    This endpoint processes speech transcripts and generates audio responses.
    Used by the meeting page transcript API.
    
    Now supports user-specific agents - only agents whose assigned users are in the meeting will respond.
    """
    user_message = body.transcript
    speaking_user = body.speaking_user
    meeting_users = body.meeting_users or []
    
    # IMPORTANT: If no users are in the meeting, don't process - no agents should respond
    if not meeting_users or len(meeting_users) == 0:
        print(f"[generate-response] No users in meeting - returning without processing (agents should not respond)")
        return {
            "status": "success",
            "transcript": user_message,
            "response_text": "No one is in the meeting. Please add users to the meeting first.",
            "response_transcript": "No one is in the meeting. Please add users to the meeting first.",
            "audio": None,
            "whiteboard_data": None,
            "agent_responses": None
        }
    
    # Filter agents based on meeting users
    available_agent_roles = []
    for user in meeting_users:
        if user in USER_AGENT_MAPPING:
            agent_role = USER_AGENT_MAPPING[user]
            available_agent_roles.append(agent_role)
            print(f"[generate-response] User {user} is in meeting -> Agent {agent_role} is available")
    
    # If no agents are available (no mapped users in meeting), don't process
    if not available_agent_roles:
        print(f"[generate-response] No agents available - no mapped users in meeting")
        return {
            "status": "success",
            "transcript": user_message,
            "response_text": "No agents are available in this meeting. Please add users to activate agents.",
            "response_transcript": "No agents are available in this meeting. Please add users to activate agents.",
            "audio": None,
            "whiteboard_data": None,
            "agent_responses": None
        }
    
    print(f"[generate-response] Speaking user: {speaking_user}, Meeting users: {meeting_users}, Available agents: {available_agent_roles}")
    
    # Auto-detect discussion mode: if multiple agents available, use discussion mode
    # Discussion mode allows agents to interact and have shorter, focused responses
    num_available_agents = len(available_agent_roles)
    help_type = "discussion" if num_available_agents > 1 else "explanation"
    
    if num_available_agents > 1:
        print(f"[generate-response] Multiple agents detected ({num_available_agents}) - switching to DISCUSSION mode")
    else:
        print(f"[generate-response] Single agent detected - using EXPLANATION mode")
    
    try:
        # Use agent_runner to process the transcript
        if run_agent:
            # Prepare extra context for agent filtering
            extra_context = {
                "meeting_users": meeting_users,
                "speaking_user": speaking_user,
                "available_agent_roles": available_agent_roles,
            }
            
            # Use direct mode to call the agent
            result = run_agent(
                mode="direct",
                topic=user_message,
                subject="general",  # Can be extracted from context if needed
                help_type=help_type,  # Auto-switch to discussion if multiple agents
                agent=None,  # Auto-select appropriate agent
                extra=extra_context,
            )
            
            if result and result.get("response"):
                # Extract answer from response
                resp_dict = result["response"]
                
                # Debug: print response structure
                print(f"[generate-response] Response dict keys: {list(resp_dict.keys()) if isinstance(resp_dict, dict) else 'Not a dict'}")
                if isinstance(resp_dict, dict):
                    print(f"[generate-response] Has 'answer': {resp_dict.get('answer') is not None}")
                    print(f"[generate-response] Has 'agent_responses': {resp_dict.get('agent_responses') is not None}")
                    if resp_dict.get('agent_responses'):
                        print(f"[generate-response] agent_responses count: {len(resp_dict.get('agent_responses', []))}")
                
                response_text = None
                
                # Try extraction function first
                if _extract_answer_from_response:
                    response_text = _extract_answer_from_response(resp_dict)
                    print(f"[generate-response] After extraction function: {response_text[:50] if response_text else 'None'}...")
                
                # Fallback extraction - check multiple possible keys
                if not response_text or (isinstance(response_text, str) and response_text.strip() == ""):
                    response_text = (
                        resp_dict.get("answer") or 
                        resp_dict.get("response_text") or 
                        None
                    )
                    print(f"[generate-response] After fallback 1: {response_text[:50] if response_text else 'None'}...")
                
                # If still no answer, try agent_responses
                if not response_text or (isinstance(response_text, str) and response_text.strip() == ""):
                    agent_responses = resp_dict.get("agent_responses")
                    if agent_responses and isinstance(agent_responses, list) and len(agent_responses) > 0:
                        first_response = agent_responses[0]
                        if isinstance(first_response, dict):
                            response_text = first_response.get("message") or first_response.get("text")
                            print(f"[generate-response] After agent_responses extraction: {response_text[:50] if response_text else 'None'}...")
                
                # If still no answer, try to get from final_output or crew output
                if not response_text or (isinstance(response_text, str) and response_text.strip() == ""):
                    # Try to extract from crew output structure
                    if isinstance(resp_dict, dict):
                        # Check for final_output in crew result
                        final_output = resp_dict.get("final_output") or resp_dict.get("output")
                        if final_output:
                            response_text = str(final_output)
                            print(f"[generate-response] After final_output extraction: {response_text[:50] if response_text else 'None'}...")
                
                # Extract whiteboard_data and agent_responses from response if available (before TTS)
                whiteboard_data = resp_dict.get("whiteboard_data")
                agent_responses = resp_dict.get("agent_responses", [])
                
                # Truncate agent responses for discussion mode (30-second limit per agent)
                if help_type == "discussion" and agent_responses:
                    for agent_resp in agent_responses:
                        if isinstance(agent_resp, dict) and "message" in agent_resp:
                            message = agent_resp["message"]
                            if message:
                                words = str(message).split()
                                if len(words) > 100:
                                    original_length = len(message)
                                    agent_resp["message"] = " ".join(words[:100]) + "..."
                                    print(f"[generate-response] Discussion mode: truncated agent {agent_resp.get('agent', 'Unknown')} response from {original_length} chars to {len(agent_resp['message'])} chars (max 100 words)")
                
                # Truncate main response text for discussion mode
                if help_type == "discussion" and response_text:
                    words = response_text.split()
                    if len(words) > 100:
                        original_length = len(response_text)
                        response_text = " ".join(words[:100]) + "..."
                        print(f"[generate-response] Discussion mode: truncated main response from {original_length} chars to {len(response_text)} chars (max 100 words for 30-second limit)")
                
                # Try to get OGG file path from result
                ogg_path = result.get("ogg_path")
                audio_base64 = None
                
                # If OGG file exists, read and encode it
                if ogg_path and os.path.exists(ogg_path):
                    try:
                        with open(ogg_path, "rb") as f:
                            audio_bytes = f.read()
                            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                            print(f"[generate-response] Loaded OGG file from: {ogg_path}")
                    except Exception as e:
                        print(f"[generate-response] Error reading OGG file: {e}")
                
                # Fallback: Generate audio from response text if no OGG file
                if not audio_base64 and response_text and text_to_speech:
                    try:
                        # Determine which agent is speaking to use appropriate voice
                        voice_id = get_voice_id_for_agent(None, agent_responses)
                        print(f"[generate-response] Using voice_id: {voice_id} for agent responses")
                        
                        # Generate audio using TTS with agent-specific voice
                        audio_bytes = text_to_speech(response_text, voice_id=voice_id)
                        if audio_bytes:
                            # Encode audio as base64
                            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                            print(f"[generate-response] Generated audio using TTS with voice_id: {voice_id}")
                    except Exception as e:
                        print(f"[generate-response] TTS error: {e}")
                
                # Ensure we have a response text
                if not response_text or response_text.strip() == "":
                    response_text = "I'm processing your question. Please wait..."
                
                print(f"[generate-response] Extracted response_text: {response_text[:100] if response_text else 'None'}...")
                print(f"[generate-response] Audio available: {bool(audio_base64)}")
                
                # Extract speaking agent name for frontend display
                speaking_agent_name = None
                if agent_responses and len(agent_responses) > 0:
                    first_response = agent_responses[0]
                    if isinstance(first_response, dict):
                        speaking_agent_name = first_response.get("agent")
                        print(f"[generate-response] Speaking agent: {speaking_agent_name}")
                
                if whiteboard_data:
                    print(f"[generate-response] Whiteboard data found: {whiteboard_data.get('type', 'unknown') if isinstance(whiteboard_data, dict) else 'present'}")
                
                if agent_responses:
                    print(f"[generate-response] Agent responses found: {len(agent_responses)} responses")
                    for i, agent_resp in enumerate(agent_responses):
                        if isinstance(agent_resp, dict):
                            agent_name = agent_resp.get("agent", "Unknown")
                            print(f"[generate-response] Agent {i}: {agent_name}")
                
                return {
                    "status": "success",
                    "transcript": user_message,  # Original user transcript
                    "response_text": response_text,  # AI-generated response text
                    "response_transcript": response_text,  # Transcript of what's in audio (same as response_text)
                    "audio": audio_base64,  # base64 encoded audio bytes (OGG format)
                    "whiteboard_data": whiteboard_data,  # Whiteboard tool output JSON (for TldrawBoardEmbedded)
                    "agent_responses": agent_responses,  # List of agent responses for whiteboard prompts
                    "speaking_agent": speaking_agent_name  # Name of agent currently speaking (for UI display)
                }
        else:
            # Fallback if agent_runner is not available
            response_text = f"Received: {user_message}"
            return {
                "status": "success",
                "transcript": user_message,  # Original user transcript
                "response_text": response_text,  # AI-generated response text
                "response_transcript": response_text,  # Transcript of what's in audio
                "audio": None
            }
    except Exception as e:
        print(f"[generate-response] Error: {e}")
        import traceback
        # Only log full traceback for non-parsing errors
        error_str = str(e).lower()
        if "parsing" not in error_str and "invalid format" not in error_str and "retry" not in error_str:
            traceback.print_exc()
        
        # Return simple error message
        return {
            "status": "error",
            "transcript": user_message,  # Original user transcript
            "response_text": "An error has occurred.",  # Simple error message
            "response_transcript": "An error has occurred.",  # Transcript of what's in audio (error message)
            "audio": None
        }


# ============================================================================
# WHITEBOARD UPDATE ENDPOINT
# ============================================================================

@app.post("/api/whiteboard-update")
async def whiteboard_update(body: WhiteboardUpdateRequest):
    """
    Receives whiteboard updates from frontend.
    This can be used to sync whiteboard state or trigger AI responses.
    """
    board_id = body.boardId
    update_data = body.update
    
    try:
        # Extract information from update data
        shapes_count = update_data.get("shapesCount", 0)
        timestamp = update_data.get("timestamp")
        
        # Optionally process with AI if significant changes detected
        instructions = []
        
        # For now, just acknowledge the update
        # TODO: Add AI processing to generate drawing instructions based on context
        # This could analyze the whiteboard state and suggest improvements or generate
        # additional content based on what's already drawn
        
        return {
            "status": "success",
            "boardId": board_id,
            "update": update_data,
            "instructions": instructions  # AI-generated drawing instructions if any
        }
    except Exception as e:
        print(f"[whiteboard-update] Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "boardId": board_id,
            "update": update_data,
            "instructions": [],
            "error": str(e)
        }


@app.post("/api/whiteboard/transform-prompt")
async def transform_whiteboard_prompt(body: WhiteboardPromptTransformRequest):
    """
    Transform a prompt to be specialized for drawing and labeling on a whiteboard.
    Uses LLM to ensure the prompt focuses on visual representation rather than text.
    """
    original_prompt = body.prompt
    
    if not original_prompt or not original_prompt.strip():
        return {
            "status": "error",
            "transformed_prompt": original_prompt,
            "error": "Empty prompt provided"
        }
    
    try:
        # Use Gemini 2.0 Flash to transform the prompt
        import os
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        
        if not gemini_api_key:
            print("[transform-prompt] No GEMINI_API_KEY found, returning original prompt")
            return {
                "status": "success",
                "transformed_prompt": original_prompt,
                "note": "LLM transformation skipped - no API key"
            }
        
        # Use Google Gemini via langchain-google-genai
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            
            # Try gemini-2.0-flash first, fallback to gemini-1.5-flash
            model_name = "gemini-2.0-flash"
            try:
                llm = ChatGoogleGenerativeAI(
                    model=model_name,
                    temperature=0.3,  # Slightly higher for more creative but still focused visual descriptions
                    google_api_key=gemini_api_key,
                    max_output_tokens=400,  # Increased to allow for complete process descriptions (3-4 sentences for complex processes)
                )
            except Exception as e:
                print(f"[transform-prompt] Model {model_name} not available, trying gemini-1.5-flash: {e}")
                # Final fallback to gemini-1.5-flash
                model_name = "gemini-1.5-flash"
                llm = ChatGoogleGenerativeAI(
                    model=model_name,
                    temperature=0.3,  # Slightly higher for more creative but still focused visual descriptions
                    google_api_key=gemini_api_key,
                    max_output_tokens=400,  # Increased to allow for complete process descriptions (3-4 sentences for complex processes)
                )
            
            print(f"[transform-prompt] Using model: {model_name}")
        except ImportError:
            print("[transform-prompt] langchain_google_genai not available, returning original")
            return {
                "status": "success",
                "transformed_prompt": original_prompt,
                "note": "LLM transformation skipped - langchain_google_genai not available"
            }
        
        # Create transformation prompt - output concise prose describing exactly what to see
        # Enhanced to ensure robust visual diagram generation with COMPLETE processes
        transformation_prompt = f"""You are a visual diagram expert. Transform the following user question or topic into a SPECIFIC, DETAILED description of exactly what should be drawn on a whiteboard.

CRITICAL REQUIREMENTS FOR VISUAL DIAGRAMS:
1. MUST describe concrete visual elements: shapes, arrows, labels, connections, positions, layouts
2. MUST specify relationships: how elements connect, flow, or relate to each other
3. MUST include all key details: names, numbers, equations, dates, categories mentioned
4. MUST show COMPLETE PROCESSES: For operations, calculations, or multi-step procedures, include:
   - The initial inputs/components
   - ALL intermediate steps with labels and arrows
   - The step-by-step process showing HOW it works (not just what it is)
   - The final result/output
   - Arrows and connections showing the flow/sequence
5. MUST be actionable: someone reading this should know exactly what to draw
6. Output in PROSE FORMAT (continuous sentences, no bullet points, no numbered lists)
7. Maximum 3-4 sentences for complex processes, but be SPECIFIC and DETAILED

EXAMPLES OF GOOD TRANSFORMATIONS:
- Input: "French Revolution"
  Output: "A timeline diagram showing the French Revolution from 1789 to 1799, with key events labeled including the Storming of the Bastille in 1789, Reign of Terror, and rise of Napoleon, arranged chronologically from left to right with connecting arrows."

- Input: "explain photosynthesis"
  Output: "A labeled diagram showing the photosynthesis process: a plant leaf in the center, arrows pointing in for sunlight and CO2, arrows pointing out for oxygen, with labeled chloroplasts inside the leaf containing chlorophyll."

- Input: "quadratic equations"
  Output: "A graph showing a parabolic curve labeled as y = ax² + bx + c, with axes marked x and y, vertex point labeled, and example values for a, b, and c shown on the graph."

- Input: "matrix multiplication"
  Output: "Two matrices labeled A and B positioned side by side, with arrows connecting corresponding rows and columns showing how each element of the result matrix is calculated by multiplying row elements of A with column elements of B and summing, including step-by-step calculations for each element labeled, and the final result matrix C positioned to the right with all calculated values filled in."

- Input: "how to solve quadratic equations"
  Output: "A step-by-step diagram showing a quadratic equation ax² + bx + c = 0, followed by the quadratic formula x = (-b ± √(b² - 4ac)) / 2a written out, then a worked example with numbers substituted in, showing each calculation step with arrows, and the final solutions clearly labeled."

Original prompt: {original_prompt}

Transform this into a SPECIFIC visual description. For any process, operation, or calculation, include ALL steps from beginning to end, not just the basic components. Show HOW it works, not just WHAT it is. Be DETAILED about what shapes, labels, positions, relationships, steps, and final results should appear. Return ONLY the prose description of what to draw, nothing else."""

        # Get transformed prompt from LLM
        response = llm.invoke(transformation_prompt)
        transformed_prompt = response.content.strip()
        
        # Clean up and format as prose
        if transformed_prompt:
            import re
            # Remove bullet points, numbered lists, and formatting
            transformed_prompt = re.sub(r'^[\s]*[-•*]\s+', '', transformed_prompt, flags=re.MULTILINE)  # Remove bullet points
            transformed_prompt = re.sub(r'^\d+\.\s+', '', transformed_prompt, flags=re.MULTILINE)  # Remove numbered lists
            transformed_prompt = re.sub(r'\*\*([^*]+)\*\*', r'\1', transformed_prompt)  # Remove bold markers
            transformed_prompt = re.sub(r'\*([^*]+)\*', r'\1', transformed_prompt)  # Remove italic markers
            # Collapse multiple whitespace/newlines into single spaces
            transformed_prompt = re.sub(r'\s+', ' ', transformed_prompt).strip()
            # Remove any remaining markdown formatting
            transformed_prompt = re.sub(r'`([^`]+)`', r'\1', transformed_prompt)  # Remove code backticks
            # Ensure it ends with proper punctuation
            if transformed_prompt and not transformed_prompt[-1] in '.!?':
                transformed_prompt += '.'
            # Limit length but preserve detail (max 450 characters for complete process descriptions)
            if len(transformed_prompt) > 450:
                # Try to truncate at sentence boundary to preserve meaning
                truncated = transformed_prompt[:447]
                last_period = truncated.rfind('.')
                if last_period > 200:  # Only truncate at sentence if reasonable (allows for 3-4 sentence descriptions)
                    transformed_prompt = truncated[:last_period + 1]
                else:
                    transformed_prompt = truncated + '...'
        
        # Fallback to original if transformation failed
        if not transformed_prompt or len(transformed_prompt) < 5:
            transformed_prompt = original_prompt
        
        print(f"[transform-prompt] Original: {original_prompt[:150]}")
        print(f"[transform-prompt] Transformed (prose): {transformed_prompt[:200]}")
        
        return {
            "status": "success",
            "transformed_prompt": transformed_prompt
        }
        
    except Exception as e:
        print(f"[transform-prompt] Error: {e}")
        import traceback
        traceback.print_exc()
        # Return original prompt on error
        return {
            "status": "error",
            "transformed_prompt": original_prompt,
            "error": str(e)
        }


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
    # Important: This file must be run from the crewai_backend directory
    # When uvicorn reloads, it needs to find the 'agents' module
    # Run with: cd crewai_backend && python agents/agent.py
    
    # Check if we're in the right directory
    import os
    current_file_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(current_file_dir)
    current_cwd = os.getcwd()
    
    # If not in backend_dir, warn user but try to continue
    if os.path.basename(current_cwd) != 'crewai_backend' and current_cwd != backend_dir:
        print(f"[WARNING] Recommended: Run from crewai_backend directory")
        print(f"  Current dir: {current_cwd}")
        print(f"  Expected: {backend_dir}")
        print(f"  Run: cd crewai_backend && python agents/agent.py")
    
    # Pass app directly - uvicorn will handle reload
    # This avoids import string issues
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True, reload_dirs=[backend_dir] if os.path.exists(backend_dir) else None)
