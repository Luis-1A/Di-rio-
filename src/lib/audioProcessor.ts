/**
 * Audio Processing with Noise Reduction and Normalization
 */

export interface AudioCaptureResult {
  blob: Blob;
  base64: string;
  durationSeconds: number;
  mimeType: string;
}

export class AudioProcessor {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalPausedDuration: number = 0;
  private isPaused: boolean = false;
  private timerInterval: any = null;

  async startRecording(
    onTick?: (durationFormatted: string, seconds: number) => void
  ): Promise<void> {
    this.recordedChunks = [];
    this.totalPausedDuration = 0;
    this.isPaused = false;

    // Request microphone stream with browser-level noise suppression and echo cancellation
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    this.mediaStream = stream;

    // Advanced Web Audio API Pipeline for clean studio filtering
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);

      // 1. Highpass filter to eliminate sub-bass rumble (< 80Hz)
      const highpass = this.audioContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 80;

      // 2. Lowpass filter to reduce hiss (> 8000Hz for voice clarity)
      const lowpass = this.audioContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 8500;

      // 3. Dynamics Compressor to level audio volume peaks and valleys
      const compressor = this.audioContext.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, this.audioContext.currentTime);
      compressor.knee.setValueAtTime(30, this.audioContext.currentTime);
      compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
      compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);

      // Connect nodes
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);

      const destination = this.audioContext.createMediaStreamDestination();
      compressor.connect(destination);

      // Use the filtered stream for recording
      const filteredStream = destination.stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(filteredStream, {
        mimeType,
        audioBitsPerSecond: 64000,
      });
    } catch (e) {
      console.warn('Web Audio filter fallback to raw stream:', e);
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(100); // chunk every 100ms

    if (onTick) {
      this.timerInterval = setInterval(() => {
        if (!this.isPaused) {
          const elapsedMs = Date.now() - this.startTime - this.totalPausedDuration;
          const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
          const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
          const secs = (totalSeconds % 60).toString().padStart(2, '0');
          onTick(`${mins}:${secs}`, totalSeconds);
        }
      }, 250);
    }
  }

  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.pausedTime = Date.now();
    }
  }

  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused = false;
      if (this.pausedTime > 0) {
        this.totalPausedDuration += Date.now() - this.pausedTime;
      }
    }
  }

  async stopRecording(): Promise<AudioCaptureResult> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('Nenhum gravador ativo.'));
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const blob = new Blob(this.recordedChunks, { type: mimeType });
          const elapsedMs = Date.now() - this.startTime - this.totalPausedDuration;
          const durationSeconds = Math.max(1, Math.round(elapsedMs / 1000));

          // Cleanup tracks
          if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
          }
          if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
          }

          // Convert blob to base64
          const base64 = await blobToBase64(blob);

          resolve({
            blob,
            base64,
            durationSeconds,
            mimeType,
          });
        } catch (err) {
          reject(err);
        }
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
