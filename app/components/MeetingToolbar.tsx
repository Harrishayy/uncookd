"use client";
import React from "react";
import { FaMicrophone, FaMicrophoneSlash, FaHeadphones, FaChalkboard, FaSignOutAlt, FaCog } from "react-icons/fa";

export default function MeetingToolbar({
  muted,
  deafened,
  onMute,
  onDeafen,
  onLeave,
  onSettings,
}: {
  muted: boolean;
  deafened: boolean;
  onMute: (v: boolean) => void;
  onDeafen: (v: boolean) => void;
  onLeave: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="p-4 border-t border-gray-700 flex items-center justify-center gap-4">
      <button
        onClick={() => onMute(!muted)}
        className={`flex items-center gap-2 px-4 py-2 rounded-md ${muted ? "bg-yellow-500 text-black" : "bg-gray-700 text-white hover:bg-gray-600"}`}
      >
        {muted ? <FaMicrophoneSlash /> : <FaMicrophone />}
        <span className="hidden sm:inline">{muted ? "Unmute" : "Mute"}</span>
      </button>

      <button
        onClick={() => onDeafen(!deafened)}
        className={`flex items-center gap-2 px-4 py-2 rounded-md ${deafened ? "bg-yellow-500 text-black" : "bg-gray-700 text-white hover:bg-gray-600"}`}
      >
        <FaHeadphones />
        <span className="hidden sm:inline">{deafened ? "Undeafen" : "Deafen"}</span>
      </button>

      <button
        onClick={() => alert("Whiteboard (placeholder)")}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600"
      >
        <FaChalkboard />
        <span className="hidden sm:inline">Whiteboard</span>
      </button>

      <button
        onClick={onLeave}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
      >
        <FaSignOutAlt />
        <span className="hidden sm:inline">Leave</span>
      </button>

      <button
        onClick={onSettings}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600"
      >
        <FaCog />
        <span className="hidden sm:inline">Settings</span>
      </button>
    </div>
  );
}
