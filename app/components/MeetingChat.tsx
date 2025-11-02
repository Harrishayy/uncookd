"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/outline";
import { UserCircleIcon } from "@heroicons/react/24/solid";

export interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  text: string;
  timestamp: number;
  isLoading?: boolean;
  userName?: string;
  userAvatar?: string;
}

interface MeetingChatProps {
  onSendMessage?: (message: string) => void;
  messages?: ChatMessage[];
  currentUser?: {
    name: string;
    avatar_url?: string;
  };
  meetingUsers?: string[];
  onAgentResponse?: (agentName: string, message: string) => void; // Callback for agent responses to send to whiteboard
}

export default function MeetingChat({ 
  onSendMessage,
  messages: externalMessages,
  currentUser,
  meetingUsers = [],
  onAgentResponse
}: MeetingChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(externalMessages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Animate typing indicator
  useEffect(() => {
    if (isLoading) {
      let dots = "";
      const interval = setInterval(() => {
        dots = dots.length >= 3 ? "" : dots + ".";
        setTypingText(dots);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setTypingText("");
    }
  }, [isLoading]);

  // Sync with external messages if provided
  useEffect(() => {
    if (externalMessages) {
      setMessages(externalMessages);
    }
  }, [externalMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || isProcessing || isPlaying) {
      if (isProcessing || isPlaying) {
        console.log('[MeetingChat] Agent is busy, please wait...');
      }
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      type: "user",
      text: inputValue.trim(),
      timestamp: Date.now(),
      userName: currentUser?.name || "You",
      userAvatar: currentUser?.avatar_url,
    };

    // Add user message immediately
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setIsProcessing(true);

    // Call onSendMessage callback if provided
    if (onSendMessage) {
      onSendMessage(userMessage.text);
    }

    // IMPORTANT: If no users are in the meeting, don't send - no agents should respond
    if (!meetingUsers || meetingUsers.length === 0) {
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        type: "assistant",
        text: "No one is in the meeting. Please add users to the meeting first.",
        timestamp: Date.now(),
        userName: "Assistant",
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
      setIsLoading(false);
      return;
    }
    
    // Send to backend API
    try {
      const response = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: userMessage.text,
          timestamp: userMessage.timestamp,
          isFinal: true,
          speaking_user: currentUser?.name || "You",
          meeting_users: meetingUsers || [],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = data.response_transcript || data.response_text || data.transcript || "No response received";

        // Process agent responses - show each agent's response separately if available
        if (data.agent_responses && Array.isArray(data.agent_responses) && data.agent_responses.length > 0) {
          // Add messages for each agent
          for (const agentResp of data.agent_responses) {
            if (agentResp && typeof agentResp === 'object') {
              const agentName = agentResp.agent || 'Assistant';
              const agentMessage = agentResp.message || '';
              
              if (agentMessage) {
                const agentMessageObj: ChatMessage = {
                  id: `msg-${Date.now()}-${agentName}`,
                  type: "assistant",
                  text: agentMessage,
                  timestamp: Date.now(),
                  userName: agentName,
                };
                setMessages((prev) => [...prev, agentMessageObj]);
              }
            }
          }
        } else {
          // Fallback: Add single assistant response
          const assistantMessage: ChatMessage = {
            id: `msg-${Date.now()}-assistant`,
            type: "assistant",
            text: responseText,
            timestamp: Date.now(),
            userName: "Assistant",
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
        
        // Send agent responses to whiteboard (via parent callback)
        // Check if we have professor/expert responses to send to whiteboard
        if (data.agent_responses && Array.isArray(data.agent_responses) && onAgentResponse) {
          for (const agentResp of data.agent_responses) {
            if (agentResp && typeof agentResp === 'object') {
              const agentName = agentResp.agent || '';
              const agentMessage = agentResp.message || '';
              
              // Check if this is professor or expert
              const isProfessor = agentName.toLowerCase().includes('socratic') || 
                                agentName.toLowerCase().includes('mentor') ||
                                agentName.toLowerCase().includes('professor');
              const isExpert = agentName.toLowerCase().includes('problem analyst') ||
                             agentName.toLowerCase().includes('expert') ||
                             agentName.toLowerCase().includes('analyst');
              
              if ((isProfessor || isExpert) && agentMessage) {
                console.log(`[MeetingChat] Sending ${agentName} response to whiteboard`);
                // Wrap agent message in concise prompt
                const wrappedPrompt = `Draw: ${agentMessage}`;
                onAgentResponse(agentName, wrappedPrompt);
                // Break after first professor/expert response
                break;
              }
            }
          }
        }

        // Play audio if available (OGG format)
        if (data.audio) {
          try {
            console.log("[MeetingChat] Received audio data, decoding...");
            
            // Stop any currently playing audio
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
              if (audioRef.current.src) {
                URL.revokeObjectURL(audioRef.current.src);
              }
            }
            
            const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
            // OGG files from ElevenLabs are typically audio/ogg or audio/opus
            const audioBlob = new Blob([audioBytes], { type: "audio/ogg; codecs=opus" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // Store audio reference
            audioRef.current = audio;
            setIsPlaying(true);
            
            console.log("[MeetingChat] Playing audio response...");
            audio.play().catch((err) => {
              console.error("[MeetingChat] Error playing audio:", err);
              setIsPlaying(false);
              setIsProcessing(false);
            });
            
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
              audioRef.current = null;
              setIsPlaying(false);
              setIsProcessing(false);
              console.log("[MeetingChat] Audio playback completed, ready for new input");
            };
            
            audio.onerror = (err) => {
              console.error("[MeetingChat] Audio playback error:", err);
              setIsPlaying(false);
              setIsProcessing(false);
              if (audioRef.current && audioRef.current.src) {
                URL.revokeObjectURL(audioRef.current.src);
              }
              audioRef.current = null;
            };
          } catch (audioError) {
            console.error("[MeetingChat] Error processing audio:", audioError);
            setIsPlaying(false);
            setIsProcessing(false);
          }
        } else {
          console.log("[MeetingChat] No audio data received");
          setIsProcessing(false);
        }
      } else {
        // Graceful error handling - just say sorry
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          type: "assistant",
          text: "Sorry, I couldn't do it.",
          timestamp: Date.now(),
          userName: "Assistant",
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsProcessing(false);
      }
    } catch (error) {
      // Catch any other errors and handle gracefully
      console.error("[MeetingChat] Error sending message:", error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        type: "assistant",
        text: "Sorry, I couldn't do it.",
        timestamp: Date.now(),
        userName: "Assistant",
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageError = (messageId: string) => {
    setImageErrors(prev => new Set(prev).add(messageId));
  };

  const handleStopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current = null;
    }
    // Reset both playing and processing states to allow chat to work again
    setIsPlaying(false);
    setIsProcessing(false);
    console.log("[MeetingChat] Audio playback stopped by user - chat re-enabled");
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src) {
          URL.revokeObjectURL(audioRef.current.src);
        }
      }
    };
  }, []);

  const renderAvatar = (message: ChatMessage) => {
    const hasError = imageErrors.has(message.id);
    
    if (message.type === "user" && message.userAvatar && !hasError) {
      return (
        <div className="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-700 flex-shrink-0">
          <Image
            src={message.userAvatar}
            alt={message.userName || "User"}
            width={32}
            height={32}
            className="object-cover"
            onError={() => handleImageError(message.id)}
            unoptimized
          />
        </div>
      );
    }
    
    return (
      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center ring-2 ring-gray-700 flex-shrink-0">
        {message.type === "user" ? (
          <span className="text-xs font-bold text-white">
            {(message.userName || "You").charAt(0).toUpperCase()}
          </span>
        ) : (
          <UserCircleIcon className="h-5 w-5 text-gray-300" />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-800/60 border-l border-gray-700 overflow-hidden">
      {/* Messages Container */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <p>No messages yet. Start a conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${
                message.type === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div className="flex-shrink-0">
                {renderAvatar(message)}
              </div>

              {/* Message Content */}
              <div className={`flex flex-col max-w-[75%] ${
                message.type === "user" ? "items-end" : "items-start"
              }`}>
                {/* User Name */}
                {message.userName && (
                  <span className="text-xs text-gray-400 mb-1 px-1">
                    {message.userName}
                  </span>
                )}
                
                {/* Message Bubble */}
                <div
                  className={`rounded-lg px-4 py-2.5 ${
                    message.type === "user"
                      ? "bg-blue-600 text-white rounded-tr-none"
                      : "bg-gray-700/80 text-gray-100 rounded-tl-none"
                  }`}
                >
                  <p className="text-base whitespace-pre-wrap break-words leading-6">{message.text}</p>
                  <span className={`text-xs opacity-70 mt-1 block ${
                    message.type === "user" ? "text-blue-100" : "text-gray-300"
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex gap-2 flex-row">
            {/* Avatar for typing indicator */}
            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center ring-2 ring-gray-700 flex-shrink-0">
              <UserCircleIcon className="h-5 w-5 text-gray-300" />
            </div>
            
            {/* Typing indicator */}
            <div className="flex flex-col items-start">
              <span className="text-xs text-gray-400 mb-1 px-1">Assistant</span>
              <div className="bg-gray-700/80 text-gray-100 rounded-lg rounded-tl-none px-4 py-3">
                <span className="text-sm">Typing{typingText}</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700 bg-gray-800/80">
        {/* Stop button - shown when audio is playing */}
        {isPlaying && (
          <div className="mb-2 flex justify-center">
            <button
              onClick={handleStopPlayback}
              className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <StopIcon className="h-4 w-4" />
              <span className="text-sm">Stop Playback</span>
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isProcessing || isPlaying ? "Agent is responding, please wait..." : "Type your message... (Enter to send, Shift+Enter for new line)"}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700/50 text-gray-100 placeholder-gray-400 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
            rows={1}
            style={{ minHeight: "44px", maxHeight: "120px" }}
            disabled={isLoading || isProcessing || isPlaying}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || isProcessing || isPlaying}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 flex-shrink-0"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

