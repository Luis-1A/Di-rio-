import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  KeyRound,
  Mail,
  User,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  LogIn,
  UserPlus,
  ShieldCheck,
} from 'lucide-react';
import { registerUser, loginUser, resetOrChangePassword } from '../lib/authService';

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
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [suggestMode, setSuggestMode] = useState<AuthMode | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSuggestMode(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Informe o seu endereço de e-mail.');
      return;
    }

    if (mode === 'login') {
      if (!password) {
        setErrorMsg('Digite sua senha para acessar.');
        return;
      }
      setLoading(true);
      try {
        await loginUser(cleanEmail, password);
      } catch (err: any) {
        console.error('Login error:', err);
        const msg = err.message || 'Erro ao autenticar.';
        setErrorMsg(msg);
        if (msg.includes('Criar conta') || msg.includes('não encontrada')) {
          setSuggestMode('register');
        }
      } finally {
        setLoading(false);
      }
    } else if (mode === 'register') {
      if (!name.trim()) {
        setErrorMsg('Informe seu nome ou como prefere ser chamado.');
        return;
      }
      if (!password) {
        setErrorMsg('Defina uma senha de acesso.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('As senhas digitadas não coincidem.');
        return;
      }
      setLoading(true);
      try {
        await registerUser(cleanEmail, password, name.trim());
      } catch (err: any) {
        console.error('Registration error:', err);
        const msg = err.message || 'Erro ao criar conta.';
        setErrorMsg(msg);
        if (msg.includes('já está cadastrado') || msg.includes('Entrar')) {
          setSuggestMode('login');
        }
      } finally {
        setLoading(false);
      }
    } else if (mode === 'forgot') {
      if (!newPassword || newPassword.length < 6) {
        setErrorMsg('Informe uma nova senha com pelo menos 6 caracteres.');
        return;
      }
      setLoading(true);
      try {
        const resMsg = await resetOrChangePassword(cleanEmail, newPassword);
        setSuccessMsg(resMsg);
        setPassword(newPassword);
        setTimeout(() => {
          setMode('login');
          setSuccessMsg('Senha atualizada com sucesso! Você já pode entrar.');
        }, 1200);
      } catch (err: any) {
        console.error('Password reset error:', err);
        setErrorMsg(err.message || 'Erro ao redefinir senha.');
      } finally {
        setLoading(false);
      }
    }
  };

  const switchTo = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    setSuggestMode(null);
    if (newMode === 'register' && password) {
      setConfirmPassword(password);
      if (!name && email) {
        const defaultName = email.split('@')[0].replace(/[._0-9]/g, ' ').trim();
        setName(defaultName.charAt(0).toUpperCase() + defaultName.slice(1) || 'Meu Diário');
      }
    }
  };

  const handleAutoCreateAccount = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSuggestMode(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Informe o seu endereço de e-mail.');
      return;
    }
    if (!password || password.length < 6) {
      switchTo('register');
      setErrorMsg('Defina uma senha com no mínimo 6 caracteres para criar sua conta.');
      return;
    }

    const defaultName = name.trim() || email.split('@')[0] || 'Usuário';
    setLoading(true);
    try {
      await registerUser(cleanEmail, password, defaultName);
    } catch (err: any) {
      console.error('Auto-registration error:', err);
      setErrorMsg(err.message || 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-screen-container"
      className="min-h-screen bg-stone-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden"
    >
      {/* Subtle ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-stone-800/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-stone-900 border border-stone-800 shadow-xl mb-3 text-amber-400">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-100 tracking-tight">
            Diário Pessoal
          </h1>
          <p className="text-stone-400 text-xs sm:text-sm mt-1.5 font-sans">
            Seu arquivo digital. Sua memória. Sua história.
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-stone-900/90 backdrop-blur-md border border-stone-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
          {/* Navigation Tabs */}
          <div className="flex border-b border-stone-800 pb-2">
            <button
              id="auth-tab-login"
              type="button"
              onClick={() => switchTo('login')}
              className={`flex-1 pb-2 text-xs sm:text-sm font-medium transition-colors text-center border-b-2 -mb-2 ${
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
              onClick={() => switchTo('register')}
              className={`flex-1 pb-2 text-xs sm:text-sm font-medium transition-colors text-center border-b-2 -mb-2 ${
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
              onClick={() => switchTo('forgot')}
              className={`flex-1 pb-2 text-xs sm:text-sm font-medium transition-colors text-center border-b-2 -mb-2 ${
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
            <div
              id="auth-error-banner"
              className="p-3.5 rounded-xl bg-red-950/70 border border-red-800/80 text-red-200 text-xs sm:text-sm space-y-2.5"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>

              {suggestMode === 'login' && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => switchTo('login')}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Acessar a aba "Entrar"</span>
                  </button>
                </div>
              )}

              {suggestMode === 'register' && (
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoCreateAccount}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Criar conta agora com esta senha</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTo('register')}
                    className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Ir para aba Criar conta</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {successMsg && (
            <div
              id="auth-success-banner"
              className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-200 text-xs sm:text-sm flex items-start gap-2.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Primary Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
                  Seu Nome
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
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
                <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
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
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchTo('forgot')}
                      className="text-xs text-amber-500/80 hover:text-amber-400 transition-colors"
                    >
                      Esqueceu?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
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
                  <KeyRound className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
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

            {mode === 'forgot' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
                  Nova Senha Desejada
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    id="input-forgot-new-password"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-10 py-2.5 text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 text-sm transition-all"
                  />
                </div>
              </div>
            )}

            <button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-semibold py-2.5 sm:py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-900/20 cursor-pointer text-sm"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'login'
                      ? 'Entrar no Diário'
                      : mode === 'register'
                      ? 'Criar Meu Arquivo Pessoal'
                      : 'Redefinir e Salvar Senha'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Privacy & Security footer */}
          <div className="pt-3 border-t border-stone-800/80 flex items-center justify-center gap-2 text-xs text-stone-500">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500/70" />
            <span>Acesso seguro com isolamento individual e criptografia</span>
          </div>
        </div>
      </div>
    </div>
  );
};
