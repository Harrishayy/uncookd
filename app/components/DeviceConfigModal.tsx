"use client";

import React, { useEffect, useState, Fragment } from 'react';
import { Dialog, Transition } from "@headlessui/react";
import { Cog6ToothIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
  onClose: () => void;
  onConfirm: (selection: { audioInputId?: string; audioOutputId?: string }) => void;
  isOpen: boolean;
}

export default function DeviceConfigModal({ onClose, onConfirm, isOpen }: Props) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | undefined>(undefined);
  const [selectedOutput, setSelectedOutput] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getDevices = async () => {
      setLoading(true);
      try {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          // ignore - permissions may be denied but enumerateDevices still works
        }

        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioIn = devs.filter(d => d.kind === 'audioinput');
        const audioOut = devs.filter(d => d.kind === 'audiooutput');
        setInputs(audioIn);
        setOutputs(audioOut);
        if (audioIn[0]) setSelectedInput(audioIn[0].deviceId);
        if (audioOut[0]) setSelectedOutput(audioOut[0].deviceId);
      } catch (err: any) {
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      getDevices();
    } else {
      setError('No media device support');
      setLoading(false);
    }
  }, []);

  const handleConfirm = () => {
    onConfirm({ audioInputId: selectedInput, audioOutputId: selectedOutput });
    onClose();
  };

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
                    className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-2"
                  >
                    <Cog6ToothIcon className="h-6 w-6 text-blue-400" />
                    Meeting Setup
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {loading ? (
                  <div className="py-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                    <p className="mt-4 text-sm text-gray-400">Detecting audio devices…</p>
                  </div>
                ) : error ? (
                  <div className="py-4 px-4 rounded-xl bg-red-500/20 border border-red-500/30">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Microphone
                      </label>
                      <select
                        value={selectedInput}
                        onChange={e => setSelectedInput(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        {inputs.map(inp => (
                          <option key={inp.deviceId} value={inp.deviceId} className="bg-gray-800">
                            {inp.label || `Microphone ${inputs.indexOf(inp) + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Headphones / Output
                      </label>
                      <select
                        value={selectedOutput}
                        onChange={e => setSelectedOutput(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        {outputs.map(out => (
                          <option key={out.deviceId} value={out.deviceId} className="bg-gray-800">
                            {out.label || `Speaker ${outputs.indexOf(out) + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4">
                      <button
                        className="px-6 py-2.5 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-all"
                        onClick={onClose}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:from-blue-600 hover:to-purple-600 shadow-lg shadow-blue-500/25 transition-all"
                        onClick={handleConfirm}
                      >
                        Join Meeting
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
