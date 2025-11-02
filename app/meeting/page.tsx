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
    console.log('[Meeting Page] Audio playback stopped by user - chat re-enabled');
  };

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
      // Only process if agents are not currently processing or playing audio
      if (entry.isFinal && entry.text.trim()) {
        
        // Check if agent is currently processing or audio is playing
        if (isAgentProcessing || isAudioPlaying) {
          console.log('[Transcript API] Agent is busy, ignoring input:', entry.text);
          return; // Ignore this input
        }
        
        try {
          // Set processing state
          setIsAgentProcessing(true);
          
          // Determine who is speaking (for now, assume current user is speaking)
          // In a real implementation, you might identify speakers from audio analysis
          const speakingUser = "You"; // TODO: Implement speaker identification
          
          const response = await fetch('/api/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: entry.text,
              timestamp: entry.timestamp,
              isFinal: entry.isFinal,
              speaking_user: speakingUser,
              meeting_users: meetingUsers, // Include all users in the meeting
            }),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('[Transcript API] Response:', data);
            
            // Log transcript text that accompanies the audio
            const responseTranscript = data.response_transcript || data.response_text || '';
            const originalTranscript = data.transcript || entry.text;
            
            if (responseTranscript) {
              console.log('[Transcript API] Response transcript (audio content):', responseTranscript);
            }
            if (originalTranscript) {
              console.log('[Transcript API] Original user transcript:', originalTranscript);
            }
            
            // Extract and set whiteboard data if available
            let shouldShowWhiteboard = false;
            let whiteboardPromptText = null;
            
            if (data.whiteboard_data) {
              console.log('[Transcript API] Whiteboard data received:', data.whiteboard_data);
              setWhiteboardData(data.whiteboard_data);
              
              // Use wrapped prompt if backend provided it, otherwise generate one
              if (data.whiteboard_data.wrapped_prompt) {
                // Backend already wrapped the tool output in a robust prompt
                whiteboardPromptText = data.whiteboard_data.wrapped_prompt;
                shouldShowWhiteboard = true;
                console.log('[Transcript API] Using backend-wrapped prompt (length:', data.whiteboard_data.wrapped_prompt.length, ')');
              } else if (data.whiteboard_data.type) {
                // Fallback: Generate prompt on frontend
                const whiteboardPrompt = createWhiteboardPromptFromToolOutput(data.whiteboard_data);
                console.log('[Transcript API] Generated whiteboard prompt from tool:', whiteboardPrompt);
                if (whiteboardPrompt) {
                  whiteboardPromptText = whiteboardPrompt;
                  shouldShowWhiteboard = true;
                }
              }
            }
            
            // Also check agent responses for professor/expert responses to send to whiteboard
            if (data.agent_responses && Array.isArray(data.agent_responses)) {
              console.log('[Transcript API] Processing agent responses for whiteboard:', data.agent_responses.length);
              
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
                    console.log(`[Transcript API] Found ${agentName} response, sending to whiteboard`);
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
              console.log('[Transcript API] Original whiteboard prompt:', whiteboardPromptText.substring(0, 100));
              
              // Transform prompt through LLM to ensure it's drawing-focused
              try {
                const transformResponse = await fetch('/api/whiteboard/transform-prompt', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: whiteboardPromptText }),
                });
                
                if (transformResponse.ok) {
                  const transformData = await transformResponse.json();
                  if (transformData.transformed_prompt) {
                    whiteboardPromptText = transformData.transformed_prompt;
                    console.log('[Transcript API] Transformed whiteboard prompt:', whiteboardPromptText.substring(0, 100));
                  }
                } else {
                  console.warn('[Transcript API] Prompt transformation failed, using original');
                }
              } catch (transformError) {
                console.error('[Transcript API] Error transforming prompt:', transformError);
                // Continue with original prompt
              }
              
              setAgentPrompt(whiteboardPromptText);
              setShowWhiteboard(true);
            } else {
              // Clear whiteboard data if not present
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
                
                // Set audio playing state
                setIsAudioPlaying(true);
                
                // Log that we're playing audio with its transcript
                console.log('[Transcript API] Playing audio response:', responseTranscript);
                
                audio.play().catch(err => {
                  console.error('[Transcript API] Error playing audio:', err);
                  setIsAudioPlaying(false);
                  setIsAgentProcessing(false);
                });
                
                // Clean up and reset states after playback completes
                audio.onended = () => {
                  URL.revokeObjectURL(audioUrl);
                  audioPlayerRef.current = null;
                  setIsAudioPlaying(false);
                  setIsAgentProcessing(false);
                  console.log('[Transcript API] Audio playback completed, ready for new input');
                };
                
                audio.onerror = () => {
                  console.error('[Transcript API] Audio playback error');
                  setIsAudioPlaying(false);
                  setIsAgentProcessing(false);
                  if (audioPlayerRef.current && audioPlayerRef.current.src) {
                    URL.revokeObjectURL(audioPlayerRef.current.src);
                  }
                  audioPlayerRef.current = null;
                };
              } catch (audioError) {
                console.error('[Transcript API] Error processing audio:', audioError);
                setIsAudioPlaying(false);
                setIsAgentProcessing(false);
              }
            } else if (responseTranscript) {
              // Even if no audio, log the response transcript
              console.log('[Transcript API] No audio, but transcript available:', responseTranscript);
              // Reset processing state if no audio
              setIsAgentProcessing(false);
            }
          } else {
            console.error('[Transcript API] Request failed:', response.status);
            // Reset processing state on error
            setIsAgentProcessing(false);
            // Try to get error details
            try {
              const errorData = await response.json();
              console.error('[Transcript API] Error details:', errorData);
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        } catch (error) {
          console.error('[Transcript API] Error sending transcript:', error);
          // Reset processing state on error
          setIsAgentProcessing(false);
        }
      }
    },
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
      <div className="flex flex-col justify-center items-center min-h-[80vh] py-8 gap-6 relative">
        <audio id="local-preview" className="hidden" />
        <audio id="remote-audio" ref={remoteAudioRef} className="hidden" />

        {/* Main Content with Chat Sidebar */}
        <div className="flex gap-6 w-full max-w-7xl mx-8">
          {/* Main Meeting Area */}
          <div className="relative z-20 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex-1 overflow-hidden">
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

          {/* Stop Playback Button - shown when audio is playing */}
          {isAudioPlaying && (
            <div className="absolute top-4 right-4 z-30">
              <button
                onClick={handleStopPlayback}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors shadow-lg"
              >
                <StopIcon className="h-4 w-4" />
                <span className="text-sm">Stop Playback</span>
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
            <div className="w-96 flex-shrink-0">
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
