export function cleanupAudioAndConnections({
  localStreamRef,
  pcRef,
  wsRef,
  audioContextRef,
  audioLevelCheckInterval,
  recorderControllerRef,
  speechRecognitionControllerRef,
}: any) {
  // Stop all tracks
  if (localStreamRef.current) {
    localStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    localStreamRef.current = null;
  }

  if (pcRef.current) {
    pcRef.current.close();
    pcRef.current = null;
  }

  if (wsRef.current) {
    wsRef.current.close();
    wsRef.current = null;
  }

  if (audioContextRef.current) {
    audioContextRef.current.close();
    audioContextRef.current = null;
  }

  if (audioLevelCheckInterval.current) {
    clearInterval(audioLevelCheckInterval.current);
    audioLevelCheckInterval.current = null;
  }

  if (recorderControllerRef.current) {
    recorderControllerRef.current.stop().catch(() => {});
    recorderControllerRef.current = null;
  }

  if (speechRecognitionControllerRef.current) {
    speechRecognitionControllerRef.current.stop().catch(() => {});
    speechRecognitionControllerRef.current = null;
  }
}
