"use client";
import React from "react";
import Image from "next/image";

interface MeetingUserProps {
  name: string;
  avatar_url: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

export default function MeetingUser({ name, avatar_url, isMuted, isSpeaking }: MeetingUserProps) {
  return (
    <div className="relative w-56 h-40 bg-gray-800 rounded-xl shadow-lg flex flex-col items-center justify-center p-4">
      {avatar_url ? (
        <Image
          src={avatar_url}
          alt={name}
          width={64}
          height={64}
          className="rounded-full mb-2"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-gray-600 mb-2" />
      )}
      <span className="text-white font-medium truncate">{name}</span>

      {isSpeaking && (
        <div className="absolute bottom-3 flex gap-1">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:-0.2s]" />
          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:-0.1s]" />
          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" />
        </div>
      )}
    </div>
  );
}
