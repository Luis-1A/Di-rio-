import React, { useState } from 'react';
import { DiaryRecord, UserProfile } from '../types';
import { DailyMemoryRecall } from '../lib/memoryRecall';
import { addRecordReflection } from '../lib/firestoreService';
import {
  Sparkles,
  Calendar,
  Clock,
  ArrowRight,
  GitCompare,
  MessageSquarePlus,
  Send,
  Check,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
} from 'lucide-react';

interface OnThisDayCardProps {
  user: UserProfile;
  recall: DailyMemoryRecall;
  onOpenRecord: (record: DiaryRecord) => void;
  onRecordUpdated?: (updated: DiaryRecord) => void;
}

export const OnThisDayCard: React.FC<OnThisDayCardProps> = ({
  user,
  recall,
  onOpenRecord,
  onRecordUpdated,
}) => {
  const { record, reason, timeAgoText, isExactAnniversary } = recall;
  const [showReflectionInput, setShowReflectionInput] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const photoAtt = record.attachments?.find(
    (a) => a.type === 'image' || a.mimeType?.startsWith('image/')
  );
  const audioAtt = record.attachments?.find(
    (a) => a.type === 'audio' || a.mimeType?.startsWith('audio/')
  );
  const videoAtt = record.attachments?.find(
    (a) => a.type === 'video' || a.mimeType?.startsWith('video/')
  );

  const formattedDate = () => {
    try {
      const d = new Date(record.date || record.createdAt);
      return d.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return record.date;
    }
  };

  const handleSaveReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reflectionText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const updated = await addRecordReflection(user.uid, record, reflectionText.trim());
      if (onRecordUpdated) {
        onRecordUpdated(updated);
      }
      setReflectionText('');
      setShowReflectionInput(false);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (err) {
      console.error('Error saving reflection:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reflections = record.reflections || [];

  return (
    <div className="bg-gradient-to-br from-amber-50/90 via-orange-50/70 to-stone-50 border border-orange-200/90 rounded-3xl p-5 shadow-[0_4px_20px_rgba(234,88,12,0.06)] space-y-4 relative overflow-hidden transition-all">
      {/* Decorative Warm Halo */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-200/30 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

      {/* Header Tag */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-600 text-white shadow-xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Lembrança de Hoje</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-orange-950/70 font-medium bg-white/70 backdrop-blur-xs px-2.5 py-1 rounded-full border border-orange-200/60">
          <Calendar className="w-3.5 h-3.5 text-orange-600" />
          <span>{timeAgoText}</span>
        </div>
      </div>

      {/* Question Prompt */}
      <div>
        <h3 className="text-sm md:text-base font-serif font-bold text-stone-900 leading-snug">
          Você lembra como era sua vida nesta época?
        </h3>
        <p className="text-xs text-stone-600 mt-0.5">
          {reason} • <span className="font-medium text-stone-700">{formattedDate()}</span>
        </p>
      </div>

      {/* Record Preview Card */}
      <div
        onClick={() => onOpenRecord(record)}
        className="bg-white/90 hover:bg-white border border-stone-200/90 hover:border-orange-300 rounded-2xl p-3.5 transition-all cursor-pointer shadow-xs group space-y-2.5"
      >
        <div className="flex items-start gap-3">
          {/* Media thumbnail if exists */}
          {photoAtt && (
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-stone-100 shrink-0 border border-stone-200/70">
              <img
                src={photoAtt.url}
                alt={record.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {audioAtt && !photoAtt && (
            <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-700 flex items-center justify-center shrink-0">
              <Mic className="w-6 h-6" />
            </div>
          )}

          {videoAtt && !photoAtt && !audioAtt && (
            <div className="w-14 h-14 rounded-xl bg-purple-50 border border-purple-200/70 text-purple-700 flex items-center justify-center shrink-0">
              <Video className="w-6 h-6" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <h4 className="text-sm font-bold text-stone-900 group-hover:text-orange-700 transition-colors line-clamp-1">
              {record.title || (record.type === 'text' ? 'Anotação pessoal' : 'Registro')}
            </h4>

            {record.content && (
              <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                "{record.content}"
              </p>
            )}

            {record.tags && record.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {record.tags.slice(0, 3).map((t, idx) => (
                  <span key={idx} className="text-[10px] text-stone-500 font-mono">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Previous "Antes e Agora" Reflections if already present */}
      {reflections.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
            <GitCompare className="w-3.5 h-3.5 text-orange-600" />
            <span>Sua evolução (Antes e Agora):</span>
          </div>
          <div className="space-y-1.5">
            {reflections.map((ref) => (
              <div
                key={ref.id}
                className="bg-white/80 border border-orange-200/70 rounded-xl p-2.5 text-xs text-stone-700 space-y-1"
              >
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span className="font-semibold text-orange-700">Reflexão posterior</span>
                  <span>
                    {new Date(ref.createdAt || ref.date).toLocaleDateString('pt-BR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <p className="italic text-stone-800 leading-relaxed">"{ref.content}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => setShowReflectionInput(!showReflectionInput)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-800 bg-white hover:bg-orange-100/70 border border-stone-200 hover:border-orange-300 transition-all cursor-pointer shadow-2xs"
        >
          <GitCompare className="w-3.5 h-3.5 text-orange-600" />
          <span>Antes e Agora</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenRecord(record)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-orange-700 hover:text-orange-800 bg-orange-100/80 hover:bg-orange-200/80 transition-colors cursor-pointer"
        >
          <span>Reler completo</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* "Antes e Agora" Inline Input Form */}
      {showReflectionInput && (
        <form
          onSubmit={handleSaveReflection}
          className="bg-white border border-orange-200 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in duration-150"
        >
          <div className="space-y-0.5">
            <label className="block text-xs font-bold text-stone-800">
              O que você pensa hoje sobre este momento?
            </label>
            <p className="text-[11px] text-stone-500">
              Compare como você pensava antes com o que você pensa agora. Sem julgamento, apenas reconhecendo a sua história.
            </p>
          </div>

          <textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            placeholder="Hoje, olhando para trás, percebo que..."
            rows={3}
            autoFocus
            className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-orange-500 resize-none"
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowReflectionInput(false);
                setReflectionText('');
              }}
              className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-800 cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!reflectionText.trim() || isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
            >
              <Send className="w-3 h-3" />
              <span>{isSubmitting ? 'Guardando...' : 'Salvar Reflexão'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Success Notification */}
      {showSuccessToast && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl animate-in fade-in">
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          <span>Sua reflexão "Antes e Agora" foi conectada com sucesso ao registro!</span>
        </div>
      )}
    </div>
  );
};
