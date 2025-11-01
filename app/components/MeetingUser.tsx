"use client";
import React from "react";
import Image from "next/image";
import { MicrophoneIcon, SpeakerWaveIcon, XMarkIcon } from "@heroicons/react/24/solid";

interface MeetingUserProps {
  name: string;
  avatar_url: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  onRemove?: () => void;
  isCurrentUser?: boolean;
}

export default function MeetingUser({ 
  name, 
  avatar_url, 
  isMuted = false, 
  isSpeaking = false,
  onRemove,
  isCurrentUser = false
}: MeetingUserProps) {
  return (
    <div className="group relative w-64 h-48 rounded-2xl bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border border-white/10 hover:border-blue-500/50 shadow-xl hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300 overflow-hidden">
      {/* Animated background gradient */}
      {isSpeaking && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 animate-pulse" />
      )}
      
      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center p-6">
        {/* Avatar */}
        <div className="relative mb-4">
          {avatar_url ? (
            <div className="relative w-20 h-20 rounded-full overflow-hidden ring-4 ring-white/20 group-hover:ring-blue-400/50 transition-all">
              <Image
                src={avatar_url}
                alt={name}
                width={80}
                height={80}
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center ring-4 ring-white/20 group-hover:ring-blue-400/50 transition-all">
              <span className="text-2xl font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          
          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-gray-800 flex items-center justify-center animate-pulse">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          )}
        </div>

        {/* Name */}
        <span className="text-white font-semibold text-lg truncate max-w-full px-2">
          {name}
        </span>

        {/* Status indicators and remove button */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMuted && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30">
                <MicrophoneIcon className="h-3 w-3 text-red-400" />
              </div>
            )}
            {isSpeaking && !isMuted && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                <SpeakerWaveIcon className="h-3 w-3 text-green-400" />
              </div>
            )}
          </div>
          
          {/* Remove button - only show for non-current users */}
          {!isCurrentUser && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50"
              title="Remove user"
            >
              <XMarkIcon className="h-4 w-4 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/10 group-hover:via-purple-500/10 group-hover:to-pink-500/10 transition-all duration-300 pointer-events-none" />
    </div>
  );
}
