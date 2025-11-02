import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward request to Python backend
    const response = await fetch(`${BACKEND_URL}/api/generate-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript: body.transcript || body.text || '',
        timestamp: body.timestamp || Date.now(),
        isFinal: body.isFinal !== undefined ? body.isFinal : true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Transcript API] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Backend request failed', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // If audio is returned as base64, decode it and return as blob URL
    let audioUrl = null;
    if (data.audio) {
      try {
        // Decode base64 audio
        const audioBytes = Buffer.from(data.audio, 'base64');
        const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
        
        // In Next.js API route, we need to return base64 or URL
        // For now, return the base64 string and let frontend handle it
        audioUrl = data.audio;
      } catch (error) {
        console.error('[Transcript API] Error processing audio:', error);
      }
    }

    return NextResponse.json({
      status: 'success',
      transcript: data.transcript, // Original user transcript
      response_text: data.response_text || data.response_transcript, // AI-generated response text
      response_transcript: data.response_transcript || data.response_text, // Transcript of what's in audio
      audio: audioUrl, // base64 encoded audio or null
      whiteboard_data: data.whiteboard_data || null, // Whiteboard tool output JSON (for TldrawBoardEmbedded)
    });
    } catch (error: any) {
    console.error('[Transcript API] Error:', error);
    const errorMessage = error.message || 'Failed to process transcript';
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to process transcript', 
        details: errorMessage,
        transcript: body?.transcript || body?.text || '', // Include original transcript even on error
        response_text: errorMessage,
        response_transcript: errorMessage,
        audio: null
      },
      { status: 500 }
    );
  }
}

