// Lightweight audio level monitoring helper
// startAudioLevelMonitoring(stream, options, onLevel) -> returns controller { stop(): Promise<void>, audioContext }

export interface MonitoringController {
  stop: () => Promise<void> | void;
  audioContext?: AudioContext | null;
}

export function startAudioLevelMonitoring(
  stream: MediaStream,
  onLevel: (average: number) => void,
  options?: { fftSize?: number; intervalMs?: number }
): MonitoringController {
  const fftSize = options?.fftSize || 256;
  const intervalMs = options?.intervalMs || 100;

  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = fftSize;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  const id = setInterval(() => {
    try {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
      onLevel(average);
    } catch (e) {
      // ignore
    }
  }, intervalMs);

  return {
    audioContext,
    stop: async () => {
      clearInterval(id);
      try {
        // disconnect nodes if possible
        try {
          source.disconnect();
        } catch (e) {}
        try {
          analyser.disconnect();
        } catch (e) {}
        if (audioContext && audioContext.state !== 'closed') await audioContext.close();
      } catch (e) {
        // ignore
      }
    },
  };
}
