"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";
import AddUserModal from "../components/AddUserModal";
import DeviceConfigModal from "../components/DeviceConfigModal";
import TldrawBoardEmbedded from "../components/TldrawBoardEmbedded";
import DesmosCalculator from "../components/DesmosCalculator";
import useMeetingAudio from "./useMeetingAudio";
import MeetingArea from "../components/MeetingArea";
import MeetingToolbar from "../components/MeetingToolbar";
import { UserCircleIcon, UserPlusIcon } from "@heroicons/react/24/solid";
import { Transition } from "@headlessui/react";
import Footer from "../components/Footer"

const allUsers = [
  { name: "John Doe", avatar_url: "https://via.placeholder.com/150" },
  { name: "Jane Doe", avatar_url: "https://via.placeholder.com/150" },
  { name: "Alice Smith", avatar_url: "https://via.placeholder.com/150" },
  { name: "Bob Johnson", avatar_url: "https://via.placeholder.com/150" },
  { name: "Charlie Brown", avatar_url: "https://via.placeholder.com/150" },
  { name: "Eve Adams", avatar_url: "https://via.placeholder.com/150" },
];

export default function Page() {
  const router = useRouter();
  const [meetingUsers, setMeetingUsers] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState<any>(null);

  const SIGNALING_URL =
    process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://localhost:8888";

  const {
    muted,
    deafened,
    isSpeaking,
    remoteAudioRef,
    handleMute,
    handleDeafen,
    cleanup,
  } = useMeetingAudio(SIGNALING_URL);

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
    setMeetingUsers((prev) => prev.filter(name => name !== userName));
  };

  const currentUser = { name: "You", avatar_url: "" };

  useEffect(() => {
    const saved = typeof window !== "undefined" && localStorage.getItem("meetingDevices");
    if (!saved) setShowConfig(true);
    return () => cleanup();
  }, []);

  const handleAgentComplete = () => {
    console.log('Agent completed task');
    setAgentPrompt(null);
  };

  const handleAgentError = (error: any) => {
    console.error('Agent error:', error);
  };

  const handlePromptSubmit = (prompt: string) => {
    setAgentPrompt({ message: prompt, type: 'user' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <Header />
      <div className="flex flex-col justify-center items-center min-h-[80vh] py-8 gap-6">
        <audio id="local-preview" className="hidden" />
        <audio id="remote-audio" ref={remoteAudioRef} className="hidden" />

        <div className="bg-gradient-to-br from-gray-900/90 via-gray-800/90 to-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-7xl mx-8 border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-white/10 bg-gradient-to-r from-gray-900/50 to-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                    Active Meeting
                  </h1>
                </div>
                <div className="h-6 w-px bg-white/20" />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <UserCircleIcon className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-medium text-sm">{currentUser.name}</span>
                </div>
              </div>
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:from-blue-600 hover:to-purple-600 shadow-lg shadow-blue-500/25 hover:scale-105 active:scale-95 transition-all"
                onClick={() => setShowModal(true)}
              >
                <UserPlusIcon className="h-5 w-5" />
                <span>Add User</span>
              </button>
            </div>
          </div>

          {/* Meeting Area */}
          <MeetingArea
            currentUser={currentUser}
            otherUsers={allUsers.filter(u => meetingUsers.includes(u.name))}
            onAddClick={() => setShowModal(true)}
            onRemoveUser={handleRemoveUser}
          />

          {/* Toolbar */}
          <MeetingToolbar
            muted={muted}
            deafened={deafened}
            onMute={handleMute}
            onDeafen={handleDeafen}
            onWhiteboard={() => setShowWhiteboard(!showWhiteboard)}
            onCalculator={() => setShowCalculator(!showCalculator)}
            onLeave={() => {
              cleanup();
              router.push("/");
            }}
            onSettings={() => setShowConfig(true)}
          />
        </div>

        {/* Whiteboard */}
        <Transition
          show={showWhiteboard}
          enter="transition-all duration-300 ease-out"
          enterFrom="opacity-0 transform scale-95 -translate-y-4"
          enterTo="opacity-100 transform scale-100 translate-y-0"
          leave="transition-all duration-200 ease-in"
          leaveFrom="opacity-100 transform scale-100 translate-y-0"
          leaveTo="opacity-0 transform scale-95 -translate-y-4"
        >
          <div className="w-full max-w-7xl mx-8 bg-gradient-to-br from-gray-900/90 via-gray-800/90 to-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-gray-900/50 to-gray-800/50">
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Whiteboard
              </h2>
            </div>
            <div className="h-[600px] bg-white">
              <TldrawBoardEmbedded
                boardId="meeting-whiteboard"
                agentPrompt={agentPrompt}
                showAgentUI={true}
                onAgentComplete={handleAgentComplete}
                onAgentError={handleAgentError}
                onPromptSubmit={handlePromptSubmit}
              />
            </div>
          </div>
        </Transition>
      </div>

      {/* Modals */}
      <AddUserModal
        users={allUsers}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAdd={handleAddUser}
        addedUsers={meetingUsers}
      />

      <DeviceConfigModal
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        onConfirm={() => setShowConfig(false)}
      />

      {/* Desmos Calculator */}
      <DesmosCalculator
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
      />
    </div>
  );
}
