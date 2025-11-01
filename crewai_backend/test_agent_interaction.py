"""
Test Script for Agent Interaction
This script tests whether agents can respond to users and interact with each other.

Run this script while your FastAPI server is running:
    python test_agent_interaction.py
"""

import requests
import json
from typing import Dict, Any


BASE_URL = "http://localhost:8000"


def test_classroom_discussion():
    """Test that multiple agents can participate in a discussion"""
    print("\n" + "=" * 60)
    print("TEST 1: Classroom Discussion - Multiple Agents Responding")
    print("=" * 60)

    payload = {
        "topic": "How do we solve quadratic equations?",
        "subject": "mathematics",
        "user_message": "I'm confused about completing the square method",
        "agents_config": {
            "professor_personality": "encouraging",
            "expert_level": "advanced",
            "challenge_level": "moderate",
        },
    }

    print(f"\n📤 Sending request to /api/classroom/discuss")
    print(f"   Topic: {payload['topic']}")
    print(f"   User Message: {payload['user_message']}")

    try:
        response = requests.post(f"{BASE_URL}/api/classroom/discuss", json=payload)
        response.raise_for_status()
        result = response.json()

        if result.get("success"):
            print(
                f"\n✅ Success! Execution time: {result.get('execution_time', 0):.2f}s"
            )
            print(f"\n📝 Agent Responses:")
            for i, resp in enumerate(result.get("responses", []), 1):
                agent = resp.get("agent", "Unknown")
                message = resp.get("message", "")[:200]  # Truncate for display
                print(f"\n   {i}. {agent}:")
                print(f"      {message}...")

            # Check if multiple agents responded
            agent_count = len(result.get("responses", []))
            if agent_count > 1:
                print(
                    f"\n✅ CONFIRMED: {agent_count} agents participated in the discussion!"
                )
            else:
                print(
                    f"\n⚠️  Only {agent_count} agent responded. Expected multiple agents."
                )

        else:
            print(f"\n❌ Error: {result.get('error')}")

    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to server.")
        print("   Make sure the FastAPI server is running:")
        print("   cd crewai_backend && python main.py")
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")


def test_debate():
    """Test that agents can debate with each other"""
    print("\n" + "=" * 60)
    print("TEST 2: Debate - Agents Arguing Different Positions")
    print("=" * 60)

    payload = {
        "proposition": "Artificial intelligence will replace human teachers in the next 10 years",
        "subject": "education",
        "agents_config": {
            "professor_personality": "rigorous",
            "expert_level": "advanced",
            "challenge_level": "moderate",
        },
    }

    print(f"\n📤 Sending request to /api/classroom/debate")
    print(f"   Proposition: {payload['proposition']}")

    try:
        response = requests.post(f"{BASE_URL}/api/classroom/debate", json=payload)
        response.raise_for_status()
        result = response.json()

        if result.get("success"):
            print(
                f"\n✅ Success! Execution time: {result.get('execution_time', 0):.2f}s"
            )
            print(f"\n💬 Debate Transcript:")

            for i, entry in enumerate(result.get("debate_transcript", []), 1):
                agent = entry.get("agent", "Unknown")
                position = entry.get("position", "neutral")
                argument = entry.get("argument", "")[:300]  # Truncate

                position_icon = (
                    "✅"
                    if position == "for"
                    else "❌"
                    if position == "against"
                    else "⚖️"
                )
                print(f"\n   {i}. {position_icon} {agent} ({position}):")
                print(f"      {argument}...")

            # Check if we have arguments from different positions
            positions = [e.get("position") for e in result.get("debate_transcript", [])]
            if "for" in positions and "against" in positions:
                print(f"\n✅ CONFIRMED: Agents argued different positions!")
            else:
                print(f"\n⚠️  Agents may not have taken opposing positions.")

        else:
            print(f"\n❌ Error: {result.get('error')}")

    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to server.")
        print("   Make sure the FastAPI server is running:")
        print("   cd crewai_backend && python main.py")
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")


def test_explanation_with_visual():
    """Test that expert agent can explain and visual assistant can suggest visuals"""
    print("\n" + "=" * 60)
    print("TEST 3: Explanation with Visual Suggestions")
    print("=" * 60)

    payload = {
        "topic": "Graphing the quadratic function f(x) = x² - 5x + 6",
        "subject": "mathematics",
        "agents_config": {"expert_level": "advanced"},
    }

    print(f"\n📤 Sending request to /api/classroom/explain")
    print(f"   Concept: {payload['topic']}")

    try:
        response = requests.post(f"{BASE_URL}/api/classroom/explain", json=payload)
        response.raise_for_status()
        result = response.json()

        if result.get("success"):
            print(
                f"\n✅ Success! Execution time: {result.get('execution_time', 0):.2f}s"
            )
            print(f"\n📚 Explanations:")

            for i, resp in enumerate(result.get("responses", []), 1):
                agent = resp.get("agent", "Unknown")
                message = resp.get("message", "")[:300]
                print(f"\n   {i}. {agent}:")
                print(f"      {message}...")

            # Check if visual assistant responded
            agents = [r.get("agent") for r in result.get("responses", [])]
            if "Visual Assistant" in agents or any(
                "visual" in str(r).lower() for r in result.get("responses", [])
            ):
                print(f"\n✅ CONFIRMED: Visual assistant suggested whiteboard content!")
            else:
                print(f"\n⚠️  Visual assistant may not have responded.")

        else:
            print(f"\n❌ Error: {result.get('error')}")

    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to server.")
        print("   Make sure the FastAPI server is running:")
        print("   cd crewai_backend && python main.py")
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")


def test_health_check():
    """Test that server is running"""
    print("\n" + "=" * 60)
    print("PRE-FLIGHT CHECK: Server Health")
    print("=" * 60)

    try:
        response = requests.get(f"{BASE_URL}/health")
        response.raise_for_status()
        print("✅ Server is running and healthy!")
        return True
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running!")
        print("\n   To start the server, run:")
        print("   cd crewai_backend")
        print("   python main.py")
        return False
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False


if __name__ == "__main__":
    print("\n" + "🧪 AGENT INTERACTION TEST SUITE 🧪")
    print("\nThis script tests:")
    print("  1. Can agents respond to user input?")
    print("  2. Can agents interact with each other?")
    print("  3. Can agents debate different positions?")
    print("  4. Can agents suggest visual aids?")

    # Check server health first
    if not test_health_check():
        print("\n⚠️  Cannot proceed without server. Please start the server first.")
        exit(1)

    # Run tests
    test_classroom_discussion()
    test_debate()
    test_explanation_with_visual()

    print("\n" + "=" * 60)
    print("✅ TEST SUITE COMPLETE")
    print("=" * 60)
    print("\nNext Steps:")
    print("  1. Review the responses above")
    print("  2. If agents are responding, they can interact!")
    print("  3. For real-time interaction, implement WebSocket support")
    print("  4. Integrate with frontend to display agent messages")
