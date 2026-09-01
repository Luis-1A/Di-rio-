import React, { useState, useEffect } from 'react';
import { UserProfile, SyncQueueItem } from '../types';
import { syncQueue } from '../lib/syncQueue';
import { flushSyncQueue } from '../lib/firestoreService';
import { logoutUser } from '../lib/authService';
import {
  BookOpen,
  LogOut,
  WifiOff,
  RefreshCw,
  Search,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface HeaderProps {
  user: UserProfile;
  onOpenDiagnostics: () => void;
  onOpenSearch?: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onOpenDiagnostics,
  onOpenSearch,
  activeTab,
  setActiveTab,
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (user?.uid) {
        flushSyncQueue(user.uid).catch(() => {});
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = syncQueue.subscribe((q) => {
      setQueueItems(q);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, [user?.uid]);

  const handleManualSync = async () => {
    if (!user?.uid || isFlushing) return;
    setIsFlushing(true);
    try {
      await flushSyncQueue(user.uid);
    } catch (e) {
      console.warn('Manual sync attempt:', e);
    } finally {
      setIsFlushing(false);
    }
  };

  const pendingCount = queueItems.filter(
    (q) => q.status === 'pending' || q.status === 'processing'
  ).length;
  const failedCount = queueItems.filter((q) => q.status === 'failed').length;

  const renderStatus = () => {
    if (!isOnline) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
          <WifiOff className="w-3 h-3 text-amber-600" />
          <span>Offline</span>
        </span>
      );
    }

    if (isFlushing) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
          <RefreshCw className="w-3 h-3 text-amber-600 animate-spin" />
          <span>Sincronizando</span>
        </span>
      );
    }

    if (failedCount > 0) {
      return (
        <button
          onClick={handleManualSync}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
          title="Tocar para enviar registros pendentes"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span>{failedCount} pendente(s)</span>
        </button>
      );
    }

    if (pendingCount > 0) {
      return (
        <button
          onClick={handleManualSync}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3 text-amber-600 animate-spin" />
          <span>Sincronizando</span>
        </button>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        <span>Sincronizado</span>
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/90 backdrop-blur-md px-4 lg:px-8 py-3.5 transition-all border-b border-stone-200/40">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-600 transition-colors">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-bold text-stone-800 leading-none">
                Diário Pessoal
              </div>
            </div>
          </button>
        </div>

        {/* Center: Desktop Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-stone-100/90 border border-stone-200/80 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-white text-stone-900 font-semibold shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Início
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'archive'
                ? 'bg-white text-stone-900 font-semibold shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Arquivo
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'new'
                ? 'bg-orange-600 text-white font-semibold shadow-xs'
                : 'text-orange-700 hover:text-orange-800 font-medium'
            }`}
          >
            + Novo
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'timeline'
                ? 'bg-white text-stone-900 font-semibold shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Histórico
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'profile'
                ? 'bg-white text-stone-900 font-semibold shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Ajustes
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {renderStatus()}

          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              title="Pesquisar no Diário"
              className="p-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenDiagnostics}
            title="Diagnóstico & Status"
            className="p-2 rounded-xl text-stone-500 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button
            onClick={() => logoutUser()}
            title="Sair da conta"
            className="p-2 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
