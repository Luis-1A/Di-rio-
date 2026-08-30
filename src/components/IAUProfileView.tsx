import React, { useState, useEffect } from 'react';
import { IAUProfileSettings, UserProfile } from '../types';
import {
  saveIAUSettings,
  exportAllUserData,
  deleteUserAccountData,
} from '../lib/firestoreService';
import { auth } from '../lib/firebase';
import { deleteUser } from 'firebase/auth';
import { getCustomGeminiKey, saveCustomGeminiKey } from '../lib/geminiBridge';
import {
  BrainCircuit,
  Volume2,
  Download,
  Trash2,
  Save,
  CheckCircle2,
  Sparkles,
  Shield,
  Sliders,
  AlertTriangle,
  Key,
} from 'lucide-react';

interface IAUProfileViewProps {
  user: UserProfile;
  settings: IAUProfileSettings;
  onSettingsUpdated: (settings: IAUProfileSettings) => void;
}

export const IAUProfileView: React.FC<IAUProfileViewProps> = ({
  user,
  settings: initialSettings,
  onSettingsUpdated,
}) => {
  const [settings, setSettings] = useState<IAUProfileSettings>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const v = window.speechSynthesis.getVoices();
        setAvailableVoices(v.filter((voice) => voice.lang.startsWith('pt') || voice.lang.includes('pt')));
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await saveIAUSettings(user.uid, settings);
      onSettingsUpdated(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save IAU profile:', err);
      alert('Falha ao salvar configurações no Firebase.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const data = await exportAllUserData(user.uid);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diario_pessoal_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Não foi possível exportar os dados.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    const text = prompt(
      'ATENÇÃO: Esta ação apagará permanentemente todos os seus registros, fotos, memórias e conversas do Firebase.\n\nPara confirmar, digite EXCLUIR:'
    );
    if (text === 'EXCLUIR') {
      setIsDeletingAccount(true);
      try {
        await deleteUserAccountData(user.uid);
        if (auth.currentUser) {
          await deleteUser(auth.currentUser);
        }
        window.location.reload();
      } catch (err: any) {
        console.error('Account deletion error:', err);
        alert(
          'Para excluir a conta por segurança, faça logout e login novamente antes de executar a exclusão.'
        );
      } finally {
        setIsDeletingAccount(false);
      }
    }
  };

  return (
    <div id="iau-profile-view" className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div>
        <h2 className="text-xl font-bold font-serif text-stone-100 flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-amber-400" />
          <span>Perfil da IAU & Configurações</span>
        </h2>
        <p className="text-xs text-stone-400">
          Personalize o comportamento, a extensão das respostas e a voz da sua inteligência pessoal
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* 1. Personality & Style */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Personalidade & Tom de Conversa</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-400 mb-1.5">Tom Predominante</label>
              <select
                value={settings.personalityTone}
                onChange={(e) =>
                  setSettings({ ...settings, personalityTone: e.target.value as any })
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              >
                <option value="natural">Natural & Conversacional</option>
                <option value="thoughtful">Reflexiva & Profunda</option>
                <option value="witty">Espirituosa & Espontânea</option>
                <option value="direct">Direta & Objetiva</option>
                <option value="empathetic">Empática & Acolhedora</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-stone-400 mb-1.5">Extensão das Respostas</label>
              <select
                value={settings.responseLength}
                onChange={(e) =>
                  setSettings({ ...settings, responseLength: e.target.value as any })
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              >
                <option value="adaptive">Adaptativas (conforme o contexto)</option>
                <option value="short">Curtas & Concisas</option>
                <option value="medium">Médias & Balanceadas</option>
                <option value="long">Longas & Detalhadas</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1.5">
              Instruções Customizadas para a IAU
            </label>
            <textarea
              rows={3}
              value={settings.customInstructions || ''}
              onChange={(e) =>
                setSettings({ ...settings, customInstructions: e.target.value })
              }
              placeholder="Ex: 'Sou desenvolvedor, me chame de Luis, evite jargões excessivos...'"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="chk-auto-memory"
              checked={settings.allowAutoMemoryCreation}
              onChange={(e) =>
                setSettings({ ...settings, allowAutoMemoryCreation: e.target.checked })
              }
              className="rounded bg-stone-950 border-stone-800 text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="chk-auto-memory" className="text-xs text-stone-300 cursor-pointer">
              Permitir que a IAU aprenda e estruture novas memórias automaticamente durante as conversas
            </label>
          </div>
        </div>

        {/* 2. Voice & Speech Synthesis */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5" />
            <span>Configurações de Voz & Fala</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-400 mb-1.5">Voz do Sistema (PT-BR)</label>
              <select
                value={settings.selectedVoiceName || ''}
                onChange={(e) =>
                  setSettings({ ...settings, selectedVoiceName: e.target.value })
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              >
                <option value="">Padrão do Navegador</option>
                {availableVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 pt-4 sm:pt-6">
              <input
                type="checkbox"
                id="chk-auto-read"
                checked={settings.autoPlayAudio}
                onChange={(e) =>
                  setSettings({ ...settings, autoPlayAudio: e.target.checked })
                }
                className="rounded bg-stone-950 border-stone-800 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="chk-auto-read" className="text-xs text-stone-300 cursor-pointer">
                Ler respostas em voz alta automaticamente ao receber da IAU
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <div className="flex justify-between text-xs text-stone-400 mb-1">
                <span>Velocidade de Fala ({settings.voiceRate.toFixed(2)}x)</span>
              </div>
              <input
                type="range"
                min="0.75"
                max="1.75"
                step="0.05"
                value={settings.voiceRate}
                onChange={(e) =>
                  setSettings({ ...settings, voiceRate: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-stone-400 mb-1">
                <span>Tom da Voz ({settings.voicePitch.toFixed(2)})</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={settings.voicePitch}
                onChange={(e) =>
                  setSettings({ ...settings, voicePitch: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-2">
          {saveSuccess ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Preferências salvas com sucesso!
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-bold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : 'Salvar Preferências'}</span>
          </button>
        </div>
      </form>

      {/* 3. Chave Gemini API (Google AI Studio) */}
      <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-amber-400" />
          <span>Conexão da IAU Central (Chave Gemini API)</span>
        </h3>
        <p className="text-xs text-stone-400 leading-relaxed">
          A IAU Central utiliza os modelos Gemini da Google AI Studio. Em deploys externos (como Vercel), você pode fornecer sua chave diretamente para comunicação instantânea.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <input
            type="password"
            defaultValue={getCustomGeminiKey()}
            id="iau-custom-gemini-key"
            placeholder="AIzaSy..."
            className="flex-1 bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('iau-custom-gemini-key') as HTMLInputElement;
              if (el) {
                saveCustomGeminiKey(el.value);
                alert('Chave da IAU Central atualizada com sucesso!');
              }
            }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Chave</span>
          </button>
        </div>
      </div>

      {/* 4. Export & Data Sovereignty */}
      <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5 text-amber-400" />
          <span>Soberania de Dados & Backup</span>
        </h3>
        <p className="text-xs text-stone-400 leading-relaxed">
          Exporte todo o seu arquivo digital (textos, referências, memórias, conversas e metadados) em formato JSON estruturado para segurança de longo prazo.
        </p>
        <button
          onClick={handleExportData}
          disabled={isExporting}
          className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExporting ? 'Exportando dados...' : 'Exportar Meu Diário Completo'}</span>
        </button>
      </div>

      {/* 5. Danger Zone */}
      <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Zona de Perigo</span>
        </h3>
        <p className="text-xs text-stone-400">
          Excluir sua conta e apagar todos os documentos e memórias armazenados no Firebase definitivamente.
        </p>
        <button
          onClick={handleDeleteAccount}
          disabled={isDeletingAccount}
          className="px-4 py-2 bg-red-950 border border-red-800 text-red-300 hover:bg-red-900/80 rounded-xl text-xs font-bold transition-colors cursor-pointer"
        >
          {isDeletingAccount ? 'Excluindo...' : 'Excluir Minha Conta Permanentemente'}
        </button>
      </div>
    </div>
  );
};
