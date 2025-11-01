/**
 * API Route for AI Agent Drawing Operations
 * Handles drawing tasks from AI agents on the tldraw board
 * Uses Gemini API directly via backend (or can be configured to use Gemini directly here)
 */

import { NextRequest, NextResponse } from 'next/server';

const CREWAI_BACKEND_URL = process.env.CREWAI_BACKEND_URL || 'http://localhost:8000';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task, agents, boardId } = body;

    if (!task || !agents || agents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Task and agents are required' },
        { status: 400 }
      );
    }

    const agent = agents[0];

    // Option 1: Try backend first (if running)
    if (CREWAI_BACKEND_URL && CREWAI_BACKEND_URL !== '') {
      try {
        const simpleResponse = await fetch(`${CREWAI_BACKEND_URL}/api/draw/simple`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: task,
            agent_name: agent.name,
            agent_color: agent.color,
            agent_role: agent.role,
          }),
          // Add timeout to fail fast if backend isn't running
          signal: AbortSignal.timeout(5000),
        });

        if (simpleResponse.ok) {
          const simpleData = await simpleResponse.json();
          
          if (simpleData.success && simpleData.drawing_instructions) {
            return NextResponse.json({
              success: true,
              drawing_instructions: [{
                agent_id: agent.id,
                agent_name: agent.name,
                agent_role: agent.role,
                color: agent.color,
                instructions: simpleData.drawing_instructions,
                task: task,
              }],
              result: "Drawing instructions generated using Gemini via backend",
            });
          }
        }
      } catch (backendError: any) {
        // Backend not available or connection failed
        console.log('Backend not available, attempting direct Gemini call:', backendError.message);
        
        // Fall through to direct Gemini call if API key is available
        if (!GEMINI_API_KEY) {
          throw new Error(
            `Backend is not running (${backendError.code || 'connection failed'}) and GEMINI_API_KEY is not set. ` +
            `Please either: 1) Start the backend server (cd crewai_backend && python main.py), or ` +
            `2) Set GEMINI_API_KEY in your .env.local file to use Gemini directly.`
          );
        }
      }
    }

    // Option 2: Direct Gemini API call (if backend unavailable and API key is set)
    if (GEMINI_API_KEY) {
      try {
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are an AI assistant that generates drawing instructions for a whiteboard canvas.

The user wants to draw: "${task}"

Generate specific drawing instructions in JSON format with this structure:
{
  "shapes": [
    {
      "type": "circle|rectangle|line|arrow|text",
      "x": <number>,
      "y": <number>,
      "width": <number> (for rectangles),
      "height": <number> (for rectangles),
      "radius": <number> (for circles),
      "x1": <number> (for lines/arrows),
      "y1": <number> (for lines/arrows),
      "x2": <number> (for lines/arrows),
      "y2": <number> (for lines/arrows),
      "text": "<text content>" (for text shapes),
      "color": "${agent.color}"
    }
  ]
}

Guidelines:
- Use coordinates between 100-1000 for positioning
- For arrows, use type "arrow" with x1, y1 (start) and x2, y2 (end)
- For circles, use type "circle" with x, y (center) and radius
- For rectangles, use type "rectangle" with x, y (top-left), width, height
- For lines, use type "line" with x1, y1, x2, y2
- For text, use type "text" with x, y (position) and text content
- Use the color ${agent.color} for all shapes
- Ensure shapes don't overlap (spread them out)
- Return ONLY valid JSON, no markdown code blocks or extra text

Generate the drawing instructions now:`
                }]
              }]
            }),
          }
        );

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          throw new Error(`Gemini API error: ${geminiResponse.statusText} - ${errorText}`);
        }

        const geminiData = await geminiResponse.json();
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Extract JSON from response
        let jsonText = responseText.trim();
        if (jsonText.includes('```json')) {
          const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) jsonText = jsonMatch[1];
        } else if (jsonText.includes('```')) {
          const jsonMatch = jsonText.match(/```\s*([\s\S]*?)\s*```/);
          if (jsonMatch) jsonText = jsonMatch[1];
        }

        // Validate JSON
        try {
          JSON.parse(jsonText);
        } catch {
          throw new Error(`Invalid JSON from Gemini: ${jsonText.substring(0, 200)}`);
        }

        return NextResponse.json({
          success: true,
          drawing_instructions: [{
            agent_id: agent.id,
            agent_name: agent.name,
            agent_role: agent.role,
            color: agent.color,
            instructions: jsonText,
            task: task,
          }],
          result: "Drawing instructions generated using Gemini (direct API call)",
        });
      } catch (geminiError: any) {
        throw new Error(`Failed to call Gemini API: ${geminiError.message}`);
      }
    }

    // No backend and no API key
    throw new Error(
      'Backend is not available and GEMINI_API_KEY is not set. ' +
      'Please either: 1) Start the backend server, or 2) Set GEMINI_API_KEY in .env.local'
    );
  } catch (error) {
    console.error('Error in draw route:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute drawing task',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

