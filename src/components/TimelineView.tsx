import React, { useMemo } from 'react';
import { DiaryRecord, MemoryItem, ChatMessage, UserProfile } from '../types';
import {
  Calendar,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  Sparkles,
  Bookmark,
  MessageSquare,
  Clock,
} from 'lucide-react';

interface TimelineViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  memories: MemoryItem[];
  messages: ChatMessage[];
  onSelectRecord: (record: DiaryRecord) => void;
  onOpenChat: () => void;
}

interface TimelineItem {
  id: string;
  type: 'record' | 'memory' | 'message';
  dateStr: string;
  timeStr: string;
  timestamp: number;
  data: any;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  user,
  records,
  memories,
  messages,
  onSelectRecord,
  onOpenChat,
}) => {
  // Combine records, memories and messages into grouped date timeline
  const groupedTimeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // 1. Add active records
    records
      .filter((r) => !r.isDeleted)
      .forEach((r) => {
        const dt = new Date(r.createdAt);
        items.push({
          id: `rec_${r.id}`,
          type: 'record',
          dateStr: r.date || dt.toISOString().split('T')[0],
          timeStr: r.time || dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          timestamp: dt.getTime(),
          data: r,
        });
      });

    // 2. Add memories
    memories.forEach((m) => {
      const dt = new Date(m.createdAt);
      items.push({
        id: `mem_${m.id}`,
        type: 'memory',
        dateStr: dt.toISOString().split('T')[0],
        timeStr: dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: dt.getTime(),
        data: m,
      });
    });

    // Sort descending by timestamp
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Group by Date String
    const groups: { [dateStr: string]: TimelineItem[] } = {};
    items.forEach((item) => {
      if (!groups[item.dateStr]) {
        groups[item.dateStr] = [];
      }
      groups[item.dateStr].push(item);
    });

    return Object.entries(groups).map(([dateStr, list]) => ({
      dateStr,
      items: list,
    }));
  }, [records, memories, messages]);

  const formatDateHeader = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }).toUpperCase();
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div id="timeline-view-container" className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h2 className="text-xl font-serif font-semibold text-stone-800">Linha do Tempo</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Sua história em ordem cronológica de registros e momentos
        </p>
      </div>

      {groupedTimeline.length === 0 ? (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-12 text-center text-stone-500 shadow-xs">
          <Clock className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-stone-700">Linha do tempo vazia</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            Crie novos registros para visualizar a linha do tempo do seu diário.
          </p>
        </div>
      ) : (
        <div className="relative border-l border-stone-200 pl-6 ml-4 sm:ml-8 space-y-10">
          {groupedTimeline.map((group) => (
            <div key={group.dateStr} className="space-y-4">
              {/* Date Header Marker */}
              <div className="relative">
                <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-amber-600 border-4 border-[#fbfaf8] shadow-xs" />
                <span className="text-xs font-semibold font-mono tracking-wider text-amber-800 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
                  {formatDateHeader(group.dateStr)}
                </span>
              </div>

              {/* Items for this date */}
              <div className="space-y-3 pt-2">
                {group.items.map((item) => {
                  if (item.type === 'record') {
                    const rec = item.data as DiaryRecord;
                    return (
                      <div
                        key={item.id}
                        onClick={() => onSelectRecord(rec)}
                        className="bg-white hover:bg-stone-50 border border-stone-200/90 rounded-2xl p-4 transition-all cursor-pointer shadow-xs group"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-stone-100 border border-stone-200 text-stone-600">
                              {rec.type === 'photo' && <ImageIcon className="w-3.5 h-3.5 text-sky-600" />}
                              {rec.type === 'audio' && <Mic className="w-3.5 h-3.5 text-emerald-600" />}
                              {rec.type === 'video' && <Video className="w-3.5 h-3.5 text-purple-600" />}
                              {rec.type === 'document' && <FileText className="w-3.5 h-3.5 text-amber-600" />}
                              {rec.type === 'text' && <FileText className="w-3.5 h-3.5 text-stone-600" />}
                            </span>
                            <span className="font-medium text-stone-800 group-hover:text-amber-700 transition-colors">
                              {rec.title}
                            </span>
                          </div>
                          <span className="text-[10px] text-stone-400 font-mono">{item.timeStr}</span>
                        </div>
                        <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                          {rec.content || '(Sem texto)'}
                        </p>
                      </div>
                    );
                  }

                  if (item.type === 'memory') {
                    const mem = item.data as MemoryItem;
                    return (
                      <div
                        key={item.id}
                        className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-4 shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                          <div className="flex items-center gap-2 text-amber-900 font-medium">
                            <Bookmark className="w-3.5 h-3.5 text-amber-600" />
                            <span>Memória Guardada: {mem.title}</span>
                          </div>
                          <span className="text-[10px] text-stone-400 font-mono">{item.timeStr}</span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">{mem.summary}</p>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
