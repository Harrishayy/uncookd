"""
CLI Tool for Study Help
Interactive terminal interface for testing the study help endpoint
without needing a frontend.
"""

import sys
import asyncio
from typing import Optional


def print_header():
    """Print welcome header"""
    print("\n" + "="*60)
    print("🎓 STUDY HELP - Interactive Terminal Interface")
    print("="*60)
    print("\nAsk questions and get help from AI agents!")
    print("Type 'exit' or 'quit' to stop.\n")


def get_user_input(prompt: str = "> ") -> str:
    """Get input from user"""
    try:
        return input(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        print("\n\nExiting...")
        sys.exit(0)


def prompt_question() -> Optional[str]:
    """Prompt user for their question"""
    question = get_user_input("What would you like help with? ")
    
    if question.lower() in ['exit', 'quit', 'q']:
        return None
    
    if not question:
        print("Please enter a question!")
        return prompt_question()
    
    return question


def prompt_subject() -> str:
    """Prompt user for subject"""
    subject = get_user_input("Subject (mathematics/physics/biology/etc) [default: general]: ")
    
    if not subject:
        return "general"
    
    return subject.lower()


def prompt_help_type() -> str:
    """Prompt user for help type"""
    print("\nHelp types:")
    print("  1. explanation - Get a clear explanation (default)")
    print("  2. discussion - Get multiple perspectives from agents")
    
    choice = get_user_input("Help type [1/2, default: 1]: ")
    
    if choice == "2":
        return "discussion"
    
    return "explanation"


def print_response(response: dict):
    """Print formatted response"""
    print("\n" + "-"*60)
    print("📚 RESPONSE")
    print("-"*60)
    
    if not response.get("success"):
        print(f"❌ Error: {response.get('error', 'Unknown error')}")
        return
    
    # Print main answer
    if response.get("answer"):
        print(f"\n💡 Answer:\n{response['answer']}\n")
    
    # Print agent responses
    if response.get("agent_responses"):
        print("🤖 Agent Responses:")
        for i, agent_resp in enumerate(response["agent_responses"], 1):
            agent_name = agent_resp.get("agent", "Unknown Agent")
            message = agent_resp.get("message", "")
            
            print(f"\n  {i}. {agent_name}:")
            # Print message with indentation, wrap at 80 chars
            lines = message.split('\n')
            for line in lines:
                if len(line) > 75:
                    # Simple word wrap
                    words = line.split(' ')
                    current_line = ""
                    for word in words:
                        if len(current_line + word) < 75:
                            current_line += word + " "
                        else:
                            if current_line:
                                print(f"     {current_line.strip()}")
                            current_line = word + " "
                    if current_line:
                        print(f"     {current_line.strip()}")
                else:
                    print(f"     {line}")
    
    # Print visual suggestions
    if response.get("visual_suggestions"):
        print("\n📊 Visual Suggestions:")
        print(f"     {response['visual_suggestions'].get('description', 'N/A')}")
    
    # Print execution time
    if response.get("execution_time"):
        print(f"\n⏱️  Time: {response['execution_time']:.2f} seconds")
    
    print("-"*60 + "\n")


async def call_study_help_direct(user_question: str, subject: str, help_type: str):
    """
    Call the study_help function directly (bypassing HTTP)
    This is faster and doesn't require the server to be running.
    """
    # Import here to avoid circular imports
    import sys
    import os
    
    # Add current directory to path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    from main import study_help, StudyHelpRequest
    
    # Create request object
    request = StudyHelpRequest(
        user_question=user_question,
        subject=subject,
        help_type=help_type,
        conversation_history=None
    )
    
    # Call the endpoint function directly
    response = await study_help(request)
    
    # Convert to dict for printing
    return {
        "success": response.success,
        "answer": response.answer,
        "agent_responses": response.agent_responses,
        "visual_suggestions": response.visual_suggestions,
        "error": response.error,
        "execution_time": response.execution_time
    }


async def call_study_help_http(user_question: str, subject: str, help_type: str):
    """
    Call the study_help endpoint via HTTP
    Requires the server to be running on http://localhost:8000
    """
    import requests
    
    url = "http://localhost:8000/api/study/help"
    payload = {
        "user_question": user_question,
        "subject": subject,
        "help_type": help_type
    }
    
    try:
        response = requests.post(url, json=payload, timeout=120)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Could not connect to server.")
        print("   Make sure the server is running: python main.py")
        return None
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return None


async def main():
    """Main CLI loop"""
    print_header()
    
    # Ask user which mode they want
    print("Select mode:")
    print("  1. Direct function call (fast, no server needed)")
    print("  2. HTTP request (requires server running)")
    
    mode = get_user_input("Mode [1/2, default: 1]: ")
    use_http = (mode == "2")
    
    conversation_history = []
    
    while True:
        try:
            # Get user input
            question = prompt_question()
            if not question:
                break
            
            # Get optional parameters
            subject = prompt_subject()
            help_type = prompt_help_type()
            
            print("\n⏳ Processing your question...")
            print("   (This may take a moment)")
            
            # Call the endpoint
            if use_http:
                response = await call_study_help_http(question, subject, help_type)
            else:
                response = await call_study_help_direct(question, subject, help_type)
            
            if response:
                print_response(response)
                
                # Add to conversation history (simplified)
                conversation_history.append({"role": "user", "message": question})
                if response.get("answer"):
                    conversation_history.append({"role": "agent", "message": response["answer"]})
            
            # Ask if they want to continue
            continue_choice = get_user_input("\nAsk another question? [y/n, default: y]: ")
            if continue_choice.lower() in ['n', 'no']:
                break
                
        except KeyboardInterrupt:
            print("\n\nExiting...")
            break
        except Exception as e:
            print(f"\n❌ Unexpected error: {str(e)}")
            import traceback
            traceback.print_exc()
    
    print("\n👋 Thanks for using Study Help!")


if __name__ == "__main__":
    # Run the async main function
    asyncio.run(main())

