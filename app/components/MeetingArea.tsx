import MeetingUser from "./MeetingUser";
import { PlusIcon } from "@heroicons/react/24/outline";

export interface User {
  name: string;
  avatar_url: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

export default function MeetingArea({
  currentUser,
  otherUsers,
  onAddClick,
  onRemoveUser,
}: {
  currentUser: User;
  otherUsers: User[];
  onAddClick: () => void;
  onRemoveUser?: (userName: string) => void;
}) {
  const safeOtherUsers = otherUsers || [];
  const users = safeOtherUsers.length > 0 
    ? [currentUser, ...safeOtherUsers]
    : [currentUser];

  return (
    <div className="p-6 bg-gradient-to-b from-gray-900/50 to-transparent">
      <div className="flex flex-wrap gap-6 justify-center">
        {users.map((user) => (
          <MeetingUser
            key={user.name}
            name={user.name}
            avatar_url={user.avatar_url}
            isMuted={user.isMuted}
            isSpeaking={user.isSpeaking}
            isCurrentUser={user.name === currentUser.name}
            onRemove={user.name !== currentUser.name && onRemoveUser ? () => onRemoveUser(user.name) : undefined}
          />
        ))}

        {/* Add User Button */}
        <button
          onClick={onAddClick}
          className="group relative w-64 h-48 rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 hover:from-blue-500 hover:via-purple-500 hover:to-pink-500 border-2 border-dashed border-white/30 hover:border-white/50 shadow-xl hover:shadow-2xl hover:shadow-purple-500/30 transition-all duration-300 flex flex-col items-center justify-center gap-3 overflow-hidden"
        >
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/50 via-purple-600/50 to-pink-600/50 group-hover:from-blue-500/70 group-hover:via-purple-500/70 group-hover:to-pink-500/70 transition-all duration-300" />
          
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/20 group-hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-all group-hover:scale-110">
              <PlusIcon className="h-8 w-8 text-white" />
            </div>
            <span className="font-semibold text-white text-lg group-hover:scale-105 transition-transform">
              Add User
            </span>
          </div>

          {/* Shimmer effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </button>
      </div>
    </div>
  );
}
