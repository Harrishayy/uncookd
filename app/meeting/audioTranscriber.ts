// Lightweight audio transcription helpers for the browser.
// - Uses the Web Speech API (SpeechRecognition) when available (best client-side UX).
// - Falls back to MediaRecorder chunking when SpeechRecognition is not available.
// - Includes robust Voice Activity Detection (VAD) to only process speech after user finishes talking.
//
// Exports:
// - startLiveTranscriptionWithWebSpeech(onResult, onError, options): uses SpeechRecognition with VAD
// - startRecordingChunks(stream, onChunk, options): records a MediaStream and emits audio blobs periodically
// - stopRecording(recordController): stops recording and returns collected Blob (if requested)
//
// Note: For reliable server-side transcription (Whisper/AssemblyAI/etc.) you'll need an API endpoint that accepts audio blobs.

export type TranscriptionCallback = (text: string, isFinal?: boolean) => void;
export type ChunkCallback = (blob: Blob) => void;

export interface VADOptions {
  /** Stream to monitor for voice activity */
  stream?: MediaStream;
  /** Silence duration in ms before finalizing (default: 2000) */
  silenceDurationMs?: number;
  /** Audio level threshold for detecting speech (default: 30) */
  audioLevelThreshold?: number;
  /** Minimum transcript length to consider (default: 3 characters) */
  minTranscriptLength?: number;
}

// ----- Web Speech API helper with robust VAD -----
export function startLiveTranscriptionWithWebSpeech(
  onResult: TranscriptionCallback,
  onError?: (err: any) => void,
  lang = "en-US",
  vadOptions?: VADOptions
) {
  const win = typeof window !== "undefined" ? (window as any) : null;
  const SpeechRecognition = win?.SpeechRecognition || win?.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const err = new Error("Web Speech API SpeechRecognition not available in this browser");
    if (onError) onError(err);
    return { available: false, stop: async () => {} };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  
  // Optimized VAD configuration - faster and more robust
  const SILENCE_DURATION_MS = vadOptions?.silenceDurationMs ?? 1500; // Reduced to 1.5s for faster response
  const ADAPTIVE_SILENCE_MS = 800; // Adaptive silence after speech stops
  const AUDIO_LEVEL_THRESHOLD = vadOptions?.audioLevelThreshold ?? 50; // Lower threshold for quieter speech
  const MIN_TRANSCRIPT_LENGTH = vadOptions?.minTranscriptLength ?? 50; // Require at least 15 chars
  const MIN_SPEECH_DURATION_MS = 300; // Reduced minimum speech duration for faster response
  const SPEECH_ENERGY_THRESHOLD = 30; // Frequency-based energy threshold
  
  // Track state for robust voice activity detection
  let silenceTimer: NodeJS.Timeout | null = null;
  let lastInterimText = "";
  let lastSpeechTimestamp = 0;
  let firstSpeechTimestamp = 0; // Track when speech first started
  let pendingTranscript = ""; // Buffer for transcripts waiting for silence confirmation
  let allFinalText = ""; // Accumulate ALL final results across all events
  let lastProcessedIndex = -1; // Track which results we've already processed
  let audioLevelMonitor: { stop: () => void } | null = null;
  let isSpeechActive = false;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let speechEnergyHistory: number[] = []; // Track speech energy for adaptive detection
  let consecutiveSilenceFrames = 0; // Count consecutive silence frames
  const ENERGY_HISTORY_SIZE = 5; // Keep last 5 energy measurements
  
  // Set up audio level monitoring for VAD if stream is provided
  if (vadOptions?.stream) {
    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = audioContext.createMediaStreamSource(vadOptions.stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const timeDataArray = new Uint8Array(analyser.fftSize);
      
      const checkInterval = setInterval(() => {
        if (!analyser) return;
        
        // Get frequency data for volume-based detection
        analyser.getByteFrequencyData(dataArray);
        const avgVolume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        // Get time domain data for energy-based detection (more accurate for speech)
        analyser.getByteTimeDomainData(timeDataArray);
        let sumSquares = 0;
        for (let i = 0; i < timeDataArray.length; i++) {
          const normalized = (timeDataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const energy = Math.sqrt(sumSquares / timeDataArray.length) * 100; // Convert to 0-100 scale
        
        // Update energy history for adaptive thresholding
        speechEnergyHistory.push(energy);
        if (speechEnergyHistory.length > ENERGY_HISTORY_SIZE) {
          speechEnergyHistory.shift();
        }
        
        // Calculate adaptive threshold based on recent speech energy
        const avgEnergy = speechEnergyHistory.reduce((a, b) => a + b, 0) / speechEnergyHistory.length;
        const adaptiveThreshold = Math.max(AUDIO_LEVEL_THRESHOLD, avgEnergy * 0.3);
        
        // Dual detection: volume OR energy-based (more robust)
        const wasSpeaking = isSpeechActive;
        isSpeechActive = avgVolume > adaptiveThreshold || energy > SPEECH_ENERGY_THRESHOLD;
        
        if (isSpeechActive) {
          consecutiveSilenceFrames = 0;
          if (!wasSpeaking) {
            // Speech just started - record first speech timestamp
            firstSpeechTimestamp = Date.now();
            console.log('[VAD] Speech detected - energy:', energy.toFixed(2), 'volume:', avgVolume.toFixed(2));
          }
          lastSpeechTimestamp = Date.now();
          // Clear silence timer if user is speaking
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
        } else {
          consecutiveSilenceFrames++;
          
          // Speech stopped - use adaptive silence detection
          if (wasSpeaking) {
            const speechDuration = Date.now() - firstSpeechTimestamp;
            const timeSinceLastSpeech = Date.now() - lastSpeechTimestamp;
            
            // Adaptive silence duration: shorter if we have more text, longer if less
            const transcriptLength = pendingTranscript.trim().length;
            const adaptiveSilence = transcriptLength > 50 
              ? ADAPTIVE_SILENCE_MS  // Shorter wait for longer sentences (likely complete)
              : SILENCE_DURATION_MS; // Longer wait for short phrases (might continue)
            
            // Start silence timer if:
            // 1. We've had at least MIN_SPEECH_DURATION_MS of speech
            // 2. It's been a moment since speech stopped
            // 3. We have a pending transcript
            if (speechDuration >= MIN_SPEECH_DURATION_MS && timeSinceLastSpeech > 50) {
              if (pendingTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH) {
                if (silenceTimer) clearTimeout(silenceTimer);
                
                // Use shorter silence for faster response
                silenceTimer = setTimeout(() => {
                  // Verify silence is maintained (check consecutive frames)
                  if (consecutiveSilenceFrames >= 3 && !isSpeechActive && pendingTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH) {
                    console.log('[VAD] Finalizing after adaptive silence:', pendingTranscript.substring(0, 50));
                    onResult(pendingTranscript.trim(), true);
                    // Reset for next utterance
                    pendingTranscript = "";
                    allFinalText = "";
                    lastInterimText = "";
                    lastProcessedIndex = -1;
                    speechEnergyHistory = [];
                  }
                  silenceTimer = null;
                }, adaptiveSilence);
              }
            }
          } else if (consecutiveSilenceFrames > 10 && pendingTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH) {
            // If we've had sustained silence and have text, finalize it
            if (!silenceTimer) {
              silenceTimer = setTimeout(() => {
                if (!isSpeechActive && pendingTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH) {
                  console.log('[VAD] Finalizing after sustained silence:', pendingTranscript.substring(0, 50));
                  onResult(pendingTranscript.trim(), true);
                  pendingTranscript = "";
                  allFinalText = "";
                  lastInterimText = "";
                  lastProcessedIndex = -1;
                  speechEnergyHistory = [];
                }
                silenceTimer = null;
              }, 500); // Very short wait after sustained silence
            }
          }
        }
      }, 50); // Check more frequently for faster response (50ms instead of 100ms)
      
      audioLevelMonitor = {
        stop: () => {
          clearInterval(checkInterval);
          if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
          }
        }
      };
    } catch (e) {
      console.warn('[VAD] Could not set up audio level monitoring:', e);
    }
  }

  recognition.onresult = (event: any) => {
    // Process ALL results, not just from resultIndex
    // The API accumulates all results in event.results array
    let currentInterim = "";
    let newFinalText = "";
    
    // Process only NEW results (ones we haven't seen yet)
    for (let i = Math.max(0, lastProcessedIndex + 1); i < event.results.length; i++) {
      const res = event.results[i];
      const t = res[0]?.transcript || "";
      
      if (res.isFinal) {
        // Add to accumulated final text (these are confirmed words)
        // Check if this final text is new (not already in allFinalText)
        if (!allFinalText.includes(t) || t.length > allFinalText.length) {
          newFinalText += (newFinalText ? " " : "") + t;
          allFinalText = (allFinalText + (allFinalText ? " " : "") + t).trim();
        }
        lastProcessedIndex = i;
      } else {
        // This is interim (still being processed)
        // Always use the latest interim result for better accumulation
        if (i === event.results.length - 1) {
          currentInterim = t;
        }
      }
    }
    
    // Build complete transcript: all final text + current interim
    // Smart merging: always use the longest/most complete version
    let completeTranscript = allFinalText.trim();
    if (currentInterim.trim()) {
      // If interim is longer or contains the final text, prefer interim
      if (currentInterim.length > completeTranscript.length || 
          currentInterim.toLowerCase().includes(completeTranscript.toLowerCase())) {
        completeTranscript = currentInterim.trim();
      } else if (!completeTranscript) {
        // No final text yet, use interim
        completeTranscript = currentInterim.trim();
      } else {
        // Merge: append interim if it adds new content
        const lastWords = completeTranscript.split(' ').slice(-3).join(' ').toLowerCase();
        const interimFirstWords = currentInterim.trim().split(' ').slice(0, 3).join(' ').toLowerCase();
        
        if (!currentInterim.toLowerCase().includes(lastWords) && interimFirstWords !== lastWords) {
          completeTranscript = (completeTranscript + " " + currentInterim.trim()).trim();
        }
      }
    }

    // Update pending transcript with complete accumulated text
    if (completeTranscript.trim()) {
      // Always use the longest version to ensure we capture everything
      if (completeTranscript.length > pendingTranscript.length) {
        pendingTranscript = completeTranscript.trim();
      }
      lastInterimText = currentInterim.trim();

      // Log for debugging (less verbose)
      if (newFinalText || currentInterim !== lastInterimText) {
        console.log(`[VAD] Accumulated: "${pendingTranscript.substring(0, 60)}${pendingTranscript.length > 60 ? '...' : ''}" (${pendingTranscript.length} chars)`);
      }
    }
    
    // Send interim results for live UI feedback (reduced frequency to avoid spam)
    if (currentInterim.trim() && currentInterim.trim() !== lastInterimText) {
      // Only send interim updates periodically or when significantly changed
      const interimChanged = currentInterim.length > lastInterimText.length + 3;
      if (interimChanged || pendingTranscript.length % 15 === 0) {
        onResult(pendingTranscript || currentInterim.trim(), false);
      }
    }
    
    // Note: Final transcript handling is now managed by the VAD audio level monitoring above
  };
  
  // Cleanup on stop - wrap the stop method
  const originalStop = recognition.stop.bind(recognition);
  (recognition as any).stop = function() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    
    // Finalize any pending transcript if we have audio monitoring or sufficient silence
    if (pendingTranscript.trim() && pendingTranscript.trim().length >= MIN_TRANSCRIPT_LENGTH) {
      // Wait a moment to see if audio level confirms silence
      setTimeout(() => {
        if (!isSpeechActive && pendingTranscript.trim()) {
          console.log(`[VAD] Finalizing on stop: "${pendingTranscript}"`);
          onResult(pendingTranscript.trim(), true);
        }
        // Reset accumulation
        pendingTranscript = "";
        allFinalText = "";
        lastProcessedIndex = -1;
      }, 500);
    } else if (lastInterimText.trim() && lastInterimText.trim().length >= MIN_TRANSCRIPT_LENGTH) {
      // Fallback: use last interim text
      onResult(lastInterimText.trim(), true);
      lastInterimText = "";
    }
    
    // Cleanup audio monitoring
    if (audioLevelMonitor) {
      audioLevelMonitor.stop();
      audioLevelMonitor = null;
    }
    
    originalStop();
  };

  recognition.onerror = (e: any) => {
    // Network errors are common and recoverable in continuous mode - the API auto-retries
    // Aborted errors happen when stopping recognition - also not critical
    // Only log errors that actually matter
    const ignorableErrors = ['network', 'aborted'];
    if (!e.error || !ignorableErrors.includes(e.error)) {
      if (onError) onError(e);
    }
    // Note: In continuous mode, network errors are automatically handled by the API
  };

  try {
    recognition.start();
  } catch (e) {
    // start can throw if called without user gesture in some browsers
    if (onError) onError(e);
  }

  return {
    available: true,
    stop: async () => {
      try {
        recognition.stop();
      } catch (e) {
        // ignore
      }
    },
  };
}

// ----- MediaRecorder chunked recorder (fallback) -----
export interface RecorderController {
  stop: () => Promise<Blob | null>;
  pause: () => void;
  resume: () => void;
  isRecording: () => boolean;
}

export function startRecordingChunks(
  stream: MediaStream,
  onChunk: ChunkCallback,
  options?: { mimeType?: string; timesliceMs?: number }
): RecorderController {
  const mimeType = options?.mimeType || "audio/webm;codecs=opus";
  const timesliceMs = options?.timesliceMs || 3000; // emit every 3s

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stoppedResolve: ((b: Blob | null) => void) | null = null;

  const start = () => {
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (e) {
      // Last-resort: try without mimeType
      try {
        recorder = new MediaRecorder(stream as any);
      } catch (err) {
        console.error("Failed to create MediaRecorder", err);
        throw err;
      }
    }

    recorder.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
        // Emit chunk to caller for uploading/transcription
        onChunk(ev.data);
      }
    };

    recorder.onstop = () => {
      const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
      if (stoppedResolve) stoppedResolve(blob);
    };

    recorder.start(timesliceMs);
  };

  start();

  return {
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        stoppedResolve = resolve;
        if (recorder && recorder.state !== "inactive") recorder.stop();
        else resolve(null);
      }),
    pause: () => recorder && recorder.state === "recording" && recorder.pause(),
    resume: () => recorder && recorder.state === "paused" && (recorder as any).resume(),
    isRecording: () => !!recorder && recorder.state === "recording",
  };
}

// ----- Utility: upload chunk to a server transcription endpoint -----
// Example server endpoint expected to accept multipart/form-data file field named "file" and return JSON { text }
export async function uploadChunkForTranscription(
  blob: Blob,
  endpoint = (process.env.NEXT_PUBLIC_TRANSCRIBE_URL as string) || "/api/transcribe",
  extraHeaders?: Record<string, string>
): Promise<{ text?: string; ok: boolean; status: number }> {
  const fd = new FormData();
  fd.append("file", blob, "chunk.webm");

  const res = await fetch(endpoint, {
    method: "POST",
    body: fd,
    headers: { ...extraHeaders } as any,
  });

  if (!res.ok) return { ok: false, status: res.status };
  try {
    const json = await res.json();
    return { ok: true, status: res.status, text: json.text } as any;
  } catch (e) {
    return { ok: true, status: res.status } as any;
  }
}

// Exports for convenience
export default {
  startLiveTranscriptionWithWebSpeech,
  startRecordingChunks,
  uploadChunkForTranscription,
};
