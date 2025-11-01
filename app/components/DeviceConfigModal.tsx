"use client";

import React, { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
  onConfirm: (selection: { audioInputId?: string; audioOutputId?: string }) => void;
}

export default function DeviceConfigModal({ onClose, onConfirm }: Props) {
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
        // Ensure we have permission to see labels where possible
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          // ignore - permissions may be denied but enumerateDevices still works in many browsers
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Meeting setup</h2>
        {loading ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">Detecting audio devices…</p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Microphone</label>
              <select
                value={selectedInput}
                onChange={e => setSelectedInput(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              >
                {inputs.map(inp => (
                  <option key={inp.deviceId} value={inp.deviceId}>{inp.label || `Microphone ${inputs.indexOf(inp) + 1}`}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Headphones / Output</label>
              <select
                value={selectedOutput}
                onChange={e => setSelectedOutput(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              >
                {outputs.map(out => (
                  <option key={out.deviceId} value={out.deviceId}>{out.label || `Speaker ${outputs.indexOf(out) + 1}`}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700" onClick={onClose}>Cancel</button>
              <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={handleConfirm}>Join meeting</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
