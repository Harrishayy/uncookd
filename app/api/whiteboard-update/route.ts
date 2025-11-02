import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.boardId || !body.update) {
      return NextResponse.json(
        { error: 'Missing required fields: boardId and update are required' },
        { status: 400 }
      );
    }

    // Forward request to Python backend
    const response = await fetch(`${BACKEND_URL}/api/whiteboard-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        boardId: body.boardId,
        update: body.update,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Whiteboard Update API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Backend request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      status: data.status || 'success',
      boardId: data.boardId,
      update: data.update,
      instructions: data.instructions || [],
    });
  } catch (error: any) {
    console.error('[Whiteboard Update API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process whiteboard update', details: error.message },
      { status: 500 }
    );
  }
}

