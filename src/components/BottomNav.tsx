import React from 'react';
import { Home, FolderClosed, PlusCircle, Sparkles, Clock, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-stone-950/95 backdrop-blur-md border-t border-stone-800/80 px-2 py-1.5 flex items-center justify-around">
      <button
        id="btn-nav-home"
        onClick={() => setActiveTab('dashboard')}
        className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition-all ${
          activeTab === 'dashboard'
            ? 'text-amber-400 font-semibold'
            : 'text-stone-500 hover:text-stone-300'
        }`}
      >
        <Home className="w-5 h-5 mb-0.5" />
        <span>Início</span>
      </button>

      <button
        id="btn-nav-archive"
        onClick={() => setActiveTab('archive')}
        className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition-all ${
          activeTab === 'archive'
            ? 'text-amber-400 font-semibold'
            : 'text-stone-500 hover:text-stone-300'
        }`}
      >
        <FolderClosed className="w-5 h-5 mb-0.5" />
        <span>Arquivo</span>
      </button>

      <button
        id="btn-nav-new"
        onClick={() => setActiveTab('new')}
        className="flex flex-col items-center justify-center -mt-5 bg-amber-600 hover:bg-amber-500 text-stone-950 p-3 rounded-full shadow-lg shadow-amber-900/40 border-2 border-stone-950 font-bold"
      >
        <PlusCircle className="w-6 h-6" />
      </button>

      <button
        id="btn-nav-chat"
        onClick={() => setActiveTab('chat')}
        className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition-all ${
          activeTab === 'chat'
            ? 'text-amber-400 font-semibold'
            : 'text-stone-500 hover:text-stone-300'
        }`}
      >
        <Sparkles className="w-5 h-5 mb-0.5" />
        <span>IAU</span>
      </button>

      <button
        id="btn-nav-timeline"
        onClick={() => setActiveTab('timeline')}
        className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition-all ${
          activeTab === 'timeline'
            ? 'text-amber-400 font-semibold'
            : 'text-stone-500 hover:text-stone-300'
        }`}
      >
        <Clock className="w-5 h-5 mb-0.5" />
        <span>Histórico</span>
      </button>

      <button
        id="btn-nav-settings"
        onClick={() => setActiveTab('profile')}
        className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-medium transition-all ${
          activeTab === 'profile'
            ? 'text-amber-400 font-semibold'
            : 'text-stone-500 hover:text-stone-300'
        }`}
      >
        <Settings className="w-5 h-5 mb-0.5" />
        <span>Ajustes</span>
      </button>
    </nav>
  );
};
