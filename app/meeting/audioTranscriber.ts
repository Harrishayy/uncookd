// Lightweight audio transcription helpers for the browser.
// - Uses the Web Speech API (SpeechRecognition) when available (best client-side UX).
// - Falls back to MediaRecorder chunking when SpeechRecognition is not available.
//
// Exports:
// - startLiveTranscriptionWithWebSpeech(onResult, onError): uses SpeechRecognition (does not accept a MediaStream)
// - startRecordingChunks(stream, onChunk, options): records a MediaStream and emits audio blobs periodically
// - stopRecording(recordController): stops recording and returns collected Blob (if requested)
//
// Note: For reliable server-side transcription (Whisper/AssemblyAI/etc.) you'll need an API endpoint that accepts audio blobs.

export type TranscriptionCallback = (text: string, isFinal?: boolean) => void;
export type ChunkCallback = (blob: Blob) => void;

// ----- Web Speech API helper -----
export function startLiveTranscriptionWithWebSpeech(
  onResult: TranscriptionCallback,
  onError?: (err: any) => void,
  lang = "en-US"
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

  recognition.onresult = (event: any) => {
    // Build transcript from results
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const t = res[0]?.transcript || "";
      if (res.isFinal) final += t;
      else interim += t;
    }

    if (final.trim()) onResult(final.trim(), true);
    else if (interim.trim()) onResult(interim.trim(), false);
  };

  recognition.onerror = (e: any) => {
    if (onError) onError(e);
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
