import React, { useState, useEffect, useRef } from 'react';
import { DiaryRecord, UserProfile, RecordAttachment } from '../types';
import { getLocalMediaBlob } from '../lib/idbStorage';
import { permanentlyDeleteRecord } from '../lib/firestoreService';
import { deleteLocalMediaBlob } from '../lib/idbStorage';
import { verifyAccountPassword } from '../lib/authService';
import { MediaFeedRenderer } from './MediaFeedRenderer';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Calendar,
  Clock,
  Tag,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  File,
  Download,
  ExternalLink,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  Maximize2,
  X,
  Share2,
  RotateCw,
  Wand2,
} from 'lucide-react';

interface RecordDetailViewProps {
  user: UserProfile;
  record: DiaryRecord;
  onBack: () => void;
  onEdit: (record: DiaryRecord) => void;
  onDeleted: (recordId: string) => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
  onEditPhoto?: (record: DiaryRecord, photoUrl: string) => void;
}

export const RecordDetailView: React.FC<RecordDetailViewProps> = ({
  user,
  record,
  onBack,
  onEdit,
  onDeleted,
  onOpenPdf,
  onEditPhoto,
}) => {
  // Media URLs with local fallback
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const [loadingMedia, setLoadingMedia] = useState(true);

  // Audio Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fullscreen Photo Modal
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Password-Protected Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Resolve local blobs if remote URLs are pending or not yet synced
  useEffect(() => {
    let isMounted = true;

    async function loadAttachments() {
      setLoadingMedia(true);
      const urls: Record<string, string> = {};

      if (record.attachments && record.attachments.length > 0) {
        for (const att of record.attachments) {
          if (att.url && att.url.startsWith('http')) {
            urls[att.id] = att.url;
          } else {
            // Check IndexedDB local blob
            try {
              const localBlob = await getLocalMediaBlob(record.id);
              if (localBlob && localBlob.blob) {
                urls[att.id] = URL.createObjectURL(localBlob.blob);
              } else if (att.url) {
                urls[att.id] = att.url;
              }
            } catch (err) {
              console.warn('Could not load local blob:', err);
              if (att.url) urls[att.id] = att.url;
            }
          }
        }
      } else {
        // Single legacy media check
        try {
          const localBlob = await getLocalMediaBlob(record.id);
          if (localBlob && localBlob.blob) {
            urls['primary'] = URL.createObjectURL(localBlob.blob);
          }
        } catch (e) {
          // ignore
        }
      }

      if (isMounted) {
        setResolvedMediaUrls(urls);
        setLoadingMedia(false);
      }
    }

    loadAttachments();

    return () => {
      isMounted = false;
      // Cleanup object URLs
      (Object.values(resolvedMediaUrls) as string[]).forEach((u) => {
        if (typeof u === 'string' && u.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(u);
          } catch (e) {
            // ignore
          }
        }
      });
    };
  }, [record.id, record.attachments]);

  // Audio Playback Handlers
  const handleToggleAudio = (audioSrc: string) => {
    if (!audioRef.current) {
      const audio = new Audio(audioSrc);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration || 0);
      };

      audio.ontimeupdate = () => {
        setAudioCurrentTime(audio.currentTime);
        if (audio.duration) {
          setAudioProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.onended = () => {
        setIsPlayingAudio(false);
        setAudioProgress(0);
        setAudioCurrentTime(0);
      };
    }

    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingAudio(true);
      }).catch((err) => {
        console.warn('Playback error:', err);
      });
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAudioProgress(val);
    if (audioRef.current && audioDuration) {
      audioRef.current.currentTime = (val / 100) * audioDuration;
    }
  };

  const toggleMuteAudio = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isAudioMuted;
      setIsAudioMuted(!isAudioMuted);
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Format seconds -> mm:ss
  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Format Date friendly
  const formattedDate = () => {
    const d = new Date(record.date || record.createdAt);
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Password-Protected Deletion
  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    if (!deletePassword.trim()) {
      setDeleteError('Digite sua senha para confirmar.');
      return;
    }

    setDeleteLoading(true);

    try {
      // 1. Authenticate password securely against Firebase Auth / Hash
      await verifyAccountPassword(user.email, deletePassword);

      // 2. Authorized! Delete from Firestore & Firebase Storage
      await permanentlyDeleteRecord(user.uid, record.id, record.attachments);

      // 3. Delete from Local IndexedDB
      await deleteLocalMediaBlob(record.id);

      // 4. Close modal and inform parent
      setShowDeleteModal(false);
      onDeleted(record.id);
    } catch (err: any) {
      console.error('Delete verification failed:', err);
      const msg = err.message || 'Senha incorreta. O registro não foi excluído.';
      setDeleteError(msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  const primaryAttachment = record.attachments && record.attachments.length > 0 ? record.attachments[0] : null;
  const primaryUrl = primaryAttachment ? resolvedMediaUrls[primaryAttachment.id] || primaryAttachment.url : resolvedMediaUrls['primary'];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Top Bar Navigation & Actions */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-stone-700 bg-white hover:bg-stone-100 hover:text-stone-900 border border-stone-200/80 rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-stone-500" />
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Photo Editor Button (When record is a photo) */}
          {record.type === 'photo' && onEditPhoto && (
            <button
              type="button"
              onClick={() => onEditPhoto(record, primaryUrl || record.thumbnailUrl || '')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-all shadow-xs cursor-pointer active:scale-95"
              title="Abrir editor de fotos integrado"
            >
              <Wand2 className="w-4 h-4 text-amber-300" />
              <span>Editar foto</span>
            </button>
          )}

          {/* Edit Button */}
          <button
            type="button"
            onClick={() => onEdit(record)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 rounded-xl transition-colors cursor-pointer"
          >
            <Edit3 className="w-4 h-4" />
            <span>Editar</span>
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => {
              setDeletePassword('');
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/80 rounded-xl transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Excluir</span>
          </button>
        </div>
      </div>

      {/* Main Record Header */}
      <article className="bg-white border border-stone-200/80 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="space-y-3">
          {/* Metadata Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 text-stone-700 font-medium rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-stone-500" />
              <span className="capitalize">{formattedDate()}</span>
            </span>

            {record.time && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 text-stone-700 font-medium rounded-lg">
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                <span>{record.time}</span>
              </span>
            )}

            {record.category && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-800 font-medium rounded-lg border border-orange-100">
                <Tag className="w-3 h-3 text-orange-600" />
                <span className="capitalize">{record.category}</span>
              </span>
            )}

            {record.syncStatus === 'local' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-medium rounded-md">
                ✓ Salvo no aparelho
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 text-stone-600 text-[11px] font-medium rounded-md">
                ☁️ Sincronizado
              </span>
            )}
          </div>

          {/* Record Title */}
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-stone-900 tracking-tight leading-snug">
            {record.title || 'Registro sem título'}
          </h1>

          {/* Tags */}
          {record.tags && record.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {record.tags.map((t, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md text-xs transition-colors"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Media Attachments Section (ZERO CROP & FULL FIDELITY) */}
        {record.type === 'photo' && (primaryUrl || record.thumbnailUrl) && (
          <div className="pt-2">
            <div className="relative group bg-stone-950/5 border border-stone-200/90 rounded-2xl overflow-hidden p-2 flex items-center justify-center min-h-[220px]">
              {/* Photo Display: object-contain with native aspect ratio preserved */}
              <img
                src={primaryUrl || record.thumbnailUrl}
                alt={record.title || 'Foto do registro'}
                className="max-w-full max-h-[75vh] w-auto h-auto object-contain rounded-xl transition-transform duration-200"
                style={{ imageOrientation: 'from-image' }}
              />

              <div className="absolute top-4 right-4 flex items-center gap-2">
                {onEditPhoto && (
                  <button
                    type="button"
                    onClick={() => onEditPhoto(record, primaryUrl || record.thumbnailUrl || '')}
                    className="p-2 bg-black/70 hover:bg-black/90 text-white rounded-xl backdrop-blur-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5 text-xs font-semibold"
                    title="Editar foto no sistema"
                  >
                    <Wand2 className="w-4 h-4 text-amber-300" />
                    <span>Editar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setFullscreenImage(primaryUrl || record.thumbnailUrl || '')}
                  className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-xl backdrop-blur-xs opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                  title="Ver em tela cheia"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {primaryAttachment?.name && (
              <p className="text-xs text-stone-500 mt-2 text-center font-mono">
                {primaryAttachment.name} {primaryAttachment.size ? `(${formatFileSize(primaryAttachment.size)})` : ''}
              </p>
            )}
          </div>
        )}

        {/* Video Player: Zero-crop, full controls */}
        {record.type === 'video' && (primaryUrl || record.downloadUrl || record.thumbnailUrl) && (
          <div className="pt-2">
            <div className="bg-black rounded-2xl overflow-hidden shadow-sm flex items-center justify-center min-h-[240px] relative">
              {primaryUrl || record.downloadUrl ? (
                <video
                  src={primaryUrl || record.downloadUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[70vh] h-auto object-contain"
                >
                  Seu navegador não suporta reprodução de vídeo HTML5.
                </video>
              ) : (
                <div className="relative w-full flex items-center justify-center">
                  <img
                    src={record.thumbnailUrl}
                    alt={record.title || 'Vídeo'}
                    className="w-full max-h-[70vh] h-auto object-contain opacity-75"
                  />
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 text-white p-4 text-center">
                    <RotateCw className="w-6 h-6 animate-spin text-amber-400" />
                    <p className="text-sm font-bold">Carregando vídeo da nuvem...</p>
                  </div>
                </div>
              )}
            </div>
            {primaryAttachment?.name && (
              <p className="text-xs text-stone-500 mt-2 text-center font-mono">
                {primaryAttachment.name} {primaryAttachment.size ? `(${formatFileSize(primaryAttachment.size)})` : ''}
              </p>
            )}
          </div>
        )}

        {/* Audio Player: Dedicated clean audio control card */}
        {record.type === 'audio' && primaryUrl && (
          <div className="pt-2">
            <div className="bg-gradient-to-r from-orange-50/70 to-amber-50/50 border border-orange-200/80 rounded-2xl p-5 md:p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
                    <Mic className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">
                      {primaryAttachment?.name || 'Gravação de Áudio'}
                    </h3>
                    <p className="text-xs text-stone-500">
                      {formattedDate()} {primaryAttachment?.size ? `• ${formatFileSize(primaryAttachment.size)}` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleMuteAudio}
                  className="p-2 text-stone-500 hover:text-stone-800 hover:bg-orange-100/60 rounded-xl transition-colors cursor-pointer"
                  title={isAudioMuted ? 'Desmutar' : 'Mutar'}
                >
                  {isAudioMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </div>

              {/* Player Controls & Scrubber */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggleAudio(primaryUrl)}
                    className="w-11 h-11 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm cursor-pointer"
                  >
                    {isPlayingAudio ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current translate-x-0.5" />
                    )}
                  </button>

                  {/* Progress Slider */}
                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={audioProgress}
                      onChange={handleAudioSeek}
                      className="w-full h-2 bg-orange-200/80 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-stone-500">
                      <span>{formatTime(audioCurrentTime)}</span>
                      <span>{formatTime(audioDuration)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PDF & Document Cards */}
        {record.type === 'document' && primaryAttachment && (
          <div className="pt-2">
            <div className="bg-stone-50 border border-stone-200/90 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-stone-900 break-all">
                    {primaryAttachment.name}
                  </h4>
                  <p className="text-xs text-stone-500">
                    Documento PDF {primaryAttachment.size ? `• ${formatFileSize(primaryAttachment.size)}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onOpenPdf && primaryUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPdf(
                        primaryUrl,
                        record.title || primaryAttachment.name,
                        primaryAttachment.name,
                        primaryAttachment.size
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white hover:bg-stone-100 border border-stone-200 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-orange-600" />
                    <span>Abrir PDF</span>
                  </button>
                )}

                {primaryUrl && (
                  <a
                    href={primaryUrl}
                    download={primaryAttachment.name}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white hover:bg-stone-100 border border-stone-200 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-stone-600" />
                    <span>Baixar</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Text Content (Preserving line breaks, readable font) */}
        {record.content && (
          <div className="pt-4 border-t border-stone-100">
            <div className="text-stone-800 text-base md:text-lg leading-relaxed whitespace-pre-wrap font-sans selection:bg-orange-100">
              {record.content}
            </div>
          </div>
        )}

        {/* Additional attachments if multiple */}
        {record.attachments && record.attachments.length > 1 && (
          <div className="pt-6 border-t border-stone-100 space-y-3">
            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Outros anexos ({record.attachments.length - 1})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {record.attachments.slice(1).map((att) => {
                const attUrl = resolvedMediaUrls[att.id] || att.url;
                return (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200/80 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <File className="w-4 h-4 text-stone-400 shrink-0" />
                      <span className="font-medium text-stone-700 truncate">{att.name}</span>
                    </div>
                    {attUrl && (
                      <a
                        href={attUrl}
                        download={att.name}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-200 transition-colors"
                        title="Baixar anexo"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </article>

      {/* Fullscreen Photo Lightbox Modal */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={fullscreenImage}
            alt="Tela cheia"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}

      {/* Password Protected Deletion Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-stone-900">
                  Excluir este registro?
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Essa ação removerá permanentemente o registro e todos os seus arquivos da sua conta.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmDelete} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-stone-700">
                  Digite sua senha para confirmar:
                </label>
                <div className="relative">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      if (deleteError) setDeleteError(null);
                    }}
                    placeholder="Sua senha de acesso"
                    autoFocus
                    required
                    className="w-full pl-3.5 pr-10 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1 cursor-pointer text-xs"
                  >
                    {showPasswordText ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>

              {/* Error feedback */}
              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200/80 rounded-xl flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteError(null);
                    setDeletePassword('');
                  }}
                  disabled={deleteLoading}
                  className="px-4 py-2.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={deleteLoading}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {deleteLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Validando & Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
