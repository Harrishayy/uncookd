"""
Whiteboard Visual Generation Tool
Tool that agents can use to generate visual/whiteboard content descriptions
"""

from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
import json


class WhiteboardToolInput(BaseModel):
    """Input schema for WhiteboardVisualTool."""
    topic: str = Field(
        ..., 
        description="The concept, equation, or topic that needs visual representation. "
        "Be specific about what should be visualized (e.g., 'quadratic equation x^2 - 5x + 6', "
        "'photosynthesis process', 'wave interference pattern')."
    )
    content_type: str = Field(
        default="graph",
        description="Type of visualization needed. Options: 'graph', 'diagram', 'equation', "
        "'concept_map', 'step_by_step', or 'diagram'. Default is 'graph'."
    )
    context: str = Field(
        default="",
        description="Additional context about why this visualization is needed or what it should show. "
        "Include key points, relationships, or specific elements to highlight."
    )
    desmos: bool = Field(
        default=False,
        description="If true, the tool will raise a 'desmos' flag and include a LaTeX representation suitable for Desmos."
    )


class WhiteboardVisualTool(BaseTool):
    """
    Tool for generating visual/whiteboard content descriptions.
    
    Agents should use this tool when a concept would benefit from visual representation,
    such as mathematical graphs, scientific diagrams, conceptual maps, or step-by-step
    visual solutions.
    
    The tool generates structured descriptions that can be interpreted by visualization
    tools like Desmos, Matplotlib, or other whiteboard rendering systems.
    """
    name: str = "generate_whiteboard_visual"
    description: str = (
        "Generate detailed descriptions and specifications for graphs, diagrams, and visual aids "
        "to be displayed on the whiteboard. Use this tool when explaining concepts that would "
        "benefit from visual representation, such as: "
        "- Mathematical equations and their graphs (with roots, intercepts, etc.) "
        "- Scientific phenomena (wave patterns, molecular structures, etc.) "
        "- Conceptual relationships (cause-and-effect, hierarchies, etc.) "
        "- Step-by-step solutions with visual annotations "
        "- Abstract concepts that need concrete visualization "
        ""
        "ONLY use this tool when a visual representation would significantly aid understanding. "
        "Do NOT use it for simple text explanations or concepts that don't need visuals."
    )
    args_schema: Type[BaseModel] = WhiteboardToolInput

    def _run(
        self, 
        topic: str, 
        content_type: str = "graph",
        context: str = "",
        desmos: bool = False,
    ) -> str:
        """
        Generate whiteboard content description.
        
        Args:
            topic: The concept/topic to visualize
            content_type: Type of visualization (graph, diagram, equation, etc.)
            context: Additional context for the visualization
            
        Returns:
            Structured JSON description of the whiteboard content
        """
        # Defensive parsing: handle cases where the entire JSON payload was
        # passed as a quoted string in the 'topic' parameter.
        try:
            if isinstance(topic, str) and topic.strip().startswith("{"):
                parsed = json.loads(topic)
                if isinstance(parsed, dict):
                    topic = parsed.get("topic", topic)
                    content_type = parsed.get("content_type", content_type)
                    context = parsed.get("context", context)
                    if "desmos" in parsed:
                        dv = parsed.get("desmos")
                        if isinstance(dv, str):
                            desmos = dv.strip().lower() in ["true", "1", "yes", "y"]
                        else:
                            desmos = bool(dv)
        except Exception:
            # If parsing fails, continue with provided values
            pass
        # Determine visualization details based on content type
        if content_type == "graph":
            # For mathematical graphs
            visualization_spec = {
                "type": "graph",
                "description": f"Graph visualization for: {topic}",
                "specifications": {
                    "axes": "Include x and y axes with appropriate labels",
                    "grid": "Show grid lines for reference",
                    "annotations": "Mark key points (intercepts, roots, turning points) clearly"
                },
                "instructions": f"Create a graph that visually represents {topic}. "
                               f"{context if context else 'Highlight important features and relationships.'}"
            }
        elif content_type == "diagram":
            visualization_spec = {
                "type": "diagram",
                "description": f"Diagram visualization for: {topic}",
                "specifications": {
                    "components": "Identify all key components and their relationships",
                    "labels": "Label all important parts clearly",
                    "flow": "Show direction/flow if applicable"
                },
                "instructions": f"Create a diagram showing {topic}. "
                               f"{context if context else 'Use clear visual hierarchy and connections.'}"
            }
        elif content_type == "concept_map":
            visualization_spec = {
                "type": "concept_map",
                "description": f"Concept map for: {topic}",
                "specifications": {
                    "nodes": "Identify key concepts as nodes",
                    "connections": "Show relationships between concepts with labeled edges",
                    "hierarchy": "Organize concepts by importance or category"
                },
                "instructions": f"Create a concept map for {topic}. "
                               f"{context if context else 'Show relationships and connections clearly.'}"
            }
        elif content_type == "step_by_step":
            visualization_spec = {
                "type": "step_by_step",
                "description": f"Step-by-step visual solution for: {topic}",
                "specifications": {
                    "steps": "Break down into numbered steps",
                    "annotations": "Add visual annotations to each step",
                    "highlight": "Highlight important operations or transformations"
                },
                "instructions": f"Create a step-by-step visual solution for {topic}. "
                               f"{context if context else 'Make each step clear and visually distinct.'}"
            }
        else:
            # Generic visualization
            visualization_spec = {
                "type": content_type,
                "description": f"Visual representation for: {topic}",
                "specifications": {
                    "elements": "Include all relevant visual elements",
                    "labels": "Add clear labels and annotations"
                },
                "instructions": f"Create a {content_type} visualization for {topic}. "
                               f"{context if context else 'Make it clear and educational.'}"
            }
        
        # Always return a consistent JSON structure
        if desmos and visualization_spec.get("type") in ["graph", "equation"]:
            # Enrich with render metadata and expression for Desmos consumers
            visualization_spec["render_engine"] = "desmos"
            visualization_spec["expression"] = str(topic)
            visualization_spec["desmos"] = True
        else:
            visualization_spec["render_engine"] = "whiteboard"
            visualization_spec["expression"] = None
            visualization_spec["desmos"] = False

        return json.dumps(visualization_spec, indent=2)


class WhiteboardFlexInput(BaseModel):
    payload: str = Field(
        ...,
        description="A single string containing either: (1) a JSON object with keys topic, content_type, context, desmos; or (2) a plain expression string such as 'y = x^2 - 5x + 6'"
    )


class WhiteboardVisualToolFlexible(BaseTool):
    name: str = "generate_whiteboard_visual_flex"
    description: str = (
        "Flexible wrapper for generate_whiteboard_visual. Accepts a single 'payload' string. "
        "If payload is a JSON object, it will be parsed and forwarded to generate_whiteboard_visual. "
        "If payload is a plain expression and suitable for Desmos, it will be returned as-is."
    )
    args_schema: Type[BaseModel] = WhiteboardFlexInput

    def _run(self, payload: str) -> str:
        try:
            data = json.loads(payload) if isinstance(payload, str) and payload.strip().startswith("{") else None
        except Exception:
            data = None

        if isinstance(data, dict):
            topic = data.get("topic", "")
            content_type = data.get("content_type", "graph")
            context = data.get("context", "")
            desmos = data.get("desmos", False)
            tool = WhiteboardVisualTool()
            return tool._run(topic=topic, content_type=content_type, context=context, desmos=desmos)

        # If not JSON, treat payload as an expression/topic. Default to graph; still return JSON structure
        tool = WhiteboardVisualTool()
        return tool._run(topic=str(payload), content_type="graph", context="", desmos=True)
