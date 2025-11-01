import MeetingUser from "./MeetingUser";
import { FaPlus } from "react-icons/fa";

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
}: {
  currentUser: User;
  otherUsers: User[];
  onAddClick: () => void;
}) {
  let users = [];
  if (otherUsers.length > 0){
    users = [currentUser, ...otherUsers];
  } else {
    users = [currentUser];
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-6">
        {users && users.map((user) => (
          <MeetingUser
            key={user.name}
            name={user.name}
            avatar_url={user.avatar_url}
            isMuted={user.isMuted}
            isSpeaking={user.isSpeaking}
          />
        ))}

        <div className="flex flex-col items-center justify-center p-2">
          <div
            className="w-56 h-40 bg-blue-500 rounded-xl flex flex-col items-center justify-center hover:bg-blue-600 cursor-pointer m-2 transition-all"
            onClick={onAddClick}
          >
            <FaPlus className="w-14 h-14 text-white" />
            <span className="font-semibold text-white text-lg mt-1">Add User</span>
          </div>
        </div>
      </div>
    </div>
  );
}
