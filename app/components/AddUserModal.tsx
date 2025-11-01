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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-gray-900 border border-gray-700 p-6 text-left align-middle shadow-2xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-2xl font-bold text-gray-100"
                  >
                    Add User to Meeting
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent hover:border-gray-600 transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                  {users.map((user) => {
                    const isAdded = addedUsers.includes(user.name);
                    return (
                      <div
                        key={user.name}
                        className="group flex items-center justify-between p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800/70 border border-gray-700 hover:border-gray-600 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {user.avatar_url ? (
                              <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-gray-700 group-hover:ring-gray-600 transition-all">
                                <Image
                                  src={user.avatar_url}
                                  alt={user.name}
                                  width={48}
                                  height={48}
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                                <UserPlusIcon className="h-6 w-6 text-black" />
                              </div>
                            )}
                          </div>
                          <span className="text-gray-100 font-medium">{user.name}</span>
                        </div>
                        <button
                          onClick={() => onAdd(user)}
                          disabled={isAdded}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                            isAdded
                              ? "bg-gray-800/50 text-gray-500 cursor-not-allowed border border-gray-700"
                              : "bg-white text-black hover:bg-gray-100 border border-gray-600"
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
