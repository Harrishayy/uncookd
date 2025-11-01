
"use client";

import Header from "../components/Header";
import MeetingUser from "../components/MeetingUser";
import AddUserModal from "../components/AddUserModal";
import React, { useState } from "react";
import { FaUserCircle, FaMicrophone, FaMicrophoneSlash, FaHeadphones, FaChalkboard, FaSignOutAlt } from "react-icons/fa";

const allUsers = [
    { name: "John Doe", avatar_url: "https://via.placeholder.com/150" },
    { name: "Jane Doe", avatar_url: "https://via.placeholder.com/150" },
    { name: "Alice Smith", avatar_url: "https://via.placeholder.com/150" },
    { name: "Bob Johnson", avatar_url: "https://via.placeholder.com/150" },
    { name: "Charlie Brown", avatar_url: "https://via.placeholder.com/150" },
    { name: "Eve Adams", avatar_url: "https://via.placeholder.com/150" }
];

export default function Page() {
    const [meetingUsers, setMeetingUsers] = useState<string[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [muted, setMuted] = useState(false);
    const [deafened, setDeafened] = useState(false);

    const handleAddUser = (user: { name: string; avatar_url: string }) => {
        if (!meetingUsers.includes(user.name)) {
            setMeetingUsers([...meetingUsers, user.name]);
        }
    };
    
    const currentUser = { name: 'You', avatar_url: '' };

    return (
        <div className="min-h-screen bg-[#1a1d21]">
            <Header />
            <div className="flex justify-center items-center min-h-[80vh]">
                <div className="bg-[#2d2f31] rounded-2xl shadow-2xl w-full max-w-6xl mx-8 my-8">
                    <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h1 className="text-2xl font-semibold text-white">
                                Active Meeting
                            </h1>
                            {/* Profile Icon for Current User */}
                            <div className="flex items-center gap-2">
                                {currentUser.avatar_url ? (
                                    <img
                                        src={currentUser.avatar_url}
                                        alt={currentUser.name}
                                        className="w-10 h-10 rounded-full border-2 border-blue-500 shadow"
                                    />
                                ) : (
                                    <FaUserCircle className="w-10 h-10 text-blue-500" />
                                )}
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
                    <div className="p-4">
                        <div className="flex flex-wrap gap-6">
                            {/* Always show current user as a MeetingUser */}
                            <MeetingUser 
                                key={currentUser.name} 
                                name={currentUser.name} 
                                avatar_url={currentUser.avatar_url}
                            />
                            {/* Other meeting users */}
                            {allUsers.filter(u => meetingUsers.includes(u.name)).map((user) => (
                                <MeetingUser 
                                    key={user.name} 
                                    name={user.name} 
                                    avatar_url={user.avatar_url}
                                />
                            ))}
                            {/* Add User button as a rounded rectangle - always last */}
                                                        <div className="flex flex-col items-center justify-center p-2">
                                                            <div className="w-56 h-40 bg-blue-500 rounded-xl shadow-lg flex flex-col items-center justify-center hover:bg-blue-600 transition-all duration-300 m-2 cursor-pointer" onClick={() => setShowModal(true)}>
                                                                <div className="flex flex-col items-center justify-center w-full h-full">
                                                                    <FaUserCircle className="w-14 h-14 text-white" />
                                                                    <span className="font-semibold text-white text-lg mt-1 truncate text-center">Add User</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                </div>
                                        </div>

                                        {/* Toolbar below meeting area */}
                                        <div className="p-4 border-t border-gray-700 flex items-center justify-center gap-4">
                                            <button
                                                onClick={() => setMuted(!muted)}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${muted ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                                                {muted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                                                <span className="hidden sm:inline">{muted ? 'Unmute' : 'Mute'}</span>
                                            </button>

                                            <button
                                                onClick={() => setDeafened(!deafened)}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${deafened ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
                                                <FaHeadphones />
                                                <span className="hidden sm:inline">{deafened ? 'Undeafen' : 'Deafen'}</span>
                                            </button>

                                            <button
                                                onClick={() => alert('Open whiteboard (placeholder)')}
                                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">
                                                <FaChalkboard />
                                                <span className="hidden sm:inline">Whiteboard</span>
                                            </button>

                                            <button
                                                onClick={() => alert('Leaving call')}
                                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors">
                                                <FaSignOutAlt />
                                                <span className="hidden sm:inline">Leave</span>
                                            </button>
                                        </div>
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
        </div>
    );
}