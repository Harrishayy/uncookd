"""
Example CrewAI Agents Configuration
This file demonstrates how to create and configure CrewAI agents
"""

from crewai import Agent, Task, Crew


def create_research_agent():
    """Create a research agent"""
    return Agent(
        role="Research Analyst",
        goal="Gather and analyze information on the given topic",
        backstory="You are an experienced research analyst with expertise in data collection and analysis.",
        verbose=True,
        allow_delegation=False,
    )


def create_writer_agent():
    """Create a writer agent"""
    return Agent(
        role="Content Writer",
        goal="Create well-structured and engaging content based on research",
        backstory="You are a professional content writer with a talent for creating clear and compelling narratives.",
        verbose=True,
        allow_delegation=False,
    )


def create_reviewer_agent():
    """Create a reviewer agent"""
    return Agent(
        role="Quality Reviewer",
        goal="Review and improve content quality and accuracy",
        backstory="You are a meticulous reviewer with an eye for detail and quality assurance.",
        verbose=True,
        allow_delegation=False,
    )


def create_example_crew():
    """Create an example crew with multiple agents"""
    research_agent = create_research_agent()
    writer_agent = create_writer_agent()
    reviewer_agent = create_reviewer_agent()

    # Define tasks
    research_task = Task(
        description="Research the topic: AI in modern software development",
        agent=research_agent,
        expected_output="A comprehensive research summary with key findings",
    )

    writing_task = Task(
        description="Write an article based on the research findings",
        agent=writer_agent,
        expected_output="A well-written article draft",
    )

    review_task = Task(
        description="Review and improve the article",
        agent=reviewer_agent,
        expected_output="A polished, high-quality article",
    )

    # Create crew
    crew = Crew(
        agents=[research_agent, writer_agent, reviewer_agent],
        tasks=[research_task, writing_task, review_task],
        verbose=True,
    )

    return crew
