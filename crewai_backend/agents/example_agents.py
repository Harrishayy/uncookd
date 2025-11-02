"""
Virtual Classroom Agents Configuration
CrewAI agents designed for educational debates, discussions, and interactive learning
in a virtual classroom environment with whiteboard support.
"""

from crewai import Agent, Task, Crew
from typing import List, Optional, Dict, Any
from agents.tools.whiteboard_tool import (
    WhiteboardVisualTool,
    WhiteboardVisualToolFlexible,
)
import re


# ============================================================================
# WHITEBOARD AWARENESS UTILITY
# ============================================================================


def should_use_whiteboard(
    topic: str, context: Optional[Dict[str, Any]] = None, subject: str = "general"
) -> bool:
    """
    Determine if a question/topic would benefit from visual representation.

    This function analyzes the topic and context to determine if visual aids
    (graphs, diagrams, charts) would be helpful for understanding.

    Args:
        topic: The question or topic being discussed
        context: Additional context (conversation history, user message, etc.)
        subject: The subject area (mathematics, physics, etc.)

    Returns:
        True if visual representation would benefit understanding, False otherwise
    """
    topic_lower = topic.lower()
    context_str = ""

    # Extract text from context if available
    if context:
        if isinstance(context, dict):
            # Get user message and conversation history
            user_msg = context.get("user_message", "")
            conv_history = context.get("conversation_history", [])

            # Build context string from history
            if conv_history:
                history_text = " ".join(
                    [
                        msg.get("message", "") if isinstance(msg, dict) else str(msg)
                        for msg in conv_history[-3:]  # Last 3 messages
                    ]
                )
                context_str = f"{user_msg} {history_text}".lower()
            else:
                context_str = user_msg.lower()

    # Combine topic and context for analysis
    full_text = f"{topic_lower} {context_str}".lower()

    # Subject-specific visual indicators
    visual_subjects = {
        "mathematics": [
            "graph",
            "plot",
            "function",
            "equation",
            "derivative",
            "integral",
            "curve",
            "slope",
            "intercept",
            "parabola",
            "solve",
            "calculate",
            "quadratic",
            "linear",
            "exponential",
            "geometric",
            "shape",
            "angle",
            "triangle",
            "circle",
        ],
        "physics": [
            "force",
            "wave",
            "motion",
            "diagram",
            "circuit",
            "electric",
            "magnetic",
            "field",
            "particle",
            "atom",
            "molecule",
            "energy",
            "acceleration",
            "velocity",
            "trajectory",
            "interference",
        ],
        "biology": [
            "cell",
            "molecule",
            "process",
            "cycle",
            "structure",
            "diagram",
            "organism",
            "system",
            "pathway",
            "anatomy",
            "physiology",
        ],
        "chemistry": [
            "molecule",
            "reaction",
            "compound",
            "structure",
            "bond",
            "periodic",
            "table",
            "equation",
            "formula",
        ],
        "geometry": [
            "shape",
            "angle",
            "triangle",
            "circle",
            "square",
            "polygon",
            "area",
            "perimeter",
            "volume",
            "surface",
            "diagram",
        ],
        "general": [
            "visual",
            "diagram",
            "graph",
            "chart",
            "plot",
            "illustrate",
            "show",
            "draw",
            "sketch",
            "represent",
            "model",
        ],
    }

    # Get relevant keywords for the subject
    keywords = visual_subjects.get(subject.lower(), visual_subjects["general"])
    keywords.extend(visual_subjects["general"])  # Always include general keywords

    # Check for visual-related keywords
    visual_keywords = [
        "graph",
        "plot",
        "chart",
        "diagram",
        "visual",
        "illustration",
        "show",
        "draw",
        "sketch",
        "picture",
        "image",
        "figure",
        "equation",
        "formula",
        "function",
        "solve",
        "calculate",
        "shape",
        "geometry",
        "geometric",
        "visualize",
        "represent",
        "model",
        "structure",
        "process",
        "flow",
        "relationship",
    ]

    # Check for mathematical/scientific patterns
    has_equation = bool(re.search(r"[x-y]=|f\(x\)|=|\+|−|×|÷|√|∫|∑|π", full_text))
    has_numbers = bool(re.search(r"\d+", full_text))
    has_visual_request = any(keyword in full_text for keyword in visual_keywords)
    has_subject_keywords = any(keyword in full_text for keyword in keywords)

    # Special patterns that suggest visual needs
    visual_patterns = [
        r"how\s+(to|do|does|can)",
        r"what\s+(is|are|does|do)",
        r"explain\s+(the|how|what)",
        r"show\s+(me|how)",
        r"visualize",
        r"illustrate",
        r"demonstrate",
        r"compare",
        r"difference\s+between",
        r"relationship",
        r"pattern",
    ]

    has_visual_pattern = any(
        re.search(pattern, full_text, re.IGNORECASE) for pattern in visual_patterns
    )

    # Check if context explicitly requests visual
    explicit_visual_request = any(
        word in full_text
        for word in [
            "visual",
            "diagram",
            "graph",
            "chart",
            "picture",
            "draw",
            "show visually",
        ]
    )

    # Decision logic: True if any strong indicators
    should_use = (
        explicit_visual_request
        or (has_equation and has_numbers)  # Mathematical expressions
        or (has_visual_request and has_subject_keywords)  # Subject-specific visuals
        or has_visual_pattern  # Patterns suggesting need for visuals
        or (
            has_subject_keywords
            and subject.lower() in ["mathematics", "physics", "geometry", "chemistry"]
        )  # Strong visual subjects
    )

    # Exclude cases that definitely don't need visuals
    text_only_indicators = [
        "define",
        "meaning",
        "word",
        "phrase",
        "concept (without visual)",
        "history",
        "story",
        "narrative",
        "explain in words",
    ]

    if any(indicator in full_text for indicator in text_only_indicators):
        # But still allow if explicitly requested
        if not explicit_visual_request:
            should_use = False

    return should_use


def create_professor_agent(
    subject: str = "general studies", personality: str = "encouraging"
):
    """
    Create a Socratic Mentor agent to guide the user's learning process.

    Args:
        subject: The subject area (e.g., "mathematics", "physics", "history")
        personality: Agent personality ("encouraging", "inquisitive", "patient")
    """
    personality_traits = {
        "encouraging": "You are warm and supportive, celebrating small breakthroughs and encouraging curiosity.",
        "inquisitive": "You are deeply curious, asking probing questions that guide students to new insights.",
        "patient": "You are calm and unhurried, giving students the time and space they need to think.",
    }

    return Agent(
        role=f"Socratic Mentor for {subject.title()}",
        goal=f"""Guide the user (the student) to discover answers for themselves through 
        Socratic questioning and critical thinking. Do not give direct answers, but 
        instead, help the user build their own understanding. Facilitate debates 
        between other agents to expose the user to multiple viewpoints.""",
        backstory=f"""You are an educator who believes the best learning comes from 
        discovery, not dictation. {personality_traits.get(personality, personality_traits["encouraging"])}
        You specialize in the Socratic method. Your main tools are questions.
        When a student asks a question, you respond with a question that helps them 
        think more deeply. You moderate the classroom, calling on other agents 
        (like the Analyst or Thinker) to provide different perspectives, and then 
        you turn back to the user and ask, 'What do you think about that?'
        
        As the teacher, you are the ONLY agent with access to the whiteboard tool.
        When a visual aid is needed to help explain a concept, you will use the 
        `generate_whiteboard_visual` tool to create visual representations on the whiteboard.
        Other agents can suggest what should be on the whiteboard, but only you can actually change it.""",
        verbose=True,
        allow_delegation=True,  # Can delegate tasks to the Analyst or Thinker
    )


def create_subject_expert_agent(
    subject: str = "mathematics", expertise_level: str = "advanced"
):
    """
    Create a Domain Analyst agent that reasons *with* the student.

    Args:
        subject: The subject of expertise (e.g., "mathematics", "physics", "literature")
        expertise_level: "beginner", "intermediate", or "advanced"
    """
    return Agent(
        role=f"{subject.title()} Problem Analyst",
        goal=f"""To co-reason with the user to break down complex {subject} problems. 
        Collaborate on finding solutions step-by-step, but do not provide the 
        final answer outright. Suggest and create visual representations to aid intuition.""",
        backstory=f"""You are a specialist in {subject} with {expertise_level}-level expertise.
        You function like a brilliant lab partner or study companion. When the user 
        presents a problem, your first step is to say, 'Okay, let's tackle this. 
        What do we know first?' or 'What's our first step?'
        
        You excel at breaking down problems, organizing information, and thinking aloud.
        When the discussion involves a plottable equation or a diagrammable concept 
        (e.g., 'solving y=x^2-4'), you can suggest what should be visualized, but 
        you do NOT have access to the whiteboard tool. Only the professor/teacher 
        can actually change the whiteboard. If you think a visual would help, 
        describe what should be shown and suggest the professor add it to the whiteboard.""",
        verbose=True,
        allow_delegation=False,  # Focuses on its task
    )


def create_devils_advocate_agent(challenge_level: str = "moderate"):
    """
    Create a Critical Thinker agent to challenge ideas and promote rigor.

    Args:
        challenge_level: "mild", "moderate", or "thorough"
    """
    challenge_styles = {
        "mild": "You gently question assumptions and ask for clarification.",
        "moderate": "You actively look for flaws in logic and ask for evidence.",
        "thorough": "You rigorously test every statement against known facts and logical fallacies.",
    }

    return Agent(
        role="Critical Thinker",
        goal="Ensure all arguments are logical, well-supported, and have been examined from all sides.",
        backstory=f"""You are a "why" person. You believe that ideas only become 
        strong after they have been thoroughly tested.
        {challenge_styles.get(challenge_level, challenge_styles["moderate"])}
        You are not adversarial for the sake of it; your purpose is to strengthen 
        everyone's understanding by ensuring no one takes shortcuts in their reasoning.
        You will often say, 'Are we sure about that?' or 'What evidence supports that claim?' 
        or 'What if we look at it from this angle...?'""",
        verbose=True,
        allow_delegation=False,
    )


def create_peer_student_agent(background: str = "curious learner"):
    """
    Create a Peer Student agent that participates as another student.

    Args:
        background: Student background (e.g., "curious learner", "struggling student", "overachiever")
    """
    return Agent(
        role="Peer Student",
        goal="Participate in discussions, ask clarifying questions, and share insights to learn alongside the user.",
        backstory=f"""You are a fellow student in this virtual classroom from a {background} background.
        You're here to learn, just like the user. You will 'think aloud', 
        sometimes proposing hypotheses that might be incomplete or even wrong.
        You are not afraid to ask 'dumb questions' (e.g., 'Sorry, can we go back? 
        I'm lost.') which helps make the classroom a safe space for the user.
        You can also offer peer feedback, saying 'That's a great way to put it!' 
        or 'I'm not sure I follow your logic there.'""",
        verbose=True,
        allow_delegation=False,
    )


def create_interdisciplinary_connector_agent():
    """
    Create a "Discovery Engine" agent that connects ideas across fields.
    """
    return Agent(
        role="Interdisciplinary Connector",
        goal="Find surprising and insightful connections between the current topic and other fields (e.g., art, history, philosophy, science).",
        backstory=f"""You are a 'big picture' thinker, a polymath. You have a knack 
        for lateral thinking. While other agents are focused on the details 
        of a problem, your job is to add context and spark discovery.
        
        If the class is discussing quadratic equations (math), you might bring up 
        how Galileo used them to describe projectile motion (physics) or how the 
        parabolic shape appears in architecture (art). If the topic is the 
        French Revolution (history), you might connect it to the rise of 
        Enlightenment philosophy (ideas). Your goal is to widen the user's 
        perspective.""",
        verbose=True,
        allow_delegation=False,
    )


# Visual Learning Assistant removed - converted to a tool
# Agents can now use WhiteboardVisualTool when they need visual explanations


# ============================================================================
# TASK CREATION FUNCTIONS
# ============================================================================


def create_discussion_task(
    topic: str,
    agent: Agent,
    context: Optional[Dict[str, Any]] = None,
    whiteboard_aware: Optional[bool] = None,
    subject: str = "general",
) -> Task:
    """
    Create a discussion task for an agent to participate in.
    Whiteboard tool is included only if relevant AND agent is the professor/teacher.
    """
    # Auto-determine if whiteboard would be helpful
    if whiteboard_aware is None:
        whiteboard_aware = should_use_whiteboard(topic, context, subject)

    # Check if agent is the professor/teacher (Socratic Mentor)
    is_professor = agent and "Socratic Mentor" in (agent.role or "")

    # Only attach whiteboard tools if whiteboard is needed AND agent is the professor
    task_tools = (
        [WhiteboardVisualTool(), WhiteboardVisualToolFlexible()]
        if (whiteboard_aware and is_professor)
        else []
    )

    whiteboard_instruction = ""
    if whiteboard_aware:
        if is_professor:
            whiteboard_instruction = """
        As the teacher, you have access to the whiteboard tool. If relevant, use the generate_whiteboard_visual 
        tool to create visual representations on the whiteboard to aid understanding.
        Reference any existing whiteboard content when making your points.
        IMPORTANT: When using generate_whiteboard_visual, pass a Python dict Action Input (not a JSON string), 
        e.g. {"topic": "y = x^2 + 4x + 4", "content_type": "graph", "context": "Plot and mark vertex and roots.", "desmos": true}.
        If you only have a single string, use generate_whiteboard_visual_flex with Action Input {"payload": "<your JSON string or expression>"}."""
        else:
            whiteboard_instruction = """
        If relevant, suggest what could be visualized on the whiteboard to aid understanding.
        Reference any existing whiteboard content when making your points.
        However, you do NOT have access to change the whiteboard - only the professor/teacher can modify it.
        Describe what should be shown and suggest the professor add it if needed."""

    context_str = f"\nContext: {context}" if context else ""

    return Task(
        description=f"""Participate in a discussion about: {topic}
        
        {whiteboard_instruction}
        {context_str}
        
        Provide a thoughtful, conversational response that contributes meaningfully to the discussion.
        CRITICAL: Keep your response VERY concise - maximum 75 words (approximately 20-25 seconds when spoken aloud).
        Focus on ONE key point or insight. Be direct and clear.
        If you're a moderator, guide the conversation. If you're an expert, provide insights.
        If you're a challenger, ask critical questions. If you're a student, ask questions and share thoughts.""",
        agent=agent,
        expected_output="A very concise conversational response (maximum 75 words, 20-25 seconds when spoken) that contributes to the discussion with ONE key point, potentially including whiteboard suggestions",
        tools=task_tools if task_tools else [],  # Only include tools if relevant
    )


def create_debate_task(
    proposition: str,
    agent: Agent,
    position: str = "argue",
    context: Optional[Dict[str, Any]] = None,
) -> Task:
    position_instructions = {
        "argue": "Present arguments in favor of the proposition.",
        "counter": "Present arguments against the proposition and challenge the opposing side.",
        "moderate": "Help structure the debate, summarize points, and ensure both sides are heard.",
    }

    context_str = f"\nContext: {context}" if context else ""

    # Debate tasks rarely need whiteboard, but keep tools empty list for consistency
    return Task(
        description=f"""Participate in a debate about: {proposition}
        
        {position_instructions.get(position, position_instructions["argue"])}
        {context_str}
        
        Make your arguments clear, evidence-based, and conversational.
        Reference the whiteboard if visual aids would strengthen your position.""",
        agent=agent,
        expected_output="A concise persuasive argument or counterargument (under 300 words) presented in a conversational debate format",
        tools=[],  # always a list
    )


def create_explanation_task(
    concept: str,
    agent: Agent,
    audience_level: str = "intermediate",
    include_visuals: Optional[bool] = None,
    context: Optional[Dict[str, Any]] = None,
    subject: str = "general",
) -> Task:
    """
    Create a task for an agent to explain a concept.
    Whiteboard tool is included only if relevant AND agent is the professor/teacher.
    """
    # Auto-determine if visuals would be helpful
    if include_visuals is None:
        include_visuals = should_use_whiteboard(concept, context, subject)

    # Check if agent is the professor/teacher (Socratic Mentor)
    is_professor = agent and "Socratic Mentor" in (agent.role or "")

    # Only attach whiteboard tools if visuals are needed AND agent is the professor
    task_tools = (
        [WhiteboardVisualTool(), WhiteboardVisualToolFlexible()]
        if (include_visuals and is_professor)
        else []
    )

    visual_instruction = ""
    if include_visuals:
        if is_professor:
            visual_instruction = """
        As the teacher, you have access to the whiteboard tool. Use the generate_whiteboard_visual 
        tool to create visual representations on the whiteboard to help visualize this concept
        (e.g., graphs, diagrams, step-by-step solutions).
        IMPORTANT: When using generate_whiteboard_visual, pass a Python dict Action Input (not a JSON string), 
        e.g. {"topic": "y = x^2 + 4x + 4", "content_type": "graph", "context": "Plot and mark vertex and roots.", "desmos": true}.
        If you only have a single string, use generate_whiteboard_visual_flex with Action Input {"payload": "<your JSON string or expression>"}."""
        else:
            visual_instruction = """
        You can suggest what should be displayed on the whiteboard to help visualize this concept
        (e.g., graphs, diagrams, step-by-step solutions), but you do NOT have access to change the whiteboard.
        Only the professor/teacher can actually modify it. Describe what should be shown and suggest 
        the professor add it to the whiteboard if needed."""

    return Task(
        description=f"""Explain the concept: {concept}
        
        Tailor your explanation for {audience_level} level students.
        {visual_instruction}
        
        Make your explanation clear, intuitive, and engaging.
        Keep your response concise (under 500 words, approximately 3-4 minutes when spoken).""",
        agent=agent,
        expected_output=f"A clear, concise explanation of {concept} (under 500 words, approximately 3-4 minutes when spoken) appropriate for {audience_level} students, with visual suggestions if relevant",
        tools=task_tools if task_tools else [],  # Only include tools if relevant
    )


def create_whiteboard_content_task(
    topic: str, agent: Agent, content_type: str = "graph"
) -> Task:
    """
    Create a task for generating whiteboard content descriptions

    Note: This is kept for backward compatibility. In most cases, agents should
    use the WhiteboardVisualTool directly instead of requiring a separate task.

    Args:
        topic: The topic/concept to visualize
        agent: The agent to assign this task to (should have WhiteboardVisualTool available)
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

    Note: Visual learning is handled via tools - agents automatically use
    generate_whiteboard_visual tool when they need visual explanations.
    """
    config = agents_config or {}

    # Create agents (they have access to whiteboard tool when needed)
    professor = create_professor_agent(
        subject=subject, personality=config.get("professor_personality", "encouraging")
    )

    expert = create_subject_expert_agent(
        subject=subject, expertise_level=config.get("expert_level", "advanced")
    )

    devils_advocate = create_devils_advocate_agent(
        challenge_level=config.get("challenge_level", "moderate")
    )

    peer_student = create_peer_student_agent(
        background=config.get("student_background", "curious learner")
    )

    connector = create_interdisciplinary_connector_agent()

    agents = [professor, expert, devils_advocate, peer_student, connector]

    # Create initial discussion tasks (these can be customized per session)
    # whiteboard_aware and include_visuals are auto-determined
    tasks = [
        create_discussion_task(
            topic=f"Introduction to key concepts in {subject}",
            agent=professor,
            whiteboard_aware=None,  # Auto-detect
            subject=subject,
        ),
        create_explanation_task(
            concept=f"Fundamental principles of {subject}",
            agent=expert,
            include_visuals=None,  # Auto-detect
            subject=subject,
        ),
    ]

    crew = Crew(
        agents=agents,
        tasks=tasks,
        verbose=True,
        process="sequential",  # Sequential process for more conversational flow
    )

    return crew


def find_agent_by_role(crew: Crew, role_contains: str) -> Optional[Agent]:
    """
    Find an agent in the crew whose role contains the given substring (case-insensitive).
    """
    if not crew or not getattr(crew, "agents", None):
        return None
    role_lc = (role_contains or "").lower()
    for a in crew.agents:
        try:
            if role_lc in (a.role or "").lower():
                return a
        except Exception:
            continue
    return None


def add_user_question_flow(
    crew: Crew,
    question: str,
    preferred_agent_role: Optional[str] = None,
    subject: str = "general",
    context: Optional[Dict[str, Any]] = None,
    followups: int = 3,
    include_summary: bool = False,
) -> List[Task]:
    """
    Add a short multi-agent flow for a user's question:
    - Primary: selected (or default) agent responds first
    - Follow-ups: Limited number (by followups) from Expert and/or Critical Thinker
    - Moderator: Optional Professor summary if include_summary=True

    Returns the list of created tasks (also appended to crew.tasks).
    """
    if not crew:
        return []

    primary = (
        find_agent_by_role(crew, preferred_agent_role or "")
        or find_agent_by_role(crew, "Interdisciplinary Connector")
        or find_agent_by_role(crew, "Problem Analyst")
        or find_agent_by_role(crew, "Socratic Mentor")
    )

    expert = find_agent_by_role(crew, "Problem Analyst")
    challenger = find_agent_by_role(crew, "Critical Thinker")
    professor = find_agent_by_role(crew, "Socratic Mentor")

    created: List[Task] = []

    if primary:
        created.append(
            create_discussion_task(
                topic=question,
                agent=primary,
                context=context,
                whiteboard_aware=None,
                subject=subject,
            )
        )

    # Collect potential follow-ups in priority order: challenger then expert
    followup_tasks: List[Task] = []
    if challenger and challenger is not primary:
        followup_tasks.append(
            create_debate_task(
                proposition=question,
                agent=challenger,
                position="counter",
                context=context,
            )
        )
    if expert and expert not in [primary, getattr(challenger, "", None)]:
        followup_tasks.append(
            create_explanation_task(
                concept=question,
                agent=expert,
                include_visuals=None,
                context=context,
                subject=subject,
            )
        )

    # Limit number of follow-ups
    if followups > 0 and followup_tasks:
        created.extend(followup_tasks[: max(0, int(followups))])

    # Optional summary step by professor
    if include_summary and professor and professor not in [primary, expert, challenger]:
        created.append(
            create_discussion_task(
                topic=f"Summarize and guide next steps for: {question}",
                agent=professor,
                context=context,
                whiteboard_aware=None,
                subject=subject,
            )
        )

    if created:
        crew.tasks.extend(created)

    return created


def create_debate_crew(
    topic: str, subject: str = "general", agents_config: Optional[Dict[str, Any]] = None
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
        subject=subject, personality=config.get("professor_personality", "encouraging")
    )

    expert = create_subject_expert_agent(
        subject=subject, expertise_level=config.get("expert_level", "advanced")
    )

    devils_advocate = create_devils_advocate_agent(
        challenge_level=config.get("challenge_level", "moderate")
    )

    # Create debate tasks
    tasks = [
        create_debate_task(proposition=topic, agent=professor, position="moderate"),
        create_debate_task(proposition=topic, agent=expert, position="argue"),
        create_debate_task(
            proposition=topic, agent=devils_advocate, position="counter"
        ),
    ]

    crew = Crew(
        agents=[professor, expert, devils_advocate],
        tasks=tasks,
        verbose=True,  # change to false for small
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
            "student_background": "curious learner",
        },
    )

    print("Math Classroom Crew Created!")
    print(f"Agents: {[agent.role for agent in math_classroom.agents]}")
    print(f"Tasks: {[task.description[:50] + '...' for task in math_classroom.tasks]}")

    # Example: Create a debate session
    debate_crew = create_debate_crew(
        topic="Is calculus essential for understanding the natural world?",
        subject="mathematics",
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
        whiteboard_aware=None,  # Auto-detect based on topic/context
        subject=request.subject
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
