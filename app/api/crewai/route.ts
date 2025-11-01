/**
 * Next.js API Route for CrewAI Backend Communication
 * This route acts as a proxy between the Next.js frontend and Python CrewAI backend
 */

import { NextRequest, NextResponse } from 'next/server';

const CREWAI_BACKEND_URL = process.env.CREWAI_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || '/health';

    const response = await fetch(`${CREWAI_BACKEND_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to connect to CrewAI backend', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint = '/api/crew/execute', ...payload } = body;

    const response = await fetch(`${CREWAI_BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to connect to CrewAI backend', details: String(error) },
      { status: 500 }
    );
  }
}
