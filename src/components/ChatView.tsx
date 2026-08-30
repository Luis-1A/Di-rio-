import React, { useState, useEffect, useRef } from 'react';
import {
  ChatMessage,
  DiaryRecord,
  MemoryItem,
  UserProfile,
  IAUProfileSettings,
  VoicePlaybackState,
} from '../types';
import {
  saveMessage,
  saveMemory,
} from '../lib/firestoreService';
import { findRelevantRecords, findRelevantMemories } from '../lib/memoryEngine';
import { VoiceDefenseEngine } from '../lib/voiceDefense';
import { AudioProcessor, AudioCaptureResult } from '../lib/audioProcessor';
import { executeChatWithIAU, transcribeAudioWithIAU } from '../lib/geminiBridge';
import {
  Send,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Mic,
  Bookmark,
  FileText,
  User,
  Loader2,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface ChatViewProps {
  user: UserProfile;
  messages: ChatMessage[];
  records: DiaryRecord[];
  memories: MemoryItem[];
  iauSettings: IAUProfileSettings;
  onSelectRecord?: (record: DiaryRecord) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  user,
  messages,
  records,
  memories,
  iauSettings,
  onSelectRecord,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micTimer, setMicTimer] = useState('00:00');
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);

  // Voice Playback State with Triple Defense Engine
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

  // Initialize Voice Defense Engine
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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setInputText('');
    setIsSending(true);

    try {
      // 1. Save user message to Firestore
      const userMsg = await saveMessage(user.uid, {
        role: 'user',
        content: text,
        operationId: `op_msg_${Date.now()}`,
      });

      // 2. Layered Memory & Relevance Engine: Scoped context retrieval
      const relevantRecs = findRelevantRecords(records, text, 4);
      const relevantMems = findRelevantMemories(memories, text, 4);

      // 3. Request IAU Central via resilient Gemini Bridge
      const data = await executeChatWithIAU({
        message: text,
        userId: user.uid,
        userName: user.displayName,
        history: messages.slice(-8),
        relevantRecords: relevantRecs.map((r) => ({
          id: r.id,
          title: r.title,
          date: r.date,
          category: r.category,
          content: r.content.slice(0, 500),
          transcripts: (r.attachments || [])
            .filter((a) => a.transcript)
            .map((a) => a.transcript),
        })),
        relevantMemories: relevantMems.map((m) => ({
          id: m.id,
          title: m.title,
          summary: m.summary,
          category: m.category,
        })),
        iauProfile: iauSettings,
      });

      const reply = data.reply || 'Não consegui processar a resposta.';

      // 4. Save IAU Assistant message in Firestore
      const assistantMsg = await saveMessage(user.uid, {
        role: 'assistant',
        content: reply,
        referencedRecordIds: data.referencedRecordIds || [],
        referencedMemoryIds: data.referencedMemoryIds || [],
        operationId: `op_reply_${Date.now()}`,
      });

      // 5. Save structured memories suggested by IAU if enabled
      if (
        iauSettings.allowAutoMemoryCreation &&
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
              sourceId: assistantMsg.id,
              tags: sm.tags || [],
            });
          }
        }
      }

      // 6. Auto-play voice if preferred
      if (iauSettings.autoPlayAudio && voiceEngineRef.current) {
        voiceEngineRef.current.play(assistantMsg.id, reply);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      // Save error notice message so user is informed honestly
      await saveMessage(user.uid, {
        role: 'assistant',
        content: `⚠️ Não foi possível obter resposta da IAU Central: ${err.message || 'Falha de conexão'}.`,
        operationId: `op_err_${Date.now()}`,
      });
    } finally {
      setIsSending(false);
    }
  };

  // Mic voice query recording with noise suppression
  const handleToggleMic = async () => {
    if (isRecordingMic) {
      // Stop and transcribe
      if (!audioProcessorRef.current) return;
      setIsRecordingMic(false);
      setIsTranscribingVoice(true);

      try {
        const capture: AudioCaptureResult = await audioProcessorRef.current.stopRecording();
        const transcript = await transcribeAudioWithIAU(capture.base64, capture.mimeType);
        if (transcript) {
          setInputText(transcript);
          // Auto send transcribed voice question
          handleSendMessage(transcript);
        }
      } catch (err: any) {
        console.error('Voice query transcription error:', err);
        alert('Não foi possível transcrever a sua voz.');
      } finally {
        setIsTranscribingVoice(false);
      }
    } else {
      // Start recording
      try {
        audioProcessorRef.current = new AudioProcessor();
        await audioProcessorRef.current.startRecording((formatted) => {
          setMicTimer(formatted);
        });
        setIsRecordingMic(true);
        setMicTimer('00:00');
      } catch (e) {
        alert('Permissão de microfone negada ou indisponível.');
      }
    }
  };

  // Voice playback toggles for individual assistant messages
  const handleToggleVoice = (msg: ChatMessage) => {
    if (!voiceEngineRef.current) return;

    if (playbackState.currentMessageId === msg.id) {
      if (playbackState.isPlaying) {
        voiceEngineRef.current.pause();
      } else if (playbackState.isPaused) {
        voiceEngineRef.current.resume();
      } else {
        voiceEngineRef.current.play(msg.id, msg.content);
      }
    } else {
      voiceEngineRef.current.play(msg.id, msg.content);
    }
  };

  const handleRestartVoice = (msg: ChatMessage) => {
    if (voiceEngineRef.current) {
      voiceEngineRef.current.play(msg.id, msg.content, 0);
    }
  };

  const formatSeconds = (sec: number) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const rem = (s % 60).toString().padStart(2, '0');
    return `${m}:${rem}`;
  };

  return (
    <div id="chat-view-container" className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-80px)] px-4 py-4">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-stone-500">
            <div className="w-14 h-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold font-serif text-stone-200">
              Conversa Central com a IAU
            </h3>
            <p className="text-xs text-stone-400 mt-1 max-w-md">
              Esta é sua relação contínua com a inteligência do Diário. Pergunte sobre registros passados, peça resumos, reflexões ou grave perguntas por voz.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              <button
                onClick={() => handleSendMessage('O que você sabe sobre mim até agora?')}
                className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 text-xs transition-colors"
              >
                "O que você sabe sobre mim até agora?"
              </button>
              <button
                onClick={() => handleSendMessage('Faça um resumo dos meus últimos registros.')}
                className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 text-xs transition-colors"
              >
                "Resuma meus registros recentes."
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isAss = msg.role === 'assistant';
            const isPlayingThis = playbackState.currentMessageId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isAss ? 'justify-start' : 'justify-end'}`}
              >
                {isAss && (
                  <div className="w-8 h-8 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400 shrink-0 mt-1 shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl p-4.5 text-sm shadow-md space-y-3 ${
                    isAss
                      ? 'bg-stone-900/90 border border-stone-800 text-stone-100'
                      : 'bg-amber-600 text-stone-950 font-medium ml-12'
                  }`}
                >
                  {/* Clean message text with optional voice synchronization tracking */}
                  <div className="leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.content}
                  </div>

                  {/* Clean IAU Voice Player inside the Message Card */}
                  {isAss && (
                    <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between gap-3 text-xs text-stone-400">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleVoice(msg)}
                          title={isPlayingThis && playbackState.isPlaying ? 'Pausar voz' : 'Ouvir resposta'}
                          className="p-1.5 rounded-lg bg-stone-950 border border-stone-800 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          {isPlayingThis && playbackState.isPlaying ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          <span className="text-[11px] font-mono font-medium">
                            {isPlayingThis
                              ? `${formatSeconds(playbackState.currentTime)} / ${formatSeconds(playbackState.duration)}`
                              : 'Ouvir'}
                          </span>
                        </button>

                        {isPlayingThis && (
                          <button
                            onClick={() => handleRestartVoice(msg)}
                            title="Recomeçar áudio"
                            className="p-1.5 rounded-lg bg-stone-950 border border-stone-800 hover:text-stone-200 transition-colors text-stone-400"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Referenced records trace */}
                      {msg.referencedRecordIds && msg.referencedRecordIds.length > 0 && (
                        <span className="text-[10px] text-stone-500 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-amber-500/60" />
                          <span>{msg.referencedRecordIds.length} ref(s) consultada(s)</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div
                    className={`text-[10px] text-right ${
                      isAss ? 'text-stone-500' : 'text-stone-900/70'
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {!isAss && (
                  <div className="w-8 h-8 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {isSending && (
          <div className="flex gap-3 justify-start items-center">
            <div className="w-8 h-8 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-xs text-stone-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Consultando memórias e pensando...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Mic Recording Status Indicator */}
      {isRecordingMic && (
        <div className="mb-2 p-2.5 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Gravando pergunta por voz: {micTimer} (Filtro de ruído ativo)</span>
          </div>
          <button
            onClick={handleToggleMic}
            className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-[11px] font-bold"
          >
            Enviar Pergunta
          </button>
        </div>
      )}

      {isTranscribingVoice && (
        <div className="mb-2 p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-amber-300 text-xs flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Transcrevendo sua fala com a IAU...</span>
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="relative flex items-center gap-2 bg-stone-900/90 border border-stone-800 rounded-2xl p-2 shadow-xl"
      >
        <button
          type="button"
          onClick={handleToggleMic}
          disabled={isSending || isTranscribingVoice}
          title={isRecordingMic ? 'Parar gravação' : 'Falar pergunta por microfone'}
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${
            isRecordingMic
              ? 'bg-red-600 text-white'
              : 'bg-stone-950 hover:bg-stone-800 text-stone-400 hover:text-amber-400 border border-stone-800'
          }`}
        >
          <Mic className="w-4 h-4" />
        </button>

        <input
          id="input-chat-message"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Converse com a IAU, pesquise lembranças, peça conselhos..."
          disabled={isSending || isRecordingMic}
          className="flex-1 bg-transparent px-2 py-1.5 text-stone-100 placeholder:text-stone-600 text-sm focus:outline-none"
        />

        <button
          id="btn-send-message"
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="p-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-bold transition-colors cursor-pointer"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  );
};
