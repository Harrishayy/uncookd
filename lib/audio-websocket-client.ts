/**
 * WebSocket client for bidirectional audio streaming with CrewAI backend
 * Handles STT (audio → text) and TTS (text → audio) via WebSocket
 */

export interface AudioWebSocketConfig {
  taskType?: 'agent' | 'crew' | 'classroom';
  agentConfig?: {
    role?: string;
    goal?: string;
    backstory?: string;
    voice_id?: string;
    subject?: string;
  };
}

export interface AudioWebSocketCallbacks {
  onConnected?: (sessionId: string) => void;
  onTranscription?: (text: string) => void;
  onResponseText?: (text: string) => void;
  onAudioChunk?: (chunk: Blob) => void;
  onAudioStart?: () => void;
  onAudioEnd?: () => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

export class AudioWebSocketClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private audioChunks: Blob[] = [];
  private callbacks: AudioWebSocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private url: string;

  constructor(backendUrl: string = 'ws://localhost:8000') {
    // Convert http:// to ws:// or https:// to wss://
    this.url = backendUrl.replace(/^http/, 'ws') + '/ws/audio';
  }

  connect(callbacks: AudioWebSocketCallbacks): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.callbacks = callbacks;
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.callbacks.onError?.('WebSocket connection error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.callbacks.onClose?.();
          
          // Attempt to reconnect if not intentionally closed
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
              this.reconnectAttempts++;
              console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
              this.connect(this.callbacks).catch(console.error);
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(event: MessageEvent) {
    // Handle JSON messages
    if (typeof event.data === 'string') {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            this.sessionId = data.session_id;
            this.callbacks.onConnected?.(data.session_id);
            break;
          
          case 'transcription':
            this.callbacks.onTranscription?.(data.text);
            break;
          
          case 'response_text':
            this.callbacks.onResponseText?.(data.text);
            break;
          
          case 'audio_start':
            this.audioChunks = []; // Reset chunks
            this.callbacks.onAudioStart?.();
            break;
          
          case 'audio_end':
            // Combine all audio chunks into single blob
            if (this.audioChunks.length > 0) {
              const audioBlob = new Blob(this.audioChunks, { type: 'audio/mpeg' });
              this.callbacks.onAudioChunk?.(audioBlob);
              this.audioChunks = [];
            }
            this.callbacks.onAudioEnd?.();
            break;
          
          case 'error':
            this.callbacks.onError?.(data.message);
            break;
          
          case 'config_received':
            console.log('Config received:', data);
            break;
          
          case 'audio_chunk_received':
            // Acknowledgment from server
            break;
          
          case 'pong':
            // Keep-alive response
            break;
        }
      } catch (error) {
        console.error('Error parsing JSON message:', error);
      }
    }
    // Handle binary messages (audio chunks)
    else if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
      const blob = event.data instanceof Blob ? event.data : new Blob([event.data]);
      this.audioChunks.push(blob);
      // Optionally call onAudioChunk for each chunk for streaming playback
      this.callbacks.onAudioChunk?.(blob);
    }
  }

  sendConfig(config: AudioWebSocketConfig): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'config',
        task_type: config.taskType || 'agent',
        agent_config: config.agentConfig || {},
      }));
    }
  }

  sendAudioChunk(audioChunk: Blob | ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (audioChunk instanceof Blob) {
        audioChunk.arrayBuffer().then((buffer) => {
          this.ws?.send(buffer);
        });
      } else {
        this.ws.send(audioChunk);
      }
    }
  }

  sendAudioEnd(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'audio_end',
      }));
    }
  }

  ping(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'ping',
      }));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
      this.ws.close();
      this.ws = null;
      this.sessionId = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

