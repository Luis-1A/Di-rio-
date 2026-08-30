import React, { useState, useRef, useEffect } from 'react';
import {
  DiaryRecord,
  RecordAttachment,
  RecordType,
  UserProfile,
} from '../types';
import {
  saveRecord,
  uploadFileToStorage,
} from '../lib/firestoreService';
import { AudioProcessor, AudioCaptureResult } from '../lib/audioProcessor';
import { transcribeAudioWithIAU, organizeRecordWithIAU } from '../lib/geminiBridge';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  File,
  Sparkles,
  X,
  Play,
  Pause,
  Trash2,
  Tag,
  Folder,
  Calendar as CalendarIcon,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

interface RecordEditorProps {
  user: UserProfile;
  initialRecord?: DiaryRecord | null;
  onSaved: (record: DiaryRecord) => void;
  onCancel: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const RecordEditor: React.FC<RecordEditorProps> = ({
  user,
  initialRecord,
  onSaved,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialRecord?.title || '');
  const [content, setContent] = useState(initialRecord?.content || '');
  const [date, setDate] = useState(
    initialRecord?.date || new Date().toISOString().split('T')[0]
  );
  const [category, setCategory] = useState(initialRecord?.category || 'Pessoal');
  const [tags, setTags] = useState<string[]>(initialRecord?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [type, setType] = useState<RecordType>(initialRecord?.type || 'text');
  const [attachments, setAttachments] = useState<RecordAttachment[]>(
    initialRecord?.attachments || []
  );

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPausedRecording, setIsPausedRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState('00:00');
  const [isUploading, setIsUploading] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);

  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadType, setUploadType] = useState<'image' | 'video' | 'audio' | 'document'>('image');

  // Handle Tag Addition
  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const clean = tagInput.trim().replace(/^#/, '');
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Audio Recording Handlers with Noise Suppression
  const handleStartAudioRecord = async () => {
    try {
      audioProcessorRef.current = new AudioProcessor();
      await audioProcessorRef.current.startRecording((formatted) => {
        setRecordTimer(formatted);
      });
      setIsRecording(true);
      setIsPausedRecording(false);
      setRecordTimer('00:00');
    } catch (err: any) {
      console.error('Microphone access error:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };

  const handlePauseAudioRecord = () => {
    if (audioProcessorRef.current) {
      if (isPausedRecording) {
        audioProcessorRef.current.resume();
        setIsPausedRecording(false);
      } else {
        audioProcessorRef.current.pause();
        setIsPausedRecording(true);
      }
    }
  };

  const handleStopAudioRecord = async () => {
    if (!audioProcessorRef.current) return;
    setIsRecording(false);
    setIsPausedRecording(false);
    setIsUploading(true);

    try {
      const result: AudioCaptureResult = await audioProcessorRef.current.stopRecording();
      const filename = `audio_gravacao_${Date.now()}.webm`;

      // 1. Upload audio to Firebase Storage
      const { url, storagePath } = await uploadFileToStorage(
        user.uid,
        result.blob,
        'audio',
        filename
      );

      const newAttachment: RecordAttachment = {
        id: `att_${Date.now()}`,
        name: filename,
        type: 'audio',
        url,
        storagePath,
        size: result.blob.size,
        mimeType: result.mimeType,
        durationSeconds: result.durationSeconds,
        transcriptStatus: 'processing',
      };

      setAttachments((prev) => [...prev, newAttachment]);
      setType('audio');

      // 2. Request Gemini Transcription in background with resilient bridge
      transcribeAudioWithIAU(result.base64, result.mimeType)
        .then((transcript) => {
          if (transcript) {
            setAttachments((prev) =>
              prev.map((att) =>
                att.id === newAttachment.id
                  ? {
                      ...att,
                      transcript,
                      transcriptStatus: 'completed',
                    }
                  : att
              )
            );
          } else {
            setAttachments((prev) =>
              prev.map((att) =>
                att.id === newAttachment.id
                  ? { ...att, transcriptStatus: 'failed' }
                  : att
              )
            );
          }
        })
        .catch((err) => {
          console.warn('Background transcription failed:', err);
          setAttachments((prev) =>
            prev.map((att) =>
              att.id === newAttachment.id
                ? { ...att, transcriptStatus: 'failed' }
                : att
            )
          );
        });
    } catch (err: any) {
      console.error('Audio processing/upload failed:', err);
      alert(`Falha ao salvar áudio: ${err.message || 'Erro de upload'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Generic File Upload Handler (Photos, Videos, Documents)
  const triggerFileUpload = (targetType: 'image' | 'video' | 'audio' | 'document') => {
    setUploadType(targetType);
    if (fileInputRef.current) {
      if (targetType === 'image') fileInputRef.current.accept = 'image/*';
      else if (targetType === 'video') fileInputRef.current.accept = 'video/*';
      else if (targetType === 'audio') fileInputRef.current.accept = 'audio/*';
      else fileInputRef.current.accept = '.pdf,.doc,.docx,.txt,.csv';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const folderMap = {
        image: 'images' as const,
        video: 'videos' as const,
        audio: 'audio' as const,
        document: 'documents' as const,
      };

      const { url, storagePath } = await uploadFileToStorage(
        user.uid,
        file,
        folderMap[uploadType],
        file.name
      );

      const newAtt: RecordAttachment = {
        id: `att_${Date.now()}`,
        name: file.name,
        type: uploadType,
        url,
        storagePath,
        size: file.size,
        mimeType: file.type,
      };

      setAttachments((prev) => [...prev, newAtt]);
      if (uploadType === 'image') setType('photo');
      else if (uploadType === 'video') setType('video');
      else if (uploadType === 'document') setType('document');
    } catch (err: any) {
      console.error('File upload failed:', err);
      alert(`Falha no upload do arquivo: ${err.message || 'Erro no Firebase Storage'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (attId: string) => {
    setAttachments(attachments.filter((a) => a.id !== attId));
  };

  // Smart IAU Helper to enhance title, categories and tags
  const handleAIAssist = async () => {
    if (!content.trim() && !title.trim()) {
      alert('Escreva algum conteúdo no registro para a IAU analisar.');
      return;
    }

    setIsOrganizing(true);
    try {
      const data = await organizeRecordWithIAU(content, title);
      if (data.suggestedTitle && !title.trim()) {
        setTitle(data.suggestedTitle);
      }
      if (data.suggestedCategory) {
        setCategory(data.suggestedCategory);
      }
      if (Array.isArray(data.suggestedTags) && data.suggestedTags.length > 0) {
        const merged = Array.from(new Set([...tags, ...data.suggestedTags]));
        setTags(merged);
      }
    } catch (e) {
      console.warn('AI Organize failed:', e);
    } finally {
      setIsOrganizing(false);
    }
  };

  // SAVE HANDLER with strict guarantee
  const handleSave = async () => {
    if (!title.trim() && !content.trim() && attachments.length === 0) {
      setErrorMessage('O registro não pode estar totalmente vazio.');
      return;
    }

    setSaveStatus('saving');
    setErrorMessage(null);

    const recordType: RecordType =
      attachments.length > 1
        ? 'mixed'
        : attachments.length === 1
        ? (attachments[0].type as RecordType)
        : 'text';

    try {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const saved = await saveRecord(user.uid, {
        id: initialRecord?.id,
        title: title.trim() || 'Registro sem título',
        content: content.trim(),
        date,
        time: initialRecord?.time || timeStr,
        category,
        tags,
        type: recordType,
        attachments,
        isFavorite: initialRecord?.isFavorite || false,
        isDeleted: false,
        operationId: initialRecord?.operationId || `op_rec_${Date.now()}`,
      });

      setSaveStatus('saved');
      setTimeout(() => {
        onSaved(saved);
      }, 700);
    } catch (err: any) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setErrorMessage(
        'Não foi possível salvar no Firebase. Suas informações foram mantidas nesta tela para você tentar novamente.'
      );
    }
  };

  return (
    <div id="record-editor-view" className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Top Header Controls */}
      <div className="flex items-center justify-between gap-4 border-b border-stone-800 pb-4">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAIAssist}
            disabled={isOrganizing || (!content.trim() && !title.trim())}
            title="IAU sugere categoria, tags e melhorias no título"
            className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-amber-400 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isOrganizing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Organizar com IAU</span>
          </button>

          <button
            id="btn-save-record"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
              saveStatus === 'saved'
                ? 'bg-emerald-600 text-stone-950 shadow-emerald-950/40'
                : saveStatus === 'error'
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/40'
                : 'bg-amber-600 hover:bg-amber-500 text-stone-950 shadow-amber-900/30'
            }`}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>SALVANDO...</span>
              </>
            ) : saveStatus === 'saved' ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>✓ SALVO</span>
              </>
            ) : saveStatus === 'error' ? (
              <>
                <AlertCircle className="w-4 h-4" />
                <span>Tentar Salvar Novamente</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error notification banner if save fails */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">⚠ NÃO FOI POSSÍVEL SALVAR</div>
            <div className="text-xs text-red-300 mt-1">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Form Fields */}
      <div className="space-y-4">
        {/* Title */}
        <input
          id="input-record-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título do registro..."
          className="w-full bg-transparent text-xl sm:text-2xl font-bold font-serif text-stone-100 placeholder:text-stone-600 focus:outline-none border-b border-stone-800 focus:border-amber-500/50 pb-2 transition-colors"
        />

        {/* Metadata Controls: Date & Category */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 rounded-xl px-3 py-1.5 text-stone-300">
            <CalendarIcon className="w-3.5 h-3.5 text-stone-500" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-stone-200 focus:outline-none text-xs"
            />
          </div>

          <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 rounded-xl px-3 py-1.5 text-stone-300">
            <Folder className="w-3.5 h-3.5 text-stone-500" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-transparent text-stone-200 focus:outline-none text-xs"
            >
              <option value="Pessoal" className="bg-stone-900 text-stone-100">Pessoal</option>
              <option value="Trabalho" className="bg-stone-900 text-stone-100">Trabalho</option>
              <option value="Ideias" className="bg-stone-900 text-stone-100">Ideias</option>
              <option value="Saúde" className="bg-stone-900 text-stone-100">Saúde</option>
              <option value="Memórias" className="bg-stone-900 text-stone-100">Memórias</option>
              <option value="Viagens" className="bg-stone-900 text-stone-100">Viagens</option>
              <option value="Projetos" className="bg-stone-900 text-stone-100">Projetos</option>
            </select>
          </div>
        </div>

        {/* Rich Content Textarea */}
        <textarea
          id="input-record-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escreva seus pensamentos, acontecimentos, reflexões ou detalhes deste momento..."
          rows={10}
          className="w-full bg-stone-900/40 border border-stone-800/80 rounded-2xl p-4 text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/50 text-sm leading-relaxed transition-all resize-y"
        />

        {/* Media Attachments Bar */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-stone-400">
            <span>Anexos e Arquivos</span>
            {isUploading && (
              <span className="flex items-center gap-1.5 text-amber-400 lowercase font-normal">
                <Loader2 className="w-3 h-3 animate-spin" /> Enviando ao Firebase Storage...
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => triggerFileUpload('image')}
              className="px-3 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-sky-400" />
              <span>Foto</span>
            </button>

            <button
              type="button"
              onClick={() => triggerFileUpload('video')}
              className="px-3 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Video className="w-4 h-4 text-purple-400" />
              <span>Vídeo</span>
            </button>

            <button
              type="button"
              onClick={isRecording ? handleStopAudioRecord : handleStartAudioRecord}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                isRecording
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300'
              }`}
            >
              <Mic className={`w-4 h-4 ${isRecording ? 'text-white' : 'text-emerald-400'}`} />
              <span>{isRecording ? '⏹ Parar Gravação' : '🎙️ Gravar Áudio'}</span>
            </button>

            <button
              type="button"
              onClick={() => triggerFileUpload('document')}
              className="px-3 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
            >
              <File className="w-4 h-4 text-amber-400" />
              <span>Documento</span>
            </button>
          </div>

          {/* Active Audio Recorder Panel */}
          {isRecording && (
            <div className="p-4 rounded-xl bg-stone-900 border border-red-800/60 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <span className="font-mono text-lg font-bold text-stone-100">{recordTimer}</span>
                <span className="text-xs text-stone-400 hidden sm:inline">
                  (Filtro de ruído e compressor ativos)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePauseAudioRecord}
                  className="p-2 rounded-lg bg-stone-800 text-stone-200 hover:bg-stone-700 text-xs font-medium flex items-center gap-1"
                >
                  {isPausedRecording ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{isPausedRecording ? 'Retomar' : 'Pausar'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopAudioRecord}
                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
                >
                  Finalizar
                </button>
              </div>
            </div>
          )}

          {/* Attached Files List with Real Storage Preview and Transcription Status */}
          {attachments.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="p-3 rounded-xl bg-stone-900/80 border border-stone-800 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {att.type === 'image' && <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />}
                      {att.type === 'video' && <Video className="w-4 h-4 text-purple-400 shrink-0" />}
                      {att.type === 'audio' && <Mic className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {att.type === 'document' && <File className="w-4 h-4 text-amber-400 shrink-0" />}
                      <span className="text-xs text-stone-200 font-medium truncate">{att.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-stone-500 hover:text-red-400 p-1 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Image Preview */}
                  {att.type === 'image' && att.url && (
                    <img
                      src={att.url}
                      alt={att.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-32 object-cover rounded-lg border border-stone-800"
                    />
                  )}

                  {/* Audio Player and Transcription Indicator */}
                  {att.type === 'audio' && (
                    <div className="space-y-2">
                      <audio src={att.url} controls className="w-full h-8" />
                      <div className="text-[11px] flex items-center justify-between text-stone-400">
                        <span>
                          {att.transcriptStatus === 'processing' && (
                            <span className="text-amber-400 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Transcrevendo com IAU...
                            </span>
                          )}
                          {att.transcriptStatus === 'completed' && (
                            <span className="text-emerald-400">✓ Transcrição processada internamente</span>
                          )}
                          {att.transcriptStatus === 'failed' && (
                            <span className="text-stone-500">Transcrição pendente</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tags Section */}
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400">
            Tags de Pesquisa
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-stone-900 border border-stone-800 text-amber-300 text-xs font-medium"
              >
                <Tag className="w-3 h-3 text-amber-500" />
                <span>#{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-stone-500 hover:text-stone-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="+ Adicionar tag (Enter)"
                className="bg-stone-900/50 border border-stone-800 rounded-lg px-2.5 py-1 text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
