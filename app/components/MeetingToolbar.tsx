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
import { Toggle } from "./ui/toggle";
import { Button } from "./ui/button";

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
  onMute: (newMuted: boolean) => void;
  onDeafen: (newDeafened: boolean) => void;
  onWhiteboard: () => void;
  onCalculator: () => void;
  onLeave: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="p-6 border-t border-gray-700 bg-gray-900/60 backdrop-blur-sm">
      <div className="flex items-center justify-center gap-6 flex-wrap">
        {/* Mute Toggle */}
        <div className={`
          flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200
          ${!muted 
            ? "border-gray-600 bg-gray-800/60 hover:bg-gray-800/80" 
            : "border-gray-700 bg-gray-800/40 hover:bg-gray-800/50"
          }
        `}>
          <div className="flex items-center gap-2">
            {!muted ? (
              <MicrophoneIcon className="h-5 w-5 text-white" />
            ) : (
              <MicrophoneIconOutline className="h-5 w-5 text-gray-500" />
            )}
            <span className={`text-sm font-medium hidden sm:inline ${
              !muted ? "text-white" : "text-gray-400"
            }`}>
              Microphone
            </span>
          </div>
          <Toggle
            checked={!muted}
            onCheckedChange={(checked) => onMute(!checked)}
            size="md"
          />
        </div>

        {/* Deafen Toggle */}
        <div className={`
          flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200
          ${!deafened 
            ? "border-gray-600 bg-gray-800/60 hover:bg-gray-800/80" 
            : "border-gray-700 bg-gray-800/40 hover:bg-gray-800/50"
          }
        `}>
          <div className="flex items-center gap-2">
            {!deafened ? (
              <SpeakerWaveIcon className="h-5 w-5 text-white" />
            ) : (
              <SpeakerWaveIconOutline className="h-5 w-5 text-gray-500" />
            )}
            <span className={`text-sm font-medium hidden sm:inline ${
              !deafened ? "text-white" : "text-gray-400"
            }`}>
              Audio
            </span>
          </div>
          <Toggle
            checked={!deafened}
            onCheckedChange={(checked) => onDeafen(!checked)}
            size="md"
          />
        </div>

        {/* Whiteboard Toggle */}
        <Button
          variant="outline"
          onClick={onWhiteboard}
          className="gap-2"
        >
          <RectangleStackIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Whiteboard</span>
        </Button>

        {/* Calculator Toggle */}
        <Button
          variant="outline"
          onClick={onCalculator}
          className="gap-2"
        >
          <CalculatorIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Calculator</span>
        </Button>

        {/* Settings Button */}
        <Button
          variant="ghost"
          onClick={onSettings}
          className="gap-2"
        >
          <Cog6ToothIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Settings</span>
        </Button>

        {/* Leave Button */}
        <Button
          variant="default"
          onClick={onLeave}
          className="gap-2 bg-white text-black hover:bg-gray-100"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>
    </div>
  );
}
