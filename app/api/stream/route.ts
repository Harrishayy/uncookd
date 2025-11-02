import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AgentPrompt } from '../../../shared/types/AgentPrompt';
import { AgentAction } from '../../../shared/types/AgentAction';
import { Streaming } from '../../../shared/types/Streaming';

// Mark this route as Node.js runtime to avoid bundling client-side code
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Google AI provider
const google = createGoogleGenerativeAI({ 
  apiKey: GOOGLE_API_KEY || '' 
});

/**
 * Server-side rate limiter to add additional delay if needed.
 * This provides a safety net in case multiple requests come through.
 */
class ServerRateLimiter {
	private lastCallTime: number = 0
	private minDelayMs: number = 500 // Minimum 500ms on server side (smaller delay since client already waits)

	async waitForNextCall(): Promise<void> {
		const now = Date.now()
		const timeSinceLastCall = now - this.lastCallTime

		if (timeSinceLastCall < this.minDelayMs) {
			const waitTime = this.minDelayMs - timeSinceLastCall
			console.log(`[Stream API] Server rate limiter: waiting ${waitTime}ms`)
			await new Promise(resolve => setTimeout(resolve, waitTime))
		}

		this.lastCallTime = Date.now()
	}
}

const serverRateLimiter = new ServerRateLimiter()

// Test endpoint to verify route is accessible
export async function GET() {
  return new Response(JSON.stringify({ message: 'Stream endpoint is working' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Stream API] POST /api/stream called at', new Date().toISOString());
  
  // Server-side rate limiting: add a small delay before processing
  await serverRateLimiter.waitForNextCall()
  
  try {
    // Check API key first
    if (!GOOGLE_API_KEY) {
      const error = 'API key not configured. Please set GEMINI_API_KEY in your .env.local file';
      console.error('[Stream API] ERROR:', error);
      const relevantEnvVars = Object.keys(process.env).filter(k => 
        k.includes('API') || k.includes('KEY') || k.includes('GOOGLE') || k.includes('GEMINI')
      );
      console.error('[Stream API] Available env vars:', relevantEnvVars.length > 0 ? relevantEnvVars : 'none found');
      return new Response(
        JSON.stringify({ 
          error,
          hint: 'Create a .env.local file in the root directory (/Users/harrishayyanar/Documents/uncookd/.env.local) and add: GEMINI_API_KEY=your_key_here\nGet your key from: https://ai.google.dev/'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body with error handling
    let prompt: AgentPrompt;
    try {
      const body = await request.json();
      prompt = body as AgentPrompt;
      console.log('[Stream API] Prompt received, preview:', JSON.stringify(prompt).substring(0, 200));
    } catch (error: any) {
      const errorMsg = 'Failed to parse request body as JSON';
      console.error('[Stream API] ERROR:', errorMsg, error.message);
      return new Response(
        JSON.stringify({ 
          error: errorMsg,
          details: error.message 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Dynamically import modules with error handling
    let getModelName: any;
    let buildMessages: any;
    let buildSystemPrompt: any;
    let closeAndParseJson: any;
    
    try {
      const modelNameModule = await import('../../../worker/prompt/getModelName');
      getModelName = modelNameModule.getModelName;
      
      const buildMessagesModule = await import('../../../worker/prompt/buildMessages');
      buildMessages = buildMessagesModule.buildMessages;
      
      const buildSystemPromptModule = await import('../../../worker/prompt/buildSystemPrompt');
      buildSystemPrompt = buildSystemPromptModule.buildSystemPrompt;
      
      const closeAndParseJsonModule = await import('../../../worker/do/closeAndParseJson');
      closeAndParseJson = closeAndParseJsonModule.closeAndParseJson;
    } catch (error: any) {
      const errorMsg = 'Failed to import required modules';
      console.error('[Stream API] ERROR:', errorMsg, error.message);
      console.error('[Stream API] Error stack:', error.stack);
      return new Response(
        JSON.stringify({ 
          error: errorMsg,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          hint: 'This might indicate a build or module resolution issue. Try restarting the dev server.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Build messages and system prompt
    let messages: any[];
    let systemPrompt: string;
    try {
      const modelName = getModelName(prompt);
      console.log('[Stream API] Using model:', modelName);
      
      messages = buildMessages(prompt);
      systemPrompt = buildSystemPrompt(prompt);
      console.log('[Stream API] Messages count:', messages.length, 'System prompt length:', systemPrompt.length);
    } catch (error: any) {
      const errorMsg = 'Failed to build messages or system prompt';
      console.error('[Stream API] ERROR:', errorMsg, error.message);
      console.error('[Stream API] Error stack:', error.stack);
      return new Response(
        JSON.stringify({ 
          error: errorMsg,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get model definition and use appropriate provider
    let model: any;
    
    try {
      const { getAgentModelDefinition } = await import('../../../worker/models');
      const modelDefinition = getAgentModelDefinition(prompt.modelName?.name || 'gemini-2.5-flash-image');
      console.log('[Stream API] Model definition:', JSON.stringify(modelDefinition));
      
      if (modelDefinition.provider === 'google') {
        model = google(modelDefinition.id);
        console.log('[Stream API] Initialized Google model:', modelDefinition.id);
      } else {
        // Fallback to Gemini 2.5 Flash Image for other providers
        console.warn('[Stream API] WARNING: Provider', modelDefinition.provider, 'not supported. Using fallback: gemini-2.5-flash-image');
        model = google('gemini-2.5-flash-image');
        console.log('[Stream API] Using fallback model: gemini-2.5-flash-image');
      }
    } catch (error: any) {
      // Fallback to Gemini if model definition fails
      console.warn('[Stream API] Model definition failed, using fallback:', error.message);
      console.warn('[Stream API] Error stack:', error.stack);
      try {
        model = google('gemini-2.5-flash-image');
        console.log('[Stream API] Using fallback model: gemini-2.5-flash-image');
      } catch (fallbackError: any) {
        const errorMsg = 'Failed to initialize model (including fallback)';
        console.error('[Stream API] FATAL ERROR:', errorMsg, fallbackError.message);
        return new Response(
          JSON.stringify({ 
            error: errorMsg,
            details: process.env.NODE_ENV === 'development' ? fallbackError.message : undefined
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Add the prompt that forces JSON response
    messages.push({
      role: 'assistant',
      content: '{"actions": [{"_type":',
    });

    // Initialize streaming with error handling
    let textStream: any;
    try {
      const streamResult = streamText({
        model,
        system: systemPrompt,
        messages,
        maxOutputTokens: 8192,
        temperature: 0,
      });
      textStream = streamResult.textStream;
    } catch (error: any) {
      const errorMsg = 'Failed to initialize text stream';
      console.error('[Stream API] ERROR:', errorMsg, error.message);
      console.error('[Stream API] Error stack:', error.stack);
      return new Response(
        JSON.stringify({ 
          error: errorMsg,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create streaming response following the agent template format
    const encoder = new TextEncoder();
    let streamErrorOccurred = false;
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = '{"actions": [{"_type":';
          let cursor = 1; // Start at 1 to match the logic that uses cursor - 1
          let maybeIncompleteAction: AgentAction | null = null;
          let streamStartTime = Date.now();
          let iterationCount = 0;
          const maxIterations = 10000; // Prevent infinite loops

          try {
            for await (const text of textStream) {
              iterationCount++;
              
              // Safety check to prevent infinite loops
              if (iterationCount > maxIterations) {
                console.error('[Stream API] ERROR: Max iterations reached, breaking stream loop');
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    error: 'Stream processing exceeded maximum iterations. This may indicate an infinite loop.',
                    iterationCount
                  })}\n\n`)
                );
                streamErrorOccurred = true;
                break;
              }

              buffer += text;

              // Parse JSON with error handling
              let partialObject: any;
              try {
                partialObject = closeAndParseJson(buffer);
              } catch (parseError: any) {
                // JSON parsing error - continue but log it
                console.warn('[Stream API] JSON parse warning:', parseError.message);
                continue;
              }
              
              if (!partialObject) continue;

              const actions = partialObject.actions;
              if (!Array.isArray(actions)) continue;
              if (actions.length === 0) continue;

              // If the actions list is ahead of the cursor, we know we've completed the current action
              // We can complete the action and move the cursor forward
              if (actions.length > cursor) {
                const action = actions[cursor - 1] as AgentAction;
                if (action) {
                  const completeAction: Streaming<AgentAction> = {
                    ...action,
                    complete: true,
                    time: Date.now() - streamStartTime,
                  };
                  try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeAction)}\n\n`));
                  } catch (enqueueError: any) {
                    console.error('[Stream API] ERROR: Failed to enqueue complete action:', enqueueError.message);
                    streamErrorOccurred = true;
                    break;
                  }
                  maybeIncompleteAction = null;
                }
                cursor++;
              }

              // Now let's check the (potentially new) current action
              // And let's yield it in its (potentially incomplete) state
              const action = actions[cursor - 1] as AgentAction;
              if (action) {
                // If we don't have an incomplete action yet, this is the start of a new one
                if (!maybeIncompleteAction) {
                  streamStartTime = Date.now();
                }

                maybeIncompleteAction = action;

                const incompleteAction: Streaming<AgentAction> = {
                  ...action,
                  complete: false,
                  time: Date.now() - streamStartTime,
                };
                
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(incompleteAction)}\n\n`));
                } catch (enqueueError: any) {
                  console.error('[Stream API] ERROR: Failed to enqueue incomplete action:', enqueueError.message);
                  streamErrorOccurred = true;
                  break;
                }
              }
            }

            // Complete any remaining incomplete action (only if no error occurred)
            if (!streamErrorOccurred && maybeIncompleteAction) {
              const completeAction: Streaming<AgentAction> = {
                ...maybeIncompleteAction,
                complete: true,
                time: Date.now() - streamStartTime,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeAction)}\n\n`));
            }

            if (!streamErrorOccurred) {
              const totalTime = Date.now() - streamStartTime;
              console.log('[Stream API] Stream completed successfully in', totalTime, 'ms (iterations:', iterationCount, ')');
            }
          } catch (streamError: any) {
            streamErrorOccurred = true;
            const errorDetails = {
              message: streamError.message,
              stack: streamError.stack,
              name: streamError.name,
              iterationCount,
            };
            console.error('[Stream API] Stream processing error:', JSON.stringify(errorDetails, null, 2));
            console.error('[Stream API] Error stack:', streamError.stack);
            
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  error: streamError.message || 'Stream processing error',
                  details: process.env.NODE_ENV === 'development' ? errorDetails : undefined 
                })}\n\n`)
              );
            } catch (enqueueError: any) {
              console.error('[Stream API] ERROR: Failed to enqueue error message:', enqueueError.message);
            }
          } finally {
            // Always close the controller
            try {
              controller.close();
            } catch (closeError: any) {
              console.error('[Stream API] ERROR: Failed to close controller:', closeError.message);
            }
          }
        } catch (error: any) {
          streamErrorOccurred = true;
          const errorDetails = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            type: error.constructor.name,
          };
          console.error('[Stream API] FATAL: Stream start error:', JSON.stringify(errorDetails, null, 2));
          console.error('[Stream API] Error stack:', error.stack);
          
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                error: error.message || 'Failed to start stream',
                details: process.env.NODE_ENV === 'development' ? errorDetails : undefined 
              })}\n\n`)
            );
            controller.close();
          } catch (finalError: any) {
            console.error('[Stream API] FATAL: Could not send error response:', finalError.message);
            // Last resort - try to abort
            try {
              controller.close();
            } catch {
              // Ignore - we've done all we can
            }
          }
        }
      },
    });

    // Return streaming response with error handling
    try {
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (responseError: any) {
      const errorMsg = 'Failed to create streaming response';
      console.error('[Stream API] FATAL:', errorMsg, responseError.message);
      console.error('[Stream API] Error stack:', responseError.stack);
      
      // Return error response - ensure we never loop
      return new Response(
        JSON.stringify({ 
          error: errorMsg,
          details: process.env.NODE_ENV === 'development' ? responseError.message : undefined,
          hint: 'Stream initialization failed. Check server logs.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    // Top-level catch for any unhandled errors - this MUST NOT loop
    const errorDetails = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      name: error.name,
      type: error.constructor.name,
    };
    
    console.error('[Stream API] FATAL ERROR (top-level catch):', JSON.stringify(errorDetails, null, 2));
    console.error('[Stream API] Error stack:', error.stack);
    console.error('[Stream API] Request processing time:', Date.now() - startTime, 'ms');
    
    // CRITICAL: This response MUST succeed to prevent infinite loops
    // Use simple JSON.stringify that cannot fail
    const errorResponse = {
      error: error.message || 'Failed to process stream request',
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      hint: 'Check server logs for more details',
      timestamp: new Date().toISOString(),
    };
    
    try {
      return new Response(
        JSON.stringify(errorResponse),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'X-Error-Time': String(Date.now() - startTime),
            'X-Error-Type': error.constructor.name,
          } 
        }
      );
    } catch (finalError: any) {
      // Absolute last resort - if even this fails, log and exit
      console.error('[Stream API] CRITICAL: Could not create ANY error response:', finalError.message);
      // Return a minimal plain text response
      return new Response(
        'Internal Server Error: Unable to process request or generate error response',
        { status: 500, headers: { 'Content-Type': 'text/plain' } }
      );
    }
  }
}
