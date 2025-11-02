"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
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
}

export default function MeetingChat({ 
  onSendMessage,
  messages: externalMessages,
  currentUser
}: MeetingChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(externalMessages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
    if (!inputValue.trim() || isLoading) return;

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

    // Call onSendMessage callback if provided
    if (onSendMessage) {
      onSendMessage(userMessage.text);
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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = data.response_transcript || data.response_text || data.transcript || "No response received";

        // Add assistant response
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          type: "assistant",
          text: responseText,
          timestamp: Date.now(),
          userName: "Assistant",
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Play audio if available
        if (data.audio) {
          try {
            const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
            const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play().catch((err) => {
              console.error("[MeetingChat] Error playing audio:", err);
            });
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
            };
          } catch (audioError) {
            console.error("[MeetingChat] Error processing audio:", audioError);
          }
        }
      } else {
        // Add error message
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          type: "assistant",
          text: "Sorry, I couldn't process your message. Please try again.",
          timestamp: Date.now(),
          userName: "Assistant",
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("[MeetingChat] Error sending message:", error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        type: "assistant",
        text: "Failed to send message. Please check your connection.",
        timestamp: Date.now(),
        userName: "Assistant",
      };
      setMessages((prev) => [...prev, errorMessage]);
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
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700/50 text-gray-100 placeholder-gray-400 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
            rows={1}
            style={{ minHeight: "44px", maxHeight: "120px" }}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 flex-shrink-0"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

