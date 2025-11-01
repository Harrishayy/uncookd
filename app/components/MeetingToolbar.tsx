"use client";
import React from "react";
import { 
  MicrophoneIcon, 
  SpeakerWaveIcon, 
  RectangleStackIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  CalculatorIcon
} from "@heroicons/react/24/solid";
import { 
  MicrophoneIcon as MicrophoneIconOutline,
  SpeakerWaveIcon as SpeakerWaveIconOutline 
} from "@heroicons/react/24/outline";

export default function MeetingToolbar({
  muted,
  deafened,
  onMute,
  onDeafen,
  onWhiteboard,
  onCalculator,
  onLeave,
  onSettings,
}: {
  muted: boolean;
  deafened: boolean;
  onMute: () => void;
  onDeafen: () => void;
  onWhiteboard: () => void;
  onCalculator: () => void;
  onLeave: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="p-6 border-t border-white/10 bg-gradient-to-r from-gray-900/80 via-gray-800/80 to-gray-900/80 backdrop-blur-sm">
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {/* Mute Button */}
        <button
          onClick={() => onMute(!muted)}
          className={`group relative flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
            muted
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30"
              : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105 active:scale-95"
          }`}
        >
          {muted ? (
            <MicrophoneIcon className="h-5 w-5" />
          ) : (
            <MicrophoneIconOutline className="h-5 w-5" />
          )}
          <span className="hidden sm:inline">{muted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Deafen Button */}
        <button
          onClick={() => onDeafen(!deafened)}
          className={`group relative flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
            deafened
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30"
              : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105 active:scale-95"
          }`}
        >
          {deafened ? (
            <SpeakerWaveIcon className="h-5 w-5" />
          ) : (
            <SpeakerWaveIconOutline className="h-5 w-5" />
          )}
          <span className="hidden sm:inline">{deafened ? "Undeafen" : "Deafen"}</span>
        </button>

        {/* Whiteboard Button */}
        <button
          onClick={onWhiteboard}
          className="group flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <RectangleStackIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Whiteboard</span>
        </button>

        {/* Calculator Button */}
        <button
          onClick={onCalculator}
          className="group flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <CalculatorIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Calculator</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onSettings}
          className="group flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Cog6ToothIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Settings</span>
        </button>

        {/* Leave Button */}
        <button
          onClick={onLeave}
          className="group flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-red-600 to-red-500 text-white border border-red-500/50 hover:from-red-500 hover:to-red-400 hover:scale-105 active:scale-95 shadow-lg shadow-red-500/25 transition-all duration-200"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </div>
  );
}
