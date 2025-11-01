"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";
import AddUserModal from "../components/AddUserModal";
import DeviceConfigModal from "../components/DeviceConfigModal";
import useMeetingAudio from "./useMeetingAudio";
import MeetingArea from "../components/MeetingArea";
import MeetingToolbar from "../components/MeetingToolbar";
import { FaUserCircle } from "react-icons/fa";

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
    if (!meetingUsers.includes(user.name)) setMeetingUsers([...meetingUsers, user.name]);
  };

  const currentUser = { name: "You", avatar_url: "" };

  useEffect(() => {
    const saved = typeof window !== "undefined" && localStorage.getItem("meetingDevices");
    if (!saved) setShowConfig(true);
    return () => cleanup();
  }, []);

  return (
    <div className="min-h-screen bg-[#1a1d21]">
      <Header />
      <div className="flex justify-center items-center min-h-[80vh]">
        <audio id="local-preview" className="hidden" />
        <audio id="remote-audio" ref={remoteAudioRef} className="hidden" />

        <div className="bg-[#2d2f31] rounded-2xl shadow-2xl w-full max-w-6xl mx-8 my-8">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold text-white">Active Meeting</h1>
              <div className="flex items-center gap-2">
                <FaUserCircle className="w-10 h-10 text-blue-500" />
                <span className="text-white font-medium">{currentUser.name}</span>
              </div>
            </div>
            <button
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              onClick={() => setShowModal(true)}
            >
              Add User
            </button>
          </div>

          <MeetingArea
            currentUser={currentUser}
            meetingUsers={meetingUsers}
            onAddClick={() => setShowModal(true)}
          />

          <MeetingToolbar
            muted={muted}
            deafened={deafened}
            onMute={handleMute}
            onDeafen={handleDeafen}
            onLeave={() => {
              cleanup();
              router.push("/");
            }}
            onSettings={() => setShowConfig(true)}
          />
        </div>
      </div>

      {showModal && (
        <AddUserModal
          users={allUsers}
          onClose={() => setShowModal(false)}
          onAdd={handleAddUser}
          addedUsers={meetingUsers}
        />
      )}

      {showConfig && (
        <DeviceConfigModal
          onClose={() => setShowConfig(false)}
          onConfirm={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}
