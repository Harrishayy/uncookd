"""
CrewAI Agents Module for Virtual Classroom
"""

from .example_agents import (
    # Agent Creation
    create_professor_agent,
    create_subject_expert_agent,
    create_devils_advocate_agent,
    create_peer_student_agent,
    # Note: Visual learning assistant removed - now a tool (WhiteboardVisualTool)
    
    # Task Creation
    create_discussion_task,
    create_debate_task,
    create_explanation_task,
    create_whiteboard_content_task,  # Kept for backward compatibility
    
    # Crew Creation
    create_classroom_crew,
    create_debate_crew,
    
    # Utility Functions
    should_use_whiteboard,  # Auto-detect if whiteboard would be helpful
)

# Tools
from .tools.whiteboard_tool import WhiteboardVisualTool

__all__ = [
    "create_professor_agent",
    "create_subject_expert_agent",
    "create_devils_advocate_agent",
    "create_peer_student_agent",
    "create_discussion_task",
    "create_debate_task",
    "create_explanation_task",
    "create_whiteboard_content_task",
    "create_classroom_crew",
    "create_debate_crew",
    "should_use_whiteboard",  # Auto-detect whiteboard needs
    "WhiteboardVisualTool",  # Export the tool
]
