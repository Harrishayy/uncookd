"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";
import AddUserModal from "../components/AddUserModal";
import DeviceConfigModal from "../components/DeviceConfigModal";
import TldrawBoardEmbedded from "../components/TldrawBoardEmbedded";
import DesmosCalculator from "../components/DesmosCalculator";
import MeetingArea from "../components/MeetingArea";
import MeetingToolbar from "../components/MeetingToolbar";
import { UserCircleIcon, UserPlusIcon } from "@heroicons/react/24/solid";
import { Transition } from "@headlessui/react";
import Footer from "../components/Footer";
import useMeetingAudio from "./useMeetingAudio";

const allUsers = [
  { name: "Thomas", avatar_url: "https://via.placeholder.com/150" },
  { name: "Tara", avatar_url: "https://via.placeholder.com/150" },
  { name: "Ethan", avatar_url: "https://via.placeholder.com/150" },
  { name: "Harrish", avatar_url: "https://via.placeholder.com/150" }
];

export default function Page() {
  const router = useRouter();
  const [meetingUsers, setMeetingUsers] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState<any>(null);

  const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://localhost:8888";

  const {
    muted,
    deafened,
    isSpeaking,
    transcript,
    localStreamRef,
    remoteAudioRef,
    handleMute,
    handleDeafen,
    cleanup,
    startAudioLevelMonitoring,
    startTranscriptionForStream,
    } = useMeetingAudio(SIGNALING_URL, {
    onTranscription: async (entry) => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      console.log(
        `[Transcript ${entry.isFinal ? '✓ FINAL' : '⏳ INTERIM'}] ${timestamp}:`,
        entry.text
      );
      console.log('Full entry:', entry);
      
      // Send transcript to backend and receive audio response
      if (entry.isFinal && entry.text.trim()) {
        try {
          const response = await fetch('/api/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: entry.text,
              timestamp: entry.timestamp,
              isFinal: entry.isFinal,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            console.log('[Transcript API] Response:', data);
            
            // Play audio response if available
            if (data.audio) {
              try {
                // Decode base64 audio
                const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
                const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                // Create and play audio element
                const audio = new Audio(audioUrl);
                audio.play().catch(err => {
                  console.error('[Transcript API] Error playing audio:', err);
                });
                
                // Clean up URL after playback
                audio.onended = () => {
                  URL.revokeObjectURL(audioUrl);
                };
              } catch (audioError) {
                console.error('[Transcript API] Error processing audio:', audioError);
              }
            }
          } else {
            console.error('[Transcript API] Request failed:', response.status);
          }
        } catch (error) {
          console.error('[Transcript API] Error sending transcript:', error);
        }
      }
    },
  });

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
    setMeetingUsers((prev) => prev.filter((name) => name !== userName));
  };

  const currentUser = { name: "You", avatar_url: "" };

  // Preload user avatar images
  useEffect(() => {
    allUsers.forEach((user) => {
      if (user.avatar_url) {
        const img = new window.Image();
        img.src = user.avatar_url;
      }
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initAudio = async () => {
      try {
        // Ask for microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) return;

        localStreamRef.current = stream;

        // Start audio level monitoring
        startAudioLevelMonitoring(stream);

        // Start transcription (WebSpeech API or chunked fallback)
        await startTranscriptionForStream(stream);
      } catch (err) {
        console.error("Failed to access microphone:", err);
      }
    };

    initAudio();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [localStreamRef, startAudioLevelMonitoring, startTranscriptionForStream, cleanup]);

  return (
    <div className="min-h-screen bg-gray-950">
      <Header />
      <div className="flex flex-col justify-center items-center min-h-[80vh] py-8 gap-6">
        <audio id="local-preview" className="hidden" />
        <audio id="remote-audio" ref={remoteAudioRef} className="hidden" />

        <div className="relative z-20 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-7xl mx-8 overflow-hidden">
          <div className="p-6 border-b border-gray-700 bg-gray-900/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isSpeaking ? "bg-green-400 animate-pulse" : "bg-white"
                    }`}
                  />
                  <h1 className="text-2xl font-bold text-white">Active Meeting</h1>
                </div>
                <div className="h-6 w-px bg-gray-700" />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700">
                  <UserCircleIcon className="w-5 h-5 text-gray-300" />
                  <span className="text-gray-100 font-medium text-sm">{currentUser.name}</span>
                </div>
              </div>
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-black font-medium hover:bg-gray-100 border border-gray-600 transition-all duration-200"
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
            otherUsers={allUsers.filter((u) => meetingUsers.includes(u.name))}
            onAddClick={() => setShowModal(true)}
            onRemoveUser={handleRemoveUser}
          />

          {/* Toolbar */}
          <MeetingToolbar
            muted={muted}
            deafened={deafened}
            onMute={(newMuted) => handleMute(newMuted)}
            onDeafen={(newDeafened) => handleDeafen(newDeafened)}
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
        {showWhiteboard && (
          <Transition
            show={showWhiteboard}
            enter="transition-all duration-300 ease-out"
            enterFrom="opacity-0 transform scale-95 -translate-y-4"
            enterTo="opacity-100 transform scale-100 translate-y-0"
            leave="transition-all duration-200 ease-in"
            leaveFrom="opacity-100 transform scale-100 translate-y-0"
            leaveTo="opacity-0 transform scale-95 -translate-y-4"
          >
            <div className="relative z-10 w-full max-w-7xl mx-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-700 bg-gray-900/80">
                <h2 className="text-xl font-bold text-white">Whiteboard</h2>
              </div>
              <div className="h-[600px] bg-white">
                <TldrawBoardEmbedded
                  boardId="meeting-whiteboard"
                  agentPrompt={agentPrompt}
                  showAgentUI={true}
                  onAgentComplete={() => {}}
                  onAgentError={() => {}}
                  onPromptSubmit={() => {}}
                />
              </div>
            </div>
          </Transition>
        )}

        {/* Desmos Calculator */}
        <DesmosCalculator isOpen={showCalculator} onClose={() => setShowCalculator(false)} />
      </div>

      {/* Modals */}
      <AddUserModal
        users={allUsers}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAdd={handleAddUser}
        addedUsers={meetingUsers}
      />

      <DeviceConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} onConfirm={() => setShowConfig(false)} />
      <Footer />
    </div>
  );
}
