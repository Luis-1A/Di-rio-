import React, { useEffect, useState } from 'react';
import { SystemHealth } from '../types';
import { auth, db, storage } from '../lib/firebase';
import { syncQueue } from '../lib/syncQueue';
import { getStoredSession } from '../lib/authService';
import {
  checkGeminiHealth,
  getCustomGeminiKey,
  saveCustomGeminiKey,
} from '../lib/geminiBridge';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  X,
  Activity,
  Key,
  Globe,
  Check,
  HelpCircle,
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
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [customKey, setCustomKey] = useState(getCustomGeminiKey());
  const [saveKeySuccess, setSaveKeySuccess] = useState(false);

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
      setGeminiStatusNote('Erro ao testar comunicação com a IAU Central.');
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
      setCustomKey(getCustomGeminiKey());
      runDiagnostics();
    }
  }, [isOpen]);

  const handleSaveCustomKey = () => {
    saveCustomGeminiKey(customKey);
    setSaveKeySuccess(true);
    setTimeout(() => setSaveKeySuccess(false), 2000);
    runDiagnostics();
  };

  if (!isOpen) return null;

  const renderStatusBadge = (status: 'online' | 'degraded' | 'offline' | 'error') => {
    switch (status) {
      case 'online':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            ONLINE
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            DEGRADADO
          </span>
        );
      case 'error':
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950/80 text-red-300 border border-red-800">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            OFFLINE
          </span>
        );
    }
  };

  return (
    <div id="diagnostics-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-stone-100">Diagnóstico do Sistema</h2>
              <div className="flex items-center gap-1.5 text-xs text-stone-400">
                <Globe className="w-3 h-3 text-stone-500" />
                <span>{hostname || 'localhost'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-100 p-1.5 rounded-lg hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-950 border border-stone-800">
            <div>
              <div className="text-sm font-medium text-stone-200">Firebase Authentication</div>
              <div className="text-xs text-stone-500">Sessão e isolamento por UID</div>
            </div>
            {renderStatusBadge(health.auth)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-950 border border-stone-800">
            <div>
              <div className="text-sm font-medium text-stone-200">Cloud Firestore</div>
              <div className="text-xs text-stone-500">Banco oficial e persistência em tempo real</div>
            </div>
            {renderStatusBadge(health.firestore)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-950 border border-stone-800">
            <div>
              <div className="text-sm font-medium text-stone-200">Firebase Storage</div>
              <div className="text-xs text-stone-500">Armazenamento de fotos, áudios e vídeos</div>
            </div>
            {renderStatusBadge(health.storage)}
          </div>

          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-stone-200">IAU Central (Gemini)</div>
                <div className="text-xs text-stone-500">Cérebro, transcrição e memórias</div>
              </div>
              {renderStatusBadge(health.gemini)}
            </div>

            {geminiStatusNote && (
              <div className="text-xs text-stone-400 pt-1 border-t border-stone-900 flex items-start gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                <span>{geminiStatusNote}</span>
              </div>
            )}

            {/* Quick Gemini Key Configuration Toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="text-xs text-amber-400 hover:text-amber-300 underline flex items-center gap-1 cursor-pointer"
              >
                <Key className="w-3 h-3" />
                <span>{showKeyInput ? 'Ocultar chave Gemini' : 'Configurar Chave Gemini do Diário'}</span>
              </button>

              {showKeyInput && (
                <div className="mt-2.5 p-3 rounded-xl bg-stone-900 border border-stone-800 space-y-2">
                  <label className="block text-xs text-stone-300 font-medium">
                    Chave Gemini API (Google AI Studio):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={customKey}
                      onChange={(e) => setCustomKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomKey}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {saveKeySuccess ? <Check className="w-3.5 h-3.5" /> : null}
                      <span>Salvar</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Em hospedagens como Vercel, a chave pode ser definida no painel como <code>GEMINI_API_KEY</code> ou salva diretamente aqui no navegador para ativação imediata.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-950 border border-stone-800">
            <div>
              <div className="text-sm font-medium text-stone-200">Motor de Áudio & Filtro</div>
              <div className="text-xs text-stone-500">Captura com cancelamento de ruído e TTS</div>
            </div>
            {renderStatusBadge(health.audioEngine)}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-stone-950 border border-stone-800">
            <div>
              <div className="text-sm font-medium text-stone-200">Fila de Sincronização</div>
              <div className="text-xs text-stone-500">
                {syncQueue.getPendingItems().length} itens pendentes de sincronização
              </div>
            </div>
            {renderStatusBadge(health.syncQueue)}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-stone-800">
          <span className="text-xs text-stone-500">Última checagem: {health.lastChecked}</span>
          <button
            onClick={runDiagnostics}
            disabled={checking}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Verificar Agora</span>
          </button>
        </div>
      </div>
    </div>
  );
};
