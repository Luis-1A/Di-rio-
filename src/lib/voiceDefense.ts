/**
 * Voice Defense System: Watchdog, Integrity Checker, Completion Validator
 * Provides segmented speech synthesis, text tracking, and crash-resilient recovery.
 */

import { VoicePlaybackState } from '../types';

export interface VoicePlaybackCallbacks {
  onStateChange: (state: VoicePlaybackState) => void;
  onHighlightWord?: (wordIndex: number, textSegment: string) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export class VoiceDefenseEngine {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private messageId: string | null = null;
  private fullText: string = '';
  private segments: string[] = [];
  private currentSegmentIndex: number = 0;
  private validatedSegments: boolean[] = [];
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private isDestroyed: boolean = false;

  // Watchdog properties
  private watchdogTimer: any = null;
  private lastProgressTimestamp: number = 0;
  private watchdogIntervalMs: number = 2000;
  private stallThresholdMs: number = 5000;
  private recoveryAttempts: number = 0;
  private maxRecoveryAttempts: number = 3;

  // Word tracking
  private totalWords: string[] = [];
  private currentGlobalWordIndex: number = 0;
  private wordsBeforeSegment: number[] = [];

  // Configuration
  private pitch: number = 1.0;
  private rate: number = 1.0;
  private volume: number = 1.0;
  private preferredVoiceName?: string;

  private callbacks: VoicePlaybackCallbacks;

  constructor(callbacks: VoicePlaybackCallbacks) {
    this.callbacks = callbacks;
  }

  setAudioConfig(pitch: number = 1.0, rate: number = 1.0, volume: number = 1.0, voiceName?: string) {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
    this.rate = Math.max(0.5, Math.min(2.0, rate));
    this.volume = Math.max(0.0, Math.min(1.0, volume));
    this.preferredVoiceName = voiceName;
  }

  /**
   * Splits text into natural sentence/clause segments for high-resilience streaming speech.
   */
  private segmentText(text: string): string[] {
    // Clean markdown symbols for natural vocalization
    const cleaned = text
      .replace(/[*_#`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    if (!cleaned) return [];

    // Split by sentence terminators: . ! ? ; or newlines
    const rawSegments = cleaned
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const result: string[] = [];
    for (const seg of rawSegments) {
      // If a segment is very long (> 160 chars), break by comma
      if (seg.length > 160) {
        const sub = seg.split(/(?<=[,])\s+/).filter(Boolean);
        result.push(...sub);
      } else {
        result.push(seg);
      }
    }

    return result.length > 0 ? result : [cleaned];
  }

  /**
   * Starts or restarts speech playback with full defense mechanisms.
   */
  play(messageId: string, text: string, startFromSegment: number = 0) {
    this.stop(false);
    this.messageId = messageId;
    this.fullText = text;
    this.segments = this.segmentText(text);
    this.totalWords = text.split(/\s+/).filter(Boolean);
    this.currentSegmentIndex = Math.min(startFromSegment, Math.max(0, this.segments.length - 1));
    this.validatedSegments = new Array(this.segments.length).fill(false);
    
    // Mark prior segments as validated if resuming
    for (let i = 0; i < this.currentSegmentIndex; i++) {
      this.validatedSegments[i] = true;
    }

    // Build word count offsets for each segment
    this.wordsBeforeSegment = [];
    let wordCountAcc = 0;
    for (const seg of this.segments) {
      this.wordsBeforeSegment.push(wordCountAcc);
      const segWords = seg.split(/\s+/).filter(Boolean);
      wordCountAcc += segWords.length;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.recoveryAttempts = 0;

    this.updateState('playing');
    this.startWatchdog();
    this.playCurrentSegment();
  }

  private playCurrentSegment() {
    if (!this.isPlaying || this.isPaused || this.currentSegmentIndex >= this.segments.length) {
      this.validateAndComplete();
      return;
    }

    const segmentText = this.segments[this.currentSegmentIndex];
    if (!segmentText) {
      this.currentSegmentIndex++;
      this.playCurrentSegment();
      return;
    }

    if (!('speechSynthesis' in window)) {
      this.callbacks.onError?.('Síntese de voz não suportada neste navegador.');
      this.stop();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(segmentText);
    this.currentUtterance = utterance;

    utterance.lang = 'pt-BR';
    utterance.pitch = this.pitch;
    utterance.rate = this.rate;
    utterance.volume = this.volume;

    // Pick best Portuguese voice if available
    const voices = window.speechSynthesis.getVoices();
    if (this.preferredVoiceName) {
      const selected = voices.find((v) => v.name === this.preferredVoiceName);
      if (selected) utterance.voice = selected;
    } else {
      const ptVoice = voices.find((v) => v.lang.startsWith('pt') || v.lang === 'pt-BR');
      if (ptVoice) utterance.voice = ptVoice;
    }

    this.lastProgressTimestamp = Date.now();

    // Word boundary tracking
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.lastProgressTimestamp = Date.now();
        const segWordOffset = this.wordsBeforeSegment[this.currentSegmentIndex] || 0;
        const approxWordIndexInSeg = Math.floor(event.charIndex / 6);
        this.currentGlobalWordIndex = segWordOffset + approxWordIndexInSeg;
        this.callbacks.onHighlightWord?.(this.currentGlobalWordIndex, segmentText);
      }
    };

    utterance.onstart = () => {
      this.lastProgressTimestamp = Date.now();
      this.updateState('playing');
    };

    utterance.onend = () => {
      // 2. Integrity Checker validates this segment completion
      if (this.integrityCheckSegment(this.currentSegmentIndex)) {
        this.validatedSegments[this.currentSegmentIndex] = true;
      }
      this.currentSegmentIndex++;
      this.lastProgressTimestamp = Date.now();

      if (this.currentSegmentIndex < this.segments.length) {
        // Small delay between natural sentences
        setTimeout(() => {
          if (this.isPlaying && !this.isPaused) {
            this.playCurrentSegment();
          }
        }, 80);
      } else {
        this.validateAndComplete();
      }
    };

    utterance.onerror = (e) => {
      console.warn('Utterance error encountered:', e);
      if (e.error === 'interrupted' || e.error === 'canceled') {
        return; // normal cancellation
      }
      // Trigger recovery on unexpected failure
      this.triggerRecovery();
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * 1. Watchdog: monitors active speech synthesis to detect browser stalls or silent pauses.
   */
  private startWatchdog() {
    this.stopWatchdog();
    this.lastProgressTimestamp = Date.now();
    this.watchdogTimer = setInterval(() => {
      if (!this.isPlaying || this.isPaused) return;

      const idleDuration = Date.now() - this.lastProgressTimestamp;
      if (idleDuration > this.stallThresholdMs) {
        console.warn(`[Watchdog] Stalled for ${idleDuration}ms at segment ${this.currentSegmentIndex}. Attempting recovery.`);
        this.triggerRecovery();
      }
    }, this.watchdogIntervalMs);
  }

  private stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * 2. Integrity Checker: Validates segment data and bounds.
   */
  private integrityCheckSegment(index: number): boolean {
    if (index < 0 || index >= this.segments.length) return false;
    const text = this.segments[index];
    return typeof text === 'string' && text.length > 0;
  }

  /**
   * Segmental Recovery: Re-launches playback directly from the unvalidated segment.
   */
  private triggerRecovery() {
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      console.error('[VoiceDefense] Max recovery attempts reached. Terminating gracefully.');
      this.stop();
      this.callbacks.onError?.('Falha ao reproduzir áudio após múltiplas tentativas.');
      return;
    }

    this.recoveryAttempts++;
    this.updateState('recovering');

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setTimeout(() => {
      if (this.isPlaying) {
        console.log(`[VoiceDefense] Resuming from segment ${this.currentSegmentIndex}/${this.segments.length}`);
        this.lastProgressTimestamp = Date.now();
        this.playCurrentSegment();
      }
    }, 200);
  }

  /**
   * 3. Completion Validator: Ensures 100% of text segments were actually processed before declaring complete.
   */
  private validateAndComplete() {
    const uncompleted = this.validatedSegments.findIndex((val) => !val);
    if (uncompleted !== -1 && uncompleted < this.segments.length) {
      console.warn(`[CompletionValidator] Segment ${uncompleted} was skipped. Fixing...`);
      this.currentSegmentIndex = uncompleted;
      this.triggerRecovery();
      return;
    }

    this.isPlaying = false;
    this.isPaused = false;
    this.stopWatchdog();
    this.updateState('completed');
    this.callbacks.onComplete?.();
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.isPaused = true;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.pause();
      }
      this.updateState('playing');
    }
  }

  resume() {
    if (this.isPlaying && this.isPaused) {
      this.isPaused = false;
      this.lastProgressTimestamp = Date.now();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
      this.updateState('playing');
    }
  }

  stop(notify: boolean = true) {
    this.isPlaying = false;
    this.isPaused = false;
    this.stopWatchdog();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    if (notify) {
      this.updateState('idle');
    }
  }

  private updateState(status: VoicePlaybackState['status']) {
    const total = this.segments.length;
    const progress = total > 0 ? (this.currentSegmentIndex / total) : 0;
    const estimatedDuration = (this.totalWords.length * 0.4) / this.rate;

    this.callbacks.onStateChange({
      isPlaying: this.isPlaying && !this.isPaused,
      isPaused: this.isPaused,
      currentMessageId: this.messageId,
      currentTime: progress * estimatedDuration,
      duration: estimatedDuration,
      currentSegmentIndex: this.currentSegmentIndex,
      totalSegments: total,
      highlightWordIndex: this.currentGlobalWordIndex,
      status,
    });
  }

  destroy() {
    this.isDestroyed = true;
    this.stop(false);
  }
}
