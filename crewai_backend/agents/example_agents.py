"""
Virtual Classroom Agents Configuration
CrewAI agents designed for educational debates, discussions, and interactive learning
in a virtual classroom environment with whiteboard support.
"""

from crewai import Agent, Task, Crew
from typing import List, Optional, Dict, Any


# ============================================================================
# AGENT CREATION FUNCTIONS
# ============================================================================

def create_professor_agent(subject: str = "general studies", personality: str = "encouraging"):
    """
    Create a Professor/Moderator agent to guide classroom discussions
    
    Args:
        subject: The subject area (e.g., "mathematics", "physics", "history")
        personality: Agent personality ("encouraging", "rigorous", "playful")
    """
    personality_traits = {
        "encouraging": "You are warm, supportive, and encourage participation from all students.",
        "rigorous": "You maintain high academic standards and push for deep understanding.",
        "playful": "You use humor and creative examples to make learning engaging."
    }
    
    return Agent(
        role=f"Professor of {subject.title()}",
        goal=f"Facilitate engaging discussions and debates about {subject}, ensuring all participants learn and contribute meaningfully",
        backstory=f"""You are an experienced educator with a passion for {subject}. 
        {personality_traits.get(personality, personality_traits['encouraging'])}
        You guide classroom discussions, moderate debates, and help synthesize different viewpoints.
        You can recognize when visual aids (graphs, diagrams) would help understanding and suggest them for the whiteboard.""",
        verbose=True,
        allow_delegation=True,
    )


def create_subject_expert_agent(subject: str = "mathematics", expertise_level: str = "advanced"):
    """
    Create a Subject Expert agent that can explain concepts and provide insights
    
    Args:
        subject: The subject of expertise (e.g., "mathematics", "physics", "literature")
        expertise_level: "beginner", "intermediate", or "advanced"
    """
    return Agent(
        role=f"{subject.title()} Expert",
        goal=f"Provide clear explanations, generate examples, and suggest visual representations for {subject} concepts",
        backstory=f"""You are a specialist in {subject} with {expertise_level}-level expertise.
        You excel at breaking down complex ideas into understandable parts and creating intuitive explanations.
        You often think in terms of visual representations and can describe graphs, equations, and diagrams
        that would help students understand the material better.""",
        verbose=True,
        allow_delegation=False,
    )


def create_devils_advocate_agent(challenge_level: str = "moderate"):
    """
    Create a Devil's Advocate agent to challenge ideas and promote critical thinking
    
    Args:
        challenge_level: "mild", "moderate", or "aggressive"
    """
    challenge_styles = {
        "mild": "You gently question assumptions and suggest alternative perspectives.",
        "moderate": "You actively challenge ideas with counterarguments and ask probing questions.",
        "aggressive": "You strongly debate points and push hard for evidence and logical consistency."
    }
    
    return Agent(
        role="Critical Thinker & Devil's Advocate",
        goal="Challenge ideas, ask probing questions, and ensure rigorous thinking in discussions",
        backstory=f"""You are a sharp intellectual who loves to test ideas through debate.
        {challenge_styles.get(challenge_level, challenge_styles['moderate'])}
        You help ensure that conclusions are well-reasoned and that students consider multiple perspectives.
        You're not mean-spirited—you want to strengthen understanding through rigorous discussion.""",
        verbose=True,
        allow_delegation=False,
    )


def create_peer_student_agent(background: str = "curious learner"):
    """
    Create a Peer Student agent that participates as another student
    
    Args:
        background: Student background (e.g., "curious learner", "struggling student", "overachiever")
    """
    return Agent(
        role="Peer Student",
        goal="Participate in discussions, ask questions, share insights, and learn alongside other students",
        backstory=f"""You are a fellow student in this virtual classroom. You come from the perspective of a {background}.
        You ask questions when concepts are unclear, share your thoughts, and engage genuinely with the material.
        You sometimes need clarification or offer unique perspectives that others might not consider.""",
        verbose=True,
        allow_delegation=False,
    )


def create_visual_learning_assistant_agent():
    """
    Create an agent that specializes in generating visual/whiteboard content
    """
    return Agent(
        role="Visual Learning Assistant",
        goal="Generate descriptions and specifications for graphs, diagrams, and visual aids to be displayed on the whiteboard",
        backstory="""You are an expert at creating visual representations of concepts.
        When discussions involve mathematical equations, scientific phenomena, or abstract concepts,
        you can describe what should be drawn on the whiteboard—including:
        - Mathematical plots (e.g., quadratic functions with roots marked)
        - Scientific diagrams (e.g., wave interference patterns)
        - Conceptual maps (e.g., cause-and-effect relationships)
        - Step-by-step visual solutions
        You provide detailed descriptions that can be interpreted by visualization tools.""",
        verbose=True,
        allow_delegation=False,
    )


# ============================================================================
# TASK CREATION FUNCTIONS
# ============================================================================

def create_discussion_task(
    topic: str,
    agent: Agent,
    context: Optional[Dict[str, Any]] = None,
    whiteboard_aware: bool = True
) -> Task:
    """
    Create a discussion task for an agent to participate in
    
    Args:
        topic: The discussion topic
        agent: The agent assigned to this task
        context: Additional context (e.g., previous messages, whiteboard state)
        whiteboard_aware: Whether the agent should consider whiteboard content
    """
    whiteboard_instruction = ""
    if whiteboard_aware:
        whiteboard_instruction = """
        If relevant, suggest what could be visualized on the whiteboard to aid understanding.
        Reference any existing whiteboard content when making your points."""
    
    context_str = ""
    if context:
        context_str = f"\nContext: {context}"
    
    return Task(
        description=f"""Participate in a discussion about: {topic}
        
        {whiteboard_instruction}
        {context_str}
        
        Provide a thoughtful, conversational response that contributes meaningfully to the discussion.
        If you're a moderator, guide the conversation. If you're an expert, provide insights.
        If you're a challenger, ask critical questions. If you're a student, ask questions and share thoughts.""",
        agent=agent,
        expected_output="A conversational response that contributes to the discussion, potentially including whiteboard suggestions",
    )


def create_debate_task(
    proposition: str,
    agent: Agent,
    position: str = "argue",
    context: Optional[Dict[str, Any]] = None
) -> Task:
    """
    Create a debate task where an agent argues for or against a proposition
    
    Args:
        proposition: The statement being debated
        agent: The agent assigned to this task
        position: "argue" (for) or "counter" (against) or "moderate" (neutral)
        context: Additional context
    """
    position_instructions = {
        "argue": "Present arguments in favor of the proposition.",
        "counter": "Present arguments against the proposition and challenge the opposing side.",
        "moderate": "Help structure the debate, summarize points, and ensure both sides are heard.",
    }
    
    context_str = ""
    if context:
        context_str = f"\nContext: {context}"
    
    return Task(
        description=f"""Participate in a debate about: {proposition}
        
        {position_instructions.get(position, position_instructions['argue'])}
        {context_str}
        
        Make your arguments clear, evidence-based, and conversational.
        Reference the whiteboard if visual aids would strengthen your position.""",
        agent=agent,
        expected_output="A persuasive argument or counterargument presented in a conversational debate format",
    )


def create_explanation_task(
    concept: str,
    agent: Agent,
    audience_level: str = "intermediate",
    include_visuals: bool = True
) -> Task:
    """
    Create a task for an agent to explain a concept
    
    Args:
        concept: The concept to explain
        agent: The agent assigned to this task
        audience_level: "beginner", "intermediate", or "advanced"
        include_visuals: Whether to suggest visual representations
    """
    visual_instruction = ""
    if include_visuals:
        visual_instruction = """
        Describe what should be displayed on the whiteboard to help visualize this concept
        (e.g., graphs, diagrams, step-by-step solutions)."""
    
    return Task(
        description=f"""Explain the concept: {concept}
        
        Tailor your explanation for {audience_level} level students.
        {visual_instruction}
        
        Make your explanation clear, intuitive, and engaging.""",
        agent=agent,
        expected_output=f"A clear explanation of {concept} appropriate for {audience_level} students, with visual suggestions if relevant",
    )


def create_whiteboard_content_task(
    topic: str,
    agent: Agent,
    content_type: str = "graph"
) -> Task:
    """
    Create a task for generating whiteboard content descriptions
    
    Args:
        topic: The topic/concept to visualize
        agent: The agent (typically Visual Learning Assistant)
        content_type: "graph", "diagram", "equation", "concept_map", etc.
    """
    return Task(
        description=f"""Generate a detailed description of {content_type} content for the whiteboard related to: {topic}
        
        Provide a structured specification that includes:
        - Type of visualization needed
        - Mathematical expressions or data to plot (if applicable)
        - Key points to highlight
        - Labels and annotations
        - Any interactive elements
        
        Format your output so it can be parsed and rendered by visualization tools (e.g., Desmos, Matplotlib).""",
        agent=agent,
        expected_output=f"A structured description of {content_type} content for the whiteboard, formatted for visualization tools",
    )


# ============================================================================
# CREW CREATION FUNCTIONS
# ============================================================================

def create_classroom_crew(
    subject: str = "mathematics",
    agents_config: Optional[Dict[str, Any]] = None,
    include_visual_assistant: bool = True
) -> Crew:
    """
    Create a virtual classroom crew with multiple educational agents
    
    Args:
        subject: The subject being studied
        agents_config: Optional configuration dict with keys:
            - professor_personality: "encouraging" | "rigorous" | "playful"
            - expert_level: "beginner" | "intermediate" | "advanced"
            - challenge_level: "mild" | "moderate" | "aggressive"
            - student_background: e.g., "curious learner"
        include_visual_assistant: Whether to include the visual learning assistant
    """
    config = agents_config or {}
    
    # Create agents
    professor = create_professor_agent(
        subject=subject,
        personality=config.get("professor_personality", "encouraging")
    )
    
    expert = create_subject_expert_agent(
        subject=subject,
        expertise_level=config.get("expert_level", "advanced")
    )
    
    devils_advocate = create_devils_advocate_agent(
        challenge_level=config.get("challenge_level", "moderate")
    )
    
    peer_student = create_peer_student_agent(
        background=config.get("student_background", "curious learner")
    )
    
    agents = [professor, expert, devils_advocate, peer_student]
    
    if include_visual_assistant:
        visual_assistant = create_visual_learning_assistant_agent()
        agents.append(visual_assistant)
    
    # Create initial discussion tasks (these can be customized per session)
    tasks = [
        create_discussion_task(
            topic=f"Introduction to key concepts in {subject}",
            agent=professor,
            whiteboard_aware=True
        ),
        create_explanation_task(
            concept=f"Fundamental principles of {subject}",
            agent=expert,
            include_visuals=True
        ),
    ]
    
    crew = Crew(
        agents=agents,
        tasks=tasks,
        verbose=True,
        process="sequential",  # Sequential process for more conversational flow
    )
    
    return crew


def create_debate_crew(
    topic: str,
    subject: str = "general",
    agents_config: Optional[Dict[str, Any]] = None
) -> Crew:
    """
    Create a crew specifically for debate sessions
    
    Args:
        topic: The debate topic/proposition
        subject: The subject area
        agents_config: Optional agent configuration
    """
    config = agents_config or {}
    
    # Create agents
    professor = create_professor_agent(
        subject=subject,
        personality=config.get("professor_personality", "encouraging")
    )
    
    expert = create_subject_expert_agent(
        subject=subject,
        expertise_level=config.get("expert_level", "advanced")
    )
    
    devils_advocate = create_devils_advocate_agent(
        challenge_level=config.get("challenge_level", "moderate")
    )
    
    # Create debate tasks
    tasks = [
        create_debate_task(
            proposition=topic,
            agent=professor,
            position="moderate"
        ),
        create_debate_task(
            proposition=topic,
            agent=expert,
            position="argue"
        ),
        create_debate_task(
            proposition=topic,
            agent=devils_advocate,
            position="counter"
        ),
    ]
    
    crew = Crew(
        agents=[professor, expert, devils_advocate],
        tasks=tasks,
        verbose=True,
        process="sequential",
    )
    
    return crew


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    # Example: Create a mathematics classroom
    math_classroom = create_classroom_crew(
        subject="mathematics",
        agents_config={
            "professor_personality": "encouraging",
            "expert_level": "advanced",
            "challenge_level": "moderate",
            "student_background": "curious learner"
        }
    )
    
    print("Math Classroom Crew Created!")
    print(f"Agents: {[agent.role for agent in math_classroom.agents]}")
    print(f"Tasks: {[task.description[:50] + '...' for task in math_classroom.tasks]}")
    
    # Example: Create a debate session
    debate_crew = create_debate_crew(
        topic="Is calculus essential for understanding the natural world?",
        subject="mathematics"
    )
    
    print("\nDebate Crew Created!")
    print(f"Debate Topic: Is calculus essential for understanding the natural world?")


# ============================================================================
# IMPLEMENTATION ROADMAP & NEXT STEPS
# ============================================================================

"""
IMPLEMENTATION ROADMAP FOR VIRTUAL CLASSROOM PLATFORM
======================================================

1. REAL-TIME COMMUNICATION LAYER
   ------------------------------
   Priority: HIGH
   
   - Implement WebSocket support in FastAPI for real-time bidirectional communication
   - Create message queue/event system to handle:
     * User messages → Agents
     * Agent responses → Frontend
     * Whiteboard updates → Agents & Frontend
     * Agent-to-agent interactions in debates
   
   Files to create:
   - `crewai_backend/websocket/connection_manager.py` - WebSocket connection handling
   - `crewai_backend/websocket/routes.py` - WebSocket endpoints
   - `crewai_backend/services/message_broker.py` - Message routing service
   
   Integration points:
   - Modify main.py to include WebSocket routes
   - Create event handlers for agent responses
   - Stream agent outputs in real-time (not wait for full completion)


2. WHITEBOARD INTEGRATION SERVICE
   -------------------------------
   Priority: HIGH
   
   - Create whiteboard state management service
   - Parse agent descriptions into structured whiteboard commands
   - Support multiple whiteboard content types:
     * Mathematical plots (Desmos-style)
     * Diagrams (via matplotlib/plotly)
     * Text annotations
     * PDF/image overlays
     * Drawing layers
   
   Files to create:
   - `crewai_backend/services/whiteboard_parser.py` - Parse agent visual descriptions
   - `crewai_backend/services/visualization_generator.py` - Generate graphs/diagrams
   - `crewai_backend/models/whiteboard_state.py` - Whiteboard state model
   - `crewai_backend/api/whiteboard.py` - Whiteboard API endpoints
   
   Agent integration:
   - Agents can query whiteboard state in context
   - Visual Learning Assistant outputs structured JSON for whiteboard
   - Example format:
     {
       "type": "graph",
       "equation": "x^2 - 5x + 6",
       "points": [{"x": 2, "y": 0}, {"x": 3, "y": 0}],
       "labels": ["Root 1", "Root 2"]
     }


3. CONVERSATIONAL TASK DYNAMICS
   ----------------------------
   Priority: HIGH
   
   - Implement dynamic task creation based on conversation flow
   - Support interrupt-driven conversations (user can jump in)
   - Multi-turn conversation memory/history
   - Agent responses trigger follow-up tasks automatically
   
   Files to create:
   - `crewai_backend/services/conversation_manager.py` - Manage conversation state
   - `crewai_backend/services/task_generator.py` - Dynamically create tasks from user input
   - `crewai_backend/models/conversation.py` - Conversation state models
   
   Features:
   - Conversation history context for each agent task
   - User can interrupt and redirect conversation
   - Agents can react to each other's responses in real-time
   - Debate mode: agents respond to each other's arguments


4. AGENT CUSTOMIZATION & PERSONALIZATION
   -------------------------------------
   Priority: MEDIUM
   
   - User-configurable agent personalities
   - Save/load agent configurations
   - Subject-specific agent presets
   - Custom agent creation UI
   
   Files to create:
   - `crewai_backend/api/agent_config.py` - Agent configuration endpoints
   - `crewai_backend/database/agent_profiles.py` - Store agent configurations
   - `crewai_backend/utils/agent_loader.py` - Load custom agent definitions
   
   API endpoints needed:
   - POST /api/agents/create - Create custom agent
   - GET /api/agents/presets - Get subject presets
   - PUT /api/agents/{id}/configure - Update agent config
   - POST /api/classroom/create - Create classroom with custom agents


5. WHITEBOARD INTERACTION CAPABILITIES
   -----------------------------------
   Priority: MEDIUM
   
   - Agents can read/analyze whiteboard content
   - Agents respond to user drawings
   - Agent annotations on whiteboard
   - PDF upload and agent analysis
   
   Files to create:
   - `crewai_backend/services/image_analyzer.py` - Analyze whiteboard drawings
   - `crewai_backend/services/pdf_processor.py` - Process uploaded PDFs
   - `crewai_backend/services/content_ocr.py` - Extract text from whiteboard images
   
   Integration:
   - Pass whiteboard snapshot to agents in context
   - Agents can request whiteboard updates
   - OCR whiteboard text for agent understanding


6. STREAMING RESPONSE HANDLER
   ---------------------------
   Priority: MEDIUM
   
   - Stream agent responses token-by-token
   - Support for "typing" indicators
   - Partial responses visible to users
   
   Files to create:
   - `crewai_backend/services/stream_handler.py` - Handle streaming responses
   - Modify agents to support streaming outputs
   
   Implementation:
   - Use CrewAI streaming capabilities
   - WebSocket streaming for real-time updates


7. DEBATE MODERATION SYSTEM
   -------------------------
   Priority: LOW (Nice to have)
   
   - Turn-taking system for debates
   - Time limits for responses
   - Voting/judging mechanism
   - Debate transcript generation
   
   Files to create:
   - `crewai_backend/services/debate_moderator.py` - Debate flow control
   - `crewai_backend/models/debate_session.py` - Debate state management


8. TESTING & VALIDATION
   ---------------------
   Priority: ONGOING
   
   - Unit tests for agent creation functions
   - Integration tests for crew execution
   - WebSocket connection tests
   - Whiteboard parser tests
   
   Files to create:
   - `crewai_backend/tests/test_agents.py`
   - `crewai_backend/tests/test_whiteboard.py`
   - `crewai_backend/tests/test_websocket.py`


QUICK START INTEGRATION EXAMPLE:
================================

```python
# In main.py, add:
from agents.example_agents import create_classroom_crew, create_discussion_task

@app.post("/api/classroom/discuss")
async def start_discussion(request: DiscussionRequest):
    # Create crew with custom configuration
    crew = create_classroom_crew(
        subject=request.subject,
        agents_config=request.agent_configs
    )
    
    # Add dynamic task from user input
    task = create_discussion_task(
        topic=request.topic,
        agent=crew.agents[0],  # Professor
        context={"whiteboard_state": request.whiteboard_state},
        whiteboard_aware=True
    )
    
    # Execute and stream results
    result = crew.kickoff()
    return {"response": result}
```


WHITEBOARD INTEGRATION EXAMPLE:
===============================

When an agent suggests a graph:
1. Visual Learning Assistant generates description
2. Parser extracts structured data
3. Frontend receives JSON spec
4. Frontend renders graph (Desmos/matplotlib)
5. Graph state synced back to agents
6. Agents can reference graph in subsequent responses
"""
