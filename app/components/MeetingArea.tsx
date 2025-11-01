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
    <div className="p-6 bg-black">
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
          className="group relative w-64 h-48 rounded-xl bg-black border-2 border-dashed border-gray-800 hover:border-white transition-all duration-300 flex flex-col items-center justify-center gap-3 overflow-hidden"
        >
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-all group-hover:scale-110 border border-gray-800 group-hover:border-white">
              <PlusIcon className="h-8 w-8 text-white" />
            </div>
            <span className="font-semibold text-white text-lg group-hover:scale-105 transition-transform">
              Add User
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
