import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Radio,
  ShieldCheck,
  ArrowRight,
  KeyRound,
  UserPlus,
  Key,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  RotateCcw
} from 'lucide-react';
import { apiFetch, ensureCsrfToken } from '../lib/api';

interface LoginProps {
  onLoginSuccess: (user: { email: string; name: string; role: string }, token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'signin' | 'register' | 'forgot'>('signin');

  // Sign In State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Register State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState<'admin' | 'root' | 'operator'>('admin');
  const [regMasterKey, setRegMasterKey] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Forgot / Reset Password State
  const [forgotEmail, setForgotEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [codeGenerated, setCodeGenerated] = useState(false);

  // Status State
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void ensureCsrfToken().catch(() => {});
  }, []);

  const resetStatus = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const hasValidComplexity = (pwd: string) =>
    pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();
    setIsLoading(true);

    try {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciais inválidas para acesso administrativo.');
      }

      if (rememberMe) {
        localStorage.setItem('carnauba_auth_token', data.token);
        localStorage.setItem('carnauba_auth_user', JSON.stringify(data.user));
      } else {
        sessionStorage.setItem('carnauba_auth_token', data.token);
        sessionStorage.setItem('carnauba_auth_user', JSON.stringify(data.user));
      }

      onLoginSuccess(data.user, data.token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha de comunicação com o servidor Carnauba';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('A confirmação de senha não confere com a senha digitada.');
      return;
    }

    if (!hasValidComplexity(regPassword)) {
      setErrorMessage('A senha deve conter no mínimo 8 caracteres com letras e números.');
      return;
    }

    if (!regMasterKey.trim()) {
      setErrorMessage('Informe a Chave de Autorização do Cluster para validar o cadastro.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          role: regRole,
          masterKey: regMasterKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao registrar administrador no Areia Preta');
      }

      sessionStorage.setItem('carnauba_auth_token', data.token);
      sessionStorage.setItem('carnauba_auth_user', JSON.stringify(data.user));

      setSuccessMessage('Administrador gravado no Areia Preta! Carregando painel...');
      setTimeout(() => {
        onLoginSuccess(data.user, data.token);
      }, 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha no cadastro do administrador';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();
    setIsLoading(true);

    try {
      const res = await apiFetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível gerar o código de recuperação.');
      }

      setCodeGenerated(true);
      setSuccessMessage(data.message || 'Código gravado com segurança no servidor XIQI OS.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar solicitação de recuperação';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('A nova senha e a confirmação devem ser idênticas.');
      return;
    }

    if (!hasValidComplexity(newPassword)) {
      setErrorMessage('A nova senha deve conter no mínimo 8 caracteres com letras e números.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail,
          code: recoveryCode,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Código inválido ou expirado.');
      }

      setSuccessMessage('Senha atualizada no Areia Preta! Retornando para o login...');
      setTimeout(() => {
        setLoginEmail(forgotEmail);
        setLoginPassword('');
        setActiveTab('signin');
        resetStatus();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao redefinir senha';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] flex flex-col justify-between items-center px-4 py-6 font-sans selection:bg-[#6b16ed] selection:text-white">
      <div className="w-full max-w-lg my-auto space-y-5">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center p-3 rounded-xl bg-[#6b16ed] border border-[#8b45ff]/40 mb-1">
            <Radio className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
              Carnauba
              <span className="text-xs px-2 py-0.5 rounded bg-[#6b16ed]/20 text-[#a391ff] border border-[#6b16ed]/30 font-mono font-medium">
                XIQI OS
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Motor Local de Deploy &amp; Orquestração — Banco Areia Preta
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
          <div className="flex border-b border-white/10 bg-[#0e0e11] text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin');
                resetStatus();
              }}
              className={`flex-1 py-3 px-3 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
                activeTab === 'signin'
                  ? 'border-[#6b16ed] text-white bg-[#121212]'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                resetStatus();
              }}
              className={`flex-1 py-3 px-3 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
                activeTab === 'register'
                  ? 'border-[#6b16ed] text-white bg-[#121212]'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cadastrar Admin</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('forgot');
                resetStatus();
              }}
              className={`flex-1 py-3 px-3 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
                activeTab === 'forgot'
                  ? 'border-[#6b16ed] text-white bg-[#121212]'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Recuperar</span>
            </button>
          </div>

          <div className="p-6">
            {errorMessage && (
              <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            {activeTab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4 text-xs">
                <div className="pb-2 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-white">Autenticação Administrativa</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Acesso local ao mini data center x86_64 (/opt/xiqi/)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="block text-zinc-300 font-medium">
                    E-mail corporativo
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="username"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md pl-9 pr-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-zinc-300 font-medium">
                      Senha de acesso
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('forgot');
                        setForgotEmail(loginEmail);
                        resetStatus();
                      }}
                      className="text-[11px] text-[#a391ff] hover:underline"
                    >
                      Redefinir senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md pl-9 pr-10 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      aria-label="Alternar visibilidade da senha"
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded bg-[#18181b] border-white/20 text-[#6b16ed] focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-[#6b16ed]"
                    />
                    <span>Manter sessão neste navegador</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] border border-[#8b45ff]/40 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Validando credenciais...</span>
                  ) : (
                    <>
                      <span>Entrar no Console</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
                <div className="pb-2 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-white">Novo Administrador</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Exige Chave de Autorização do Cluster gravada no servidor XIQI OS
                  </p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="reg-name" className="block text-zinc-300 font-medium">Nome completo</label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="reg-email" className="block text-zinc-300 font-medium">E-mail corporativo</label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="reg-role" className="block text-zinc-300 font-medium">Perfil</label>
                    <select
                      id="reg-role"
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value as 'admin' | 'root' | 'operator')}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                    >
                      <option value="admin">Administrador</option>
                      <option value="operator">Operador XIQI OS</option>
                      <option value="root">Superusuário Root</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="reg-master" className="block text-amber-300 font-medium flex items-center gap-1">
                      <KeyRound className="w-3 h-3" />
                      Chave do Cluster
                    </label>
                    <input
                      id="reg-master"
                      type="password"
                      required
                      value={regMasterKey}
                      onChange={(e) => setRegMasterKey(e.target.value)}
                      className="w-full bg-[#18181b] border border-amber-500/30 rounded-md px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="reg-pass" className="block text-zinc-300 font-medium">
                      Senha (mín. 8, letras + números)
                    </label>
                    <div className="relative">
                      <input
                        id="reg-pass"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 pr-9 text-white focus:outline-none focus:border-[#6b16ed]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-white"
                      >
                        {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="reg-confirm" className="block text-zinc-300 font-medium">Confirmar senha</label>
                    <input
                      id="reg-confirm"
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] border border-[#8b45ff]/40 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{isLoading ? 'Gravando no Areia Preta...' : 'Finalizar Cadastro'}</span>
                </button>
              </form>
            )}

            {activeTab === 'forgot' && (
              <div className="space-y-4 text-xs">
                <div className="pb-2 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-white">Recuperação de Acesso</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    O código de verificação é gravado com segurança em /opt/xiqi/app/areiapreta/.recovery_code
                  </p>
                </div>

                {!codeGenerated ? (
                  <form onSubmit={handleRequestRecoveryCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="forgot-email" className="block text-zinc-300 font-medium">E-mail cadastrado</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
                          id="forgot-email"
                          type="email"
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="w-full bg-[#18181b] border border-white/10 rounded-md pl-9 pr-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Key className="w-4 h-4" />
                      <span>{isLoading ? 'Consultando Areia Preta...' : 'Gerar Código Local no Servidor'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-3.5">
                    <div className="space-y-1">
                      <label htmlFor="reset-code" className="block text-zinc-300 font-medium">
                        Código de verificação (6 dígitos)
                      </label>
                      <input
                        id="reset-code"
                        type="text"
                        required
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white font-mono tracking-wider focus:outline-none focus:border-[#6b16ed]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="reset-pass" className="block text-zinc-300 font-medium">
                        Nova senha (mín. 8, letras + números)
                      </label>
                      <div className="relative">
                        <input
                          id="reset-pass"
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 pr-9 text-white focus:outline-none focus:border-[#6b16ed]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-white"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="reset-confirm" className="block text-zinc-300 font-medium">Confirmar nova senha</label>
                      <input
                        id="reset-confirm"
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCodeGenerated(false)}
                        className="px-3 py-2 rounded bg-white/5 hover:bg-white/10 text-zinc-300 flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Voltar</span>
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex-1 py-2 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isLoading ? 'Atualizando...' : 'Confirmar Nova Senha'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Security Shield Summary */}
        <div className="bg-[#121212] border border-white/5 rounded-lg p-3 text-[11px] text-zinc-400 space-y-1.5">
          <div className="flex items-center justify-between font-medium text-zinc-300">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Blindagem Ativa — XIQI OS &amp; Areia Preta
            </span>
            <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              scrypt + CSRF + RBAC
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-zinc-400 pt-1">
            <span>• Proteção CSRF &amp; Verificação de Origem</span>
            <span>• Hashing scrypt &amp; Locks Atômicos em Disco</span>
            <span>• Confinamento em /opt/xiqi/app/</span>
            <span>• Rate Limit &amp; Lista Branca de Comandos</span>
          </div>
        </div>
      </div>

      {/* Exclusive Footer */}
      <footer className="pt-6 pb-2 text-center text-xs text-zinc-500">
        Corporação Engecema
      </footer>
    </div>
  );
};
