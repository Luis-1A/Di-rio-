import React, { useState, useEffect } from 'react';
import { IAUProfileSettings, UserProfile } from '../types';
import {
  saveIAUSettings,
  exportAllUserData,
  deleteUserAccountData,
} from '../lib/firestoreService';
import { auth } from '../lib/firebase';
import { deleteUser } from 'firebase/auth';
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
  UserCheck,
  HeartHandshake,
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
  const [settings, setSettings] = useState<IAUProfileSettings>({
    mirrorHostPersonality: true,
    hostNickName: user.displayName || '',
    hostPersonaTraits: '',
    hostIntimacyLevel: 'companion',
    ...initialSettings,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setSettings({
      mirrorHostPersonality: true,
      hostNickName: user.displayName || '',
      hostPersonaTraits: '',
      hostIntimacyLevel: 'companion',
      ...initialSettings,
    });
  }, [initialSettings, user.displayName]);

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
        <h2 className="text-xl font-serif font-semibold text-stone-800 flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-amber-600" />
          <span>Personalidade & Cérebro da IA</span>
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Configure a essência da IA, sintonia com o seu estilo pessoal, voz e parâmetros operacionais
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* 1. Host Personality Mirroring (Sintonia do Hospedeiro) */}
        <div className="bg-white border border-stone-100 rounded-3xl p-5 space-y-4 shadow-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-800 flex items-center gap-1.5">
            <HeartHandshake className="w-3.5 h-3.5 text-orange-600" />
            <span>Sintonia com o Hospedeiro (Personalidade da IA)</span>
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">
            A IA carrega a alma do hospedeiro: aprende seu tom, vocabulário, ritmo e preferências para interagir com cumplicidade natural.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Como você prefere ser chamado?</label>
              <input
                type="text"
                value={settings.hostNickName || ''}
                onChange={(e) => setSettings({ ...settings, hostNickName: e.target.value })}
                placeholder="Ex: João, Júlia, Gui..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:outline-hidden focus:border-orange-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Nível de Proximidade & Sintonia</label>
              <select
                value={settings.hostIntimacyLevel || 'companion'}
                onChange={(e) =>
                  setSettings({ ...settings, hostIntimacyLevel: e.target.value as any })
                }
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:outline-hidden focus:border-orange-600"
              >
                <option value="companion">Companheiro Dedicado (Leal e acolhedor)</option>
                <option value="respectful">Respeitoso & Cordial (Sóbrio e polido)</option>
                <option value="intimate_mirror">Espelho Íntimo (Sincronia total de vocabulário e estilo)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              Traços de personalidade para a IA espelhar
            </label>
            <input
              type="text"
              value={settings.hostPersonaTraits || ''}
              onChange={(e) => setSettings({ ...settings, hostPersonaTraits: e.target.value })}
              placeholder="Ex: Curioso, reflexivo, fala tranquila, focado em tecnologia e arte..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:outline-hidden focus:border-orange-600"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              type="checkbox"
              id="chk-mirror-host"
              checked={settings.mirrorHostPersonality !== false}
              onChange={(e) =>
                setSettings({ ...settings, mirrorHostPersonality: e.target.checked })
              }
              className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="chk-mirror-host" className="text-xs text-stone-600 cursor-pointer">
              Ativar espelhamento contínuo da personalidade e hábitos do hospedeiro
            </label>
          </div>
        </div>

        {/* 2. Response Style & Tone */}
        <div className="bg-white border border-stone-100 rounded-3xl p-5 space-y-4 shadow-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
            <span>Estilo & Formato das Respostas</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Tom Predominante</label>
              <select
                value={settings.personalityTone}
                onChange={(e) =>
                  setSettings({ ...settings, personalityTone: e.target.value as any })
                }
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:outline-hidden focus:border-orange-600"
              >
                <option value="natural">Natural e Aconchegante</option>
                <option value="thoughtful">Reflexivo e Profundo</option>
                <option value="witty">Espirituoso e Leve</option>
                <option value="direct">Direto e Objetivo</option>
                <option value="empathetic">Empático e Caloroso</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Extensão das Respostas</label>
              <select
                value={settings.responseLength}
                onChange={(e) =>
                  setSettings({ ...settings, responseLength: e.target.value as any })
                }
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:outline-hidden focus:border-orange-600"
              >
                <option value="adaptive">Adaptativo (conforme a pergunta)</option>
                <option value="short">Curtas e Diretas</option>
                <option value="medium">Equilibradas</option>
                <option value="long">Completas e Detalhadas</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              Instruções personalizadas adicionais
            </label>
            <textarea
              rows={3}
              value={settings.customInstructions || ''}
              onChange={(e) =>
                setSettings({ ...settings, customInstructions: e.target.value })
              }
              placeholder="Ex: 'Evite respostas prolixas, me lembre de tomar água quando eu falar de cansaço...'"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-hidden focus:border-orange-600 resize-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              type="checkbox"
              id="chk-auto-memory"
              checked={settings.allowAutoMemoryCreation}
              onChange={(e) =>
                setSettings({ ...settings, allowAutoMemoryCreation: e.target.checked })
              }
              className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="chk-auto-memory" className="text-xs text-stone-600 cursor-pointer">
              Indexar automaticamente novos fatos e preferências na Memória Permanente
            </label>
          </div>
        </div>

        {/* 3. Voice & Speech Synthesis */}
        <div className="bg-white border border-stone-100 rounded-3xl p-5 space-y-4 shadow-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-800 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-orange-600" />
            <span>Voz e Leitura em Áudio</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Voz do Sistema (PT-BR)</label>
              <select
                value={settings.selectedVoiceName || ''}
                onChange={(e) =>
                  setSettings({ ...settings, selectedVoiceName: e.target.value })
                }
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:outline-hidden focus:border-orange-600"
              >
                <option value="">Padrão do Dispositivo</option>
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
                className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="chk-auto-read" className="text-xs text-stone-600 cursor-pointer">
                Ler respostas em voz alta automaticamente
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <div className="flex justify-between text-xs text-stone-600 mb-1">
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
                className="w-full accent-orange-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-stone-600 mb-1">
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
                className="w-full accent-orange-600"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-1">
          {saveSuccess ? (
            <span className="text-xs text-emerald-700 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Preferências salvas com sucesso!
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold rounded-2xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-orange-600/20"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : 'Salvar Preferências'}</span>
          </button>
        </div>
      </form>

      {/* 4. Export & Backup */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-5 space-y-3 shadow-xs">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5 text-amber-600" />
          <span>Backup e Exportação</span>
        </h3>
        <p className="text-xs text-stone-500 leading-relaxed">
          Baixe todos os seus registros, fotos, memórias e conversas em formato JSON para manter uma cópia física segura.
        </p>
        <button
          onClick={handleExportData}
          disabled={isExporting}
          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExporting ? 'Exportando dados...' : 'Exportar Meu Diário Completo'}</span>
        </button>
      </div>

      {/* 5. Danger Zone */}
      <div className="bg-red-50/50 border border-red-200 rounded-2xl p-5 space-y-3 shadow-xs">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Zona de Perigo</span>
        </h3>
        <p className="text-xs text-stone-600">
          Excluir permanentemente sua conta e todos os dados guardados.
        </p>
        <button
          onClick={handleDeleteAccount}
          disabled={isDeletingAccount}
          className="px-4 py-2 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-xl text-xs font-medium transition-colors cursor-pointer"
        >
          {isDeletingAccount ? 'Excluindo...' : 'Excluir Minha Conta'}
        </button>
      </div>
    </div>
  );
};
