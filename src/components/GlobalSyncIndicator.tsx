import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  X,
  ChevronUp,
  ChevronDown,
  Film,
  Image as ImageIcon,
  Mic,
  FileText,
  Trash2,
} from 'lucide-react';
import { BackgroundUploadItem } from '../types';
import {
  subscribeToUploadQueue,
  retryQueueItem,
  cancelQueueItem,
  processBackgroundUploadQueue,
} from '../lib/backgroundUploadManager';
import { clearFinishedQueueItems } from '../lib/idbStorage';

interface GlobalSyncIndicatorProps {
  userId: string;
}

export const GlobalSyncIndicator: React.FC<GlobalSyncIndicatorProps> = ({ userId }) => {
  const [queueItems, setQueueItems] = useState<BackgroundUploadItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToUploadQueue(userId, (items) => {
      setQueueItems(items);
    });
    return () => unsub();
  }, [userId]);

  if (queueItems.length === 0) {
    return null;
  }

  const isUploading = (status: string) =>
    status === 'uploading' ||
    status === 'pending_upload' ||
    status === 'pending' ||
    status === 'uploaded';

  const isFailed = (status: string) =>
    status === 'upload_error' || status === 'failed';

  const isSynced = (status: string) =>
    status === 'synced' || status === 'completed';

  const uploadingItems = queueItems.filter((i) => isUploading(i.status));
  const failedItems = queueItems.filter((i) => isFailed(i.status));
  const syncedItems = queueItems.filter((i) => isSynced(i.status));

  // Active uploading item
  const activeItem =
    uploadingItems.find((i) => i.status === 'uploading') || uploadingItems[0];
  const overallPercent = activeItem?.progress || 0;

  const handleRetryAll = async () => {
    setIsRetryingAll(true);
    try {
      for (const item of failedItems) {
        await retryQueueItem(item.id, userId);
      }
      await processBackgroundUploadQueue(userId);
    } catch (e) {
      console.warn('Retry all warning:', e);
    } finally {
      setIsRetryingAll(false);
    }
  };

  const handleClearSynced = async () => {
    await clearFinishedQueueItems(userId);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Film className="w-4 h-4 text-purple-600" />;
      case 'photo':
        return <ImageIcon className="w-4 h-4 text-emerald-600" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-amber-600" />;
      default:
        return <FileText className="w-4 h-4 text-blue-600" />;
    }
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-40 max-w-sm w-[calc(100vw-2rem)] md:w-80">
      {/* Floating Pill Summary */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="bg-stone-900/95 hover:bg-stone-900 text-stone-100 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-xl border border-stone-700/60 cursor-pointer flex items-center justify-between gap-3 transition-all select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {uploadingItems.length > 0 ? (
            <div className="relative flex items-center justify-center">
              <CloudUpload className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            </div>
          ) : failedItems.length > 0 ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}

          <div className="min-w-0 flex flex-col">
            <span className="text-xs font-medium truncate text-stone-200">
              {uploadingItems.length > 0
                ? `${uploadingItems.length} arquivo${uploadingItems.length > 1 ? 's' : ''} em segundo plano`
                : failedItems.length > 0
                ? `${failedItems.length} pendente${failedItems.length > 1 ? 's' : ''} de envio`
                : `${syncedItems.length} sincronizado${syncedItems.length > 1 ? 's' : ''} na nuvem`}
            </span>
            {uploadingItems.length > 0 && activeItem && (
              <span className="text-[10px] text-stone-400 truncate">
                {activeItem.fileName} ({overallPercent}%)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-stone-400">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded Panel */}
      {isOpen && (
        <div className="mt-2 bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden text-stone-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="px-3.5 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-stone-600" />
              <span className="text-xs font-semibold text-stone-700">
                Fila de Sincronização Local
              </span>
            </div>
            <div className="flex items-center gap-1">
              {syncedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSynced}
                  className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-0.5 rounded-sm hover:bg-stone-200/60 cursor-pointer"
                  title="Limpar concluídos da lista"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-600 rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Queue Items List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-stone-100 p-1">
            {queueItems.map((item) => (
              <div key={item.id} className="p-2.5 hover:bg-stone-50/80 rounded-xl space-y-1.5 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1 rounded-lg bg-stone-100 shrink-0">
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-stone-800 truncate">
                        {item.fileName || item.title}
                      </p>
                      <p className="text-[10px] text-stone-400">
                        {item.fileSize ? `${(item.fileSize / (1024 * 1024)).toFixed(2)} MB` : 'Texto/Metadados'}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge & Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSynced(item.status) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>Sincronizado</span>
                      </span>
                    )}

                    {item.status === 'uploading' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <RotateCw className="w-2.5 h-2.5 animate-spin" />
                        <span>{item.progress}%</span>
                      </span>
                    )}

                    {(item.status === 'pending_upload' || item.status === 'pending') && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                        <Clock className="w-2.5 h-2.5" />
                        <span>Na fila</span>
                      </span>
                    )}

                    {item.status === 'uploaded' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                        <RotateCw className="w-2.5 h-2.5 animate-spin" />
                        <span>Confirmando</span>
                      </span>
                    )}

                    {isFailed(item.status) && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => retryQueueItem(item.id, userId)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded-sm cursor-pointer"
                          title="Tentar novamente"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelQueueItem(item.id, userId)}
                          className="p-1 text-stone-400 hover:text-stone-600 rounded-sm cursor-pointer"
                          title="Remover da fila"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar if uploading */}
                {item.status === 'uploading' && (
                  <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}

                {isFailed(item.status) && (
                  <p className="text-[10px] text-red-600 truncate">
                    {item.errorMessage || 'Não foi possível enviar este arquivo. Toque para tentar novamente.'}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Footer actions */}
          {failedItems.length > 0 && (
            <div className="p-2 bg-red-50/70 border-t border-red-100 flex items-center justify-between">
              <span className="text-[11px] text-red-700 font-medium">
                {failedItems.length} pendência(s)
              </span>
              <button
                type="button"
                onClick={handleRetryAll}
                disabled={isRetryingAll}
                className="text-[11px] font-medium bg-red-600 text-white px-2.5 py-1 rounded-lg hover:bg-red-700 transition flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <RotateCw className={`w-3 h-3 ${isRetryingAll ? 'animate-spin' : ''}`} />
                <span>Tentar Todos</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
