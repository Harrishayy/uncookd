#!/usr/bin/env python3
"""
Quick test script for whiteboard tool output extraction
"""

import requests
import json
import sys

def test_whiteboard_extraction():
    """Test that whiteboard tool output is extracted correctly."""
    
    url = "http://localhost:8000/api/study/help"
    
    # Test with a question that should trigger whiteboard usage
    test_cases = [
        {
            "name": "Math Graph Question",
            "payload": {
                "user_question": "Graph the quadratic equation y = x^2 - 5x + 6",
                "subject": "mathematics",
                "help_type": "explanation",
                "preferred_agent_role": "professor"  # Professor has whiteboard tool access
            }
        },
        {
            "name": "Diagram Question",
            "payload": {
                "user_question": "Show me a diagram of photosynthesis",
                "subject": "biology",
                "help_type": "explanation",
                "preferred_agent_role": "professor"
            }
        }
    ]
    
    print("=" * 60)
    print("WHITEBOARD TOOL OUTPUT EXTRACTION TEST")
    print("=" * 60)
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}] Testing: {test['name']}")
        print("-" * 60)
        
        try:
            response = requests.post(url, json=test['payload'], timeout=120)
            response.raise_for_status()
            data = response.json()
            
            # Check response
            print(f"✓ Response received (Status: {response.status_code})")
            print(f"✓ Success: {data.get('success')}")
            
            # Check for whiteboard data
            whiteboard_data = data.get('whiteboard_data')
            if whiteboard_data:
                print(f"✓ Whiteboard data found!")
                print(f"  - Type: {whiteboard_data.get('type', 'N/A')}")
                print(f"  - Expression: {whiteboard_data.get('expression', 'N/A')}")
                print(f"  - Render Engine: {whiteboard_data.get('render_engine', 'N/A')}")
                print(f"  - Desmos: {whiteboard_data.get('desmos', False)}")
                
                if whiteboard_data.get('specifications'):
                    print(f"  - Has Specifications: Yes")
                if whiteboard_data.get('instructions'):
                    print(f"  - Has Instructions: Yes")
                
                print(f"\n  Full Whiteboard Data:")
                print(json.dumps(whiteboard_data, indent=4))
            else:
                print(f"⚠️  No whiteboard data found in response")
                print(f"\n  Agent Responses (checking for tool output):")
                for resp in data.get('agent_responses', [])[:2]:
                    agent = resp.get('agent', 'Unknown')
                    message = resp.get('message', '')[:200]
                    print(f"    - {agent}: {message}...")
                    
                    # Check if message contains whiteboard tool indicators
                    if any(keyword in message.lower() for keyword in ['render_engine', 'visualization', 'whiteboard']):
                        print(f"      ⚠️  Message contains whiteboard keywords but wasn't extracted!")
            
            # Check execution time
            exec_time = data.get('execution_time')
            if exec_time:
                print(f"\n  Execution Time: {exec_time:.2f}s")
                
        except requests.exceptions.ConnectionError:
            print(f"❌ ERROR: Could not connect to server at {url}")
            print(f"   Make sure the backend server is running:")
            print(f"   cd crewai_backend && python server.py")
            sys.exit(1)
        except requests.exceptions.Timeout:
            print(f"⚠️  Request timed out (may be normal for complex queries)")
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
    print("\nNext Steps:")
    print("1. Check backend logs for extraction messages")
    print("2. Test via frontend at http://localhost:3000/meeting")
    print("3. See WHITEBOARD_TESTING.md for more details")

if __name__ == "__main__":
    test_whiteboard_extraction()

