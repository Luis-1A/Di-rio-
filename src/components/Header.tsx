import React, { useState, useEffect } from 'react';
import { UserProfile, SyncQueueItem } from '../types';
import { syncQueue } from '../lib/syncQueue';
import { flushSyncQueue } from '../lib/firestoreService';
import { logoutUser } from '../lib/authService';
import {
  BookOpen,
  Activity,
  LogOut,
  Sparkles,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
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

  const pendingCount = queueItems.filter((q) => q.status === 'pending' || q.status === 'processing').length;
  const failedCount = queueItems.filter((q) => q.status === 'failed').length;

  const renderSyncIndicator = () => {
    if (!isOnline) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-900 border border-stone-800 text-stone-400" title="Trabalhando offline. Alterações salvas localmente.">
          <WifiOff className="w-3 h-3 text-amber-500" />
          <span>Offline</span>
        </span>
      );
    }

    if (isFlushing) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 border border-amber-800 text-amber-300">
          <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
          <span>Sincronizando...</span>
        </span>
      );
    }

    if (failedCount > 0) {
      return (
        <button
          onClick={handleManualSync}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/80 border border-red-800 text-red-300 hover:bg-red-900/80 transition-colors cursor-pointer"
          title="Clique para forçar o envio dos registros pendentes ao Firebase"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span>⚠ {failedCount} Pendente(s) • Tocar p/ Sincronizar</span>
        </button>
      );
    }

    if (pendingCount > 0) {
      return (
        <button
          onClick={handleManualSync}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 border border-amber-800 text-amber-300 hover:bg-amber-900/80 transition-colors cursor-pointer"
          title="Sincronizando com Firebase"
        >
          <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
          <span>⏳ Sincronizando</span>
        </button>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-900 border border-stone-800 text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span>✓ Sincronizado</span>
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-30 bg-stone-950/90 backdrop-blur-md border-b border-stone-800/80 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Brand / Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="w-9 h-9 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400 group-hover:border-amber-500/50 transition-colors">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold font-serif text-stone-100 leading-none">
                Diário Pessoal
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-stone-400 font-sans">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>IAU Central Ativa</span>
              </div>
            </div>
          </button>
        </div>

        {/* Center: Desktop Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-stone-900/90 border border-stone-800 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-amber-600/20 text-amber-300 font-semibold shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Início
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'archive'
                ? 'bg-amber-600/20 text-amber-300 font-semibold shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Arquivo
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'new'
                ? 'bg-amber-600 text-stone-950 font-bold shadow-md shadow-amber-900/30'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            + Novo
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'bg-amber-600/20 text-amber-300 font-semibold shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>IAU Central</span>
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'timeline'
                ? 'bg-amber-600/20 text-amber-300 font-semibold shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Linha do Tempo
          </button>
          <button
            onClick={() => setActiveTab('memories')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'memories'
                ? 'bg-amber-600/20 text-amber-300 font-semibold shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Memórias
          </button>
        </nav>

        {/* Right: Sync Status + Diagnostics + Profile + Logout */}
        <div className="flex items-center gap-2.5">
          {renderSyncIndicator()}

          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              title="Pesquisar no Diário"
              className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenDiagnostics}
            title="Diagnóstico dos Serviços"
            className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
          >
            <Activity className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            title="Configurações e Perfil da IAU"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-stone-800 border-amber-500/50 text-stone-100'
                : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
            }`}
          >
            <div className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-300 flex items-center justify-center font-bold text-[10px]">
              {(user.displayName || 'U')[0].toUpperCase()}
            </div>
            <span className="hidden sm:inline truncate max-w-[100px]">{user.displayName || 'Usuário'}</span>
          </button>

          <button
            onClick={() => logoutUser()}
            title="Encerrar sessão"
            className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-red-400 hover:border-red-900/50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
