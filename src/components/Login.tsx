import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Radio,
  ShieldCheck,
  ArrowRight,
  KeyRound,
  Sparkles,
  UserPlus,
  Key,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  RotateCcw
} from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: { email: string; name: string; role: string }, token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'signin' | 'register' | 'forgot'>('signin');

  // Sign In State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

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

  const resetStatus = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // 1. Sign In Handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
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
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha de comunicação com o servidor Carnauba');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Register Administrator Handler
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('A confirmação de senha não confere com a senha digitada.');
      return;
    }

    if (regPassword.length < 8) {
      setErrorMessage('A senha deve conter no mínimo 8 caracteres para conformidade de segurança.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/auth/register', {
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
        throw new Error(data.error || 'Erro ao registrar novo administrador');
      }

      localStorage.setItem('carnauba_auth_token', data.token);
      localStorage.setItem('carnauba_auth_user', JSON.stringify(data.user));

      setSuccessMessage('Administrador registrado com sucesso! Carregando painel de controle...');
      setTimeout(() => {
        onLoginSuccess(data.user, data.token);
      }, 800);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha no cadastro do administrador');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Request Recovery Code
  const handleRequestRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível solicitar o código de recuperação.');
      }

      setCodeGenerated(true);
      if (data.recoveryCode) {
        setRecoveryCode(data.recoveryCode);
      }
      setSuccessMessage('Código de verificação gerado e pronto para validação de segurança.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar solicitação de recuperação');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Confirm Password Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStatus();

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('A nova senha e a confirmação devem ser idênticas.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/auth/reset-password', {
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

      setSuccessMessage('Senha atualizada com sucesso! Redirecionando para a aba de autenticação...');
      setTimeout(() => {
        setLoginEmail(forgotEmail);
        setLoginPassword(newPassword);
        setActiveTab('signin');
        resetStatus();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao redefinir senha');
    } finally {
      setIsLoading(false);
    }
  };

  const fillQuickCredentials = (demoEmail: string, demoPass: string) => {
    setLoginEmail(demoEmail);
    setLoginPassword(demoPass);
    resetStatus();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans selection:bg-[#6b16ed] selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#6b16ed]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-[#8b45ff]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-lg relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-[#6b16ed] to-[#8b45ff] shadow-[0_4px_24px_rgba(107,22,237,0.4)] mb-1">
            <Radio className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
              Carnauba <span className="text-xs px-2 py-0.5 rounded-full bg-[#6b16ed]/20 text-[#a391ff] border border-[#6b16ed]/30 font-mono font-medium">v4 PaaS</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Plataforma PaaS &amp; Motor de Orquestração em Nuvem
            </p>
          </div>
        </div>

        {/* Card with Tabs */}
        <div className="bg-[#121212] border border-white/10 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
          {/* Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-[#0e0e11] text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setActiveTab('signin');
                resetStatus();
              }}
              className={`flex-1 py-3 px-4 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
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
              className={`flex-1 py-3 px-4 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
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
              className={`flex-1 py-3 px-4 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
                activeTab === 'forgot'
                  ? 'border-[#6b16ed] text-white bg-[#121212]'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Esqueci Senha</span>
            </button>
          </div>

          <div className="p-6 sm:p-7">
            {/* Feedback Notifications */}
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

            {/* TAB 1: SIGN IN */}
            {activeTab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4 text-xs">
                <div className="pb-2 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-white">Autenticação Administrativa</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Acesse o console com suas credenciais seguras</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-zinc-300 font-medium">Endereço de e-mail institucional</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md pl-9 pr-3 py-2 text-white focus:outline-none focus:border-[#6b16ed] transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-zinc-300 font-medium">Chave de acesso / Senha</label>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('forgot');
                        setForgotEmail(loginEmail);
                        resetStatus();
                      }}
                      className="text-[11px] text-[#a391ff] hover:underline"
                    >
                      Esqueceu a chave?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md pl-9 pr-10 py-2 text-white focus:outline-none focus:border-[#6b16ed] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
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
                    <span>Manter autenticação ativa</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] shadow-[0_2px_0_0_#4a0fa3] transition-all flex items-center justify-center gap-2 active:translate-y-0.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Validando credenciais...</span>
                    </>
                  ) : (
                    <>
                      <span>Entrar no Console</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Quick Credentials */}
                <div className="mt-6 pt-5 border-t border-white/5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-[#a391ff]" />
                    <span>Contas Padrão de Homologação</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => fillQuickCredentials('root@carnauba.cloud', 'carnauba123')}
                      className="bg-[#18181b] hover:bg-[#222228] border border-white/5 hover:border-white/10 rounded-md p-2.5 text-left transition-colors"
                    >
                      <div className="font-semibold text-white">Root Administrator</div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">root@carnauba.cloud</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => fillQuickCredentials('devops@carnauba.cloud', 'carnauba123')}
                      className="bg-[#18181b] hover:bg-[#222228] border border-white/5 hover:border-white/10 rounded-md p-2.5 text-left transition-colors"
                    >
                      <div className="font-semibold text-white">DevOps Team</div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">devops@carnauba.cloud</div>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB 2: REGISTER ADMINISTRATOR */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
                <div className="pb-2 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-white">Novo Administrador Carnauba</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Cadastre credenciais com regras de proteção contra escalonamento</p>
                </div>

                <div className="space-y-1">
                  <label className="block text-zinc-300 font-medium">Nome completo do administrador</label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-zinc-300 font-medium">E-mail corporativo / institucional</label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-zinc-300 font-medium">Nível de privilégio</label>
                    <select
                      value={regRole}
                      onChange={(e: any) => setRegRole(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                    >
                      <option value="admin">Administrador de Equipe</option>
                      <option value="operator">Operador de Infraestrutura</option>
                      <option value="root">Superusuário Root</option>
                    </select>
                  </div>

                  {regRole === 'root' && (
                    <div className="space-y-1">
                      <label className="block text-amber-300 font-medium flex items-center gap-1">
                        <KeyRound className="w-3 h-3" />
                        Chave Master do Cluster
                      </label>
                      <input
                        type="password"
                        required
                        value={regMasterKey}
                        onChange={(e) => setRegMasterKey(e.target.value)}
                        className="w-full bg-[#18181b] border border-amber-500/30 rounded-md px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-zinc-300 font-medium">Senha segura (mín. 8 dígitos)</label>
                    <div className="relative">
                      <input
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
                    <label className="block text-zinc-300 font-medium">Confirmação da senha</label>
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400 bg-white/[0.02] p-2.5 rounded border border-white/5 space-y-1">
                  <span className="font-semibold text-zinc-300 block">Política de Auditoria:</span>
                  <span>Todo novo usuário é registrado com sal criptográfico SHA-256 e monitorado contra invasões.</span>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] shadow-[0_2px_0_0_#4a0fa3] transition-all flex items-center justify-center gap-2 active:translate-y-0.5 disabled:opacity-50 mt-2"
                >
                  {isLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Registrando na base de dados...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Finalizar Cadastro e Acessar</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 3: FORGOT / RESET PASSWORD */}
            {activeTab === 'forgot' && (
              <div className="space-y-4 text-xs">
                <div className="pb-2 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-white">Recuperação e Redefinição de Senha</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Gere um código seguro de autorização para trocar a credencial</p>
                </div>

                {!codeGenerated ? (
                  <form onSubmit={handleRequestRecoveryCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-zinc-300 font-medium">Informe o e-mail cadastrado do administrador</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
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
                      className="w-full py-2.5 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] shadow-[0_2px_0_0_#4a0fa3] transition-all flex items-center justify-center gap-2 active:translate-y-0.5 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Consultando base de segurança...</span>
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          <span>Gerar Código de Recuperação</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="block text-zinc-300 font-medium">Código de verificação (6 dígitos)</label>
                      <input
                        type="text"
                        required
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/10 rounded-md px-3 py-2 text-white font-mono tracking-wider focus:outline-none focus:border-[#6b16ed]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-zinc-300 font-medium">Nova senha</label>
                      <div className="relative">
                        <input
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
                      <label className="block text-zinc-300 font-medium">Confirme a nova senha</label>
                      <input
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
                        className="flex-1 py-2 px-4 rounded-md font-medium text-white bg-[#6b16ed] hover:bg-[#7317ff] shadow-[0_2px_0_0_#4a0fa3] transition-all flex items-center justify-center gap-2 active:translate-y-0.5 disabled:opacity-50"
                      >
                        {isLoading ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Atualizando chave...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Confirmar Nova Senha</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Security Shield & Hacker Defense Badge */}
        <div className="bg-[#121212]/70 border border-white/5 rounded-lg p-3 text-[11px] text-zinc-400 space-y-1.5">
          <div className="flex items-center justify-between font-medium text-zinc-300">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Carnauba Anti-Racker Shield Ativo
            </span>
            <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              Defesa Nível 4
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-zinc-400 pt-1">
            <span>• Proteção contra Brute Force &amp; Rate Limit</span>
            <span>• Defesa Anti-Command Injection (Terminal)</span>
            <span>• Criptografia SHA-256 com Sal Individual</span>
            <span>• Cabeçalhos HTTP Defensivos (XSS/Clickjack)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
