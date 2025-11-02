from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import base64
import json
import os
import sys

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import agent runner and TTS utilities
try:
    from agent_runner import run_agent, _extract_answer_from_response
except ImportError:
    print("[server] Warning: Could not import agent_runner. Some features may not work.")
    run_agent = None
    _extract_answer_from_response = None

# Import TTS functions
try:
    from tts.tts import text_to_speech
except ImportError as e:
    print("[server] Warning: Could not import TTS functions. Audio features may not work.")
    print(f"[server] Error: {e}")
    text_to_speech = None

app = FastAPI()

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class TranscriptRequest(BaseModel):
    transcript: str
    timestamp: Optional[int] = None
    isFinal: Optional[bool] = True

class WhiteboardUpdateRequest(BaseModel):
    boardId: str
    update: Dict[str, Any]  # Tldraw board update data

class DesmosPlotRequest(BaseModel):
    expression: str
    xMin: Optional[float] = None
    xMax: Optional[float] = None
    yMin: Optional[float] = None
    yMax: Optional[float] = None

@app.get("/")
async def root():
    return {"status": "success", "message": "CrewAI Backend API"}

@app.post("/api/generate-response")
async def generate_response(body: TranscriptRequest):
    """
    Receives transcript from frontend and returns audio response.
    This endpoint processes speech transcripts and generates audio responses.
    """
    user_message = body.transcript
    
    try:
        # Use agent_runner to process the transcript
        if run_agent:
            # Use direct mode to call the agent
            result = run_agent(
                mode="direct",
                topic=user_message,
                subject="general",  # Can be extracted from context if needed
                help_type="explanation",
                agent=None,  # Auto-select appropriate agent
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
                        # Generate audio using TTS
                        audio_bytes = text_to_speech(response_text)
                        if audio_bytes:
                            # Encode audio as base64
                            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                            print(f"[generate-response] Generated audio using TTS")
                    except Exception as e:
                        print(f"[generate-response] TTS error: {e}")
                
                # Ensure we have a response text
                if not response_text or response_text.strip() == "":
                    response_text = "I'm processing your question. Please wait..."
                
                print(f"[generate-response] Extracted response_text: {response_text[:100] if response_text else 'None'}...")
                print(f"[generate-response] Audio available: {bool(audio_base64)}")
                
                return {
                    "status": "success",
                    "transcript": user_message,  # Original user transcript
                    "response_text": response_text,  # AI-generated response text
                    "response_transcript": response_text,  # Transcript of what's in audio (same as response_text)
                    "audio": audio_base64  # base64 encoded audio bytes (OGG format)
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
        traceback.print_exc()
        # Return error response
        error_message = f"Error processing request: {str(e)}"
        return {
            "status": "error",
            "transcript": user_message,  # Original user transcript
            "response_text": error_message,  # Error message text
            "response_transcript": error_message,  # Transcript of what's in audio (error message)
            "audio": None
        }

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

@app.post("/api/desmos-plot")
async def desmos_plot(body: DesmosPlotRequest):
    """
    Receives Desmos plotting requests and returns plotting configuration.
    This can process natural language requests for mathematical expressions.
    """
    expression = body.expression
    x_min = body.xMin
    x_max = body.xMax
    y_min = body.yMin
    y_max = body.yMax
    
    try:
        # Use agent_runner to process natural language math expressions
        desmos_expression = expression  # Default to original expression
        
        if run_agent and expression:
            # Check if expression looks like natural language (contains words)
            # vs already a math expression
            is_natural_language = any(word.isalpha() and word.lower() not in 
                ['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'abs', 'x', 'y', 'pi', 'e'] 
                for word in expression.split())
            
            if is_natural_language:
                # Process natural language request with AI
                topic = f"Convert this to a Desmos graphing expression: {expression}"
                result = run_agent(
                    mode="direct",
                    topic=topic,
                    subject="mathematics",
                    help_type="explanation",
                    agent="expert",
                )
                
                if result and result.get("response"):
                    # Extract Desmos-compatible expression from AI response
                    if _extract_answer_from_response:
                        ai_response = _extract_answer_from_response(result["response"])
                        # Try to extract expression from response (look for LaTeX or math notation)
                        # This is a simple heuristic - could be improved
                        if ai_response:
                            # Look for common math patterns
                            import re
                            # Look for patterns like y=, f(x)=, etc.
                            math_patterns = [
                                r'y\s*=\s*([^,\n]+)',
                                r'f\(x\)\s*=\s*([^,\n]+)',
                                r'([a-zA-Z]+\s*=\s*[^,\n]+)',
                            ]
                            for pattern in math_patterns:
                                match = re.search(pattern, ai_response)
                                if match:
                                    desmos_expression = match.group(1).strip()
                                    break
                            
                            # If no pattern found, try to extract the first mathematical expression
                            if desmos_expression == expression:
                                # Simple fallback: take first line that looks mathematical
                                lines = ai_response.split('\n')
                                for line in lines:
                                    if any(char in line for char in ['=', '+', '-', '*', '^', '/', '(']):
                                        # Clean up the line
                                        desmos_expression = line.strip()
                                        break
        else:
            # Already a math expression, use as-is
            desmos_expression = expression
        
        return {
            "status": "success",
            "expression": desmos_expression,
            "viewBounds": {
                "xMin": x_min or -10,
                "xMax": x_max or 10,
                "yMin": y_min or -10,
                "yMax": y_max or 10
            }
        }
    except Exception as e:
        print(f"[desmos-plot] Error: {e}")
        import traceback
        traceback.print_exc()
        # Return original expression on error
        return {
            "status": "success",
            "expression": expression,
            "viewBounds": {
                "xMin": x_min or -10,
                "xMax": x_max or 10,
                "yMin": y_min or -10,
                "yMax": y_max or 10
            },
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    # Use import string for reload to work properly
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)