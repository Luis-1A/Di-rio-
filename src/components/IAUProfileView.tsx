import React, { useState } from 'react';
import { UserProfile } from '../types';
import {
  exportAllUserData,
  deleteUserAccountData,
} from '../lib/firestoreService';
import { auth } from '../lib/firebase';
import { deleteUser } from 'firebase/auth';
import {
  Download,
  Trash2,
  CheckCircle2,
  Shield,
  User,
  HardDrive,
  CloudCheck,
  AlertTriangle,
} from 'lucide-react';

interface IAUProfileViewProps {
  user: UserProfile;
  settings?: any;
  onSettingsUpdated?: (settings: any) => void;
}

export const IAUProfileView: React.FC<IAUProfileViewProps> = ({ user }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    setExportSuccess(false);
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
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to export user data:', err);
      alert('Falha ao exportar os dados.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmText = prompt(
      'Atenção: Todos os seus registros, fotos, áudios, vídeos e documentos serão excluídos permanentemente do Firebase. Digite EXCLUIR para confirmar:'
    );

    if (confirmText !== 'EXCLUIR') {
      return;
    }

    setIsDeletingAccount(true);
    try {
      await deleteUserAccountData(user.uid);
      if (auth.currentUser) {
        await deleteUser(auth.currentUser);
      }
      window.location.reload();
    } catch (err: any) {
      console.error('Error deleting account:', err);
      alert(
        'Por motivos de segurança, saia e faça login novamente antes de excluir sua conta.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div id="settings-view" className="max-w-md md:max-w-xl mx-auto px-4 py-4 space-y-5">
      {/* 1. Account Profile Card */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 border border-orange-200/60 flex items-center justify-center font-bold text-lg">
            {user.displayName?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-800">
              {user.displayName || 'Usuário do Diário'}
            </h2>
            <p className="text-xs text-stone-500">{user.email || 'Modo Direto / Convidado'}</p>
          </div>
        </div>

        <div className="pt-2 border-t border-stone-100 grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/60">
            <span className="text-[10px] text-stone-400 block uppercase font-medium">
              Autenticação
            </span>
            <span className="font-semibold text-stone-800">
              {user.isAnonymous ? 'Modo Direto' : 'Firebase Auth'}
            </span>
          </div>

          <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/60">
            <span className="text-[10px] text-stone-400 block uppercase font-medium">
              Sincronização
            </span>
            <span className="font-semibold text-emerald-700 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Nuvem Ativa
            </span>
          </div>
        </div>
      </div>

      {/* 2. Storage & Cloud Status */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-orange-600" />
          <h3 className="text-sm font-bold text-stone-800">
            Armazenamento de Arquivos
          </h3>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed">
          Seus textos, fotos, áudios, vídeos e PDFs são transmitidos e armazenados com segurança no Firebase e sincronizados entre todos os seus dispositivos.
        </p>

        <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl text-xs text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Pipeline de upload à prova de falhas</p>
            <p className="text-[11px] text-emerald-700/90 mt-0.5">
              Confirmação dupla (Storage + Firestore) com prevenção de carregamento infinito.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Export & Backup Data */}
      <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-stone-700" />
          <h3 className="text-sm font-bold text-stone-800">
            Exportação & Backup Completo
          </h3>
        </div>

        <p className="text-xs text-stone-500">
          Baixe uma cópia integral de todos os seus registros, memórias e links de arquivos em formato JSON estruturado.
        </p>

        <button
          type="button"
          onClick={handleExportData}
          disabled={isExporting}
          className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <Download className="w-4 h-4" />
          <span>{isExporting ? 'Preparando arquivo...' : 'Baixar Todos os Meus Dados'}</span>
        </button>

        {exportSuccess && (
          <p className="text-xs text-emerald-600 font-medium text-center">
            ✓ Backup baixado com sucesso!
          </p>
        )}
      </div>

      {/* 4. Danger Zone */}
      <div className="bg-red-50/50 border border-red-200/80 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-4 h-4" />
          <h3 className="text-sm font-bold">Zona de Exclusão</h3>
        </div>

        <p className="text-xs text-red-600/90">
          Esta ação apagará permanentemente todos os seus registros no Firestore e Storage. Não é possível recuperar os dados depois.
        </p>

        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={isDeletingAccount}
          className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <Trash2 className="w-4 h-4" />
          <span>
            {isDeletingAccount ? 'Excluindo dados...' : 'Excluir Todos os Meus Dados'}
          </span>
        </button>
      </div>
    </div>
  );
};
