import React from 'react';
import { Home, Calendar, Plus, FolderClosed, Clock } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-stone-200/60 px-2 py-2 flex items-center justify-around">
      <button
        id="btn-nav-home"
        onClick={() => setActiveTab('dashboard')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] transition-all cursor-pointer ${
          activeTab === 'dashboard'
            ? 'text-orange-600 font-semibold'
            : 'text-stone-400 hover:text-stone-700'
        }`}
      >
        <Home className="w-5 h-5 mb-0.5" />
        <span>Início</span>
      </button>

      <button
        id="btn-nav-calendar"
        onClick={() => setActiveTab('calendar')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] transition-all cursor-pointer ${
          activeTab === 'calendar'
            ? 'text-orange-600 font-semibold'
            : 'text-stone-400 hover:text-stone-700'
        }`}
      >
        <Calendar className="w-5 h-5 mb-0.5" />
        <span>Calendário</span>
      </button>

      <button
        id="btn-nav-new"
        onClick={() => setActiveTab('new')}
        title="Novo registro"
        className="flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white w-12 h-12 rounded-full shadow-lg shadow-orange-600/25 transition-transform active:scale-95 cursor-pointer -mt-4 shrink-0"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      <button
        id="btn-nav-archive"
        onClick={() => setActiveTab('archive')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] transition-all cursor-pointer ${
          activeTab === 'archive'
            ? 'text-orange-600 font-semibold'
            : 'text-stone-400 hover:text-stone-700'
        }`}
      >
        <FolderClosed className="w-5 h-5 mb-0.5" />
        <span>Arquivo</span>
      </button>

      <button
        id="btn-nav-timeline"
        onClick={() => setActiveTab('timeline')}
        className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[11px] transition-all cursor-pointer ${
          activeTab === 'timeline'
            ? 'text-orange-600 font-semibold'
            : 'text-stone-400 hover:text-stone-700'
        }`}
      >
        <Clock className="w-5 h-5 mb-0.5" />
        <span>Histórico</span>
      </button>
    </nav>
  );
};

