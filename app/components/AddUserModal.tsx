"use client";

import React from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { UserPlusIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Image from "next/image";

interface User {
  name: string;
  avatar_url: string;
}

interface AddUserModalProps {
  users: User[];
  onClose: () => void;
  onAdd: (user: User) => void;
  addedUsers: string[];
  isOpen: boolean;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ 
  users, 
  onClose, 
  onAdd, 
  addedUsers,
  isOpen 
}) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 text-left align-middle shadow-2xl ring-1 ring-white/10 transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
                  >
                    Add User to Meeting
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                  {users.map((user) => {
                    const isAdded = addedUsers.includes(user.name);
                    return (
                      <div
                        key={user.name}
                        className="group flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {user.avatar_url ? (
                              <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white/20 group-hover:ring-blue-400/50 transition-all">
                                <Image
                                  src={user.avatar_url}
                                  alt={user.name}
                                  width={48}
                                  height={48}
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                                <UserPlusIcon className="h-6 w-6 text-white" />
                              </div>
                            )}
                          </div>
                          <span className="text-white font-medium">{user.name}</span>
                        </div>
                        <button
                          onClick={() => onAdd(user)}
                          disabled={isAdded}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                            isAdded
                              ? "bg-emerald-500/20 text-emerald-400 cursor-not-allowed border border-emerald-500/30"
                              : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/25"
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <CheckIcon className="h-4 w-4" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <UserPlusIcon className="h-4 w-4" />
                              <span>Add</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AddUserModal;
