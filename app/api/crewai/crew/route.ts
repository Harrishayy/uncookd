/**
 * API Route for Multi-Agent Crew Operations
 */

import { NextRequest, NextResponse } from 'next/server';

const CREWAI_BACKEND_URL = process.env.CREWAI_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${CREWAI_BACKEND_URL}/api/crew/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to connect to CrewAI backend', 
        details: String(error) 
      },
      { status: 500 }
    );
  }
}
