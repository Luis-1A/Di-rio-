import React, { useState, useRef, useEffect } from 'react';
import { DiaryRecord, RecordAttachment, RecordType, UserProfile } from '../types';
import { transcribeAudioWithIAU } from '../lib/geminiBridge';
import { AudioProcessor, AudioCaptureResult } from '../lib/audioProcessor';
import {
  validateFile,
  uploadToStorageWithProgress,
  executeRecordCreationPipeline,
} from '../lib/uploadService';
import {
  X,
  Mic,
  Image as ImageIcon,
  Video,
  File,
  FileText,
  Loader2,
  Square,
  ChevronLeft,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  ExternalLink,
} from 'lucide-react';

interface RecordEditorProps {
  user: UserProfile;
  initialRecord?: DiaryRecord | null;
  onSaved: (record: DiaryRecord) => void;
  onCancel: () => void;
}

type FormType = 'text' | 'photo' | 'video' | 'audio' | 'document';

export const RecordEditor: React.FC<RecordEditorProps> = ({
  user,
  initialRecord,
  onSaved,
  onCancel,
}) => {
  const [selectedType, setSelectedType] = useState<FormType>(
    initialRecord ? (initialRecord.type === 'mixed' ? 'document' : (initialRecord.type as FormType)) : 'text'
  );

  const [title, setTitle] = useState(initialRecord?.title || '');
  const [content, setContent] = useState(initialRecord?.content || initialRecord?.description || '');
  const [date, setDate] = useState(
    initialRecord?.date || new Date().toISOString().split('T')[0]
  );
  const [attachments, setAttachments] = useState<RecordAttachment[]>(
    initialRecord?.attachments || []
  );

  // Upload & Save Async State Machine
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadPhaseText, setUploadPhaseText] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stored pending file for retry if needed
  const [pendingFile, setPendingFile] = useState<File | Blob | null>(null);
  const [pendingFileType, setPendingFileType] = useState<FormType>('text');

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState('00:00');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [previewAudioPlaying, setPreviewAudioPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const triggerUploadFor = (type: FormType) => {
    setSelectedType(type);
    if (type === 'text') return;

    if (fileInputRef.current) {
      if (type === 'photo') fileInputRef.current.accept = 'image/*';
      else if (type === 'video') fileInputRef.current.accept = 'video/*';
      else if (type === 'audio') fileInputRef.current.accept = 'audio/*';
      else fileInputRef.current.accept = '.pdf,.doc,.docx,.txt,.csv,.json,.zip';
      fileInputRef.current.click();
    }
  };

  /**
   * File Selection & Validation with Resumable Upload
   */
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setPendingFile(file);
    setPendingFileType(selectedType);

    // Step 2: Validate file
    const val = validateFile(file, selectedType);
    if (!val.valid) {
      setErrorMessage(val.error || 'Arquivo selecionado não é válido.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Auto-fill title if empty
    if (!title.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setTitle(cleanName);
    }

    // Step 3 & 4: Upload to Firebase Storage with live progress & timeout
    await executeFileUpload(file, selectedType, val.fileName, val.mimeType);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeFileUpload = async (
    fileOrBlob: File | Blob,
    type: FormType,
    fileName: string,
    mimeType: string
  ) => {
    setIsUploading(true);
    setUploadPercent(0);
    setUploadPhaseText('Iniciando envio...');
    setErrorMessage(null);

    const folderMap = {
      photo: 'images' as const,
      video: 'videos' as const,
      audio: 'audio' as const,
      document: 'documents' as const,
      text: 'documents' as const,
    };

    const tempRecordId = initialRecord?.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const result = await uploadToStorageWithProgress({
        uid: user.uid,
        recordId: tempRecordId,
        fileOrBlob,
        folder: folderMap[type],
        fileName,
        mimeType,
        onProgress: (pct, text) => {
          setUploadPercent(pct);
          setUploadPhaseText(text);
        },
        timeoutMs: type === 'video' ? 60000 : 45000,
      });

      const newAtt: RecordAttachment = {
        id: `att_${Date.now()}`,
        name: result.fileName,
        type: type === 'photo' ? 'image' : type === 'document' ? 'document' : (type as any),
        url: result.url,
        storagePath: result.storagePath,
        size: result.fileSize,
        mimeType: result.mimeType,
        durationSeconds: type === 'audio' ? recordSeconds : undefined,
      };

      setAttachments([newAtt]);
      setPendingFile(null);
      setUploadPercent(100);
      setUploadPhaseText('Arquivo carregado com sucesso!');
    } catch (err: any) {
      console.error('[UPLOAD ERROR] Falha no upload:', err);
      setErrorMessage(
        `Não foi possível salvar o arquivo. ${err.message || 'Verifique sua conexão e tente novamente.'}`
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Audio Recording Handlers
  const handleStartAudioRecord = async () => {
    try {
      setErrorMessage(null);
      setRecordSeconds(0);
      setRecordTimer('00:00');
      audioProcessorRef.current = new AudioProcessor();
      await audioProcessorRef.current.startRecording((formatted, secs) => {
        setRecordTimer(formatted);
        setRecordSeconds(secs);
      });
      setIsRecording(true);
      console.log('[UPLOAD] Gravação de áudio iniciada com processamento de estúdio.');
    } catch (err: any) {
      console.error('[UPLOAD ERROR] Falha ao iniciar microfone:', err);
      setErrorMessage('Não foi possível acessar o microfone. Verifique as permissões do seu navegador.');
    }
  };

  const handleStopAudioRecord = async () => {
    if (!audioProcessorRef.current || !isRecording) return;
    try {
      setIsRecording(false);
      setUploadPhaseText('Processando áudio com redução de ruído...');
      setIsUploading(true);
      setUploadPercent(15);

      const result: AudioCaptureResult = await audioProcessorRef.current.stopRecording();
      const fileName = `gravacao_${Date.now()}.${result.mimeType.includes('mp4') ? 'm4a' : 'webm'}`;

      setPendingFile(result.blob);
      setPendingFileType('audio');

      // 1. Upload audio to Firebase Storage
      const folderMap = 'audio' as const;
      const tempRecordId = initialRecord?.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const uploadRes = await uploadToStorageWithProgress({
        uid: user.uid,
        recordId: tempRecordId,
        fileOrBlob: result.blob,
        folder: folderMap,
        fileName,
        mimeType: result.mimeType,
        onProgress: (pct, text) => {
          setUploadPercent(Math.max(15, Math.round(pct * 0.75)));
          setUploadPhaseText(text);
        },
        timeoutMs: 40000,
      });

      // 2. Transcribe Audio with Gemini
      setUploadPhaseText('Gerando transcrição inteligente com a IAU...');
      setIsTranscribing(true);
      let transcriptText = '';
      try {
        transcriptText = await transcribeAudioWithIAU(result.base64, result.mimeType);
        console.log('[UPLOAD] Transcrição concluída:', transcriptText.substring(0, 50));
      } catch (tErr) {
        console.warn('[UPLOAD] Transcrição aviso:', tErr);
      } finally {
        setIsTranscribing(false);
      }

      const newAtt: RecordAttachment = {
        id: `att_${Date.now()}`,
        name: fileName,
        type: 'audio',
        url: uploadRes.url,
        storagePath: uploadRes.storagePath,
        size: result.blob.size,
        mimeType: result.mimeType,
        transcript: transcriptText || undefined,
        transcriptStatus: transcriptText ? 'completed' : undefined,
        durationSeconds: result.durationSeconds,
      };

      setAttachments([newAtt]);
      setPendingFile(null);

      if (transcriptText && !content.trim()) {
        setContent(transcriptText);
      }
      if (!title.trim()) {
        setTitle('Gravação de ideias');
      }

      setUploadPercent(100);
      setUploadPhaseText('Áudio pronto!');
    } catch (err: any) {
      console.error('[UPLOAD ERROR] Gravação áudio falhou:', err);
      setErrorMessage(
        `Não foi possível salvar o arquivo de áudio. ${err.message || 'Tente gravar novamente.'}`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryUpload = async () => {
    if (!pendingFile) return;
    const isFile = pendingFile instanceof File;
    const fName = isFile ? (pendingFile as File).name : `arquivo_${Date.now()}`;
    const mMime = pendingFile.type || 'application/octet-stream';
    await executeFileUpload(pendingFile, pendingFileType, fName, mMime);
  };

  const handleRemoveAttachment = () => {
    setAttachments([]);
    setPendingFile(null);
    setErrorMessage(null);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewAudioPlaying(false);
  };

  /**
   * Final Save Record Submission (Prevents duplicate requests)
   */
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Prevent duplicate simultaneous submissions
    if (isSubmittingRef.current || isSaving || isUploading) {
      console.warn('[UPLOAD] Envio já em andamento. Clique duplicado bloqueado.');
      return;
    }

    if (isRecording) {
      await handleStopAudioRecord();
    }

    isSubmittingRef.current = true;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let finalType: RecordType = selectedType;
      if (attachments.length > 0) {
        const attType = attachments[0].type;
        if (attType === 'image') finalType = 'photo';
        else if (attType === 'video') finalType = 'video';
        else if (attType === 'audio') finalType = 'audio';
        else if (attType === 'document') finalType = 'document';
      }

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Use the verified pipeline
      const saved = await executeRecordCreationPipeline({
        uid: user.uid,
        recordId: initialRecord?.id,
        type: finalType,
        title: title.trim(),
        content: content.trim(),
        date: date || now.toISOString().split('T')[0],
        time: initialRecord?.time || timeStr,
        category: initialRecord?.category || 'geral',
        tags: initialRecord?.tags || [],
        existingAttachments: attachments,
        onProgress: (pct, stage) => {
          setUploadPercent(pct);
          setUploadPhaseText(stage);
        },
      });

      setSuccessMessage('✓ Arquivo salvo');

      // Smooth transition after confirmation
      setTimeout(() => {
        isSubmittingRef.current = false;
        onSaved(saved);
      }, 700);
    } catch (err: any) {
      isSubmittingRef.current = false;
      console.error('[UPLOAD ERROR] Salvar registro falhou:', err);
      setErrorMessage(
        err.message || 'Não foi possível salvar o registro. Tente novamente.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const togglePreviewAudio = (audioUrl: string) => {
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(audioUrl);
      previewAudioRef.current.onended = () => setPreviewAudioPlaying(false);
    }

    if (previewAudioPlaying) {
      previewAudioRef.current.pause();
      setPreviewAudioPlaying(false);
    } else {
      previewAudioRef.current.play().catch(() => {});
      setPreviewAudioPlaying(true);
    }
  };

  const currentPhoto = attachments.find((a) => a.type === 'image' || a.mimeType?.startsWith('image/'));
  const currentVideo = attachments.find((a) => a.type === 'video' || a.mimeType?.startsWith('video/'));
  const currentAudio = attachments.find((a) => a.type === 'audio' || a.mimeType?.startsWith('audio/'));
  const currentDoc = attachments.find((a) => a.type === 'document' || (!currentPhoto && !currentVideo && !currentAudio && a.url));

  return (
    <div id="record-editor-view" className="max-w-md mx-auto px-4 py-4 space-y-5">
      {/* Hidden File Input with broad format support */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Top Nav Header */}
      <div className="flex items-center justify-between pb-1">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <h2 className="text-sm font-semibold text-stone-800">
          {initialRecord ? 'Editar registro' : 'Novo registro'}
        </h2>

        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Title: O que você quer guardar? */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-stone-800">O que você quer guardar?</h3>

        {/* 5 Option Cards Grid */}
        <div className="grid grid-cols-5 gap-2">
          {/* 1. Texto */}
          <button
            type="button"
            onClick={() => setSelectedType('text')}
            className={`flex flex-col items-center justify-center py-3 px-1 rounded-2xl border transition-all cursor-pointer ${
              selectedType === 'text'
                ? 'bg-orange-50/90 border-orange-300 ring-2 ring-orange-500/20'
                : 'bg-white border-stone-100 hover:bg-stone-50'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 mb-1">
              <span className="text-base font-bold font-serif leading-none">T</span>
            </div>
            <span className="text-[11px] font-medium text-stone-700">Texto</span>
          </button>

          {/* 2. Foto */}
          <button
            type="button"
            onClick={() => triggerUploadFor('photo')}
            className={`flex flex-col items-center justify-center py-3 px-1 rounded-2xl border transition-all cursor-pointer ${
              selectedType === 'photo'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-500/20'
                : 'bg-white border-stone-100 hover:bg-stone-50'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-1">
              <ImageIcon className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700">Foto</span>
          </button>

          {/* 3. Vídeo */}
          <button
            type="button"
            onClick={() => triggerUploadFor('video')}
            className={`flex flex-col items-center justify-center py-3 px-1 rounded-2xl border transition-all cursor-pointer ${
              selectedType === 'video'
                ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-500/20'
                : 'bg-white border-stone-100 hover:bg-stone-50'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 mb-1">
              <Video className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700">Vídeo</span>
          </button>

          {/* 4. Áudio */}
          <button
            type="button"
            onClick={() => setSelectedType('audio')}
            className={`flex flex-col items-center justify-center py-3 px-1 rounded-2xl border transition-all cursor-pointer ${
              selectedType === 'audio'
                ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-500/20'
                : 'bg-white border-stone-100 hover:bg-stone-50'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-1">
              <Mic className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700">Áudio</span>
          </button>

          {/* 5. Arquivo */}
          <button
            type="button"
            onClick={() => triggerUploadFor('document')}
            className={`flex flex-col items-center justify-center py-3 px-1 rounded-2xl border transition-all cursor-pointer ${
              selectedType === 'document'
                ? 'bg-blue-50/90 border-blue-300 ring-2 ring-blue-500/20'
                : 'bg-white border-stone-100 hover:bg-stone-50'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-1">
              <File className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-stone-700">Arquivo</span>
          </button>
        </div>
      </div>

      {/* Live Upload Progress Indicator */}
      {isUploading && (
        <div className="bg-white border border-orange-100 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
              <span className="text-xs font-semibold text-stone-800">
                {uploadPhaseText || 'Enviando...'}
              </span>
            </div>
            <span className="text-xs font-bold font-mono text-orange-600">
              {uploadPercent}%
            </span>
          </div>

          {/* Real progress bar */}
          <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-600 transition-all duration-200 ease-out rounded-full"
              style={{ width: `${Math.max(5, uploadPercent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Audio Recorder Module if Audio is selected and no audio yet */}
      {selectedType === 'audio' && !currentAudio && !isUploading && (
        <div className="bg-white border border-stone-100 rounded-3xl p-5 space-y-3 shadow-xs text-center">
          <p className="text-xs text-stone-500">Grave sua voz com redução de ruído ou envie um arquivo de áudio</p>

          <div className="flex items-center justify-center gap-3">
            {isRecording ? (
              <button
                type="button"
                onClick={handleStopAudioRecord}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-full shadow-sm animate-pulse cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Parar ({recordTimer})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartAudioRecord}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-full shadow-sm cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Gravar áudio agora</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => triggerUploadFor('audio')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-full transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Enviar arquivo</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. Photo Preview (Real Storage URL rendering) */}
      {currentPhoto && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-700">Foto salva</span>
            <span className="text-[10px] text-stone-400">
              {currentPhoto.size ? `${(currentPhoto.size / (1024 * 1024)).toFixed(1)} MB` : ''}
            </span>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-stone-100 bg-stone-100 aspect-video max-h-48 shadow-xs">
            <img
              src={currentPhoto.url}
              alt={title || 'Foto'}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <button
              type="button"
              onClick={handleRemoveAttachment}
              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Video Preview (Playable video with controls) */}
      {currentVideo && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-700">Vídeo salvo</span>
            <span className="text-[10px] text-stone-400">
              {currentVideo.size ? `${(currentVideo.size / (1024 * 1024)).toFixed(1)} MB` : ''}
            </span>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-stone-100 bg-stone-900 aspect-video max-h-48 shadow-xs">
            <video
              src={currentVideo.url}
              controls
              className="w-full h-full object-contain"
            />
            <button
              type="button"
              onClick={handleRemoveAttachment}
              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Audio Preview (With waveform player & transcript) */}
      {currentAudio && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-700">Áudio gravado</span>
          <div className="bg-white border border-stone-100 rounded-2xl p-3.5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => togglePreviewAudio(currentAudio.url)}
                  className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                >
                  {previewAudioPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-stone-800 truncate">{currentAudio.name}</p>
                  <p className="text-[10px] text-stone-400 font-mono">
                    {currentAudio.durationSeconds
                      ? `${Math.floor(currentAudio.durationSeconds / 60)
                          .toString()
                          .padStart(2, '0')}:${(currentAudio.durationSeconds % 60)
                          .toString()
                          .padStart(2, '0')}`
                      : 'Áudio gravado'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRemoveAttachment}
                className="w-7 h-7 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {currentAudio.transcript && (
              <div className="bg-stone-50 rounded-xl p-2.5 text-xs text-stone-600 leading-relaxed border border-stone-100">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 block mb-0.5">
                  Transcrição IAU
                </span>
                {currentAudio.transcript}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Document Preview */}
      {currentDoc && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-stone-700">Arquivo anexado</span>
          <div className="bg-white border border-stone-100 rounded-2xl p-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <File className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-stone-800 truncate">{currentDoc.name}</p>
                <p className="text-[10px] text-stone-400">
                  {currentDoc.name?.toUpperCase().endsWith('.PDF') ? 'PDF' : 'Arquivo'} •{' '}
                  {currentDoc.size ? `${(currentDoc.size / (1024 * 1024)).toFixed(1)} MB` : 'Pronto'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <a
                href={currentDoc.url}
                target="_blank"
                rel="noreferrer"
                className="w-7 h-7 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 flex items-center justify-center"
                title="Abrir arquivo"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={handleRemoveAttachment}
                className="w-7 h-7 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner with Retry Button (Guarantees no infinite hanging) */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 space-y-2 text-xs text-red-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-800">Não foi possível salvar o arquivo</p>
              <p className="mt-0.5 text-red-700">{errorMessage}</p>
            </div>
          </div>

          {pendingFile && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleRetryUpload}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Tentar novamente</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2 text-xs text-emerald-800 font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Form Fields */}
      <form onSubmit={handleSave} className="space-y-4">
        {/* Título (opcional) */}
        <div className="space-y-1.5">
          <label className="text-xs text-stone-500 font-normal">Título (opcional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Passeio de fim de tarde"
            className="w-full bg-white border border-stone-200/80 rounded-2xl px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 transition-colors shadow-xs"
          />
        </div>

        {/* Descrição (opcional) */}
        <div className="space-y-1.5">
          <label className="text-xs text-stone-500 font-normal">Descrição (opcional)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva detalhes, pensamentos ou reflexões sobre este registro..."
            rows={3}
            className="w-full bg-white border border-stone-200/80 rounded-2xl px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 transition-colors resize-none shadow-xs"
          />
        </div>

        {/* Data */}
        <div className="space-y-1.5">
          <label className="text-xs text-stone-500 font-normal">Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-white border border-stone-200/80 rounded-2xl px-4 py-3 text-sm text-stone-800 focus:outline-hidden focus:border-orange-500 transition-colors shadow-xs"
          />
        </div>

        {/* Botão Salvar registro (Bloqueia múltiplos cliques durante envio) */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSaving || isUploading || isRecording}
            className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold text-sm rounded-2xl shadow-md shadow-orange-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-99"
          >
            {isSaving || isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{uploadPhaseText || 'Enviando...'}</span>
              </>
            ) : successMessage ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Salvo com sucesso</span>
              </>
            ) : (
              <span>Salvar registro</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
