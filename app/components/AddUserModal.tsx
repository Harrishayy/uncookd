"use client";

import React, { useState } from "react";
import { FaUserCircle } from "react-icons/fa";

interface User {
  name: string;
  avatar_url: string;
}

interface AddUserModalProps {
  users: User[];
  onClose: () => void;
  onAdd: (user: User) => void;
  addedUsers: string[];
}

const AddUserModal: React.FC<AddUserModalProps> = ({ users, onClose, onAdd, addedUsers }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
  <h2 className="text-2xl font-extrabold mb-4 text-gray-900">Add User to Meeting</h2>
        <div className="overflow-y-auto max-h-64 mb-4">
          {users.map((user) => {
            const isAdded = addedUsers.includes(user.name);
            return (
              <div key={user.name} className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2">
                  <FaUserCircle className="w-8 h-8 text-blue-500" />
                  <span className="text-gray-800 font-semibold">{user.name}</span>
                </div>
                <button
                  className={`transition-colors px-2 py-1 rounded-full text-white ${isAdded ? "bg-green-500" : "bg-blue-500 hover:bg-blue-600"}`}
                  onClick={() => onAdd(user)}
                  disabled={isAdded}
                >
                  {isAdded ? "✓" : "+"}
                </button>
              </div>
            );
          })}
        </div>
        <button className="mt-2 px-4 py-2 bg-gray-700 text-white rounded" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

export default AddUserModal;
