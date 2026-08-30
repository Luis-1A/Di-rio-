/**
 * Types and interfaces for Diário Pessoal & IAU Central
 */

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export type ResponseLengthPreference = 'short' | 'medium' | 'long' | 'adaptive';
export type PersonalityTone = 'natural' | 'thoughtful' | 'witty' | 'direct' | 'empathetic';

export interface IAUProfileSettings {
  personalityTone: PersonalityTone;
  responseLength: ResponseLengthPreference;
  autoPlayAudio: boolean;
  voicePitch: number;
  voiceRate: number;
  voiceVolume: number;
  selectedVoiceName?: string;
  allowAutoMemoryCreation: boolean;
  customInstructions?: string;
}

export type RecordType = 'text' | 'photo' | 'video' | 'audio' | 'document' | 'mixed';

export interface RecordAttachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document';
  url: string; // Storage download URL or data URL
  storagePath?: string;
  size: number;
  mimeType: string;
  durationSeconds?: number;
  transcript?: string;
  transcriptStatus?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface DiaryRecord {
  id: string;
  userId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  content: string;
  type: RecordType;
  tags: string[];
  category: string;
  attachments: RecordAttachment[];
  isFavorite: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  operationId: string;
  syncStatus: 'synced' | 'pending' | 'failed';
}

export interface MemoryItem {
  id: string;
  userId: string;
  title: string;
  summary: string;
  category: 'preference' | 'life_event' | 'relationship' | 'project' | 'thought' | 'habit';
  confidence: number; // 0 to 1
  sourceType: 'conversation' | 'record' | 'audio';
  sourceId?: string;
  sourceSnippet?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  audioUrl?: string;
  audioDurationSeconds?: number;
  audioStatus?: 'idle' | 'generating' | 'ready' | 'error';
  referencedRecordIds?: string[];
  referencedMemoryIds?: string[];
  generatedMemoryIds?: string[];
  syncStatus: 'synced' | 'pending' | 'failed';
  operationId: string;
}

export interface SyncQueueItem {
  id: string;
  operationId: string;
  entityType: 'record' | 'message' | 'memory' | 'profile';
  action: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: number;
  retries: number;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  errorMessage?: string;
}

export interface SystemHealth {
  auth: 'online' | 'degraded' | 'offline' | 'error';
  firestore: 'online' | 'degraded' | 'offline' | 'error';
  storage: 'online' | 'degraded' | 'offline' | 'error';
  gemini: 'online' | 'degraded' | 'offline' | 'error';
  audioEngine: 'online' | 'degraded' | 'offline' | 'error';
  syncQueue: 'online' | 'degraded' | 'offline' | 'error';
  lastChecked: string;
}

export interface VoicePlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentMessageId: string | null;
  currentTime: number;
  duration: number;
  currentSegmentIndex: number;
  totalSegments: number;
  highlightWordIndex: number;
  status: 'idle' | 'playing' | 'recovering' | 'completed' | 'error';
}
