import React, { useState, useRef, useEffect } from 'react';
import { DiaryRecord, RecordAttachment, RecordType, UserProfile } from '../types';
import { AudioProcessor, AudioCaptureResult } from '../lib/audioProcessor';
import {
  validateFile,
  executeDirectSavePipeline,
  cancelActiveUploadTask,
  formatBytes,
  UploadStage,
  UploadStageUpdate,
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
  Eye,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

interface RecordEditorProps {
  user: UserProfile;
  initialRecord?: DiaryRecord | null;
  onSaved: (record: DiaryRecord) => void;
  onCancel: () => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
}

type FormType = 'text' | 'photo' | 'video' | 'audio' | 'document';

export const RecordEditor: React.FC<RecordEditorProps> = ({
  user,
  initialRecord,
  onSaved,
  onCancel,
  onOpenPdf,
}) => {
  // 1. Immutable Record ID for entire lifecycle (Storage + Firestore + Verification)
  const [recordId] = useState<string>(
    () =>
      initialRecord?.id ||
      `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  const [selectedType, setSelectedType] = useState<FormType>(
    initialRecord
      ? initialRecord.type === 'mixed'
        ? 'document'
        : (initialRecord.type as FormType)
      : 'text'
  );

  const [title, setTitle] = useState(initialRecord?.title || '');
  const [content, setContent] = useState(
    initialRecord?.content || initialRecord?.description || ''
  );
  const [date, setDate] = useState(
    initialRecord?.date || new Date().toISOString().split('T')[0]
  );
  const [category] = useState(initialRecord?.category || 'geral');
  const [tags] = useState<string[]>(initialRecord?.tags || []);
  const [attachments, setAttachments] = useState<RecordAttachment[]>(
    initialRecord?.attachments || []
  );

  // Direct Upload & Verification State Machine
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bytesTransferred, setBytesTransferred] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);

  // Local pending file tracking
  const [pendingFile, setPendingFile] = useState<File | Blob | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [pendingFileSize, setPendingFileSize] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialRecord?.attachments?.[0]?.url || initialRecord?.thumbnailUrl || null
  );

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState('00:00');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [previewAudioPlaying, setPreviewAudioPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);

  // Exit Confirmation Modal while uploading
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);

  const isSavingOrUploading =
    uploadStage === 'validating' ||
    uploadStage === 'uploading' ||
    uploadStage === 'storage_confirmed' ||
    uploadStage === 'saving_record' ||
    uploadStage === 'verifying';

  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const triggerUploadFor = (type: FormType) => {
    if (isSavingOrUploading) return;
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
   * File Selection & Validation
   */
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const val = validateFile(file, selectedType);
    if (!val.valid) {
      setUploadStage('failed');
      setUploadError(val.error || 'Arquivo selecionado não é válido.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setPendingFile(file);
    setPendingFileName(val.fileName);
    setPendingFileSize(val.fileSize);
    setTotalBytes(val.fileSize);
    setBytesTransferred(0);

    // Create local object URL for preview
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    // If title is empty, automatically suggest file name
    if (!title.trim()) {
      const cleanName = val.fileName.replace(/\.[^/.]+$/, '').replace(/[_\\-]/g, ' ');
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }

    setUploadStage('selected');
    setUploadPercent(0);
    setUploadMessage(`Arquivo pronto para envio: ${val.fileName} (${formatBytes(val.fileSize)})`);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Audio Recording Handlers
   */
  const handleStartAudioRecord = async () => {
    if (isSavingOrUploading) return;
    setUploadError(null);
    try {
      const processor = new AudioProcessor();
      audioProcessorRef.current = processor;

      await processor.startRecording((formatted, seconds) => {
        setRecordSeconds(seconds);
        setRecordTimer(formatted);
      });

      setIsRecording(true);
    } catch (err: any) {
      console.error('[AUDIO ERROR] Falha ao iniciar gravação:', err);
      setUploadError('Permissão de microfone negada ou indisponível.');
    }
  };

  const handleStopAudioRecord = async () => {
    if (!audioProcessorRef.current) return;
    try {
      const res: AudioCaptureResult = await audioProcessorRef.current.stopRecording();
      setIsRecording(false);

      setPendingFile(res.blob);
      const audioName = `gravacao_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      setPendingFileName(audioName);
      setPendingFileSize(res.blob.size);
      setTotalBytes(res.blob.size);

      const audioUrl = URL.createObjectURL(res.blob);
      setPreviewUrl(audioUrl);

      if (!title.trim()) {
        setTitle(`Áudio gravado (${recordTimer})`);
      }

      setUploadStage('selected');
      setUploadPercent(0);
      setUploadMessage(`Áudio gravado com sucesso (${formatBytes(res.blob.size)}). Pronto para salvar.`);
    } catch (err: any) {
      console.error('[AUDIO ERROR] Falha ao finalizar áudio:', err);
      setIsRecording(false);
      setUploadError('Erro ao processar gravação de voz.');
    }
  };

  const handleRemoveAttachment = () => {
    if (isSavingOrUploading) return;
    setAttachments([]);
    setPendingFile(null);
    setPendingFileName('');
    setPendingFileSize(0);
    setTotalBytes(0);
    setBytesTransferred(0);
    setPreviewUrl(null);
    setUploadStage('idle');
    setUploadError(null);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewAudioPlaying(false);
  };

  const togglePreviewAudio = () => {
    if (!previewUrl) return;
    if (previewAudioPlaying) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setPreviewAudioPlaying(false);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio(previewUrl);
        previewAudioRef.current.onended = () => setPreviewAudioPlaying(false);
      }
      previewAudioRef.current.play().catch(() => {});
      setPreviewAudioPlaying(true);
    }
  };

  /**
   * Direct Save Submission (Direct Storage + Firestore + Verification)
   * The user remains on this screen until Firestore verifies the record.
   */
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isSubmittingRef.current || isSavingOrUploading) {
      return;
    }

    if (!title.trim() && !content.trim() && attachments.length === 0 && !pendingFile) {
      setUploadError('Por favor, escreva um texto ou anexe um arquivo para salvar.');
      return;
    }

    isSubmittingRef.current = true;
    setUploadError(null);
    setUploadStage('validating');
    setUploadPercent(5);
    setUploadMessage('Validando dados e iniciando envio...');

    try {
      const savedRecord = await executeDirectSavePipeline({
        uid: user.uid,
        recordId,
        type: selectedType === 'text' ? 'text' : (selectedType as RecordType),
        title:
          title.trim() ||
          (selectedType === 'photo'
            ? 'Foto salva'
            : selectedType === 'audio'
            ? 'Áudio gravado'
            : selectedType === 'video'
            ? 'Vídeo gravado'
            : selectedType === 'document'
            ? 'Arquivo salvo'
            : 'Registro pessoal'),
        content: content.trim(),
        date,
        time: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        category,
        tags,
        fileOrBlob: pendingFile,
        existingAttachments: attachments,
        audioDurationSeconds:
          selectedType === 'audio' ? recordSeconds : undefined,
        onProgress: (update: UploadStageUpdate) => {
          setUploadStage(update.stage);
          setUploadPercent(update.percent);
          setUploadMessage(update.message);
          if (update.bytesTransferred !== undefined) {
            setBytesTransferred(update.bytesTransferred);
          }
          if (update.totalBytes !== undefined) {
            setTotalBytes(update.totalBytes);
          }
          if (update.error) {
            setUploadError(update.error);
          }
        },
      });

      isSubmittingRef.current = false;
      setUploadStage('completed');
      setUploadPercent(100);
      setUploadMessage('Registro confirmado com sucesso no banco de dados!');

      // Release user to the confirmed view
      setTimeout(() => {
        onSaved(savedRecord);
      }, 500);
    } catch (err: any) {
      console.error('[SAVE PIPELINE ERROR] Falha no salvamento direto:', err);
      isSubmittingRef.current = false;
      setUploadStage('failed');
      setUploadError(
        err.message ||
          'Não foi possível concluir o envio. Verifique sua conexão e tente novamente.'
      );
    }
  };

  /**
   * Safe Exit Handler with In-Flight Confirmation Dialog
   */
  const handleAttemptExit = () => {
    if (isSavingOrUploading) {
      setShowExitConfirmModal(true);
    } else {
      onCancel();
    }
  };

  /**
   * Confirms Cancellation of in-flight upload
   */
  const handleConfirmCancelUpload = () => {
    cancelActiveUploadTask(recordId);
    isSubmittingRef.current = false;
    setShowExitConfirmModal(false);
    onCancel();
  };

  const isPDF =
    attachments[0]?.name?.toLowerCase().endsWith('.pdf') ||
    attachments[0]?.mimeType === 'application/pdf' ||
    pendingFileName.toLowerCase().endsWith('.pdf');

  return (
    <div id="record-editor-container" className="max-w-xl mx-auto px-4 py-4 space-y-4">
      {/* Top Bar with Cancel and Save */}
      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          onClick={handleAttemptExit}
          className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200/80 px-3 py-1.5 rounded-full shadow-xs cursor-pointer transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <h2 className="text-sm font-bold text-stone-800">
          {initialRecord ? 'Editar Registro' : 'Novo Registro'}
        </h2>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSavingOrUploading}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer ${
            isSavingOrUploading
              ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
              : 'bg-orange-600 hover:bg-orange-700 active:scale-95 text-white'
          }`}
        >
          {isSavingOrUploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {uploadStage === 'uploading'
                  ? 'Enviando...'
                  : uploadStage === 'saving_record'
                  ? 'Gravando...'
                  : uploadStage === 'verifying'
                  ? 'Validando...'
                  : 'Processando...'}
              </span>
            </>
          ) : (
            <span>Salvar</span>
          )}
        </button>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        className="hidden"
        disabled={isSavingOrUploading}
      />

      {/* Type Selector Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => !isSavingOrUploading && setSelectedType('text')}
          disabled={isSavingOrUploading}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'text'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          } ${isSavingOrUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Texto</span>
        </button>

        <button
          type="button"
          onClick={() => triggerUploadFor('photo')}
          disabled={isSavingOrUploading}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'photo'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          } ${isSavingOrUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Foto</span>
        </button>

        <button
          type="button"
          onClick={() => !isSavingOrUploading && setSelectedType('audio')}
          disabled={isSavingOrUploading}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'audio'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          } ${isSavingOrUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Áudio</span>
        </button>

        <button
          type="button"
          onClick={() => triggerUploadFor('video')}
          disabled={isSavingOrUploading}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'video'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          } ${isSavingOrUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>Vídeo</span>
        </button>

        <button
          type="button"
          onClick={() => triggerUploadFor('document')}
          disabled={isSavingOrUploading}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'document'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          } ${isSavingOrUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <File className="w-3.5 h-3.5" />
          <span>PDF / Arquivo</span>
        </button>
      </div>

      {/* Main Form Box */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        {/* Title Input */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
            Título
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSavingOrUploading}
            placeholder={
              selectedType === 'photo'
                ? 'Ex: Passeio no parque...'
                : selectedType === 'audio'
                ? 'Ex: Ideia gravada...'
                : selectedType === 'video'
                ? 'Ex: Vídeo de recordação...'
                : selectedType === 'document'
                ? 'Ex: Relatório ou Comprovante...'
                : 'Título do registro...'
            }
            className="w-full bg-stone-50 border border-stone-200/90 rounded-2xl px-3.5 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 focus:bg-white transition-all disabled:opacity-60"
          />
        </div>

        {/* Date Input */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
              Data do Registro
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSavingOrUploading}
              className="w-full bg-stone-50 border border-stone-200/90 rounded-2xl px-3.5 py-2 text-xs text-stone-800 focus:outline-hidden focus:border-orange-500 focus:bg-white transition-all disabled:opacity-60"
            />
          </div>
        </div>

        {/* Special Audio Recorder Block */}
        {selectedType === 'audio' && attachments.length === 0 && !pendingFile && (
          <div className="p-4 bg-orange-50/50 border border-orange-200/60 rounded-2xl space-y-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <Mic className="w-5 h-5 text-orange-600" />
              <span className="text-xs font-semibold text-orange-950">
                {isRecording ? 'Gravando áudio...' : 'Gravação de Voz'}
              </span>
            </div>

            {isRecording ? (
              <div className="space-y-3">
                <div className="text-2xl font-mono font-bold text-orange-600 animate-pulse">
                  {recordTimer}
                </div>
                <button
                  type="button"
                  onClick={handleStopAudioRecord}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-semibold rounded-full shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Concluir Gravação</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleStartAudioRecord}
                  disabled={isSavingOrUploading}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs font-semibold rounded-full shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Gravar Microfone</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerUploadFor('audio')}
                  disabled={isSavingOrUploading}
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-medium rounded-full shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Enviar Arquivo de Áudio</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Media & Attachment Preview & Real Progress Bar */}
        {(attachments.length > 0 || pendingFile || uploadStage !== 'idle') && (
          <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">
                Arquivo Anexo
              </span>
              {!isSavingOrUploading && (
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  className="text-stone-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  title="Remover anexo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Photo Preview: ZERO CROP, native aspect ratio preserved */}
            {selectedType === 'photo' && previewUrl && (
              <div className="rounded-xl overflow-hidden border border-stone-200 bg-stone-900/5 max-h-72 relative flex items-center justify-center p-1">
                <img
                  src={previewUrl}
                  alt="Pré-visualização da foto"
                  className="max-w-full max-h-72 w-auto h-auto object-contain rounded-lg"
                />
              </div>
            )}

            {/* Video Preview: ZERO CROP */}
            {selectedType === 'video' && previewUrl && (
              <div className="rounded-xl overflow-hidden border border-stone-200 bg-stone-900 aspect-video max-h-56 relative">
                <video
                  src={previewUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Audio Preview Player */}
            {selectedType === 'audio' && previewUrl && (
              <div className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePreviewAudio}
                    className="w-9 h-9 rounded-full bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 transition-colors cursor-pointer shadow-xs"
                  >
                    {previewAudioPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>
                  <div>
                    <p className="text-xs font-semibold text-stone-800">
                      {attachments[0]?.name || pendingFileName || 'Áudio gravado'}
                    </p>
                    <p className="text-[10px] text-stone-400">
                      {recordTimer !== '00:00'
                        ? `Duração: ${recordTimer}`
                        : pendingFileSize
                        ? `${formatBytes(pendingFileSize)}`
                        : 'Pronto para salvar'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PDF / Document Row */}
            {selectedType === 'document' && (previewUrl || pendingFileName) && (
              <div className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-800 truncate">
                      {attachments[0]?.name || pendingFileName}
                    </p>
                    <p className="text-[10px] text-stone-400">
                      {isPDF ? 'Documento PDF' : 'Arquivo'}
                      {pendingFileSize ? ` • ${formatBytes(pendingFileSize)}` : ''}
                    </p>
                  </div>
                </div>

                {isPDF && previewUrl && onOpenPdf && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPdf(
                        previewUrl,
                        title || 'Documento PDF',
                        attachments[0]?.name || pendingFileName,
                        pendingFileSize
                      )
                    }
                    className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Abrir PDF</span>
                  </button>
                )}
              </div>
            )}

            {/* REAL PROGRESS & STATUS CARD (NO ARTIFICIAL LOADINGS) */}
            {uploadStage !== 'idle' && (
              <div className="bg-white border border-stone-200/90 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {isSavingOrUploading ? (
                      <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
                    ) : uploadStage === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                    <span
                      className={`font-semibold ${
                        uploadStage === 'failed'
                          ? 'text-red-700'
                          : uploadStage === 'completed'
                          ? 'text-emerald-700'
                          : 'text-stone-800'
                      }`}
                    >
                      {uploadStage === 'selected' && 'Arquivo pronto no dispositivo'}
                      {uploadStage === 'auth_checking' && '1. Verificando autenticação...'}
                      {uploadStage === 'validating' && '2. Preparando dados e arquivo...'}
                      {uploadStage === 'connecting_storage' && '3. Conectando ao Storage...'}
                      {uploadStage === 'uploading' && '4. Enviando arquivo para o Storage...'}
                      {uploadStage === 'storage_confirmed' && '5. Upload concluído com sucesso!'}
                      {uploadStage === 'obtaining_url' && '6. Obtendo URL segura...'}
                      {uploadStage === 'saving_record' && '7. Gravando metadados no Firestore...'}
                      {uploadStage === 'verifying' && '8. Confirmando gravação no banco...'}
                      {uploadStage === 'syncing_ui' && '9. Sincronizando interface...'}
                      {uploadStage === 'completed' && '10. Salvo e confirmado na nuvem!'}
                      {uploadStage === 'failed' && 'Falha no envio'}
                      {uploadStage === 'canceled' && 'Envio cancelado'}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-stone-500 font-semibold">
                    {uploadPercent}%
                  </span>
                </div>

                {/* Progress Bar with Real Transferred Bytes */}
                <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden border border-stone-200/60">
                  <div
                    className={`h-full transition-all duration-200 ${
                      uploadStage === 'failed'
                        ? 'bg-red-500'
                        : uploadStage === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-orange-600'
                    }`}
                    style={{ width: `${Math.max(2, uploadPercent)}%` }}
                  />
                </div>

                {/* Real Detailed Status Message */}
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  {uploadMessage || 'Aguardando ação.'}
                </p>

                {/* Explicit Error Feedback with Retry and Cancel Options */}
                {uploadError && (
                  <div className="pt-2 border-t border-red-100 space-y-2">
                    <p className="text-xs text-red-600 font-medium">
                      {uploadError}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSave}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Tentar novamente</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadStage('selected');
                          setUploadError(null);
                        }}
                        className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content Textarea */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
            Texto / Anotações
          </label>
          <textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSavingOrUploading}
            placeholder="Escreva suas memórias, pensamentos, reflexões ou detalhes deste arquivo..."
            className="w-full bg-stone-50 border border-stone-200/90 rounded-2xl p-3.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 focus:bg-white transition-all leading-relaxed disabled:opacity-60"
          />
        </div>
      </div>

      {/* Confirmation Modal if User Tries to Exit Mid-Upload (Requirement 6 & 7) */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-stone-200 max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-stone-900">
                O arquivo ainda está sendo enviado
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Sair agora cancelará o envio para o Firebase Storage e o registro não será salvo.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Continuar enviando
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelUpload}
                className="w-full py-2 text-stone-600 hover:text-red-600 font-medium text-xs rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
              >
                Cancelar envio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
