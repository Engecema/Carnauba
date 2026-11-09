import React, { useState, useEffect } from 'react';
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
  ExternalLink,
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
  User,
  Lock
} from 'lucide-react';
import { Login } from './components/Login';

interface ServerData {
  id: string;
  name: string;
  ip: string;
  user: string;
  port: number;
  provider: string;
  region: string;
  status: 'online' | 'unreachable' | 'provisioning';
  docker_version: string;
  proxy_type: string;
  proxy_status: 'running' | 'stopped';
  cpu_usage: number;
  memory_usage: { used: number; total: number };
  disk_usage: { used: number; total: number };
  active_containers: number;
}

interface ApplicationData {
  id: string;
  name: string;
  fqdn: string;
  git_repository: string;
  git_branch: string;
  build_pack: 'nixpacks' | 'dockerfile' | 'dockercompose' | 'static';
  status: 'running' | 'stopped' | 'building' | 'failed';
  server_id: string;
  server_name: string;
  environment: string;
  project: string;
  destination_port: number;
  created_at: string;
  updated_at: string;
}

interface DatabaseData {
  id: string;
  name: string;
  type: 'postgresql' | 'redis' | 'mysql' | 'mongodb' | 'clickhouse';
  version: string;
  status: 'running' | 'stopped' | 'degraded';
  server_id: string;
  server_name: string;
  port: number;
  db_name: string;
  db_user: string;
  backup_enabled: boolean;
  backup_frequency: string;
  size_mb: number;
}

interface ServiceData {
  id: string;
  name: string;
  template: string;
  status: 'running' | 'stopped';
  containers_count: number;
  server_id: string;
  url: string;
}

interface DeploymentData {
  id: string;
  application_id: string;
  application_name: string;
  commit: string;
  commit_message: string;
  branch: string;
  status: 'in_progress' | 'finished' | 'failed' | 'cancelled';
  logs: string[];
  created_at: string;
  duration_seconds: number;
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

  const [currentTab, setCurrentTab] = useState<'overview' | 'applications' | 'databases' | 'servers' | 'deployments' | 'terminal' | 'api'>('overview');
  const [servers, setServers] = useState<ServerData[]>([]);
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [databases, setDatabases] = useState<DatabaseData[]>([]);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [deployments, setDeployments] = useState<DeploymentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // New Application Modal State
  const [showAppModal, setShowAppModal] = useState(false);
  const [appName, setAppName] = useState('');
  const [appRepo, setAppRepo] = useState('');
  const [appBranch, setAppBranch] = useState('main');
  const [appBuildpack, setAppBuildpack] = useState<'nixpacks' | 'dockerfile' | 'dockercompose' | 'static'>('nixpacks');
  const [appPort, setAppPort] = useState(3000);
  const [appServerId, setAppServerId] = useState('');

  // New Database Modal State
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbType, setDbType] = useState<'postgresql' | 'redis' | 'mysql' | 'mongodb' | 'clickhouse'>('postgresql');
  const [dbServerId, setDbServerId] = useState('');

  // Terminal State
  const [terminalCmd, setTerminalCmd] = useState('docker ps');
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; out: string; time: string }>>([
    {
      cmd: 'carnauba status',
      out: 'Carnauba Engine v4.0.0-beta.392\nDocker: v27.1.1 (healthy)\nProxy: Traefik v3.1 running on 0.0.0.0:80,443',
      time: '04:55:00',
    },
  ]);
  const [terminalLoading, setTerminalLoading] = useState(false);

  // Selected deployment logs modal
  const [inspectDeployment, setInspectDeployment] = useState<DeploymentData | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [srvRes, appRes, dbRes, svcRes, depRes] = await Promise.all([
        fetch('/api/v1/servers'),
        fetch('/api/v1/applications'),
        fetch('/api/v1/databases'),
        fetch('/api/v1/services'),
        fetch('/api/v1/deployments'),
      ]);

      if (srvRes.ok) setServers(await srvRes.json());
      if (appRes.ok) setApplications(await appRes.json());
      if (dbRes.ok) setDatabases(await dbRes.json());
      if (svcRes.ok) setServices(await svcRes.json());
      if (depRes.ok) setDeployments(await depRes.json());
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('carnauba_auth_token');
      localStorage.removeItem('carnauba_auth_user');
      sessionStorage.removeItem('carnauba_auth_token');
      sessionStorage.removeItem('carnauba_auth_user');
      setCurrentUser(null);
      setAuthToken(null);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName) return;

    try {
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: appName,
          git_repository: appRepo || 'https://github.com/Engecema/sample-app.git',
          git_branch: appBranch || 'main',
          build_pack: appBuildpack,
          destination_port: appPort,
          server_id: appServerId || servers[0]?.id,
        }),
      });

      if (res.ok) {
        setShowAppModal(false);
        setAppName('');
        setAppRepo('');
        fetchData();
      }
    } catch (err) {
      console.error('Error creating app:', err);
    }
  };

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbName) return;

    try {
      const res = await fetch('/api/v1/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dbName,
          type: dbType,
          server_id: dbServerId || servers[0]?.id,
        }),
      });

      if (res.ok) {
        setShowDbModal(false);
        setDbName('');
        fetchData();
      }
    } catch (err) {
      console.error('Error creating database:', err);
    }
  };

  const handleDeploy = async (applicationId: string) => {
    try {
      const res = await fetch('/api/v1/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          commit_message: 'Dashboard instant deploy trigger',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setInspectDeployment(data.deployment);
        fetchData();
      }
    } catch (err) {
      console.error('Error triggering deploy:', err);
    }
  };

  const handleRestartApp = async (id: string) => {
    await fetch(`/api/v1/applications/${id}/restart`, { method: 'POST' });
    fetchData();
  };

  const handleStopApp = async (id: string) => {
    await fetch(`/api/v1/applications/${id}/stop`, { method: 'POST' });
    fetchData();
  };

  const handleDeleteApp = async (id: string) => {
    if (confirm('Delete this application from your server?')) {
      await fetch(`/api/v1/applications/${id}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const handleDeleteDb = async (id: string) => {
    if (confirm('Delete this database instance and clean up container?')) {
      await fetch(`/api/v1/databases/${id}`, { method: 'DELETE' });
      fetchData();
    }
  };

  const runTerminalCommand = async (cmdToRun?: string) => {
    const cmd = cmdToRun || terminalCmd;
    if (!cmd.trim()) return;

    setTerminalLoading(true);
    try {
      const res = await fetch('/api/v1/servers/srv-localhost/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ command: cmd }),
      });

      if (res.ok) {
        const data = await res.json();
        setTerminalHistory((prev) => [
          ...prev,
          {
            cmd: data.command,
            out: data.stdout || data.stderr,
            time: new Date().toLocaleTimeString(),
          },
        ]);
        if (!cmdToRun) setTerminalCmd('');
      }
    } catch (err) {
      console.error('Command failed:', err);
    } finally {
      setTerminalLoading(false);
    }
  };

  const totalContainers = servers.reduce((acc, s) => acc + s.active_containers, 0);

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
      {/* Carnauba Sidebar */}
      <aside className="w-64 bg-[#120e1a] border-r border-white/5 flex flex-col shrink-0 select-none">
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5 bg-[#120e1a]/80">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#6b16ed] to-[#8b45ff] flex items-center justify-center shadow-[0_2px_8px_rgba(107,22,237,0.5)]">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <div className="font-semibold text-sm tracking-wide text-white flex items-center gap-2">
              Carnauba <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#6b16ed]/30 text-[#a391ff] border border-[#6b16ed]/40">v4 PaaS</span>
            </div>
            <div className="text-[11px] text-zinc-400">Carnauba Control Engine</div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Infrastructure
          </div>
          <button
            onClick={() => setCurrentTab('overview')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              currentTab === 'overview'
                ? 'bg-[#6b16ed] text-white shadow-[0_2px_0_0_#4a0fa3]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setCurrentTab('applications')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
              currentTab === 'applications'
                ? 'bg-[#6b16ed] text-white shadow-[0_2px_0_0_#4a0fa3]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <Layers className="w-4 h-4" />
              Applications
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono">
              {applications.length}
            </span>
          </button>
          <button
            onClick={() => setCurrentTab('databases')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
              currentTab === 'databases'
                ? 'bg-[#6b16ed] text-white shadow-[0_2px_0_0_#4a0fa3]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <Database className="w-4 h-4" />
              Databases
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono">
              {databases.length}
            </span>
          </button>
          <button
            onClick={() => setCurrentTab('servers')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
              currentTab === 'servers'
                ? 'bg-[#6b16ed] text-white shadow-[0_2px_0_0_#4a0fa3]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <Server className="w-4 h-4" />
              Servers
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono">
              {servers.length}
            </span>
          </button>

          <div className="pt-4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Operations
          </div>
          <button
            onClick={() => setCurrentTab('deployments')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
              currentTab === 'deployments'
                ? 'bg-[#6b16ed] text-white shadow-[0_2px_0_0_#4a0fa3]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-3">
              <RefreshCw className="w-4 h-4" />
              Deploy Queue
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono">
              {deployments.length}
            </span>
          </button>
          <button
            onClick={() => setCurrentTab('terminal')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              currentTab === 'terminal'
                ? 'bg-[#6b16ed] text-white shadow-[0_2px_0_0_#4a0fa3]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Live Terminal
          </button>
          <button
            onClick={() => setCurrentTab('api')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              currentTab === 'api'
                ? 'bg-[#6b16ed] text-white shadow-[0_2px_0_0_#4a0fa3]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Code2 className="w-4 h-4" />
            REST API Explorer
          </button>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-white/5 bg-black/20 text-[11px] text-zinc-400">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Docker Daemon
            </span>
            <span className="text-zinc-300 font-mono">v27.1</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Traefik Proxy</span>
            <span className="text-emerald-400">Active</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
        {/* Top Navbar */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0e0e11] shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filtrar recursos, contêineres e endereços IP"
                className="bg-[#18181b] border border-white/10 rounded-md pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-[#6b16ed] w-64"
              />
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Team: Personal</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {totalContainers} containers running
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDbModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#18181b] hover:bg-[#202025] text-zinc-200 border border-white/10 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-[#a391ff]" />
              New Database
            </button>
            <button
              onClick={() => setShowAppModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#6b16ed] hover:bg-[#7317ff] text-white shadow-[0_2px_0_0_#4a0fa3] transition-transform active:translate-y-0.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Application
            </button>

            {/* User Profile & Logout */}
            <div className="flex items-center gap-2 pl-3 ml-2 border-l border-white/10">
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#18181b] border border-white/10">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#6b16ed] to-[#8b45ff] flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-sm">
                  {currentUser.name ? currentUser.name.charAt(0) : 'A'}
                </div>
                <div className="hidden lg:block text-left text-xs">
                  <div className="font-semibold text-white leading-tight truncate max-w-[120px]">{currentUser.name}</div>
                  <div className="text-[10px] text-zinc-400 capitalize">{currentUser.role === 'root' ? 'Root Admin' : 'Admin'}</div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                title="Sign out of Carnauba"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent transition-all"
              >
                <LogOut className="w-3.5 h-3.5 text-zinc-400 group-hover:text-red-400" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* Tab View Container */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB: OVERVIEW */}
          {currentTab === 'overview' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative overflow-hidden">
                  <div className="text-xs font-medium text-zinc-400 mb-1">Managed Servers</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{servers.length}</div>
                  <div className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> All servers healthy
                  </div>
                  <Server className="w-10 h-10 text-white/5 absolute right-3 bottom-3" />
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative overflow-hidden">
                  <div className="text-xs font-medium text-zinc-400 mb-1">Active Applications</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{applications.length}</div>
                  <div className="text-[11px] text-purple-400 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Nixpacks & Dockerfile
                  </div>
                  <Layers className="w-10 h-10 text-white/5 absolute right-3 bottom-3" />
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative overflow-hidden">
                  <div className="text-xs font-medium text-zinc-400 mb-1">Managed Databases</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{databases.length}</div>
                  <div className="text-[11px] text-sky-400 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span> Automated Backups Active
                  </div>
                  <Database className="w-10 h-10 text-white/5 absolute right-3 bottom-3" />
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 relative overflow-hidden">
                  <div className="text-xs font-medium text-zinc-400 mb-1">1-Click Services</div>
                  <div className="text-2xl font-bold text-white tracking-tight">{services.length}</div>
                  <div className="text-[11px] text-amber-400 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Plausible, MinIO, Vaultwarden
                  </div>
                  <Activity className="w-10 h-10 text-white/5 absolute right-3 bottom-3" />
                </div>
              </div>

              {/* Server Nodes Grid */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#a391ff]" /> Infrastructure Nodes
                  </h2>
                  <button
                    onClick={() => setCurrentTab('servers')}
                    className="text-xs text-[#a391ff] hover:underline"
                  >
                    View All Servers →
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {servers.map((s) => (
                    <div key={s.id} className="bg-[#121212] border border-white/10 rounded-lg p-4 hover:border-white/20 transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-sm text-white">{s.name}</div>
                          <div className="text-xs text-zinc-400 font-mono">{s.ip}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {s.status}
                        </span>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-zinc-300">
                        <div>
                          <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU Load</span>
                            <span>{s.cpu_usage}%</span>
                          </div>
                          <div className="w-full bg-[#1e1e24] h-1.5 rounded-full overflow-hidden">
                            <div className="bg-[#6b16ed] h-full rounded-full" style={{ width: `${s.cpu_usage}%` }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Memory</span>
                            <span>{Math.round(s.memory_usage.used)} MB / {s.memory_usage.total} MB</span>
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
                            <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> Disk Storage</span>
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

                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
                        <span>{s.provider} ({s.region})</span>
                        <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-zinc-300">
                          {s.active_containers} containers
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Applications Quick List */}
              <div className="bg-[#121212] border border-white/10 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Production Workloads</h3>
                    <p className="text-xs text-zinc-400">Applications currently routed via Traefik reverse proxy</p>
                  </div>
                  <button
                    onClick={() => setCurrentTab('applications')}
                    className="text-xs text-[#a391ff] hover:underline"
                  >
                    Manage Applications →
                  </button>
                </div>

                <div className="divide-y divide-white/5">
                  {applications.map((app) => (
                    <div key={app.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded bg-[#1e1e24] border border-white/10 flex items-center justify-center shrink-0 text-[#a391ff]">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">{app.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#6b16ed]/20 text-[#a391ff] border border-[#6b16ed]/30">
                              {app.build_pack}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {app.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
                            <span className="flex items-center gap-1 font-mono text-zinc-300">
                              <Globe className="w-3 h-3 text-zinc-500" />
                              {app.fqdn}
                            </span>
                            <span>•</span>
                            <span>{app.server_name}</span>
                            <span>•</span>
                            <span>Branch: <span className="font-mono text-zinc-300">{app.git_branch}</span></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => handleDeploy(app.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white text-xs font-medium shadow-[0_2px_0_0_#4a0fa3] transition-all"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Deploy
                        </button>
                        <button
                          onClick={() => handleRestartApp(app.id)}
                          title="Restart Container"
                          className="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
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
                  <h2 className="text-base font-semibold text-white tracking-tight">Applications</h2>
                  <p className="text-xs text-zinc-400">Deploy and manage applications from Git repositories, Dockerfiles, and compose files</p>
                </div>
                <button
                  onClick={() => setShowAppModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#6b16ed] hover:bg-[#7317ff] text-white shadow-[0_2px_0_0_#4a0fa3]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Application
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {applications.map((app) => (
                  <div key={app.id} className="bg-[#121212] border border-white/10 rounded-lg p-5 flex flex-col justify-between hover:border-white/20 transition-all">
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
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {app.status}
                        </span>
                      </div>

                      <div className="bg-[#18181b] rounded p-3 space-y-1.5 text-xs text-zinc-300 font-mono border border-white/5 my-3">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Build Pack:</span>
                          <span className="text-[#a391ff]">{app.build_pack}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Repository:</span>
                          <span className="truncate max-w-[170px]" title={app.git_repository}>{app.git_repository.replace('https://github.com/', '')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Branch:</span>
                          <span>{app.git_branch}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Container Port:</span>
                          <span>{app.destination_port}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Server:</span>
                          <span className="truncate max-w-[150px]">{app.server_name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDeploy(app.id)}
                          className="flex items-center gap-1 px-3 py-1 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white text-xs font-medium shadow-[0_2px_0_0_#4a0fa3]"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Deploy
                        </button>
                        <button
                          onClick={() => handleRestartApp(app.id)}
                          title="Restart application"
                          className="p-1.5 rounded hover:bg-white/10 text-zinc-300"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStopApp(app.id)}
                          title="Stop application"
                          className="p-1.5 rounded hover:bg-white/10 text-zinc-300"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteApp(app.id)}
                        title="Delete application"
                        className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: DATABASES */}
          {currentTab === 'databases' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">Databases</h2>
                  <p className="text-xs text-zinc-400">Standalone and high-performance managed database clusters</p>
                </div>
                <button
                  onClick={() => setShowDbModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#6b16ed] hover:bg-[#7317ff] text-white shadow-[0_2px_0_0_#4a0fa3]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Database
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {databases.map((db) => {
                  const connString = `${db.type}://${db.db_user}:password@${db.server_name.includes('localhost') ? '127.0.0.1' : '159.69.112.44'}:${db.port}/${db.db_name}`;
                  return (
                    <div key={db.id} className="bg-[#121212] border border-white/10 rounded-lg p-5 flex flex-col justify-between hover:border-white/20 transition-all">
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-[#1e1e24] border border-white/10 flex items-center justify-center text-[#a391ff]">
                              <Database className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-white text-sm">{db.name}</h3>
                              <div className="text-[11px] text-zinc-400 uppercase font-mono">{db.type} • {db.version}</div>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {db.status}
                          </span>
                        </div>

                        <div className="bg-[#18181b] rounded p-3 space-y-1.5 text-xs text-zinc-300 font-mono border border-white/5 my-3">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Port:</span>
                            <span>{db.port}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Database:</span>
                            <span>{db.db_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">User:</span>
                            <span>{db.db_user}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Storage Used:</span>
                            <span>{db.size_mb} MB</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Backups:</span>
                            <span className="text-emerald-400">{db.backup_enabled ? 'Active' : 'Disabled'}</span>
                          </div>
                        </div>

                        {/* Connection string snippet */}
                        <div className="bg-black/40 rounded p-2 border border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                          <span className="truncate mr-2">{connString}</span>
                          <button
                            onClick={() => handleCopy(connString)}
                            className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/10"
                            title="Copy connection string"
                          >
                            {copiedText === connString ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 flex items-center justify-between mt-3">
                        <span className="text-[11px] text-zinc-500">Scheduled: {db.backup_frequency}</span>
                        <button
                          onClick={() => handleDeleteDb(db.id)}
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete database"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: SERVERS */}
          {currentTab === 'servers' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">Connected Servers</h2>
                  <p className="text-xs text-zinc-400">Manage host machines connected over SSH with automatic Docker and Traefik provisioning</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {servers.map((s) => (
                  <div key={s.id} className="bg-[#121212] border border-white/10 rounded-lg p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-[#a391ff]" />
                          <h3 className="font-semibold text-white text-base">{s.name}</h3>
                        </div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">{s.user}@{s.ip}:{s.port}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {s.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs font-mono">
                      <div className="bg-[#18181b] p-2.5 rounded border border-white/5">
                        <div className="text-zinc-500 text-[10px]">Docker Engine</div>
                        <div className="text-white font-semibold mt-0.5">{s.docker_version}</div>
                      </div>
                      <div className="bg-[#18181b] p-2.5 rounded border border-white/5">
                        <div className="text-zinc-500 text-[10px]">Proxy</div>
                        <div className="text-emerald-400 font-semibold mt-0.5">{s.proxy_type}</div>
                      </div>
                      <div className="bg-[#18181b] p-2.5 rounded border border-white/5">
                        <div className="text-zinc-500 text-[10px]">Containers</div>
                        <div className="text-white font-semibold mt-0.5">{s.active_containers} running</div>
                      </div>
                      <div className="bg-[#18181b] p-2.5 rounded border border-white/5">
                        <div className="text-zinc-500 text-[10px]">Region</div>
                        <div className="text-zinc-300 font-semibold mt-0.5 truncate">{s.region}</div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div>
                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                          <span>CPU Utilization ({s.cpu_usage}%)</span>
                          <span>8 Cores</span>
                        </div>
                        <div className="w-full bg-[#1e1e24] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#6b16ed] h-full rounded-full" style={{ width: `${s.cpu_usage}%` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                          <span>RAM Allocation</span>
                          <span>{s.memory_usage.used} MB / {s.memory_usage.total} MB</span>
                        </div>
                        <div className="w-full bg-[#1e1e24] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full"
                            style={{ width: `${(s.memory_usage.used / s.memory_usage.total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Provider: {s.provider}</span>
                      <button
                        onClick={() => {
                          setCurrentTab('terminal');
                          runTerminalCommand('docker ps');
                        }}
                        className="text-[#a391ff] hover:underline flex items-center gap-1"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        Open Shell
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: DEPLOYMENTS */}
          {currentTab === 'deployments' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight">Deployments Queue & History</h2>
                <p className="text-xs text-zinc-400">Real-time build and deployment logs for applications</p>
              </div>

              <div className="bg-[#121212] border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#18181b] text-zinc-400 border-b border-white/5 font-medium uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Application</th>
                      <th className="py-3 px-4">Commit / Branch</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4 text-right">Logs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {deployments.map((d) => (
                      <tr key={d.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-semibold text-white">{d.application_name}</td>
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
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">{d.duration_seconds}s</td>
                        <td className="py-3 px-4 text-zinc-400">{new Date(d.created_at).toLocaleTimeString()}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setInspectDeployment(d)}
                            className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-white/10 text-zinc-200 border border-white/10 text-xs"
                          >
                            View Logs
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">Host Terminal & Diagnostic Shell</h2>
                  <p className="text-xs text-zinc-400">Execute commands on localhost and connected Docker nodes</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runTerminalCommand('docker ps')}
                    className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-[#202025] text-zinc-300 border border-white/10 text-xs font-mono"
                  >
                    docker ps
                  </button>
                  <button
                    onClick={() => runTerminalCommand('uptime')}
                    className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-[#202025] text-zinc-300 border border-white/10 text-xs font-mono"
                  >
                    uptime
                  </button>
                  <button
                    onClick={() => runTerminalCommand('free -m')}
                    className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-[#202025] text-zinc-300 border border-white/10 text-xs font-mono"
                  >
                    free -m
                  </button>
                  <button
                    onClick={() => runTerminalCommand('df -h')}
                    className="px-2.5 py-1 rounded bg-[#18181b] hover:bg-[#202025] text-zinc-300 border border-white/10 text-xs font-mono"
                  >
                    df -h
                  </button>
                </div>
              </div>

              <div className="bg-[#050508] border border-white/10 rounded-lg p-4 font-mono text-xs flex flex-col h-[520px]">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {terminalHistory.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <span className="text-emerald-400 font-bold">carnauba@host:~$</span>
                        <span className="text-white font-semibold">{item.cmd}</span>
                        <span className="text-[10px] text-zinc-600 ml-auto">{item.time}</span>
                      </div>
                      <pre className="text-zinc-300 whitespace-pre-wrap pl-4 border-l border-white/10 py-1 font-mono text-[11px] leading-relaxed">
                        {item.out}
                      </pre>
                    </div>
                  ))}
                  {terminalLoading && (
                    <div className="text-zinc-500 animate-pulse flex items-center gap-2">
                      <RotateCw className="w-3 h-3 animate-spin" /> Executing command on host...
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runTerminalCommand();
                  }}
                  className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2"
                >
                  <span className="text-emerald-400 font-bold shrink-0">carnauba@host:~$</span>
                  <input
                    type="text"
                    value={terminalCmd}
                    onChange={(e) => setTerminalCmd(e.target.value)}
                    aria-label="Linha de comando do terminal"
                    className="flex-1 bg-transparent text-white focus:outline-none font-mono text-xs"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={terminalLoading}
                    className="px-3 py-1 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white text-xs font-sans font-medium"
                  >
                    Run
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB: API EXPLORER */}
          {currentTab === 'api' && (
            <div className="space-y-4 max-w-7xl mx-auto">
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight">REST API &amp; OpenAPI Explorer</h2>
                <p className="text-xs text-zinc-400">Directly inspect and test live endpoints mapped from Carnauba OpenAPI specification</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider text-zinc-400">Available Endpoints</h3>
                  <div className="space-y-2">
                    {[
                      { method: 'GET', path: '/api/v1/version', desc: 'Get Carnauba engine and platform version' },
                      { method: 'GET', path: '/api/v1/servers', desc: 'List all connected SSH servers and status' },
                      { method: 'GET', path: '/api/v1/applications', desc: 'List deployed applications and ports' },
                      { method: 'GET', path: '/api/v1/databases', desc: 'List active database instances and ports' },
                      { method: 'GET', path: '/api/v1/deployments', desc: 'List active deployment queue and history' },
                      { method: 'POST', path: '/api/v1/deploy', desc: 'Trigger zero-downtime deployment pipeline' },
                    ].map((ep, i) => (
                      <div
                        key={i}
                        onClick={async () => {
                          const res = await fetch(ep.path);
                          if (res.ok) {
                            const data = await res.json();
                            alert(`Response from ${ep.path}:\n` + JSON.stringify(data, null, 2));
                          }
                        }}
                        className="bg-[#18181b] hover:bg-[#202025] p-3 rounded border border-white/5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              ep.method === 'GET' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {ep.method}
                          </span>
                          <span className="font-mono text-xs text-white">{ep.path}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400">{ep.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#121212] border border-white/10 rounded-lg p-4 flex flex-col">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider text-zinc-400 mb-2">Live Engine Version Test</h3>
                  <div className="bg-[#050508] p-4 rounded border border-white/10 font-mono text-xs text-emerald-400 flex-1 overflow-auto">
                    {`{
  "name": "Carnauba Cloud (Carnauba Engine)",
  "version": "v4.0.0-beta.392",
  "platform": "Linux x86_64",
  "api_version": "3.1.0",
  "status": "operational",
  "uptime_seconds": 483920
}`}
                  </div>
                  <div className="mt-3 text-xs text-zinc-400">
                    OpenAPI 3.1 specification cataloged with 40+ endpoints ready for CI/CD pipelines and webhooks.
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* NEW APPLICATION MODAL */}
      {showAppModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-semibold text-white text-base">New Application</h3>
              <button onClick={() => setShowAppModal(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateApplication} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Nome da Aplicação</label>
                <input
                  type="text"
                  required
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">URL do Repositório Git</label>
                <input
                  type="text"
                  value={appRepo}
                  onChange={(e) => setAppRepo(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Branch</label>
                  <input
                    type="text"
                    value={appBranch}
                    onChange={(e) => setAppBranch(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={appPort}
                    onChange={(e) => setAppPort(Number(e.target.value))}
                    className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Build Pack</label>
                <select
                  value={appBuildpack}
                  onChange={(e: any) => setAppBuildpack(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                >
                  <option value="nixpacks">Nixpacks (Automatic Detection)</option>
                  <option value="dockerfile">Dockerfile</option>
                  <option value="dockercompose">Docker Compose</option>
                  <option value="static">Static SPA (Nginx)</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Destination Server</label>
                <select
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white font-medium shadow-[0_2px_0_0_#4a0fa3]"
                >
                  Deploy Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW DATABASE MODAL */}
      {showDbModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-semibold text-white text-base">Provision New Database</h3>
              <button onClick={() => setShowDbModal(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateDatabase} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Nome do Banco de Dados</label>
                <input
                  type="text"
                  required
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Engine Type</label>
                <select
                  value={dbType}
                  onChange={(e: any) => setDbType(e.target.value)}
                  className="w-full bg-[#18181b] border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-[#6b16ed]"
                >
                  <option value="postgresql">PostgreSQL 16</option>
                  <option value="redis">Redis 7.2</option>
                  <option value="mysql">MySQL 8.0</option>
                  <option value="mongodb">MongoDB 7.0</option>
                  <option value="clickhouse">ClickHouse 24.3</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Target Host</label>
                <select
                  value={dbServerId}
                  onChange={(e) => setDbServerId(e.target.value)}
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
                  onClick={() => setShowDbModal(false)}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#6b16ed] hover:bg-[#7317ff] text-white font-medium shadow-[0_2px_0_0_#4a0fa3]"
                >
                  Create Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT DEPLOYMENT MODAL */}
      {inspectDeployment && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6 w-full max-w-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base">Deployment Logs: {inspectDeployment.application_name}</h3>
                <div className="text-xs text-zinc-400 font-mono mt-0.5">Commit: {inspectDeployment.commit} ({inspectDeployment.branch})</div>
              </div>
              <button onClick={() => setInspectDeployment(null)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="bg-[#050508] border border-white/10 rounded p-4 font-mono text-[11px] h-80 overflow-y-auto space-y-1 text-zinc-300 leading-relaxed">
              {inspectDeployment.logs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-zinc-600 select-none">[{index + 1}]</span>
                  <span className={log.includes('successful') || log.includes('200 OK') ? 'text-emerald-400 font-semibold' : ''}>
                    {log}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-white/10">
              <span className="flex items-center gap-1.5">
                Status: <span className="font-semibold text-emerald-400 uppercase">{inspectDeployment.status}</span>
              </span>
              <button
                onClick={() => setInspectDeployment(null)}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
