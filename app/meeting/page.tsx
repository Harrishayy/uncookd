"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";
import AddUserModal from "../components/AddUserModal";
import DeviceConfigModal from "../components/DeviceConfigModal";
import TldrawBoardEmbedded from "../components/TldrawBoardEmbedded";
import DesmosCalculator from "../components/DesmosCalculator";
import MeetingArea from "../components/MeetingArea";
import MeetingChat from "../components/MeetingChat";
import MeetingToolbar from "../components/MeetingToolbar";
import { UserCircleIcon, UserPlusIcon } from "@heroicons/react/24/solid";
import { StopIcon } from "@heroicons/react/24/solid";
import { Transition } from "@headlessui/react";
import Footer from "../components/Footer";
import useMeetingAudio from "./useMeetingAudio";

// Helper function to convert whiteboard tool output to TldrawBoardEmbedded prompt
// Concise, action-focused prompt (max 2 sentences)
function createWhiteboardPromptFromToolOutput(whiteboardData: any): string {
  if (!whiteboardData || typeof whiteboardData !== 'object') {
    return '';
  }
  
  const type = whiteboardData.type || 'graph';
  const topic = whiteboardData.description?.replace(/Graph visualization for: |Diagram visualization for: |Concept map for: |Step-by-step visual solution for: /, '') || '';
  const instructions = whiteboardData.instructions || '';
  const expression = whiteboardData.expression || '';
  const specifications = whiteboardData.specifications || {};
  
  // Extract essential action verb and target
  let action = '';
  let target = '';
  
  if (type === 'graph' && expression) {
    action = 'Graph';
    target = expression;
  } else if (type === 'diagram') {
    action = 'Draw diagram';
    target = topic || instructions || 'diagram';
  } else if (type === 'concept_map') {
    action = 'Create concept map';
    target = topic || instructions || 'concepts';
  } else if (type === 'step_by_step') {
    action = 'Draw steps';
    target = topic || instructions || 'solution';
  } else {
    action = `Draw ${type}`;
    target = topic || instructions || '';
  }
  
  // Build first sentence: action + target
  const sentence1 = `${action} ${target}`.trim();
  
  // Build second sentence: specifications only (if any)
  const specParts: string[] = [];
  if (specifications.axes && type === 'graph') {
    specParts.push('labeled axes');
  }
  if (specifications.grid && type === 'graph') {
    specParts.push('grid');
  }
  if (specifications.labels && type !== 'graph') {
    specParts.push('labels');
  }
  
  let sentence2 = '';
  if (specParts.length > 0) {
    sentence2 = `Include ${specParts.join(', ')}.`;
  }
  
  // Combine: max 2 sentences
  if (sentence2) {
    return `${sentence1}. ${sentence2}`;
  } else {
    return sentence1;
  }
}

const allUsers = [
  { name: "Thomas", avatar_url: "https://via.placeholder.com/150" },
  { name: "Tara", avatar_url: "https://via.placeholder.com/150" },
  { name: "Ethan", avatar_url: "https://via.placeholder.com/150" },
  { name: "Harrish", avatar_url: "https://via.placeholder.com/150" }
];

export default function Page() {
  const router = useRouter();
  const [meetingUsers, setMeetingUsers] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [agentPrompt, setAgentPrompt] = useState<any>(null);
  const [whiteboardData, setWhiteboardData] = useState<any>(null);
  
  // State to track agent processing and audio playback
  const [isAgentProcessing, setIsAgentProcessing] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [currentSpeakingAgent, setCurrentSpeakingAgent] = useState<string | null>(null);
  
  // Agent queue system for multi-agent conversations
  const agentQueueRef = useRef<Array<{
    transcript: string;
    timestamp: number;
    speaking_user: string;
    meeting_users: string[];
  }>>([]);
  const isProcessingQueueRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  // Track if meeting is active - set to false when leaving to prevent new agent requests
  const [isMeetingActive, setIsMeetingActive] = useState(true);
  const whiteboardAgentRef = useRef<{ dispose?: () => void } | null>(null);
  
  // Track muted state in a ref so it's always current in callbacks
  const mutedRef = useRef<boolean>(false);

  // Handle stop playback for meeting page audio
  const handleStopPlayback = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      if (audioPlayerRef.current.src) {
        URL.revokeObjectURL(audioPlayerRef.current.src);
      }
      audioPlayerRef.current = null;
    }
    // Reset both playing and processing states to allow chat to work again
    setIsAudioPlaying(false);
    setIsAgentProcessing(false);
    setCurrentSpeakingAgent(null); // Clear speaking agent
    console.log('[Meeting Page] Audio playback stopped by user - chat re-enabled');
  };

  // Clean transcript by removing unnecessary characters
  const cleanTranscript = (text: string): string => {
    if (!text) return text;
    
    // Remove backticks (code formatting)
    let cleaned = text.replace(/`([^`]+)`/g, '$1');
    
    // Clean up bullet points - convert markdown bullets to simple dashes
    cleaned = cleaned.replace(/^\*\s+/gm, '- ');
    cleaned = cleaned.replace(/^-\s+/gm, '- ');
    
    // Remove excessive asterisks used for emphasis (keep content)
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    
    // Clean up markdown headers
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    
    // Remove extra whitespace but preserve intentional line breaks
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // Remove leading/trailing whitespace from each line
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
    
    // Remove excessive blank lines at start/end
    cleaned = cleaned.replace(/^\n+|\n+$/g, '');
    
    return cleaned.trim();
  };

  // Function to process agent queue sequentially (prevents agents cutting each other off)
  const processAgentQueue = async () => {
    // If already processing or queue is empty, return
    if (isProcessingQueueRef.current || agentQueueRef.current.length === 0) {
        return;
      }
      
    // Mark as processing
    isProcessingQueueRef.current = true;
    setIsAgentProcessing(true);
    
    try {
      // Process items in queue one at a time
      while (agentQueueRef.current.length > 0) {
      // Get next item from queue
      const queueItem = agentQueueRef.current.shift();
      if (!queueItem) break;
      
      console.log(`[Agent Queue] Processing: "${queueItem.transcript.substring(0, 50)}..." (${agentQueueRef.current.length} remaining)`);
      
      try {
        // Wait for any current audio to finish before starting next agent
        while (isAudioPlaying) {
          console.log('[Agent Queue] Waiting for audio to finish before processing next agent...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
          
          const response = await fetch('/api/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            transcript: queueItem.transcript,
            timestamp: queueItem.timestamp,
            isFinal: true,
            speaking_user: queueItem.speaking_user,
            meeting_users: queueItem.meeting_users,
            }),
          });

          if (response.ok) {
            const data = await response.json();
          console.log('[Agent Queue] Response:', data);
            
            // Log transcript text that accompanies the audio
            let responseTranscript = data.response_transcript || data.response_text || '';
          const originalTranscript = data.transcript || queueItem.transcript;
          
          // Extract current speaking agent - check API response first, then fallback to agent_responses
          let currentAgentName: string | null = null;
          if (data.speaking_agent) {
            // API explicitly provides speaking agent
            currentAgentName = data.speaking_agent;
            console.log('[Agent Queue] Current speaking agent (from API):', currentAgentName);
          } else if (data.agent_responses && Array.isArray(data.agent_responses) && data.agent_responses.length > 0) {
            // Fallback: extract from agent_responses
            const firstAgent = data.agent_responses[0];
            if (firstAgent && typeof firstAgent === 'object' && firstAgent.agent) {
              currentAgentName = firstAgent.agent;
              console.log('[Agent Queue] Current speaking agent (from responses):', currentAgentName);
            }
          }
            
            // Clean the response transcript
            if (responseTranscript) {
              responseTranscript = cleanTranscript(responseTranscript);
            console.log('[Agent Queue] Response transcript (audio content):', responseTranscript);
            }
            if (originalTranscript) {
            console.log('[Agent Queue] Original user transcript:', originalTranscript);
            }
            
            // Extract and set whiteboard data if available
            let shouldShowWhiteboard = false;
            let whiteboardPromptText = null;
            
          // PRIORITY 1: Use whiteboard_data from tool if available (most accurate)
            if (data.whiteboard_data) {
            console.log('[Agent Queue] Whiteboard data received:', data.whiteboard_data);
              setWhiteboardData(data.whiteboard_data);
              
              // Use wrapped prompt if backend provided it, otherwise generate one
              if (data.whiteboard_data.wrapped_prompt) {
                // Backend already wrapped the tool output in a robust prompt
                whiteboardPromptText = data.whiteboard_data.wrapped_prompt;
                shouldShowWhiteboard = true;
              console.log('[Agent Queue] Using backend-wrapped prompt (length:', data.whiteboard_data.wrapped_prompt.length, ')');
              } else if (data.whiteboard_data.type) {
                // Fallback: Generate prompt on frontend
                const whiteboardPrompt = createWhiteboardPromptFromToolOutput(data.whiteboard_data);
              console.log('[Agent Queue] Generated whiteboard prompt from tool:', whiteboardPrompt);
                if (whiteboardPrompt) {
                  whiteboardPromptText = whiteboardPrompt;
                  shouldShowWhiteboard = true;
                }
              }
            }
            
            // PRIORITY 2: If no tool output, use USER'S ORIGINAL QUESTION for whiteboard
            // This ensures the whiteboard shows what the user actually asked for
            // ALWAYS attempt to create visual for voice input (more lenient detection)
            if (!whiteboardPromptText && originalTranscript && originalTranscript.trim()) {
              const userTextLower = originalTranscript.toLowerCase().trim();
              
              // Expanded visual keyword detection - more comprehensive
              const visualKeywords = [
                // Direct visual commands
                'draw', 'show', 'display', 'illustrate', 'visualize', 'visual', 'diagram', 'graph', 'chart', 
                'map', 'plot', 'sketch', 'picture', 'image',
                // Concepts that typically need visuals
                'explain', 'how does', 'what is', 'describe', 'understand', 'see', 'look like',
                // Educational concepts that benefit from visuals
                'concept', 'process', 'structure', 'system', 'flow', 'timeline', 'timeline', 'evolution',
                'revolution', 'battle', 'war', 'period', 'era', 'cycle', 'relationship', 'connection',
                'comparison', 'difference', 'similar', 'contrast', 'hierarchy', 'tree', 'branch',
                // Math/science concepts
                'equation', 'formula', 'function', 'derivative', 'integral', 'geometry', 'triangle',
                'circle', 'graph', 'axis', 'coordinate', 'probability', 'statistics',
                // Additional common educational topics
                'photosynthesis', 'mitosis', 'atoms', 'molecules', 'cells', 'biology', 'chemistry',
                'physics', 'history', 'geography', 'anatomy', 'economy', 'economics',
              ];
              
              const questionWords = ['what', 'how', 'why', 'when', 'where', 'explain', 'describe', 'show', 'tell', 'can you'];
              const hasQuestionWord = questionWords.some(word => 
                userTextLower.startsWith(word) || 
                userTextLower.includes(` ${word} `) ||
                userTextLower.includes(`${word}?`)
              );
              
              // Determine if visual would be helpful
              const hasVisualKeyword = visualKeywords.some(keyword => userTextLower.includes(keyword));
              const isSubstantialQuestion = originalTranscript.length > 15; // Lowered threshold - more lenient
              const isExplanatory = hasQuestionWord && originalTranscript.length > 8; // Lowered threshold
              
              // VERY LENIENT: Create visual for almost any substantial question or keyword match
              // Default to creating visual unless it's clearly a greeting/simple response
              const isSimpleGreeting = ['hi', 'hello', 'hey'].some(g => 
                userTextLower === g || 
                userTextLower.startsWith(g + ' ') ||
                userTextLower === g + ' there'
              );
              const isSimpleAcknowledgment = ['thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'yeah', 'nope'].some(a =>
                userTextLower === a || userTextLower.startsWith(a + ' ')
              );
              const isTooShort = originalTranscript.trim().length < 3;
              
              // Create visual if: has keywords OR is substantial OR is explanatory, AND not a simple greeting/acknowledgment
              const shouldCreateVisual = (hasVisualKeyword || isSubstantialQuestion || isExplanatory) && 
                                        !isSimpleGreeting && 
                                        !isSimpleAcknowledgment && 
                                        !isTooShort;
              
              // FOR VOICE INPUT: Be very lenient - if it's any kind of question or explanation request, create visual
              if (shouldCreateVisual || (isSubstantialQuestion && !isSimpleGreeting && !isSimpleAcknowledgment)) {
                console.log('[Agent Queue] User question detected as visual-worthy:', originalTranscript.substring(0, 100));
                console.log('[Agent Queue] Detection reason:', {
                  hasVisualKeyword,
                  isSubstantialQuestion,
                  isExplanatory,
                  length: originalTranscript.length,
                  shouldCreateVisual
                });
                whiteboardPromptText = originalTranscript.trim();
                shouldShowWhiteboard = true;
              }
            }
          
          // PRIORITY 3: Fallback to agent responses (last resort - prefer user's question)
          if (!whiteboardPromptText && data.agent_responses && Array.isArray(data.agent_responses)) {
            console.log('[Agent Queue] Processing agent responses for whiteboard:', data.agent_responses.length);
              
              // Find professor or expert responses
              for (const agentResp of data.agent_responses) {
                if (agentResp && typeof agentResp === 'object') {
                  const agentName = agentResp.agent || '';
                  const agentMessage = agentResp.message || '';
                  
                  // Check if this is professor or expert (Problem Analyst)
                  const isProfessor = agentName.toLowerCase().includes('socratic') || 
                                    agentName.toLowerCase().includes('mentor') ||
                                    agentName.toLowerCase().includes('professor');
                  const isExpert = agentName.toLowerCase().includes('problem analyst') ||
                                 agentName.toLowerCase().includes('expert') ||
                                 agentName.toLowerCase().includes('analyst');
                  
                  if ((isProfessor || isExpert) && agentMessage) {
                  console.log(`[Agent Queue] Found ${agentName} response, sending to whiteboard`);
                    // Extract first 2 sentences from agent message for concise action-focused prompt
                    const sentences = agentMessage.split(/[.!?]+/).filter((s: string) => s.trim().length > 0).slice(0, 2);
                    const conciseMessage = sentences.join('. ').trim() + (sentences.length > 0 && !sentences[0].endsWith('.') ? '.' : '');
                    whiteboardPromptText = conciseMessage;
                    shouldShowWhiteboard = true;
                    // Break after first professor/expert response
                    break;
                  }
                }
              }
            }
            
            // Set whiteboard prompt if we found one
            if (whiteboardPromptText) {
            console.log('[Agent Queue] Original whiteboard prompt:', whiteboardPromptText.substring(0, 100));
              
            // ALWAYS transform prompt through LLM to ensure it's drawing-focused and creates actual diagrams
            // This is critical for voice input to ensure proper visual generation
              try {
                const transformResponse = await fetch('/api/whiteboard/transform-prompt', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: whiteboardPromptText }),
                });
                
                if (transformResponse.ok) {
                  const transformData = await transformResponse.json();
                if (transformData.transformed_prompt && transformData.transformed_prompt.trim()) {
                  whiteboardPromptText = transformData.transformed_prompt.trim();
                  console.log('[Agent Queue] ✓ Transformed whiteboard prompt (visual-ready):', whiteboardPromptText.substring(0, 150));
                  console.log('[Agent Queue] Full transformed prompt:', whiteboardPromptText);
                } else {
                  console.warn('[Agent Queue] Transformation returned empty, using original');
                }
              } else {
                console.warn('[Agent Queue] Prompt transformation failed, using original');
                // Even if transformation fails, still try to use original (might still be useful)
              }
            } catch (transformError) {
              console.error('[Agent Queue] Error transforming prompt:', transformError);
              // Continue with original prompt if transformation fails
              console.log('[Agent Queue] Using original prompt due to transformation error');
            }
            
            // Ensure we have a valid prompt before setting it
            if (whiteboardPromptText && whiteboardPromptText.trim().length > 3) {
              const finalPrompt = whiteboardPromptText.trim();
              
              // CRITICAL: Always show whiteboard first, then set prompt
              // This ensures the TldrawBoardEmbedded component is mounted and ready
              console.log('[Agent Queue] Showing whiteboard and setting prompt:', finalPrompt.substring(0, 100));
              
              // Set showWhiteboard first to ensure component is mounted
              setShowWhiteboard(true);
              
              // Use a small delay to ensure whiteboard is rendered before setting prompt
              // The prompt needs to be set AFTER the whiteboard component is mounted
              setTimeout(() => {
                setAgentPrompt(finalPrompt);
                console.log('[Agent Queue] ✓ Whiteboard prompt set (delayed):', finalPrompt.substring(0, 100));
                console.log('[Agent Queue] Full prompt for whiteboard:', finalPrompt);
              }, 300);
              
              // Also set immediately as fallback (in case whiteboard was already open)
              setAgentPrompt(finalPrompt);
              console.log('[Agent Queue] ✓ Whiteboard prompt set (immediate fallback)');
            } else {
              console.warn('[Agent Queue] Whiteboard prompt too short or invalid, not setting:', whiteboardPromptText);
              setWhiteboardData(null);
            }
          } else {
            // Clear whiteboard data if not present
            console.log('[Agent Queue] No whiteboard prompt found, clearing whiteboard');
              setWhiteboardData(null);
            }
            
            // Play audio response if available
            if (data.audio) {
              try {
                // Stop any currently playing audio
                if (audioPlayerRef.current) {
                  audioPlayerRef.current.pause();
                  audioPlayerRef.current.currentTime = 0;
                  if (audioPlayerRef.current.src) {
                    URL.revokeObjectURL(audioPlayerRef.current.src);
                  }
                }
                
                // Decode base64 audio
                const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
                const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                // Create and play audio element
                const audio = new Audio(audioUrl);
                audioPlayerRef.current = audio;
                
              // Set audio playing state and current speaking agent
                setIsAudioPlaying(true);
              setCurrentSpeakingAgent(currentAgentName);
                
              // Log that we're playing audio with its transcript and agent
              console.log('[Agent Queue] Playing audio response from agent:', currentAgentName || 'Unknown', 'Transcript:', responseTranscript);
                
                audio.play().catch(err => {
                console.error('[Agent Queue] Error playing audio:', err);
                  setIsAudioPlaying(false);
                // Don't reset processing - queue will continue
                });
                
                // Clean up and reset states after playback completes
                audio.onended = () => {
                  URL.revokeObjectURL(audioUrl);
                  audioPlayerRef.current = null;
                  setIsAudioPlaying(false);
                setCurrentSpeakingAgent(null); // Clear speaking agent
                
                // CRITICAL: Ensure transcription is still active and listening for new input
                // The Web Speech API in continuous mode should stay active, but verify it's running
                // Use closure to access these variables when callback runs
                setTimeout(() => {
                  if (localStreamRef.current && getTranscriptionStatus && !muted) {
                    try {
                      // Check transcription status
                      const transcriptionStatus = getTranscriptionStatus();
                      if (!transcriptionStatus.isActive) {
                        console.log('[Agent Queue] Transcription stopped, restarting to listen for new input...');
                        // Restart transcription for the existing stream
                        startTranscriptionForStream(localStreamRef.current).catch((err: any) => {
                          console.error('[Agent Queue] Error restarting transcription:', err);
                        });
                      } else {
                        console.log('[Agent Queue] ✓ Transcription active, ready to listen for next voice input');
                      }
                    } catch (err) {
                      console.warn('[Agent Queue] Could not check transcription status:', err);
                    }
                  } else if (muted) {
                    console.log('[Agent Queue] Audio playback completed, user is muted - transcription paused');
                  } else {
                    console.log('[Agent Queue] ✓ Audio playback completed, transcription should be listening');
                  }
                }, 100);
                
                // Don't reset processing - queue will continue
                console.log('[Agent Queue] Audio playback completed, processing next in queue');
              };
                
                audio.onerror = () => {
                console.error('[Agent Queue] Audio playback error');
                  setIsAudioPlaying(false);
                setCurrentSpeakingAgent(null); // Clear speaking agent on error
                // Continue with queue
                  if (audioPlayerRef.current && audioPlayerRef.current.src) {
                    URL.revokeObjectURL(audioPlayerRef.current.src);
                  }
                  audioPlayerRef.current = null;
                };
              } catch (audioError) {
              console.error('[Agent Queue] Error processing audio:', audioError);
                setIsAudioPlaying(false);
              setCurrentSpeakingAgent(null); // Clear speaking agent on error
              // Continue with queue
            }
          }
          
          // Wait for audio to finish if playing before continuing to next item
          if (isAudioPlaying) {
            await new Promise<void>((resolve) => {
              const checkAudio = setInterval(() => {
                if (!isAudioPlaying) {
                  clearInterval(checkAudio);
                  resolve();
                }
              }, 200);
              // Safety timeout
              setTimeout(() => {
                clearInterval(checkAudio);
                resolve();
              }, 60000); // Max 60 seconds wait
            });
          }
          
          // Wait a bit between queue items to prevent overwhelming
          if (agentQueueRef.current.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          console.error('[Agent Queue] Response not OK:', response.status);
          // Continue processing queue even if one fails
        }
      } catch (error) {
        console.error('[Agent Queue] Error processing queue item:', error);
        // Continue processing queue even if one fails
      }
    }
  } catch (error) {
    console.error('[Agent Queue] Error:', error);
  } finally {
    // Finished processing queue
    isProcessingQueueRef.current = false;
    setIsAgentProcessing(false);
    console.log('[Agent Queue] Finished processing queue');
  }
  };

  // Define signaling URL for WebSocket connection
  const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://localhost:8888";

  const {
    muted,
    deafened,
    isSpeaking,
    transcript,
    localStreamRef,
    remoteAudioRef,
    handleMute,
    handleDeafen,
    cleanup,
    startAudioLevelMonitoring,
    startTranscriptionForStream,
    getTranscriptionStatus,
    } = useMeetingAudio(SIGNALING_URL, {
    onTranscription: async (entry) => {
      // CRITICAL CHECKS FIRST - Don't even log if conditions aren't met
      // If microphone is muted, don't process anything
      if (mutedRef.current) {
        // Silently ignore - microphone is muted, agents cannot hear
        return;
      }
      
      // If meeting is no longer active (user left), don't process
      if (!isMeetingActive) {
        // Silently ignore - meeting ended
        return;
      }
      
      // If no users are in the meeting, don't process - no agents should talk
      if (!meetingUsers || meetingUsers.length === 0) {
        // Silently ignore - no agents available to respond
        return;
      }
      
      // Only log and process if we pass all checks
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      console.log(
        `[Transcript ${entry.isFinal ? '✓ FINAL' : '⏳ INTERIM'}] ${timestamp}:`,
        entry.text
      );
      console.log('Full entry:', entry);
      
      // Send transcript to backend and receive audio response
      // Queue system: Add to queue and process sequentially to handle multiple agents
      if (entry.isFinal && entry.text.trim()) {
        
        // Determine who is speaking (for now, assume current user is speaking)
        const speakingUser = "You"; // TODO: Implement speaker identification
        
        // Add to agent queue (handles multiple agents without cutting each other off)
        agentQueueRef.current.push({
          transcript: entry.text.trim(),
          timestamp: entry.timestamp,
          speaking_user: speakingUser,
          meeting_users: meetingUsers || [],
        });
        
        console.log(`[Agent Queue] Added request to queue (size: ${agentQueueRef.current.length}): "${entry.text.substring(0, 50)}..."`);
        
        // Process queue if not already processing
        processAgentQueue();
        
        return; // Don't process directly - let queue handle it
      }
    }
  });
  
  // Keep muted ref in sync with muted state for use in callbacks
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const handleAddUser = (user: { name: string; avatar_url: string }) => {
    setMeetingUsers((prev) => {
      if (!prev.includes(user.name)) {
        return [...prev, user.name];
      }
      return prev;
    });
    setShowModal(false);
  };

  const handleRemoveUser = (userName: string) => {
    setMeetingUsers((prev) => prev.filter((name) => name !== userName));
  };

  const currentUser = { name: "You", avatar_url: "" };

  // Preload user avatar images (skip broken placeholder URLs)
  useEffect(() => {
    allUsers.forEach((user) => {
      if (user.avatar_url && !user.avatar_url.includes('via.placeholder.com')) {
        const img = new window.Image();
        img.src = user.avatar_url;
        img.onerror = () => {
          // Silently handle image load errors
        };
      }
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initAudio = async () => {
      try {
        // Ask for microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) return;

        localStreamRef.current = stream;

        // Start audio level monitoring
        startAudioLevelMonitoring(stream);

        // Start transcription (WebSpeech API or chunked fallback)
        await startTranscriptionForStream(stream);
      } catch (err) {
        console.error("Failed to access microphone:", err);
      }
    };

    initAudio();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [localStreamRef, startAudioLevelMonitoring, startTranscriptionForStream, cleanup]);

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />
      <div className="flex flex-col justify-center items-center min-h-[80vh] py-8 gap-6 relative" style={{ maxWidth: '100vw', overflow: 'hidden' }}>
        <audio id="local-preview" className="hidden" />
        <audio id="remote-audio" ref={remoteAudioRef} className="hidden" />

        {/* Main Content with Chat Sidebar */}
        <div className="flex gap-6 mx-8 overflow-hidden flex-shrink-0" style={{ maxWidth: '80rem', width: 'min(calc(100vw - 4rem), 80rem)', flexShrink: 0 }}>
          {/* Main Meeting Area */}
          <div className="relative z-20 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex-shrink-0" style={{ width: showChat ? 'calc(100% - 24rem - 1.5rem)' : '100%', maxWidth: showChat ? 'calc(80rem - 24rem - 1.5rem)' : '80rem', minWidth: 0, flexShrink: 0, flexGrow: 0 }}>
          <div className="p-6 border-b border-gray-700 bg-gray-900/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isSpeaking ? "bg-green-400 animate-pulse" : "bg-white"
                    }`}
                  />
                  <h1 className="text-2xl font-bold text-white">Active Meeting</h1>
                </div>
                <div className="h-6 w-px bg-gray-700" />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700">
                  <UserCircleIcon className="w-5 h-5 text-gray-300" />
                  <span className="text-gray-100 font-medium text-sm">{currentUser.name}</span>
                </div>
              </div>
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-black font-medium hover:bg-gray-100 border border-gray-600 transition-all duration-200"
                onClick={() => setShowModal(true)}
              >
                <UserPlusIcon className="h-5 w-5" />
                <span>Add User</span>
              </button>
            </div>
          </div>

          {/* Agent Speaking Indicator & Stop Button - shown when audio is playing */}
          {isAudioPlaying && (
            <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
              {/* Agent Speaking Indicator */}
              {currentSpeakingAgent && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium shadow-lg animate-pulse">
                  <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                  <span className="text-sm font-semibold">{currentSpeakingAgent} is speaking</span>
                </div>
              )}
              {/* Stop Playback Button */}
              <button
                onClick={handleStopPlayback}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors shadow-lg"
              >
                <StopIcon className="h-4 w-4" />
                <span className="text-sm">Stop</span>
              </button>
            </div>
          )}

          {/* Meeting Area */}
          <MeetingArea
            currentUser={currentUser}
            otherUsers={allUsers.filter((u) => meetingUsers.includes(u.name))}
            onAddClick={() => setShowModal(true)}
            onRemoveUser={handleRemoveUser}
          />

          {/* Toolbar */}
          <MeetingToolbar
            muted={muted}
            deafened={deafened}
            onMute={(newMuted) => handleMute(newMuted)}
            onDeafen={(newDeafened) => handleDeafen(newDeafened)}
            onWhiteboard={() => setShowWhiteboard(!showWhiteboard)}
            onCalculator={() => setShowCalculator(!showCalculator)}
            onChat={() => setShowChat(!showChat)}
            showChat={showChat}
            onLeave={() => {
              // Stop any audio playback
              handleStopPlayback();
              // Cleanup audio connections
              cleanup();
              // Stop any agent processing
              setIsAgentProcessing(false);
              // Clear whiteboard and agent prompts
              setAgentPrompt(null);
              setWhiteboardData(null);
              // Navigate away
              router.push("/");
            }}
            onSettings={() => setShowConfig(true)}
          />
          </div>

          {/* Chat Sidebar - Toggleable */}
          {showChat && (
            <div className="w-96 flex-shrink-0" style={{ width: '24rem', maxWidth: '24rem' }}>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden h-[calc(100vh-200px)] flex flex-col">
                <div className="p-4 border-b border-gray-700 bg-gray-900/80">
                  <h2 className="text-xl font-bold text-white">Meeting Chat</h2>
                </div>
                <MeetingChat
                  onSendMessage={(message) => {
                    console.log('[MeetingChat] User sent message:', message);
                  }}
                  currentUser={currentUser}
                  meetingUsers={meetingUsers}
                  onAgentResponse={async (agentName, message) => {
                    console.log(`[MeetingChat] Agent ${agentName} response for whiteboard:`, message.substring(0, 100));
                    
                    // Transform prompt through LLM to ensure it's drawing-focused
                    let transformedMessage = message;
                    try {
                      const transformResponse = await fetch('/api/whiteboard/transform-prompt', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: message }),
                      });
                      
                      if (transformResponse.ok) {
                        const transformData = await transformResponse.json();
                        if (transformData.transformed_prompt) {
                          transformedMessage = transformData.transformed_prompt;
                          console.log('[MeetingChat] Transformed whiteboard prompt:', transformedMessage.substring(0, 100));
                        }
                      }
                    } catch (transformError) {
                      console.error('[MeetingChat] Error transforming prompt:', transformError);
                      // Continue with original message
                    }
                    
                    setAgentPrompt(transformedMessage);
                    setShowWhiteboard(true);
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Whiteboard */}
        {showWhiteboard && (
          <Transition
            show={showWhiteboard}
            enter="transition-all duration-300 ease-out"
            enterFrom="opacity-0 transform scale-95 -translate-y-4"
            enterTo="opacity-100 transform scale-100 translate-y-0"
            leave="transition-all duration-200 ease-in"
            leaveFrom="opacity-100 transform scale-100 translate-y-0"
            leaveTo="opacity-0 transform scale-95 -translate-y-4"
          >
            <div className="relative z-10 w-full max-w-7xl mx-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-700 bg-gray-900/80">
                <h2 className="text-xl font-bold text-white">Whiteboard</h2>
              </div>
              <div className="h-[600px] bg-white">
                <TldrawBoardEmbedded
                  boardId="meeting-whiteboard"
                  agentPrompt={agentPrompt}
                  showAgentUI={true}
                  onAgentComplete={() => {}}
                  onAgentError={() => {}}
                  onPromptSubmit={() => {}}
                  onAgentReady={(agent) => {
                    // Store agent reference for cleanup
                    if (agent) {
                      whiteboardAgentRef.current = {
                        dispose: () => {
                          try {
                            agent.dispose();
                            console.log('[Meeting Page] Whiteboard agent disposed via ref');
                          } catch (err) {
                            console.error('[Meeting Page] Error disposing agent via ref:', err);
                          }
                        }
                      };
                    } else {
                      whiteboardAgentRef.current = null;
                    }
                  }}
                />
              </div>
            </div>
          </Transition>
        )}

        {/* Desmos Calculator */}
        <DesmosCalculator isOpen={showCalculator} onClose={() => setShowCalculator(false)} />

      </div>

      {/* Modals */}
      <AddUserModal
        users={allUsers}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAdd={handleAddUser}
        addedUsers={meetingUsers}
      />

      <DeviceConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} onConfirm={() => setShowConfig(false)} />
      <Footer />
    </div>
  );
}
