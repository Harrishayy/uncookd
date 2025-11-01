"use client";
import { useState, useEffect } from 'react';
import { FaUserCircle } from "react-icons/fa";

interface MeetingUserProps {
  name: string;
  avatar_url: string;
  isMuted?: boolean;
}

function MeetingUser({ name, avatar_url, isMuted = false }: MeetingUserProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [imageError, setImageError] = useState(false);

  const toggleSpeaking = () => {
    setIsSpeaking(!isSpeaking);
  };

  // Generate initials for fallback
  const initials = name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getRandomColor = () => {
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
    return colors[name.length % colors.length];
  };

  return (
    <div className="flex flex-col items-center justify-center p-2">
      <div className={`w-56 h-40 bg-blue-500 rounded-xl shadow-lg flex flex-col items-center justify-center hover:bg-blue-600 transition-all duration-300 m-2 ${isSpeaking ? 'ring-4 ring-green-500 ring-opacity-75' : ''}`}>
        <div className="flex flex-col items-center justify-center w-full h-full">
          <div onClick={toggleSpeaking} className="flex items-center justify-center mb-2 cursor-pointer">
            {!imageError && avatar_url ? (
              <img
                src={avatar_url}
                alt={name}
                className={`w-16 h-16 rounded-full object-cover border-2 border-white shadow transition-transform duration-300 ${isSpeaking ? '-translate-y-2' : ''}`}
                onError={() => setImageError(true)}
              />
            ) : (
              <FaUserCircle className={`w-16 h-16 text-white transition-transform duration-300 ${isSpeaking ? '-translate-y-2' : ''}`} />
            )}
          </div>
          <p className="font-semibold text-white text-lg mt-1 truncate text-center">
            {name}
          </p>
          {isSpeaking && (
            <div className="dot-wave" aria-hidden>
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MeetingUser;
