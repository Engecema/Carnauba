import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Layers,
  Database,
  Terminal,
  Activity,
  Plus,
  Play,
  RotateCw,
  Square,
  Trash2,
  Cpu,
  HardDrive,
  RefreshCw,
  Code2,
  Copy,
  Check,
  Search,
  Globe,
  Radio,
  LogOut,
  ShieldCheck,
  FolderGit2,
  Network,
  KeyRound,
  AlertTriangle,
  Eye,
  EyeOff
} from 'lucide-react';
import { Login } from './components/Login';
import { apiFetch } from './lib/api';

interface AreiaPretaEnvVars {
  AREIA_PRETA_HOME: string;
  AREIA_PRETA_HOST: string;
  AREIA_PRETA_PORT: string;
  AREIA_PRETA_SCHEMA: string;
  AREIA_PRETA_USER: string;
  AREIA_PRETA_PASSWORD: string;
  AREIA_PRETA_URL: string;
}

interface ServerData {
  id: string;
  name: string;
  ip: string;
  user: string;
  port: number;
  os_name: string;
  architecture: string;
  xiqi_root: string;
  app_directory: string;
  status: 'online' | 'unreachable' | 'provisioning';
  runtime_engine: string;
  proxy_type: string;
  proxy_status: 'running' | 'stopped';
  cpu_usage: number;
  memory_usage: { used: number; total: number };
  disk_usage: { used: number; total: number };
  active_services: number;
}

interface ApplicationData {
  id: string;
  name: string;
  slug: string;
  fqdn: string;
  git_repository: string;
  git_branch: string;
  runtime_mode: 'nodejs' | 'static' | 'binary' | 'service';
  status: 'running' | 'stopped' | 'building' | 'failed';
  server_id: string;
  server_name: string;
  environment: string;
  project: string;
  local_directory: string;
  destination_port: number;
  areia_preta_env: AreiaPretaEnvVars;
  created_at: string;
  updated_at: string;
}

interface DatabaseData {
  id: string;
  name: string;
  type: 'areiapreta';
  version: string;
  status: 'running' | 'stopped' | 'degraded';
  server_id: string;
  server_name: string;
  port: number;
  data_path: string;
  db_name: string;
  db_user: string;
  backup_enabled: boolean;
  backup_frequency: string;
  size_mb: number;
}

interface DeploymentData {
  id: string;
  application_id: string;
  application_name: string;
  commit: string;
  commit_message: string;
  branch: string;
  target_directory: string;
  assigned_port: number;
  status: 'in_progress' | 'finished' | 'failed' | 'cancelled';
  logs: string[];
  created_at: string;
  duration_seconds: number;
}

interface PortMapData {
  base_app_port: number;
  next_available_port: number;
  reserved_ports: Array<{ port: number; service: string }>;
  allocated_applications: Array<{
    id: string;
    name: string;
    slug: string;
    port: number;
    directory: string;
    status: string;
  }>;
  allocated_databases: Array<{
    id: string;
    name: string;
    port: number;
    data_path: string;
    status: string;
  }>;
}

interface AreiaPretaDiagnostics {
  engine: string;
  configured_path: string;
  active_storage_path: string;
  xiqi_app_directory: string;
  storage_mode: string;
  host: string;
  port: number;
  disk_locks: {
    active_locks: number;
    total_lock_acquisitions: number;
    total_atomic_writes: number;
    last_write_at: string | null;
  };
  recent_security_events: Array<{
    id: string;
    type: string;
    ip: string;
    detail: string;
    timestamp: string;
  }>;
}

interface UserProfile {
  email: string;
  name: string;
  role: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const savedUser = localStorage.getItem('carnauba_auth_user') || sessionStorage.getItem('carnauba_auth_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [authToken, setAuthToken] = useState<string | null>(() => {
    return localStorage.getItem('carnauba_auth_token') || sessionStorage.getItem('carnauba_auth_token');
  });

  const [currentTab, setCurrentTab] = useState<
    'overview' | 'applications' | 'databases' | 'servers' | 'deployments' | 'terminal' | 'api'
  >('overview');

  const [servers, setServers] = useState<ServerData[]>([]);
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [databases, setDatabases] = useState<DatabaseData[]>([]);
  const [deployments, setDeployments] = useState<DeploymentData[]>([]);
  const [portMap, setPortMap] = useState<PortMapData | null>(null);
  const [areiaDiagnostics, setAreiaDiagnostics] = useState<AreiaPretaDiagnostics | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // New Application Modal State
  const [showAppModal, setShowAppModal] = useState(false);
  const [appName, setAppName] = useState('');
  const [appRepo, setAppRepo] = useState('');
  const [appBranch, setAppBranch] = useState('main');
  const [appRuntimeMode, setAppRuntimeMode] = useState<'nodejs' | 'static' | 'binary' | 'service'>('nodejs');
  const [appPortInput, setAppPortInput] = useState('');
  const [appServerId, setAppServerId] = useState('');
  const [confirmDeleteAppId, setConfirmDeleteAppId] = useState<string | null>(null);

  // New Schema Areia Preta Modal State
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbServerId, setDbServerId] = useState('');
  const [confirmDeleteDbId, setConfirmDeleteDbId] = useState<string | null>(null);

  // Inspect Areia Preta Env Vars Modal
  const [inspectEnvApp, setInspectEnvApp] = useState<ApplicationData | null>(null);
  const [revealEnvSecrets, setRevealEnvSecrets] = useState(false);

  // Terminal State
  const [terminalCmd, setTerminalCmd] = useState('xiqi-status');
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; out: string; time: string }>>([
    {
      cmd: 'xiqi-status',
      out: 'XIQI OS 1.0 x86_64 (/opt/xiqi)\nCarnauba Engine v4.0.0-engecema\nAreia Preta Engine v2.4.0 ativo em /opt/xiqi/app/areiapreta (porta 7420)',
      time: '04:30:00',
    },
  ]);
  const [terminalLoading, setTerminalLoading] = useState(false);

  // Selected deployment logs modal
  const [inspectDeployment, setInspectDeployment] = useState<DeploymentData | null>(null);

  // REST API Explorer output panel
  const [apiExplorerResponse, setApiExplorerResponse] = useState<string>('Clique em um endpoint ao lado para inspecionar a resposta em tempo real.');

  const clearSession = useCallback(() => {
    localStorage.removeItem('carnauba_auth_token');
    localStorage.removeItem('carnauba_auth_user');
    sessionStorage.removeItem('carnauba_auth_token');
    sessionStorage.removeItem('carnauba_auth_user');
    setCurrentUser(null);
    setAuthToken(null);
  }, []);

  const fetchData = useCallback(async () => {
    if (!authToken) return;
    try {
      const [srvRes, appRes, dbRes, depRes, portRes, diagRes] = await Promise.all([
        apiFetch('/api/v1/servers', {}, authToken),
        apiFetch('/api/v1/applications', {}, authToken),
        apiFetch('/api/v1/databases', {}, authToken),
        apiFetch('/api/v1/deployments', {}, authToken),
        apiFetch('/api/v1/ports', {}, authToken),
        apiFetch('/api/v1/areiapreta/status', {}, authToken),
      ]);

      if (srvRes.status === 401 || appRes.status === 401) {
        clearSession();
        return;
      }

      if (srvRes.ok) setServers(await srvRes.json());
      if (appRes.ok) setApplications(await appRes.json());
      if (dbRes.ok) setDatabases(await dbRes.json());
      if (depRes.ok) setDeployments(await depRes.json());
      if (portRes.ok) setPortMap(await portRes.json());
      if (diagRes.ok) setAreiaDiagnostics(await diagRes.json());
    } catch (err) {
      console.error('Falha ao atualizar dados do Carnauba:', err);
    }
  }, [authToken, clearSession]);

  const handleLogout = async () => {
    try {
      if (authToken) {
        await apiFetch('/api/v1/auth/logout', { method: 'POST' }, authToken);
      }
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err);
    } finally {
      clearSession();
    }
  };

  useEffect(() => {
    if (!currentUser || !authToken) return;
    void fetchData();
    const interval = setInterval(() => {
      void fetchData();
    }, 8000);
    return () => clearInterval(interval);
  }, [currentUser, authToken, fetchData]);

  const handleCopy = (text: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!appName.trim()) return;

    try {
      const res = await apiFetch(
        '/api/v1/applications',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: appName.trim(),
            git_repository: appRepo.trim(),
            git_branch: appBranch.trim() || 'main',
            runtime_mode: appRuntimeMode,
            destination_port: appPortInput.trim() ? Number(appPortInput.trim()) : undefined,
            server_id: appServerId || servers[0]?.id,
          }),
        },
        authToken
      );

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Erro ao publicar aplicação em /opt/xiqi/app/');
        return;
      }

      setShowAppModal(false);
      setAppName('');
      setAppRepo('');
      setAppPortInput('');
      await fetchData();
    } catch {
      setActionError('Falha de rede ao criar aplicação.');
    }
  };

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!dbName.trim()) return;

    try {
      const res = await apiFetch(
        '/api/v1/databases',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: dbName.trim(),
            server_id: dbServerId || servers[0]?.id,
          }),
        },
        authToken
      );

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Erro ao criar schema no Areia Preta.');
        return;
      }

      setShowDbModal(false);
      setDbName('');
      await fetchData();
    } catch {
      setActionError('Falha de rede ao provisionar schema Areia Preta.');
    }
  };

  const handleDeploy = async (applicationId: string) => {
    setActionError(null);
    try {
      const res = await apiFetch(
        '/api/v1/deploy',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: applicationId,
            commit_message: 'Deploy local acionado via painel Engecema',
          }),
        },
        authToken
      );

      if (res.ok) {
        const data = await res.json();
        setInspectDeployment(data.deployment);
        await fetchData();
      } else {
        const err = await res.json();
        setActionError(err.error || 'Falha ao iniciar deploy.');
      }
    } catch {
      setActionError('Falha ao acionar pipeline de deploy.');
    }
  };

  const handleRestartApp = async (id: string) => {
    await apiFetch(`/api/v1/applications/${id}/restart`, { method: 'POST' }, authToken);
    await fetchData();
  };

  const handleStopApp = async (id: string) => {
    await apiFetch(`/api/v1/applications/${id}/stop`, { method: 'POST' }, authToken);
    await fetchData();
  };

  const handleDeleteApp = async (id: string) => {
    if (confirmDeleteAppId !== id) {
      setConfirmDeleteAppId(id);
      return;
    }
    setConfirmDeleteAppId(null);
    await apiFetch(`/api/v1/applications/${id}`, { method: 'DELETE' }, authToken);
    await fetchData();
  };

  const handleDeleteDb = async (id: string) => {
    if (confirmDeleteDbId !== id) {
      setConfirmDeleteDbId(id);
      return;
    }
    setConfirmDeleteDbId(null);
    const res = await apiFetch(`/api/v1/databases/${id}`, { method: 'DELETE' }, authToken);
    if (!res.ok) {
      const err = await res.json();
      setActionError(err.error || 'Não foi possível remover o schema.');
    }
    await fetchData();
  };

  const runTerminalCommand = async (cmdToRun?: string) => {
    const cmd = cmdToRun || terminalCmd;
    if (!cmd.trim()) return;

    setTerminalLoading(true);
    try {
      const res = await apiFetch(
        '/api/v1/servers/srv-engecema-dc01/execute',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        },
        authToken
      );

      const data = await res.json();
      setTerminalHistory((prev) => [
        ...prev,
        {
          cmd,
          out: res.ok ? data.stdout || data.stderr : `BLOQUEADO: ${data.error || 'Comando rejeitado'}`,
          time: new Date().toLocaleTimeString(),
        },
      ]);
      if (!cmdToRun && res.ok) setTerminalCmd('');
    } catch {
      setTerminalHistory((prev) => [
        ...prev,
        { cmd, out: 'Erro de comunicação com o terminal XIQI OS.', time: new Date().toLocaleTimeString() },
      ]);
    } finally {
      setTerminalLoading(false);
    }
  };

  const filteredApps = applications.filter((a) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.local_directory.toLowerCase().includes(q) ||
      String(a.destination_port).includes(q) ||
      a.git_repository.toLowerCase().includes(q)
    );
  });

  const filteredDbs = databases.filter((d) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.db_name.toLowerCase().includes(q) ||
      d.data_path.toLowerCase().includes(q)
    );
  });

  const totalServices = servers.reduce((acc, s) => acc + s.active_services, 0);

  if (!currentUser) {
    return (
      <Login
        onLoginSuccess={(user, token) => {
          setCurrentUser(user);
          setAuthToken(token);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-[#EDEDED] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#120e1a] border-r border-white/5 flex flex-col shrink-0 select-none">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5 bg-[#120e1a]">
          <div className="w-8 h-8 rounded-lg bg-[#6b16ed] border border-[#8b45ff]/40 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm tracking-wide text-white flex items-center gap-2">
              Carnauba
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#6b16ed]/30 text-[#a391ff] border border-[#6b16ed]/40 font-mono">
                XIQI OS
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">Mini Data Center x86_64</div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Orquestração Local
          </div>
          <button
            onClick={() => setCurrentTab('overview')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'overview'
                ? 'bg-[#6b16ed] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity className="w-4 h-4" />
            Painel Geral
          </button>
          <button
            onClick={() => setCurrentTab('applications')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'applications'
                ? 'bg-[#6b16ed] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <Layers className="w-4 h-4" />
              Aplicações (/opt/xiqi/app)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono">
              {applications.length}
            </span>
          </button>
          <button
            onClick={() => setCurrentTab('databases')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'databases'
                ? 'bg-[#6b16ed] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <Database className="w-4 h-4" />
              Areia Preta DB
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono">
              {databases.length}
            </span>
          </button>
          <button
            onClick={() => setCurrentTab('servers')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'servers'
                ? 'bg-[#6b16ed] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <Network className="w-4 h-4" />
              Portas &amp; Nó XIQI
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono">
              {servers.length}
            </span>
          </button>

          <div className="pt-4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Operações &amp; Segurança
          </div>
          <button
            onClick={() => setCurrentTab('deployments')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'deployments'
                ? 'bg-[#6b16ed] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <RefreshCw className="w-4 h-4" />
              Fila de Deploy
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono">
              {deployments.length}
            </span>
          </button>
          <button
            onClick={() => setCurrentTab('terminal')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'terminal'
                ? 'bg-[#6b16ed] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Terminal XIQI OS
          </button>
          <button
            onClick={() => setCurrentTab('api')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'api'
                ? 'bg-[#6b16ed] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Explorador API REST
          </button>
        </nav>

        <div className="p-3 border-t border-white/5 bg-black/20 text-[11px] text-zinc-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Areia Preta</span>
            <span className="text-emerald-400 font-mono">
              :{areiaDiagnostics?.port || 7420}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Host SO</span>
            <span className="text-zinc-300 font-mono">XIQI OS x86_64</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Locks Atômicos</span>
            <span className="text-zinc-300 font-mono">
              {areiaDiagnostics?.disk_locks.total_atomic_writes ?? 0}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0e0e11] shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filtrar aplicações, portas e diretórios"
                className="bg-[#18181b] border border-white/10 rounded-md pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-[#6b16ed] w-64"
              />
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 font-mono">
                /opt/xiqi/app/
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {totalServices} serviços ativos • 4 GB RAM
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActionError(null);
                setShowDbModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#18181b] hover:bg-[#202025] text-zinc-200 border border-white/10 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-[#a391ff]" />
              Novo Schema Areia Preta
            </button>
            <button
              onClick={() => {
                setActionError(null);
                setShowAppModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#6b16ed] hover:bg-[#7317ff] text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Publicar Repositório
            </button>

            <div className="flex items-center gap-2 pl-3 ml-2 border-l border-white/10">
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#18181b] border border-white/10">
                <div className="w-6 h-6 rounded-full bg-[#6b16ed] flex items-center justify-center text-[10px] font-bold text-white uppercase">
                  {currentUser.name ? currentUser.name.charAt(0) : 'E'}
                </div>
                <div className="hidden lg:block text-left text-xs">
                  <div className="font-semibold text-white leading-tight truncate max-w-[120px]">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-zinc-400 uppercase">{currentUser.role}</div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                title="Encerrar sessão"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-red-500/10 border border-transparent transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {actionError && (
            <div className="max-w-7xl mx-auto p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {actionError}
              </span>
              <button onClick={() => setActionError(null)} className="text-red-300 hover:text-white">
                ✕
              </button>
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {currentTab === 'overview' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative">
                  <div className="text-xs font-medium text-zinc-400 mb-1">Host XIQI OS</div>
                  <div className="text-2xl font-bold text-white tracking-tight">
                    {servers[0]?.memory_usage.total || 4096} MB
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-2">
                    x86_64 • {servers[0]?.xiqi_root || '/opt/xiqi'}
                  </div>
                  <Server className="w-9 h-9 text-white/5 absolute right-3 bottom-3" />
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative">
                  <div className="text-xs font-medium text-zinc-400 mb-1">Apps em /opt/xiqi/app/</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{applications.length}</div>
                  <div className="text-[11px] text-purple-400 mt-2 font-mono">
                    Próxima porta livre: {portMap?.next_available_port || 3102}
                  </div>
                  <FolderGit2 className="w-9 h-9 text-white/5 absolute right-3 bottom-3" />
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative">
                  <div className="text-xs font-medium text-zinc-400 mb-1">Banco Areia Preta</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{databases.length}</div>
                  <div className="text-[11px] text-sky-400 mt-2 font-mono">
                    {areiaDiagnostics?.configured_path || '/opt/xiqi/app/areiapreta'}
                  </div>
                  <Database className="w-9 h-9 text-white/5 absolute right-3 bottom-3" />
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative">
                  <div className="text-xs font-medium text-zinc-400 mb-1">Locks &amp; Segurança</div>
                  <div className="text-2xl font-bold text-white tracking-tight">
                    {areiaDiagnostics?.disk_locks.total_atomic_writes ?? 0}
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-2">
                    CSRF + Rate Limit + Disk Mutex
                  </div>
                  <ShieldCheck className="w-9 h-9 text-white/5 absolute right-3 bottom-3" />
                </div>
              </div>

              {/* Hardware Node */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#a391ff]" /> Mini Data Center (XIQI OS)
                  </h2>
                  <button
                    onClick={() => setCurrentTab('servers')}
                    className="text-xs text-[#a391ff] hover:underline"
                  >
                    Mapa de Portas &amp; Nós →
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {servers.map((s) => (
                    <div key={s.id} className="bg-[#121212] border border-white/10 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-sm text-white">{s.name}</div>
                          <div className="text-xs text-zinc-400 font-mono">
                            {s.os_name} • {s.ip}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {s.status}
                        </span>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-zinc-300">
                        <div>
                          <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU ({s.architecture})</span>
                            <span>{s.cpu_usage}%</span>
                          </div>
                          <div className="w-full bg-[#1e1e24] h-1.5 rounded-full overflow-hidden">
                            <div className="bg-[#6b16ed] h-full rounded-full" style={{ width: `${s.cpu_usage}%` }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Memória RAM</span>
                            <span>{s.memory_usage.used} MB / {s.memory_usage.total} MB</span>
                          </div>
                          <div className="w-full bg-[#1e1e24] h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-500 h-full rounded-full"
                              style={{ width: `${(s.memory_usage.used / s.memory_usage.total) * 100}%` }}
                            ></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> Disco ({s.xiqi_root})</span>
                            <span>{s.disk_usage.used} GB / {s.disk_usage.total} GB</span>
                          </div>
                          <div className="w-full bg-[#1e1e24] h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full"
                              style={{ width: `${(s.disk_usage.used / s.disk_usage.total) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Areia Preta Live Engine Card */}
                  <div className="bg-[#121212] border border-white/10 rounded-lg p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-sm text-white">Banco de Dados Areia Preta</div>
                          <div className="text-xs text-zinc-400 font-mono">
                            {areiaDiagnostics?.configured_path || '/opt/xiqi/app/areiapreta'}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          conectado
                        </span>
                      </div>
                      <div className="bg-[#18181b] rounded p-3 space-y-1.5 text-xs font-mono border border-white/5">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Porta Local:</span>
                          <span className="text-white">127.0.0.1:{areiaDiagnostics?.port || 7420}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Modo de Armazenamento:</span>
                          <span className="text-[#a391ff]">{areiaDiagnostics?.storage_mode || 'xiqi-native'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Locks Adquiridos:</span>
                          <span className="text-zinc-200">{areiaDiagnostics?.disk_locks.total_lock_acquisitions ?? 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Escritas Atômicas:</span>
                          <span className="text-emerald-400">{areiaDiagnostics?.disk_locks.total_atomic_writes ?? 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-zinc-400">
                      <span>Persistência de projetos, logs e usuários</span>
                      <button
                        onClick={() => setCurrentTab('databases')}
                        className="text-[#a391ff] hover:underline"
                      >
                        Ver Schemas →
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Workloads */}
              <div className="bg-[#121212] border border-white/10 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Aplicações Publicadas em /opt/xiqi/app/</h3>
                    <p className="text-xs text-zinc-400">
                      Portas sequenciais alocadas sem conflito com serviços locais
                    </p>
                  </div>
                  <button
                    onClick={() => setCurrentTab('applications')}
                    className="text-xs text-[#a391ff] hover:underline"
                  >
                    Gerenciar Aplicações →
                  </button>
                </div>

                <div className="divide-y divide-white/5">
                  {filteredApps.map((app) => (
                    <div key={app.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded bg-[#1e1e24] border border-white/10 flex items-center justify-center shrink-0 text-[#a391ff]">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-white">{app.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#6b16ed]/20 text-[#a391ff] border border-[#6b16ed]/30">
                              :{app.destination_port}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {app.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap font-mono">
                            <span className="flex items-center gap-1 text-zinc-300">
                              <Globe className="w-3 h-3 text-zinc-500" />
                              {app.local_directory}
                            </span>
                            <span>•</span>
                            <span>{app.git_branch}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => setInspectEnvApp(app)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#18181b] hover:bg-[#222228] text-zinc-200 border border-white/10 text-xs"
                        >
                          <KeyRound className="w-3 h-3 text-[#a391ff]" />
                          Env Areia Preta
                        </button>
                        <button
                          onClick={() => handleDeploy(app.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white text-xs font-medium"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Deploy
                        </button>
                        <button
                          onClick={() => handleRestartApp(app.id)}
                          title="Reiniciar serviço"
                          className="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-white"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: APPLICATIONS */}
          {currentTab === 'applications' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">
                    Aplicações Engecema em /opt/xiqi/app/
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Publicação local de repositórios GitHub com portas sequenciais e variáveis Areia Preta
                  </p>
                </div>
                <button
                  onClick={() => setShowAppModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#6b16ed] hover:bg-[#7317ff] text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Publicar Repositório
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredApps.map((app) => (
                  <div key={app.id} className="bg-[#121212] border border-white/10 rounded-lg p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-white text-base">{app.name}</h3>
                          <div className="text-xs text-zinc-400 font-mono mt-0.5">{app.fqdn}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            app.status === 'running'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : app.status === 'building'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {app.status}
                        </span>
                      </div>

                      <div className="bg-[#18181b] rounded p-3 space-y-1.5 text-xs text-zinc-300 font-mono border border-white/5 my-3">
                        <div className="flex justify-between gap-2">
                          <span className="text-zinc-500">Diretório:</span>
                          <span className="text-[#a391ff] truncate">{app.local_directory}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Porta Local:</span>
                          <span className="text-emerald-400">127.0.0.1:{app.destination_port}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-zinc-500">Repositório:</span>
                          <span className="truncate max-w-[170px]" title={app.git_repository}>
                            {app.git_repository.replace('https://github.com/', '')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Branch:</span>
                          <span>{app.git_branch}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Schema Areia Preta:</span>
                          <span className="truncate max-w-[150px]">{app.areia_preta_env.AREIA_PRETA_SCHEMA}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDeploy(app.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white text-xs font-medium"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Deploy
                        </button>
                        <button
                          onClick={() => setInspectEnvApp(app)}
                          title="Ver variáveis do Areia Preta"
                          className="p-1.5 rounded hover:bg-white/10 text-[#a391ff]"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRestartApp(app.id)}
                          title="Reiniciar aplicação"
                          className="p-1.5 rounded hover:bg-white/10 text-zinc-300"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStopApp(app.id)}
                          title="Parar aplicação"
                          className="p-1.5 rounded hover:bg-white/10 text-zinc-300"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteApp(app.id)}
                        title={confirmDeleteAppId === app.id ? 'Clique novamente para confirmar exclusão' : 'Excluir aplicação'}
                        className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                          confirmDeleteAppId === app.id
                            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {confirmDeleteAppId === app.id && <span>Confirmar</span>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: DATABASES (AREIA PRETA) */}
          {currentTab === 'databases' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">
                    Banco de Dados Areia Preta (/opt/xiqi/app/areiapreta)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Persistência local com locks de escrita em disco e schemas dedicados por projeto Engecema
                  </p>
                </div>
                <button
                  onClick={() => setShowDbModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#6b16ed] hover:bg-[#7317ff] text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Schema Areia Preta
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDbs.map((dbItem) => {
                  const connString = `areiapreta://${dbItem.db_user}@127.0.0.1:${dbItem.port}/${dbItem.db_name}?path=${dbItem.data_path}`;
                  return (
                    <div key={dbItem.id} className="bg-[#121212] border border-white/10 rounded-lg p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-[#1e1e24] border border-white/10 flex items-center justify-center text-[#a391ff]">
                              <Database className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-white text-sm">{dbItem.name}</h3>
                              <div className="text-[11px] text-zinc-400 uppercase font-mono">
                                AREIA PRETA • {dbItem.version}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {dbItem.status}
                          </span>
                        </div>

                        <div className="bg-[#18181b] rounded p-3 space-y-1.5 text-xs text-zinc-300 font-mono border border-white/5 my-3">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Porta Local:</span>
                            <span>{dbItem.port}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Schema:</span>
                            <span className="truncate max-w-[160px]">{dbItem.db_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Usuário:</span>
                            <span>{dbItem.db_user}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-zinc-500">Caminho:</span>
                            <span className="truncate max-w-[160px]" title={dbItem.data_path}>{dbItem.data_path}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Tamanho:</span>
                            <span>{dbItem.size_mb} MB</span>
                          </div>
                        </div>

                        <div className="bg-black/40 rounded p-2 border border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                          <span className="truncate mr-2">{connString}</span>
                          <button
                            onClick={() => handleCopy(connString)}
                            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/10"
                            title="Copiar URI do Areia Preta"
                          >
                            {copiedText === connString ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 flex items-center justify-between mt-3">
                        <span className="text-[11px] text-zinc-500">{dbItem.backup_frequency}</span>
                        {dbItem.id !== 'db-areiapreta-core' && (
                          <button
                            onClick={() => handleDeleteDb(dbItem.id)}
                            className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                              confirmDeleteDbId === dbItem.id
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
                            }`}
                            title="Excluir schema"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {confirmDeleteDbId === dbItem.id && <span>Confirmar</span>}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: SERVERS & PORTS */}
          {currentTab === 'servers' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight">
                  Nó XIQI OS &amp; Gestão Local de Portas
                </h2>
                <p className="text-xs text-zinc-400">
                  Alocação sequencial automática a partir da porta {portMap?.base_app_port || 3100} sem colisão com serviços existentes
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Port Allocation Table */}
                <div className="bg-[#121212] border border-white/10 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Mapa de Portas Locais (127.0.0.1)</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#6b16ed]/20 text-[#a391ff] border border-[#6b16ed]/30">
                      Próxima livre: {portMap?.next_available_port || 3102}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Portas Reservadas do Sistema
                    </div>
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      {portMap?.reserved_ports.map((rp) => (
                        <div key={rp.port} className="bg-[#18181b] border border-white/5 rounded px-3 py-2 flex items-center justify-between">
                          <span className="text-amber-400 font-semibold">:{rp.port}</span>
                          <span className="text-zinc-400 truncate ml-2 text-[11px]">{rp.service}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 text-xs pt-2 border-t border-white/5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Portas Atribuídas em /opt/xiqi/app/
                    </div>
                    <div className="space-y-1.5 font-mono">
                      {portMap?.allocated_applications.map((ap) => (
                        <div key={ap.id} className="bg-[#18181b] border border-white/5 rounded px-3 py-2 flex items-center justify-between">
                          <div>
                            <span className="text-emerald-400 font-semibold">:{ap.port}</span>
                            <span className="text-white ml-2">{ap.name}</span>
                          </div>
                          <span className="text-zinc-400 text-[11px]">{ap.directory}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Security Events */}
                <div className="bg-[#121212] border border-white/10 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Auditoria de Segurança &amp; Locks</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      CSRF + Rate Limit Ativos
                    </span>
                  </div>
                  <div className="bg-[#050508] border border-white/10 rounded p-3 h-72 overflow-y-auto font-mono text-[11px] space-y-2">
                    {areiaDiagnostics?.recent_security_events && areiaDiagnostics.recent_security_events.length > 0 ? (
                      areiaDiagnostics.recent_security_events.map((ev) => (
                        <div key={ev.id} className="border-b border-white/5 pb-2">
                          <div className="flex items-center justify-between text-amber-400">
                            <span>{ev.type}</span>
                            <span className="text-zinc-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-zinc-300 mt-0.5">{ev.detail}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-zinc-400">
                        Nenhuma violação detectada. Proteções CSRF, Rate Limit, validação de caminhos em /opt/xiqi/app/ e locks atômicos operando normalmente.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: DEPLOYMENTS */}
          {currentTab === 'deployments' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight">Fila e Histórico de Deploys</h2>
                <p className="text-xs text-zinc-400">Registros persistidos no banco local Areia Preta</p>
              </div>

              <div className="bg-[#121212] border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#18181b] text-zinc-400 border-b border-white/5 font-medium uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Aplicação</th>
                      <th className="py-3 px-4">Diretório &amp; Porta</th>
                      <th className="py-3 px-4">Commit / Branch</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Duração</th>
                      <th className="py-3 px-4 text-right">Logs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {deployments.map((d) => (
                      <tr key={d.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-semibold text-white">{d.application_name}</td>
                        <td className="py-3 px-4 font-mono text-zinc-300">
                          {d.target_directory} <span className="text-emerald-400">:{d.assigned_port}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-300">
                          <span className="text-[#a391ff]">{d.commit}</span> ({d.branch})
                          <div className="text-[11px] text-zinc-500 truncate max-w-xs">{d.commit_message}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              d.status === 'finished'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : d.status === 'in_progress'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">{d.duration_seconds}s</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setInspectDeployment(d)}
                            className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-white/10 text-zinc-200 border border-white/10 text-xs"
                          >
                            Ver Logs
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: TERMINAL */}
          {currentTab === 'terminal' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">
                    Terminal de Diagnóstico XIQI OS
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Shell protegido com lista de permissões e bloqueio anti-injeção
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {['xiqi-status', 'areiapreta status', 'ss -tulpn', 'ls /opt/xiqi/app', 'free -m', 'df -h'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => runTerminalCommand(preset)}
                      className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-[#202025] text-zinc-300 border border-white/10 text-xs font-mono"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#050508] border border-white/10 rounded-lg p-4 font-mono text-xs flex flex-col h-[480px]">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {terminalHistory.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <span className="text-emerald-400 font-bold">xiqi@engecema-dc01:~$</span>
                        <span className="text-white font-semibold">{item.cmd}</span>
                        <span className="text-[10px] text-zinc-600 ml-auto">{item.time}</span>
                      </div>
                      <pre className="text-zinc-300 whitespace-pre-wrap pl-4 border-l border-white/10 py-1 font-mono text-[11px] leading-relaxed">
                        {item.out}
                      </pre>
                    </div>
                  ))}
                  {terminalLoading && (
                    <div className="text-zinc-500">Executando diagnóstico no XIQI OS...</div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runTerminalCommand();
                  }}
                  className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2"
                >
                  <span className="text-emerald-400 font-bold shrink-0">xiqi@engecema-dc01:~$</span>
                  <input
                    type="text"
                    value={terminalCmd}
                    onChange={(e) => setTerminalCmd(e.target.value)}
                    aria-label="Comando de diagnóstico XIQI OS"
                    className="flex-1 bg-transparent text-white focus:outline-none font-mono text-xs"
                  />
                  <button
                    type="submit"
                    disabled={terminalLoading}
                    className="px-3 py-1 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white text-xs font-sans font-medium"
                  >
                    Executar
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB: API EXPLORER */}
          {currentTab === 'api' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight">Explorador da API REST Carnauba</h2>
                <p className="text-xs text-zinc-400">
                  Inspecione os endpoints locais protegidos por sessão e token CSRF
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 space-y-2">
                  {[
                    { method: 'GET', path: '/api/v1/version', desc: 'Versão do motor Carnauba e perfil XIQI OS' },
                    { method: 'GET', path: '/api/v1/areiapreta/status', desc: 'Diagnóstico do banco Areia Preta e locks em disco' },
                    { method: 'GET', path: '/api/v1/ports', desc: 'Mapa de portas reservadas e próximas portas disponíveis' },
                    { method: 'GET', path: '/api/v1/applications', desc: 'Aplicações publicadas em /opt/xiqi/app/' },
                    { method: 'GET', path: '/api/v1/databases', desc: 'Schemas ativos no Areia Preta' },
                    { method: 'GET', path: '/api/v1/deployments', desc: 'Histórico de deploys locais' },
                  ].map((ep) => (
                    <button
                      key={ep.path}
                      type="button"
                      onClick={async () => {
                        const res = await apiFetch(ep.path, {}, authToken);
                        const data = await res.json();
                        setApiExplorerResponse(JSON.stringify(data, null, 2));
                      }}
                      className="w-full text-left bg-[#18181b] hover:bg-[#202025] p-3 rounded border border-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400">
                          {ep.method}
                        </span>
                        <span className="font-mono text-xs text-white">{ep.path}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400">{ep.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 flex flex-col">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Resposta JSON do Servidor
                  </h3>
                  <pre className="bg-[#050508] p-4 rounded border border-white/10 font-mono text-[11px] text-emerald-400 flex-1 overflow-auto max-h-96 whitespace-pre-wrap">
                    {apiExplorerResponse}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Exclusive Footer */}
        <footer className="h-9 border-t border-white/5 bg-[#0e0e11] px-6 flex items-center justify-center text-xs text-zinc-500 shrink-0">
          Corporação Engecema
        </footer>
      </div>

      {/* MODAL: NEW APPLICATION */}
      {showAppModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-semibold text-white text-base">Publicar Repositório em /opt/xiqi/app/</h3>
              <button onClick={() => setShowAppModal(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateApplication} className="space-y-3 text-xs">
              <div>
                <label htmlFor="new-app-name" className="block text-zinc-400 mb-1">
                  Nome da Aplicação (subpasta em /opt/xiqi/app/)
                </label>
                <input
                  id="new-app-name"
                  type="text"
                  required
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-[#6b16ed]"
                />
              </div>

              <div>
                <label htmlFor="new-app-repo" className="block text-zinc-400 mb-1">
                  URL do Repositório GitHub (Engecema)
                </label>
                <input
                  id="new-app-repo"
                  type="url"
                  required
                  value={appRepo}
                  onChange={(e) => setAppRepo(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-[#6b16ed]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-app-branch" className="block text-zinc-400 mb-1">Branch</label>
                  <input
                    id="new-app-branch"
                    type="text"
                    required
                    value={appBranch}
                    onChange={(e) => setAppBranch(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>
                <div>
                  <label htmlFor="new-app-port" className="block text-zinc-400 mb-1">
                    Porta (vazio = auto {portMap?.next_available_port || 3102})
                  </label>
                  <input
                    id="new-app-port"
                    type="number"
                    min={1024}
                    max={65535}
                    value={appPortInput}
                    onChange={(e) => setAppPortInput(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="new-app-mode" className="block text-zinc-400 mb-1">Modo de Execução XIQI OS</label>
                <select
                  id="new-app-mode"
                  value={appRuntimeMode}
                  onChange={(e) => setAppRuntimeMode(e.target.value as 'nodejs' | 'static' | 'binary' | 'service')}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                >
                  <option value="nodejs">Node.js 22 Nativo (XIQI Supervisor)</option>
                  <option value="static">Estático / SPA</option>
                  <option value="binary">Binário x86_64</option>
                  <option value="service">Serviço em Background</option>
                </select>
              </div>

              <div>
                <label htmlFor="new-app-server" className="block text-zinc-400 mb-1">Nó de Destino</label>
                <select
                  id="new-app-server"
                  value={appServerId}
                  onChange={(e) => setAppServerId(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.ip})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAppModal(false)}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white font-medium"
                >
                  Publicar e Gerar Areia Preta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW AREIA PRETA SCHEMA */}
      {showDbModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-semibold text-white text-base">Provisionar Schema no Areia Preta</h3>
              <button onClick={() => setShowDbModal(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateDatabase} className="space-y-3 text-xs">
              <div>
                <label htmlFor="new-db-name" className="block text-zinc-400 mb-1">Nome do Schema</label>
                <input
                  id="new-db-name"
                  type="text"
                  required
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-[#6b16ed]"
                />
              </div>

              <div>
                <label htmlFor="new-db-server" className="block text-zinc-400 mb-1">Instância Host XIQI OS</label>
                <select
                  id="new-db-server"
                  value={dbServerId}
                  onChange={(e) => setDbServerId(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — /opt/xiqi/app/areiapreta
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowDbModal(false)}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white font-medium"
                >
                  Criar Schema
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INSPECT AREIA PRETA ENV VARS */}
      {inspectEnvApp && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6 w-full max-w-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base">
                  Variáveis Areia Preta: {inspectEnvApp.name}
                </h3>
                <div className="text-xs text-zinc-400 font-mono mt-0.5">
                  Arquivo: {inspectEnvApp.local_directory}/.env.areiapreta
                </div>
              </div>
              <button onClick={() => setInspectEnvApp(null)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <pre className="bg-[#050508] border border-white/10 rounded p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed">
{`PORT=${inspectEnvApp.destination_port}
HOST=127.0.0.1
XIQI_APP_DIR=${inspectEnvApp.local_directory}
AREIA_PRETA_HOME=${inspectEnvApp.areia_preta_env.AREIA_PRETA_HOME}
AREIA_PRETA_HOST=${inspectEnvApp.areia_preta_env.AREIA_PRETA_HOST}
AREIA_PRETA_PORT=${inspectEnvApp.areia_preta_env.AREIA_PRETA_PORT}
AREIA_PRETA_SCHEMA=${inspectEnvApp.areia_preta_env.AREIA_PRETA_SCHEMA}
AREIA_PRETA_USER=${inspectEnvApp.areia_preta_env.AREIA_PRETA_USER}
AREIA_PRETA_PASSWORD=${revealEnvSecrets ? inspectEnvApp.areia_preta_env.AREIA_PRETA_PASSWORD : '********'}
AREIA_PRETA_URL=${revealEnvSecrets ? inspectEnvApp.areia_preta_env.AREIA_PRETA_URL : `areiapreta://${inspectEnvApp.areia_preta_env.AREIA_PRETA_USER}:********@${inspectEnvApp.areia_preta_env.AREIA_PRETA_HOST}:${inspectEnvApp.areia_preta_env.AREIA_PRETA_PORT}/${inspectEnvApp.areia_preta_env.AREIA_PRETA_SCHEMA}`}`}
            </pre>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setRevealEnvSecrets((v) => !v)}
                className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-xs flex items-center gap-1.5"
              >
                {revealEnvSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{revealEnvSecrets ? 'Ocultar Segredos' : 'Revelar Segredos'}</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(inspectEnvApp.areia_preta_env.AREIA_PRETA_URL)}
                  className="px-3 py-1.5 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white text-xs font-medium flex items-center gap-1.5"
                >
                  {copiedText === inspectEnvApp.areia_preta_env.AREIA_PRETA_URL ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copiar AREIA_PRETA_URL</span>
                </button>
                <button
                  onClick={() => {
                    setRevealEnvSecrets(false);
                    setInspectEnvApp(null);
                  }}
                  className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INSPECT DEPLOYMENT */}
      {inspectDeployment && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6 w-full max-w-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base">
                  Logs de Deploy: {inspectDeployment.application_name}
                </h3>
                <div className="text-xs text-zinc-400 font-mono mt-0.5">
                  {inspectDeployment.target_directory} • Porta :{inspectDeployment.assigned_port}
                </div>
              </div>
              <button onClick={() => setInspectDeployment(null)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="bg-[#050508] border border-white/10 rounded p-4 font-mono text-[11px] h-72 overflow-y-auto space-y-1 text-zinc-300 leading-relaxed">
              {inspectDeployment.logs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-zinc-600 select-none">[{index + 1}]</span>
                  <span className={log.includes('sucesso') || log.includes('200 OK') ? 'text-emerald-400 font-semibold' : ''}>
                    {log}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-white/10">
              <span>
                Status: <span className="font-semibold text-emerald-400 uppercase">{inspectDeployment.status}</span>
              </span>
              <button
                onClick={() => setInspectDeployment(null)}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
