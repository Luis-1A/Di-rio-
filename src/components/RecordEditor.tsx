import React, { useState, useRef, useEffect } from 'react';
import { DiaryRecord, RecordAttachment, RecordType, UserProfile } from '../types';
import { AudioProcessor, AudioCaptureResult } from '../lib/audioProcessor';
import { validateFile, UploadStage } from '../lib/uploadService';
import { enqueueBackgroundUpload } from '../lib/backgroundUploadManager';
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
  // Permanent Record ID: never changes during the lifecycle of this record creation or edit
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

  // Upload State Machine
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Local pending file tracking for retry
  const [pendingFile, setPendingFile] = useState<File | Blob | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [pendingFileSize, setPendingFileSize] = useState<number>(0);
  const [pendingFileType, setPendingFileType] = useState<FormType>('text');
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialRecord?.attachments?.[0]?.url || null
  );

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState('00:00');
  const [recordSeconds, setRecordSeconds] = useState(0);
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
  /**
   * File Selection & Validation (Instant Local-First Preview)
   */
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setPendingFileType(selectedType);

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    const newAtt: RecordAttachment = {
      id: `att_${Date.now()}`,
      name: val.fileName,
      type:
        selectedType === 'photo'
          ? 'image'
          : selectedType === 'document'
          ? 'document'
          : (selectedType as any),
      url: localUrl,
      size: val.fileSize,
      mimeType: val.mimeType,
    };
    setAttachments([newAtt]);

    // Auto-fill title if empty
    if (!title.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setTitle(cleanName);
    }

    setUploadStage('selected');
    setUploadPercent(100);
    setUploadMessage(`Arquivo pronto: ${val.fileName}`);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Audio Recording Handlers
  const handleStartAudioRecord = async () => {
    try {
      setUploadError(null);
      setRecordSeconds(0);
      setRecordTimer('00:00');
      audioProcessorRef.current = new AudioProcessor();
      await audioProcessorRef.current.startRecording((formatted, secs) => {
        setRecordTimer(formatted);
        setRecordSeconds(secs);
      });
      setIsRecording(true);
    } catch (err: any) {
      console.error('[AUDIO ERROR] Falha no microfone:', err);
      setUploadStage('failed');
      setUploadError(
        'Não foi possível acessar o microfone. Verifique as permissões do seu navegador.'
      );
    }
  };

  const handleStopAudioRecord = async () => {
    if (!audioProcessorRef.current || !isRecording) return;
    try {
      setIsRecording(false);
      const result: AudioCaptureResult =
        await audioProcessorRef.current.stopRecording();
      const fileName = `gravacao_${Date.now()}.${
        result.mimeType.includes('mp4') ? 'm4a' : 'webm'
      }`;

      setPendingFile(result.blob);
      setPendingFileName(fileName);
      setPendingFileSize(result.blob.size);
      setPendingFileType('audio');

      const localUrl = URL.createObjectURL(result.blob);
      setPreviewUrl(localUrl);

      const newAtt: RecordAttachment = {
        id: `att_${Date.now()}`,
        name: fileName,
        type: 'audio',
        url: localUrl,
        size: result.blob.size,
        mimeType: result.mimeType,
        durationSeconds: recordSeconds,
      };
      setAttachments([newAtt]);

      if (!title.trim()) {
        setTitle(
          `Áudio gravado (${new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })})`
        );
      }

      setUploadStage('selected');
      setUploadPercent(100);
      setUploadMessage(`Gravação concluída: ${fileName}`);
    } catch (err: any) {
      console.error('[AUDIO ERROR] Falha ao salvar áudio:', err);
      setUploadStage('failed');
      setUploadError(
        err.message || 'Erro ao processar gravação. Tente novamente.'
      );
    }
  };

  const handleRemoveAttachment = () => {
    setAttachments([]);
    setPendingFile(null);
    setPendingFileName('');
    setPendingFileSize(0);
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
   * Final Save Record Submission (Instant Local-First with Background Sync)
   */
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    if (!title.trim() && !content.trim() && attachments.length === 0) {
      setUploadError('Por favor, escreva um texto ou anexe um arquivo para salvar.');
      return;
    }

    isSubmittingRef.current = true;
    setUploadStage('saving_record');
    setUploadPercent(100);
    setUploadMessage('Salvo no dispositivo! Sincronizando com a nuvem...');
    setUploadError(null);

    try {
      const savedRecord = await enqueueBackgroundUpload({
        uid: user.uid,
        recordId,
        type: selectedType === 'text' ? 'text' : (selectedType as RecordType),
        title:
          title.trim() ||
          (selectedType === 'photo'
            ? 'Foto'
            : selectedType === 'audio'
            ? 'Áudio'
            : selectedType === 'video'
            ? 'Vídeo'
            : selectedType === 'document'
            ? 'Arquivo'
            : 'Anotação'),
        content: content.trim(),
        date,
        time: new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        category,
        tags,
        fileOrBlob: pendingFile,
        fileName: pendingFileName,
        mimeType: pendingFile?.type,
        audioDurationSeconds:
          selectedType === 'audio' ? recordSeconds : undefined,
        existingAttachments: attachments,
      });

      isSubmittingRef.current = false;
      onSaved(savedRecord);
    } catch (err: any) {
      console.error('[SAVE ERROR] Falha ao salvar no dispositivo:', err);
      isSubmittingRef.current = false;
      setUploadStage('failed');
      setUploadError(
        `Não foi possível salvar o registro: ${
          err.message || 'Erro no armazenamento local. Tente novamente.'
        }`
      );
    }
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
          onClick={onCancel}
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
          disabled={uploadStage === 'uploading' || uploadStage === 'saving_record'}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer ${
            uploadStage === 'uploading' || uploadStage === 'saving_record'
              ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
              : 'bg-orange-600 hover:bg-orange-700 active:scale-95 text-white'
          }`}
        >
          {uploadStage === 'saving_record' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Salvando...</span>
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
      />

      {/* Type Selector Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedType('text')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'text'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Texto</span>
        </button>

        <button
          type="button"
          onClick={() => triggerUploadFor('photo')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'photo'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Foto</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedType('audio')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'audio'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Áudio</span>
        </button>

        <button
          type="button"
          onClick={() => triggerUploadFor('video')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'video'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>Vídeo</span>
        </button>

        <button
          type="button"
          onClick={() => triggerUploadFor('document')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
            selectedType === 'document'
              ? 'bg-orange-600 text-white shadow-xs font-semibold'
              : 'bg-white border border-stone-200/80 text-stone-600 hover:bg-stone-50'
          }`}
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
            placeholder={
              selectedType === 'photo'
                ? 'Ex: Passeio de domingo...'
                : selectedType === 'audio'
                ? 'Ex: Ideia para o projeto...'
                : selectedType === 'document'
                ? 'Ex: Relatório mensal ou Comprovante...'
                : 'Título do registro...'
            }
            className="w-full bg-stone-50 border border-stone-200/90 rounded-2xl px-3.5 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 focus:bg-white transition-all"
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
              className="w-full bg-stone-50 border border-stone-200/90 rounded-2xl px-3.5 py-2 text-xs text-stone-800 focus:outline-hidden focus:border-orange-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Special Audio Recorder Block */}
        {selectedType === 'audio' && attachments.length === 0 && (
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
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs font-semibold rounded-full shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Iniciar Microfone</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerUploadFor('audio')}
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-medium rounded-full shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Enviar Arquivo de Áudio</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Media & Attachment Preview & Stage Tracker */}
        {(attachments.length > 0 || uploadStage !== 'idle') && (
          <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">
                Arquivo Anexo
              </span>
              <button
                type="button"
                onClick={handleRemoveAttachment}
                className="text-stone-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                title="Remover anexo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Photo Preview: Zero crop, native ratio */}
            {selectedType === 'photo' && previewUrl && (
              <div className="rounded-xl overflow-hidden border border-stone-200 bg-stone-900/5 max-h-72 relative flex items-center justify-center p-1">
                <img
                  src={previewUrl}
                  alt="Pré-visualização"
                  className="max-w-full max-h-72 w-auto h-auto object-contain rounded-lg"
                />
              </div>
            )}

            {/* Video Preview */}
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
                      {recordTimer !== '00:00' ? `Duração: ${recordTimer}` : 'Pronto para salvar'}
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
                      {pendingFileSize ? ` • ${(pendingFileSize / (1024 * 1024)).toFixed(2)} MB` : ''}
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

            {/* Structured Stage Progress Card */}
            {uploadStage !== 'idle' && (
              <div className="bg-white border border-stone-200/90 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {uploadStage === 'saving_record' ? (
                      <Loader2 className="w-3.5 h-3.5 text-orange-600 animate-spin" />
                    ) : uploadStage === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                    <span
                      className={`font-semibold ${
                        uploadStage === 'failed'
                          ? 'text-red-700'
                          : 'text-stone-800'
                      }`}
                    >
                      {uploadStage === 'selected' && 'Arquivo Pronto no Dispositivo'}
                      {uploadStage === 'saving_record' && 'Salvando no Dispositivo...'}
                      {uploadStage === 'completed' && 'Salvo! Sincronizando em 2º plano'}
                      {uploadStage === 'failed' && 'Erro de Validação'}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-emerald-600 font-semibold">
                    ✓ Local
                  </span>
                </div>

                <p className="text-[11px] text-stone-500">
                  {uploadMessage || 'O arquivo é salvo de imediato no aparelho e enviado ao Firebase em segundo plano.'}
                </p>

                {/* Error Banner */}
                {uploadError && (
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-red-600 font-medium">
                      {uploadError}
                    </p>
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
            placeholder="Escreva suas memórias, pensamentos, reflexões ou detalhes deste arquivo..."
            className="w-full bg-stone-50 border border-stone-200/90 rounded-2xl p-3.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-orange-500 focus:bg-white transition-all leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
};
