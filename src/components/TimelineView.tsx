import React, { useMemo } from 'react';
import { DiaryRecord, UserProfile } from '../types';
import {
  Calendar,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  File,
  Clock,
  Eye,
  Plus,
} from 'lucide-react';

interface TimelineViewProps {
  user: UserProfile;
  records: DiaryRecord[];
  onSelectRecord: (record: DiaryRecord) => void;
  onNewRecord: () => void;
  onOpenPdf?: (url: string, title: string, fileName?: string, size?: number) => void;
}

interface TimelineItem {
  id: string;
  type: 'record';
  dateStr: string;
  timeStr: string;
  timestamp: number;
  data: DiaryRecord;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  user,
  records,
  onSelectRecord,
  onNewRecord,
  onOpenPdf,
}) => {
  // Group active records into date-sorted timeline
  const groupedTimeline = useMemo(() => {
    const items: TimelineItem[] = [];

    records
      .filter((r) => !r.isDeleted)
      .forEach((r) => {
        const dt = new Date(r.createdAt || r.date);
        items.push({
          id: `rec_${r.id}`,
          type: 'record',
          dateStr: r.date || dt.toISOString().split('T')[0],
          timeStr:
            r.time ||
            dt.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          timestamp: dt.getTime() || Date.now(),
          data: r,
        });
      });

    // Sort by timestamp desc
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Group by friendly date
    const groups: { label: string; date: string; items: TimelineItem[] }[] = [];
    const now = new Date();

    items.forEach((item) => {
      const itemDate = new Date(item.timestamp);
      const isToday =
        now.getFullYear() === itemDate.getFullYear() &&
        now.getMonth() === itemDate.getMonth() &&
        now.getDate() === itemDate.getDate();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        yesterday.getFullYear() === itemDate.getFullYear() &&
        yesterday.getMonth() === itemDate.getMonth() &&
        yesterday.getDate() === itemDate.getDate();

      let label = '';
      if (isToday) {
        label = 'Hoje';
      } else if (isYesterday) {
        label = 'Ontem';
      } else {
        label = itemDate.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
      }

      const existingGroup = groups.find((g) => g.label === label);
      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        groups.push({
          label,
          date: item.dateStr,
          items: [item],
        });
      }
    });

    return groups;
  }, [records]);

  const getRecordIcon = (type: string) => {
    switch (type) {
      case 'photo':
        return <ImageIcon className="w-4 h-4 text-sky-600" />;
      case 'video':
        return <Video className="w-4 h-4 text-purple-600" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-emerald-600" />;
      case 'document':
        return <File className="w-4 h-4 text-amber-600" />;
      default:
        return <FileText className="w-4 h-4 text-stone-600" />;
    }
  };

  return (
    <div id="timeline-container" className="max-w-md md:max-w-xl mx-auto px-4 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-800 leading-none">
              Linha do Tempo
            </h2>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Fluxo contínuo e cronológico de memórias
            </p>
          </div>
        </div>

        <button
          onClick={onNewRecord}
          className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-full transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo</span>
        </button>
      </div>

      {groupedTimeline.length === 0 ? (
        <div className="bg-white border border-stone-200/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center mx-auto">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-stone-800">
              Nenhuma memória na linha do tempo
            </h3>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Adicione fotos, gravações de áudio, vídeos e anotações para criar sua linha do tempo.
            </p>
          </div>
          <button
            onClick={onNewRecord}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar primeira memória</span>
          </button>
        </div>
      ) : (
        <div className="relative pl-6 space-y-8 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-0.5 before:bg-stone-200">
          {groupedTimeline.map((group) => (
            <div key={group.label} className="space-y-3 relative">
              {/* Timeline Group Date Marker */}
              <div className="flex items-center gap-2 -ml-6">
                <div className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center ring-4 ring-[#FAF8F5] shadow-xs z-10">
                  <Calendar className="w-3 h-3" />
                </div>
                <h3 className="text-xs font-bold text-stone-700 capitalize">
                  {group.label}
                </h3>
              </div>

              {/* Items in this date */}
              <div className="space-y-3 pl-2">
                {group.items.map((item) => {
                  const rec = item.data;
                  const photoAtt = rec.attachments?.find((a) => a.type === 'image');
                  const docAtt = rec.attachments?.find((a) => a.type === 'document');
                  const isPDF =
                    docAtt?.name?.toLowerCase().endsWith('.pdf') ||
                    docAtt?.mimeType === 'application/pdf';

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectRecord(rec)}
                      className="bg-white border border-stone-200/80 hover:border-orange-200 rounded-2xl p-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.02)] transition-all cursor-pointer group space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-stone-50 border border-stone-200/60 flex items-center justify-center">
                            {getRecordIcon(rec.type)}
                          </div>
                          <span className="text-xs font-bold text-stone-800 group-hover:text-orange-700 transition-colors">
                            {rec.title || 'Registro'}
                          </span>
                        </div>
                        <span className="text-[11px] text-stone-400 font-normal">
                          {item.timeStr}
                        </span>
                      </div>

                      {rec.content && (
                        <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                          {rec.content}
                        </p>
                      )}

                      {photoAtt && (
                        <div className="rounded-xl overflow-hidden bg-stone-100 aspect-video max-h-48 border border-stone-200/60">
                          <img
                            src={photoAtt.url}
                            alt={rec.title || 'Foto'}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      {isPDF && docAtt && onOpenPdf && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPdf(
                                docAtt.url,
                                rec.title || docAtt.name || 'Documento PDF',
                                docAtt.name,
                                docAtt.size
                              );
                            }}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Abrir Documento PDF</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
