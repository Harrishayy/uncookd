"""
CrewAI Agents Module for Virtual Classroom
"""

from .example_agents import (
    # Agent Creation
    create_professor_agent,
    create_subject_expert_agent,
    create_devils_advocate_agent,
    create_peer_student_agent,
    create_visual_learning_assistant_agent,
    
    # Task Creation
    create_discussion_task,
    create_debate_task,
    create_explanation_task,
    create_whiteboard_content_task,
    
    # Crew Creation
    create_classroom_crew,
    create_debate_crew,
)

__all__ = [
    "create_professor_agent",
    "create_subject_expert_agent",
    "create_devils_advocate_agent",
    "create_peer_student_agent",
    "create_visual_learning_assistant_agent",
    "create_discussion_task",
    "create_debate_task",
    "create_explanation_task",
    "create_whiteboard_content_task",
    "create_classroom_crew",
    "create_debate_crew",
]
