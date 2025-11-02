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
    <div className="p-6 bg-gray-900">
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
          className="group relative w-64 h-48 rounded-xl bg-gray-800/50 border-2 border-dashed border-gray-700 hover:border-gray-500 transition-all duration-300 flex flex-col items-center justify-center gap-3 overflow-hidden"
        >
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-700/50 group-hover:bg-gray-700/70 flex items-center justify-center transition-all group-hover:scale-110 border border-gray-600 group-hover:border-gray-500">
              <PlusIcon className="h-8 w-8 text-gray-300" />
            </div>
            <span className="font-semibold text-gray-200 text-lg group-hover:scale-105 transition-transform">
              Add User
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
