import React from 'react';
import { DiaryRecord, MemoryItem, UserProfile } from '../types';
import {
  Sparkles,
  Plus,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  File,
  ArrowRight,
  BrainCircuit,
  Calendar,
  Bookmark,
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  memories: MemoryItem[];
  onNewRecord: () => void;
  onOpenChat: () => void;
  onSelectRecord: (record: DiaryRecord) => void;
  onViewAllRecords: () => void;
  onViewAllMemories: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  records,
  memories,
  onNewRecord,
  onOpenChat,
  onSelectRecord,
  onViewAllRecords,
  onViewAllMemories,
}) => {
  const activeRecords = records.filter((r) => !r.isDeleted);
  const recentRecords = activeRecords.slice(0, 4);
  const recentMemories = memories.slice(0, 3);

  const getRecordIcon = (type: string) => {
    switch (type) {
      case 'photo':
        return <ImageIcon className="w-4 h-4 text-sky-400" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-emerald-400" />;
      case 'video':
        return <Video className="w-4 h-4 text-purple-400" />;
      case 'document':
        return <File className="w-4 h-4 text-amber-400" />;
      default:
        return <FileText className="w-4 h-4 text-stone-300" />;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div id="dashboard-view" className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-8">
      {/* 1. IAU Central Hub Card */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold font-serif text-stone-100">IAU Central</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              </div>
              <p className="text-stone-400 text-sm mt-1 max-w-lg">
                Seu cérebro digital conectado ao seu arquivo. Pergunte sobre eventos passados, peça análises ou converse com voz.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenChat}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold rounded-xl text-sm transition-all shadow-md shadow-amber-900/20 cursor-pointer self-start sm:self-center shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Conversar com IAU</span>
          </button>
        </div>
      </div>

      {/* 2. Quick Action Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-stone-200">Arquivo Pessoal</h3>
          <p className="text-xs text-stone-500">
            {activeRecords.length} registro(s) salvos no Firebase
          </p>
        </div>

        <button
          onClick={onNewRecord}
          className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/40 text-stone-100 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Novo Registro</span>
        </button>
      </div>

      {/* 3. Últimos Registros */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-stone-400 font-semibold uppercase tracking-wider">
          <span>Últimos registros</span>
          {activeRecords.length > 4 && (
            <button
              onClick={onViewAllRecords}
              className="text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-sans"
            >
              <span>Ver todos</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {recentRecords.length === 0 ? (
          <div className="bg-stone-900/50 border border-stone-800/80 rounded-2xl p-8 text-center">
            <Calendar className="w-8 h-8 text-stone-600 mx-auto mb-3" />
            <h4 className="text-sm font-medium text-stone-300">Nenhum registro ainda</h4>
            <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
              Seu arquivo começa aqui. Crie seu primeiro registro de texto, áudio, foto ou pensamento.
            </p>
            <button
              onClick={onNewRecord}
              className="mt-4 px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold hover:bg-amber-600/30 transition-colors"
            >
              Criar Primeiro Registro
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentRecords.map((rec) => (
              <div
                key={rec.id}
                onClick={() => onSelectRecord(rec)}
                className="bg-stone-900/80 hover:bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-xl p-4 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-stone-950 border border-stone-800">
                        {getRecordIcon(rec.type)}
                      </div>
                      <span className="text-xs text-stone-500">{formatDate(rec.createdAt)}</span>
                    </div>
                    {rec.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-950 border border-stone-800 text-stone-400 font-medium">
                        {rec.category}
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-sm text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-1">
                    {rec.title || 'Sem título'}
                  </h4>
                  <p className="text-xs text-stone-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {rec.content || '(Sem texto adicional)'}
                  </p>
                </div>

                {rec.attachments && rec.attachments.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-stone-800/60 flex items-center gap-2 text-[11px] text-stone-500">
                    <span>{rec.attachments.length} anexo(s)</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Memórias Recentes Criadas pela IAU */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-stone-400 font-semibold uppercase tracking-wider">
          <span>Memórias estruturadas pela IAU</span>
          {memories.length > 3 && (
            <button
              onClick={onViewAllMemories}
              className="text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-sans"
            >
              <span>Ver todas ({memories.length})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {recentMemories.length === 0 ? (
          <div className="bg-stone-900/30 border border-stone-800/60 rounded-xl p-5 text-center text-xs text-stone-500">
            A IAU cria e organiza memórias estruturadas conforme você conversa e faz novos registros.
          </div>
        ) : (
          <div className="space-y-2">
            {recentMemories.map((mem) => (
              <div
                key={mem.id}
                className="bg-stone-900/60 border border-stone-800 rounded-xl p-3.5 flex items-start gap-3"
              >
                <Bookmark className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-stone-200 truncate">
                      {mem.title}
                    </span>
                    <span className="text-[10px] text-stone-500 shrink-0">
                      {formatDate(mem.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                    {mem.summary}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
