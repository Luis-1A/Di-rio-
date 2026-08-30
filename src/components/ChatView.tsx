import React, { useState, useEffect, useRef } from 'react';
import {
  ChatMessage,
  DiaryRecord,
  MemoryItem,
  UserProfile,
  IAUProfileSettings,
  VoicePlaybackState,
  RecordAttachment,
} from '../types';
import {
  saveMessage,
  saveMemory,
  softDeleteRecord,
} from '../lib/firestoreService';
import { findRelevantRecords, findRelevantMemories } from '../lib/memoryEngine';
import { VoiceDefenseEngine } from '../lib/voiceDefense';
import { AudioProcessor, AudioCaptureResult } from '../lib/audioProcessor';
import { executeCentralAgent, transcribeAudioWithIAU } from '../lib/geminiBridge';
import {
  Send,
  ChevronLeft,
  MoreHorizontal,
  Paperclip,
  Mic,
  Loader2,
  Calendar,
  Check,
  CheckCheck,
  Image as ImageIcon,
  FileText,
  X,
  Sparkles,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface ChatViewProps {
  user: UserProfile;
  messages: ChatMessage[];
  records: DiaryRecord[];
  memories: MemoryItem[];
  iauSettings: IAUProfileSettings;
  onSelectRecord?: (record: DiaryRecord) => void;
  onBack?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  user,
  messages = [],
  records = [],
  memories = [],
  iauSettings,
  onSelectRecord,
  onBack,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micTimer, setMicTimer] = useState('00:00');
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<RecordAttachment[]>([]);
  const [confirmDeleteAction, setConfirmDeleteAction] = useState<{
    messageId: string;
    recordId: string;
    recordTitle: string;
    reason: string;
  } | null>(null);

  const [playbackState, setPlaybackState] = useState<VoicePlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentMessageId: null,
    currentTime: 0,
    duration: 0,
    currentSegmentIndex: 0,
    totalSegments: 0,
    highlightWordIndex: -1,
    status: 'idle',
  });

  const voiceEngineRef = useRef<VoiceDefenseEngine | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    voiceEngineRef.current = new VoiceDefenseEngine({
      onStateChange: (st) => setPlaybackState(st),
      onHighlightWord: (wordIdx) => {
        setPlaybackState((prev) => ({ ...prev, highlightWordIndex: wordIdx }));
      },
      onComplete: () => {
        setPlaybackState((prev) => ({
          ...prev,
          isPlaying: false,
          isPaused: false,
          currentMessageId: null,
          highlightWordIndex: -1,
          status: 'completed',
        }));
      },
      onError: (err) => {
        console.warn('Voice Engine Error:', err);
      },
    });

    voiceEngineRef.current.setAudioConfig(
      iauSettings.voicePitch,
      iauSettings.voiceRate,
      iauSettings.voiceVolume,
      iauSettings.selectedVoiceName
    );

    return () => {
      voiceEngineRef.current?.destroy();
    };
  }, [iauSettings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const newAtt: RecordAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          name: file.name,
          type: file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('audio/')
            ? 'audio'
            : 'document',
          url: base64,
          size: file.size,
          mimeType: file.type,
        };
        setPendingAttachments((prev) => [...prev, newAtt]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText !== undefined ? customText : inputText;
    if (!textToSend.trim() && pendingAttachments.length === 0) return;

    const currentAttachments = [...pendingAttachments];
    setInputText('');
    setPendingAttachments([]);
    setIsSending(true);

    try {
      const userMsgPayload: any = {
        role: 'user',
        content: textToSend.trim(),
        operationId: `op_user_${Date.now()}`,
      };
      if (currentAttachments.length > 0) {
        userMsgPayload.attachments = currentAttachments;
      }
      await saveMessage(user.uid, userMsgPayload);

      const relevantRecords = findRelevantRecords(records, textToSend, 6);
      const relevantMemories = findRelevantMemories(memories, textToSend, 6);

      const data = await executeCentralAgent({
        userId: user.uid,
        userName: user.displayName,
        message: textToSend,
        history: messages.slice(-10),
        relevantRecords,
        relevantMemories,
        iauProfile: iauSettings,
        attachments: currentAttachments,
      });

      const reply = data.reply || 'Entendido. Processei sua solicitação.';
      const executedActions = data.actions || [];

      if (
        data.suggestedMemories &&
        Array.isArray(data.suggestedMemories) &&
        data.suggestedMemories.length > 0
      ) {
        for (const sm of data.suggestedMemories) {
          if (sm.title && sm.summary) {
            await saveMemory(user.uid, {
              title: sm.title,
              summary: sm.summary,
              category: sm.category || 'thought',
              confidence: sm.confidence || 0.85,
              sourceType: 'conversation',
              tags: sm.tags || [],
            });
          }
        }
      }

      const assistantMsgPayload: any = {
        role: 'assistant',
        content: reply,
        referencedRecordIds: data.referencedRecordIds || [],
        referencedMemoryIds: data.referencedMemoryIds || [],
        operationId: `op_reply_${Date.now()}`,
      };
      if (executedActions.length > 0) {
        assistantMsgPayload.agentActions = executedActions;
      }
      if (data.timelineArtifact) {
        assistantMsgPayload.timelineArtifact = data.timelineArtifact;
      }

      await saveMessage(user.uid, assistantMsgPayload);
    } catch (err: any) {
      console.error('Chat error:', err);
      await saveMessage(user.uid, {
        role: 'assistant',
        content: `Não consegui processar agora: ${err.message || 'Erro de conexão'}.`,
        operationId: `op_err_${Date.now()}`,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleMic = async () => {
    if (isRecordingMic) {
      if (!audioProcessorRef.current) return;
      setIsRecordingMic(false);
      setIsTranscribingVoice(true);

      try {
        const capture: AudioCaptureResult = await audioProcessorRef.current.stopRecording();
        const transcript = await transcribeAudioWithIAU(capture.base64, capture.mimeType);
        if (transcript) {
          setInputText(transcript);
          handleSendMessage(transcript);
        }
      } catch (err: any) {
        console.error('Voice query error:', err);
        alert('Não foi possível transcrever sua voz.');
      } finally {
        setIsTranscribingVoice(false);
      }
    } else {
      try {
        audioProcessorRef.current = new AudioProcessor();
        await audioProcessorRef.current.startRecording((formatted) => {
          setMicTimer(formatted);
        });
        setIsRecordingMic(true);
        setMicTimer('00:00');
      } catch {
        alert('Permissão de microfone negada ou indisponível.');
      }
    }
  };

  const formatMessageTime = (dateStr?: string) => {
    try {
      const d = dateStr ? new Date(dateStr) : new Date();
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div id="chat-screen" className="max-w-md md:max-w-lg mx-auto flex flex-col h-[calc(100vh-75px)] px-4 py-2">
      {/* Hidden File Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        multiple
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
      />

      {/* 1. Header (Screen 3: IA Central • Online) */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-sm font-semibold text-stone-800 leading-none">IA Central</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] text-stone-500 font-medium">Online</span>
            </div>
          </div>
        </div>

        <button
          className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          title="Opções da IA"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Messages List Feed */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pt-3 pb-3 pr-0.5">
        {/* Welcome greeting bubble if no messages */}
        {messages.length === 0 && (
          <div className="flex flex-col items-start space-y-2">
            <div className="bg-white border border-stone-100 rounded-3xl rounded-tl-sm p-4 text-xs sm:text-sm text-stone-800 shadow-xs max-w-[85%]">
              <span className="font-semibold text-stone-900">Oi! 👋</span>
              <p className="mt-1 text-stone-600">Como posso ajudar você hoje?</p>
            </div>

            {/* Quick Prompts */}
            <div className="flex flex-col gap-2 pt-2 w-full">
              <button
                onClick={() =>
                  handleSendMessage('Quero que você crie uma linha do tempo com os momentos mais importantes desse ano.')
                }
                className="text-left p-3 rounded-2xl bg-white border border-stone-100 hover:border-orange-200 text-xs text-stone-700 shadow-xs transition-colors cursor-pointer"
              >
                "Quero que você crie uma linha do tempo com os momentos mais importantes desse ano."
              </button>
              <button
                onClick={() => handleSendMessage('Quais foram as ideias que gravei por áudio recentemente?')}
                className="text-left p-3 rounded-2xl bg-white border border-stone-100 hover:border-orange-200 text-xs text-stone-700 shadow-xs transition-colors cursor-pointer"
              >
                "Quais foram as ideias que gravei por áudio recentemente?"
              </button>
            </div>
          </div>
        )}

        {/* Message Stream */}
        {messages.map((msg) => {
          const isAssistant = msg.role === 'assistant';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
            >
              {/* Message Bubble */}
              <div
                className={`max-w-[88%] rounded-3xl p-3.5 text-xs sm:text-sm shadow-xs space-y-2 ${
                  isAssistant
                    ? 'bg-white border border-stone-100 text-stone-800 rounded-tl-sm'
                    : 'bg-[#ffeedd] border border-orange-200/50 text-stone-900 rounded-tr-sm'
                }`}
              >
                {/* Attachments preview */}
                {!isAssistant && msg.attachments && msg.attachments.length > 0 && (
                  <div className="space-y-1">
                    {msg.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="rounded-xl overflow-hidden bg-white/70 p-2 border border-orange-200/60 text-xs flex items-center gap-2"
                      >
                        {att.type === 'image' ? (
                          <img
                            src={att.url}
                            alt={att.name}
                            className="w-10 h-10 object-cover rounded-lg"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-orange-600" />
                        )}
                        <span className="truncate text-[11px] text-stone-700">{att.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Text */}
                <div className="leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>

                {/* Structured Timeline Artifact Card (Matching Screen 3) */}
                {isAssistant && (msg.timelineArtifact || msg.content.toLowerCase().includes('linha do tempo')) && (
                  <div className="mt-2 bg-stone-50/90 border border-stone-200/70 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center gap-2 font-semibold text-xs text-stone-800">
                      <span>📅</span>
                      <span>{msg.timelineArtifact?.title || 'Linha do tempo — 2026'}</span>
                    </div>

                    <div className="relative pl-4 space-y-3.5 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-orange-300">
                      {msg.timelineArtifact?.items ? (
                        msg.timelineArtifact.items.map((item, i) => (
                          <div key={i} className="relative text-xs">
                            <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-orange-500" />
                            <div className="text-[11px] text-stone-400 font-medium">{item.date}</div>
                            <div className="font-semibold text-stone-800 mt-0.5 flex items-center gap-1.5">
                              <span className="text-orange-500">🔸</span>
                              <span>{item.title}</span>
                            </div>
                            <div className="text-[11px] text-stone-500">{item.summary}</div>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="relative text-xs">
                            <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-orange-500" />
                            <div className="text-[11px] text-stone-400 font-medium">30 de ago.</div>
                            <div className="font-semibold text-stone-800 mt-0.5 flex items-center gap-1.5">
                              <span className="text-orange-500">🔸</span>
                              <span>Fim de tarde especial</span>
                            </div>
                            <div className="text-[10px] text-stone-500">Foto</div>
                          </div>

                          <div className="relative text-xs">
                            <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-orange-500" />
                            <div className="text-[11px] text-stone-400 font-medium">28 de ago.</div>
                            <div className="font-semibold text-stone-800 mt-0.5 flex items-center gap-1.5">
                              <span className="text-orange-500">🔸</span>
                              <span>Gravação de ideias</span>
                            </div>
                            <div className="text-[10px] text-stone-500">Áudio</div>
                          </div>

                          <div className="relative text-xs">
                            <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-orange-500" />
                            <div className="text-[11px] text-stone-400 font-medium">15 de ago.</div>
                            <div className="font-semibold text-stone-800 mt-0.5 flex items-center gap-1.5">
                              <span className="text-orange-500">🔸</span>
                              <span>Viagem pra serra</span>
                            </div>
                            <div className="text-[10px] text-stone-500">Vídeo</div>
                          </div>

                          <div className="relative text-xs">
                            <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-orange-500" />
                            <div className="text-[11px] text-stone-400 font-medium">10 de ago.</div>
                            <div className="font-semibold text-stone-800 mt-0.5 flex items-center gap-1.5">
                              <span className="text-orange-500">🔸</span>
                              <span>Reflexão da manhã</span>
                            </div>
                            <div className="text-[10px] text-stone-500">Texto</div>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => onSelectRecord && records[0] && onSelectRecord(records[0])}
                      className="w-full py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 transition-colors cursor-pointer"
                    >
                      Ver completa
                    </button>
                  </div>
                )}

                {/* Footer Time & Status */}
                <div className="flex items-center justify-end gap-1 text-[10px] text-stone-400 pt-0.5">
                  <span>{formatMessageTime(msg.createdAt)}</span>
                  {!isAssistant && <CheckCheck className="w-3.5 h-3.5 text-orange-600 inline" />}
                </div>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-center gap-2 p-3 bg-white border border-stone-100 rounded-2xl w-fit shadow-xs">
            <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
            <span className="text-xs text-stone-500">Pensando e organizando...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Pending Attachments preview before sending */}
      {pendingAttachments.length > 0 && (
        <div className="mb-2 p-2 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-wrap gap-1.5">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100 text-xs text-stone-700"
            >
              <span className="truncate max-w-[120px] text-[11px]">{att.name}</span>
              <button
                type="button"
                onClick={() => removePendingAttachment(att.id)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recording Voice banner */}
      {isRecordingMic && (
        <div className="mb-2 p-2.5 rounded-2xl bg-orange-50 border border-orange-200 text-orange-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>Gravando por voz: {micTimer}</span>
          </div>
          <button
            onClick={handleToggleMic}
            className="px-3 py-1 bg-orange-600 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            Enviar
          </button>
        </div>
      )}

      {/* 3. Fixed Bottom Input Bar (Screen 3) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center gap-1.5 bg-white border border-stone-200/80 rounded-full px-2 py-1.5 shadow-xs"
      >
        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Anexar arquivo"
          className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Mic button */}
        <button
          type="button"
          onClick={handleToggleMic}
          disabled={isSending}
          title="Falar por áudio"
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
            isRecordingMic
              ? 'bg-red-500 text-white animate-pulse'
              : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
          }`}
        >
          <Mic className="w-4 h-4" />
        </button>

        {/* Text Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Digite sua mensagem..."
          disabled={isSending || isRecordingMic}
          className="flex-1 bg-transparent px-2 py-1 text-stone-800 placeholder:text-stone-400 text-xs sm:text-sm focus:outline-hidden"
        />

        {/* Send Button (Orange Circle) */}
        <button
          type="submit"
          disabled={(!inputText.trim() && pendingAttachments.length === 0) || isSending}
          className="w-9 h-9 rounded-full bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-orange-600/20 transition-transform active:scale-95 cursor-pointer shrink-0"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4 fill-white ml-0.5" />
          )}
        </button>
      </form>
    </div>
  );
};
