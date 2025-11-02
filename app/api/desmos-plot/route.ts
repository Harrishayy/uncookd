import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.expression) {
      return NextResponse.json(
        { error: 'Missing required field: expression is required' },
        { status: 400 }
      );
    }

    // Forward request to Python backend
    const response = await fetch(`${BACKEND_URL}/api/desmos-plot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expression: body.expression,
        xMin: body.xMin,
        xMax: body.xMax,
        yMin: body.yMin,
        yMax: body.yMax,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Desmos Plot API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Backend request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      status: data.status || 'success',
      expression: data.expression,
      viewBounds: data.viewBounds || {
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10,
      },
    });
  } catch (error: any) {
    console.error('[Desmos Plot API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process Desmos plot request', details: error.message },
      { status: 500 }
    );
  }
}

