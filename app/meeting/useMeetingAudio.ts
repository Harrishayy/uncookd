"use client";

import { useState, useRef } from "react";
import {
  startLiveTranscriptionWithWebSpeech,
  startRecordingChunks,
  uploadChunkForTranscription,
} from "./audioTranscriber";
import { cleanupAudioAndConnections } from "./cleanupAudio";

export interface TranscriptEntry {
  text: string;
  timestamp: number; // milliseconds since epoch
  isFinal: boolean;
}

export default function useMeetingAudio(
  SIGNALING_URL: string,
  options?: {
    onTranscription?: (entry: TranscriptEntry) => void;
  }
) {
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const recorderControllerRef = useRef<any | null>(null);
  const speechRecognitionControllerRef = useRef<any | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const startAudioLevelMonitoring = (stream: MediaStream) => {
    if (audioContextRef.current) audioContextRef.current.close();
    if (audioLevelCheckInterval.current) clearInterval(audioLevelCheckInterval.current);

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8; // Smooth audio level detection
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastAvg = 0;
    audioLevelCheckInterval.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      // Detect significant drop in dB (silence detection)
      const dBThreshold = 40;
      const dropThreshold = 15; // Detect if level drops by this amount
      const isCurrentlySpeaking = avg > dBThreshold;
      const hasSignificantDrop = lastAvg > dBThreshold && avg < (lastAvg - dropThreshold);
      
      setIsSpeaking(isCurrentlySpeaking || !hasSignificantDrop);
      lastAvg = avg;
    }, 100);
  };

  const startTranscriptionForStream = async (stream: MediaStream) => {
    try {
      const webRec = startLiveTranscriptionWithWebSpeech(
        (text, isFinal) => {
          const entry: TranscriptEntry = { text, isFinal, timestamp: Date.now() };
          setTranscript(prev => [...prev, entry]);
          // Log transcript when received
          const timestamp = new Date(entry.timestamp).toLocaleTimeString();
          console.log(
            `[Speech Recognition ${entry.isFinal ? '✓ FINAL' : '⏳ INTERIM'}] ${timestamp}:`,
            text
          );
          options?.onTranscription?.(entry);
        },
        (err) => {
          // Only log errors that aren't network-related (network errors are common and handled automatically)
          if (err?.error && err.error !== 'network' && err.error !== 'aborted') {
            console.warn("Speech recognition error:", err.error, err.message || '');
          }
        }
      );
      if (webRec?.available) {
        speechRecognitionControllerRef.current = webRec;
        return;
      }
    } catch {}

    const recorder = startRecordingChunks(stream, async (blob) => {
      try {
        console.log("[Transcription] Uploading audio chunk for transcription...");
        const res = await uploadChunkForTranscription(blob);
        if ((res as any).text) {
          const entry: TranscriptEntry = { text: (res as any).text, isFinal: true, timestamp: Date.now() };
          setTranscript(prev => [...prev, entry]);
          // Log transcript when received from server
          const timestamp = new Date(entry.timestamp).toLocaleTimeString();
          console.log(
            `[Server Transcription ✓ FINAL] ${timestamp}:`,
            (res as any).text
          );
          options?.onTranscription?.(entry);
        }
      } catch (err) {
        console.warn("Upload/transcription failed", err);
      }
    });
    recorderControllerRef.current = recorder;
  };

  const stopTranscription = async () => {
    if (recorderControllerRef.current) {
      await recorderControllerRef.current.stop().catch(() => {});
      recorderControllerRef.current = null;
    }
    if (speechRecognitionControllerRef.current) {
      await speechRecognitionControllerRef.current.stop().catch(() => {});
      speechRecognitionControllerRef.current = null;
    }
  };

  const handleMute = async (newMuted: boolean) => {
    setMuted(newMuted);
    if (!localStreamRef.current) return;

    const savedDevices =
      typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("meetingDevices") || "{}")
        : {};

    if (newMuted) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setIsSpeaking(false);
      if (audioContextRef.current) audioContextRef.current.close();
      if (audioLevelCheckInterval.current)
        clearInterval(audioLevelCheckInterval.current);
      await stopTranscription();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: savedDevices.audioInputId ? { deviceId: savedDevices.audioInputId } : true,
        });
        localStreamRef.current = stream;
        startAudioLevelMonitoring(stream);
        await startTranscriptionForStream(stream);
      } catch (err) {
        console.error("Error restarting audio stream:", err);
      }
    }
  };

  const handleDeafen = (newDeafened: boolean) => {
    setDeafened(newDeafened);
    const remote = remoteAudioRef.current || document.getElementById("remote-audio") as HTMLAudioElement;
    if (remote) remote.muted = newDeafened;
  };

  const cleanup = () =>
    cleanupAudioAndConnections({
      localStreamRef,
      pcRef,
      wsRef,
      audioContextRef,
      audioLevelCheckInterval,
      recorderControllerRef,
      speechRecognitionControllerRef,
    });

  return {
    muted,
    deafened,
    isSpeaking,
    transcript,
    localStreamRef,
    remoteAudioRef,
    handleMute,
    handleDeafen,
    cleanup,
    startAudioLevelMonitoring,
    startTranscriptionForStream,
    stopTranscription,
  };
}
