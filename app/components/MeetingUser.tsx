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
    <div className="group relative w-64 h-48 rounded-xl bg-black border border-gray-800 hover:border-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
      {/* Animated background gradient */}
      {isSpeaking && (
        <div className="absolute inset-0 bg-white/5 animate-pulse" />
      )}
      
      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center p-6">
        {/* Avatar */}
        <div className="relative mb-4">
          {avatar_url ? (
            <div className="relative w-20 h-20 rounded-full overflow-hidden ring-4 ring-gray-800 group-hover:ring-white transition-all">
              <Image
                src={avatar_url}
                alt={name}
                width={80}
                height={80}
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center ring-4 ring-gray-800 group-hover:ring-white transition-all">
              <span className="text-2xl font-bold text-black">
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          
          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full border-4 border-black flex items-center justify-center animate-pulse">
              <div className="w-2 h-2 bg-black rounded-full" />
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
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black border border-gray-700">
                <MicrophoneIcon className="h-3 w-3 text-gray-400" />
              </div>
            )}
            {isSpeaking && !isMuted && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                <SpeakerWaveIcon className="h-3 w-3 text-white" />
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
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-black hover:bg-gray-900 border border-gray-800 hover:border-gray-700"
              title="Remove user"
            >
              <XMarkIcon className="h-4 w-4 text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
