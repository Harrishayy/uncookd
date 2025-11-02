import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward request to Python backend
    const response = await fetch(`${BACKEND_URL}/api/whiteboard/transform-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: body.prompt || '',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[transform-prompt] Backend error:', response.status, errorData);
      return NextResponse.json(
        {
          status: 'error',
          transformed_prompt: body.prompt, // Return original on error
          error: `Backend error: ${response.status}`,
        },
        { status: 200 } // Return 200 so frontend can handle gracefully
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[transform-prompt] Error:', error);
    // Return original prompt on error so whiteboard still works
    const body = await request.json();
    return NextResponse.json({
      status: 'error',
      transformed_prompt: body.prompt || '',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

