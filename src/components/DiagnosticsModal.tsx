import React, { useEffect, useState } from 'react';
import { SystemHealth } from '../types';
import { auth, db, storage } from '../lib/firebase';
import { syncQueue } from '../lib/syncQueue';
import { flushSyncQueue } from '../lib/firestoreService';
import { getStoredSession } from '../lib/authService';
import { checkGeminiHealth } from '../lib/geminiBridge';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  X,
  Activity,
  Globe,
  HelpCircle,
  Trash2,
  Send,
  Sparkles,
} from 'lucide-react';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [health, setHealth] = useState<SystemHealth>({
    auth: 'offline',
    firestore: 'offline',
    storage: 'offline',
    gemini: 'offline',
    audioEngine: 'offline',
    syncQueue: 'online',
    lastChecked: new Date().toLocaleTimeString(),
  });
  const [geminiStatusNote, setGeminiStatusNote] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [flushingQueue, setFlushingQueue] = useState(false);
  const [flushResultNote, setFlushResultNote] = useState<string | null>(null);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const runDiagnostics = async () => {
    setChecking(true);
    const newHealth: SystemHealth = {
      auth: 'offline',
      firestore: 'offline',
      storage: 'offline',
      gemini: 'offline',
      audioEngine: 'offline',
      syncQueue: 'online',
      lastChecked: new Date().toLocaleTimeString(),
    };

    // 1. Check Auth (Session or Firebase Auth)
    const storedUser = getStoredSession();
    if (auth.currentUser || storedUser) {
      newHealth.auth = 'online';
    } else {
      newHealth.auth = 'degraded';
    }

    // 2. Check Firestore
    try {
      if (db) {
        newHealth.firestore = 'online';
      }
    } catch {
      newHealth.firestore = 'error';
    }

    // 3. Check Storage
    try {
      if (storage) {
        newHealth.storage = 'online';
      }
    } catch {
      newHealth.storage = 'error';
    }

    // 4. Check Gemini / IAU Central Communication
    try {
      const geminiRes = await checkGeminiHealth();
      newHealth.gemini = geminiRes.status;
      setGeminiStatusNote(geminiRes.message);
    } catch {
      newHealth.gemini = 'error';
      setGeminiStatusNote('Erro ao testar comunicação com a IA Central.');
    }

    // 5. Check Audio Engine
    if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      newHealth.audioEngine = 'online';
    } else {
      newHealth.audioEngine = 'degraded';
    }

    // 6. Check Sync Queue
    const pending = syncQueue.getPendingItems();
    if (pending.some((p) => p.status === 'failed')) {
      newHealth.syncQueue = 'degraded';
    } else {
      newHealth.syncQueue = 'online';
    }

    setHealth(newHealth);
    setChecking(false);
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen]);

  const handleForceFlushQueue = async () => {
    const storedUser = getStoredSession();
    const uid = auth.currentUser?.uid || storedUser?.uid;
    if (!uid) {
      setFlushResultNote('Nenhum usuário ativo para sincronizar.');
      return;
    }
    setFlushingQueue(true);
    setFlushResultNote(null);
    try {
      const res = await flushSyncQueue(uid);
      setFlushResultNote(`Sincronizado com sucesso: ${res.synced} enviado(s), ${res.failed} falha(s).`);
      runDiagnostics();
    } catch (e: any) {
      setFlushResultNote(`Erro ao sincronizar: ${e.message}`);
    } finally {
      setFlushingQueue(false);
    }
  };

  const handleClearQueue = () => {
    syncQueue.clearQueue();
    setFlushResultNote('Fila de sincronização limpa.');
    runDiagnostics();
  };

  if (!isOpen) return null;

  const renderStatusBadge = (status: 'online' | 'degraded' | 'offline' | 'error') => {
    switch (status) {
      case 'online':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            ONLINE
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            PARCIAL
          </span>
        );
      case 'error':
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            OFFLINE
          </span>
        );
    }
  };

  return (
    <div id="diagnostics-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
      <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-lg p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-lg font-serif font-semibold text-stone-800">Status dos Serviços</h2>
              <div className="flex items-center gap-1.5 text-xs text-stone-400">
                <Globe className="w-3 h-3 text-stone-400" />
                <span>{hostname || 'localhost'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/80">
            <div>
              <div className="text-sm font-medium text-stone-800">Autenticação</div>
              <div className="text-xs text-stone-500">Sessão e isolamento de usuário</div>
            </div>
            {renderStatusBadge(health.auth)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/80">
            <div>
              <div className="text-sm font-medium text-stone-800">Banco de Dados (Firestore)</div>
              <div className="text-xs text-stone-500">Armazenamento em nuvem em tempo real</div>
            </div>
            {renderStatusBadge(health.firestore)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/80">
            <div>
              <div className="text-sm font-medium text-stone-800">Armazenamento de Arquivos</div>
              <div className="text-xs text-stone-500">Fotos, vídeos, áudios e documentos</div>
            </div>
            {renderStatusBadge(health.storage)}
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <div>
                  <div className="text-sm font-medium text-stone-800">IA Central (Cérebro Operacional)</div>
                  <div className="text-xs text-stone-500">Compreensão multimodal, ações & ferramentas</div>
                </div>
              </div>
              {renderStatusBadge(health.gemini)}
            </div>

            {geminiStatusNote && (
              <div className="text-xs text-stone-500 pt-1 border-t border-stone-200/60 flex items-start gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                <span>{geminiStatusNote}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/80">
            <div>
              <div className="text-sm font-medium text-stone-800">Sistema de Áudio & Voz</div>
              <div className="text-xs text-stone-500">Gravação por microfone e sintetizador de voz com watchdog</div>
            </div>
            {renderStatusBadge(health.audioEngine)}
          </div>

          {/* Sync Queue Card with Flush & Clear actions */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-stone-800">Fila de Sincronização</div>
                <div className="text-xs text-stone-500">
                  {syncQueue.getPendingItems().length} item(ns) pendente(s) de envio
                </div>
              </div>
              {renderStatusBadge(health.syncQueue)}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleForceFlushQueue}
                disabled={flushingQueue || syncQueue.getPendingItems().length === 0}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer shadow-xs"
              >
                <Send className="w-3 h-3" />
                <span>{flushingQueue ? 'Enviando...' : 'Sincronizar Agora'}</span>
              </button>

              {syncQueue.getPendingItems().length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-700 border border-stone-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpar Fila</span>
                </button>
              )}
            </div>

            {flushResultNote && (
              <div className="text-xs text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200">
                {flushResultNote}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-stone-100">
          <span className="text-xs text-stone-400">Última checagem: {health.lastChecked}</span>
          <button
            onClick={runDiagnostics}
            disabled={checking}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
