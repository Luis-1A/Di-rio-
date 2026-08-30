import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getOrCreateUserProfile } from '../lib/firestoreService';
import { BookOpen, Sparkles, KeyRound, Mail, User, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot';

interface AuthScreenProps {
  onAuthenticated?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const translateFirebaseError = (errCode: string): string => {
    switch (errCode) {
      case 'auth/invalid-email':
        return 'O formato do e-mail é inválido.';
      case 'auth/user-disabled':
        return 'Esta conta de usuário foi desativada.';
      case 'auth/user-not-found':
        return 'Nenhum usuário encontrado com este e-mail.';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'E-mail ou senha incorretos.';
      case 'auth/email-already-in-use':
        return 'Este e-mail já está cadastrado em outra conta.';
      case 'auth/weak-password':
        return 'A senha é muito fraca. Escolha uma senha com pelo menos 6 caracteres.';
      case 'auth/network-request-failed':
        return 'Falha de rede. Verifique sua conexão com a internet.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas sem sucesso. Tente novamente mais tarde.';
      default:
        return 'Ocorreu um erro ao autenticar. Tente novamente.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setErrorMsg('Informe o seu endereço de e-mail.');
      return;
    }

    if (mode !== 'forgot' && !password) {
      setErrorMsg('Informe a sua senha.');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setErrorMsg('Informe seu nome ou apelido.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('As senhas digitadas não coincidem.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('A senha precisa ter no mínimo 6 caracteres.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await getOrCreateUserProfile(userCred.user.uid, userCred.user.email || email, userCred.user.displayName || undefined);
      } else if (mode === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(userCred.user, { displayName: name.trim() });
        await getOrCreateUserProfile(userCred.user.uid, email.trim(), name.trim());
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email.trim());
        setSuccessMsg('E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.');
      }
    } catch (err: any) {
      console.error('Firebase Auth error:', err);
      const message = translateFirebaseError(err.code || '');
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-screen-container" className="min-h-screen bg-stone-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      {/* Subtle ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-stone-800/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-900 border border-stone-800 shadow-xl mb-4 text-amber-400">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold font-serif text-stone-100 tracking-tight">
            Diário Pessoal
          </h1>
          <p className="text-stone-400 text-sm mt-2 font-sans">
            Seu arquivo digital. Sua memória. Sua história.
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-stone-900/90 backdrop-blur-md border border-stone-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Tabs */}
          <div className="flex border-b border-stone-800 mb-6 pb-2">
            <button
              id="auth-tab-login"
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 pb-2 text-sm font-medium transition-colors text-center border-b-2 -mb-2 ${
                mode === 'login'
                  ? 'border-amber-500 text-amber-400 font-semibold'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              Entrar
            </button>
            <button
              id="auth-tab-register"
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 pb-2 text-sm font-medium transition-colors text-center border-b-2 -mb-2 ${
                mode === 'register'
                  ? 'border-amber-500 text-amber-400 font-semibold'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              Criar conta
            </button>
            <button
              id="auth-tab-forgot"
              type="button"
              onClick={() => {
                setMode('forgot');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 pb-2 text-sm font-medium transition-colors text-center border-b-2 -mb-2 ${
                mode === 'forgot'
                  ? 'border-amber-500 text-amber-400 font-semibold'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              Recuperar
            </button>
          </div>

          {/* Feedback banners */}
          {errorMsg && (
            <div id="auth-error-banner" className="mb-5 p-3.5 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div id="auth-success-banner" className="mb-5 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-200 text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
                  Seu Nome
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-3.5" />
                  <input
                    id="input-register-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como prefere ser chamado"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-10 py-2.5 text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 text-sm transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-3.5" />
                <input
                  id="input-auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-10 py-2.5 text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 text-sm transition-all"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                    Senha
                  </label>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-stone-500 absolute left-3.5 top-3.5" />
                  <input
                    id="input-auth-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-10 py-2.5 text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 text-sm transition-all"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-stone-500 absolute left-3.5 top-3.5" />
                  <input
                    id="input-register-password-confirm"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-10 py-2.5 text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 text-sm transition-all"
                  />
                </div>
              </div>
            )}

            <button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              className="w-full mt-6 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-900/20 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'login'
                      ? 'Entrar no Diário'
                      : mode === 'register'
                      ? 'Criar Meu Arquivo Pessoal'
                      : 'Enviar Instruções de Recuperação'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Privacy badge */}
          <div className="mt-6 pt-4 border-t border-stone-800/80 flex items-center justify-center gap-2 text-xs text-stone-500">
            <Sparkles className="w-3.5 h-3.5 text-amber-500/70" />
            <span>Isolamento individual criptografado via Firebase</span>
          </div>
        </div>
      </div>
    </div>
  );
};
