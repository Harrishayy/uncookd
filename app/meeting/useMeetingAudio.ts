"use client";
import { useState, useRef } from "react";
import {
  startLiveTranscriptionWithWebSpeech,
  startRecordingChunks,
  uploadChunkForTranscription,
} from "./audioTranscriber";
import { cleanupAudioAndConnections } from "./cleanupAudio";

export default function useMeetingAudio(SIGNALING_URL: string) {
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

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
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    audioLevelCheckInterval.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setIsSpeaking(avg > 40);
    }, 100);
  };

  const startTranscriptionForStream = async (stream: MediaStream) => {
    try {
      const webRec = startLiveTranscriptionWithWebSpeech(
        (text, isFinal) => console.log("WebSpeech:", text, isFinal),
        (err) => console.warn("Speech error:", err)
      );
      if (webRec?.available) {
        speechRecognitionControllerRef.current = webRec;
        return;
      }
    } catch {}

    const recorder = startRecordingChunks(stream, async (blob) => {
      try {
        const res = await uploadChunkForTranscription(blob);
        if ((res as any).text) console.log("Server transcription:", (res as any).text);
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
    localStreamRef,
    remoteAudioRef,
    handleMute,
    handleDeafen,
    cleanup,
    startAudioLevelMonitoring,
    startTranscriptionForStream,
  };
}
