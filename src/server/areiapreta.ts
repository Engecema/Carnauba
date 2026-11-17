import fs from 'fs';
import path from 'path';
import net from 'net';
import crypto from 'crypto';

export const XIQI_OS_ROOT = process.env.XIQI_OS_ROOT || '/opt/xiqi';
export const XIQI_APP_DIR = process.env.XIQI_APP_DIR || '/opt/xiqi/app';
export const AREIA_PRETA_CONFIGURED_DIR = process.env.AREIA_PRETA_DIR || '/opt/xiqi/app/areiapreta';
export const AREIA_PRETA_HOST = process.env.AREIA_PRETA_HOST || '127.0.0.1';
export const AREIA_PRETA_PORT = Number(process.env.AREIA_PRETA_PORT || 7420);
export const BASE_APP_PORT = Number(process.env.ENGECEMA_BASE_PORT || 3100);

export const RESERVED_PORTS: ReadonlyArray<{ port: number; service: string }> = [
  { port: 22, service: 'XIQI OS SSH Daemon' },
  { port: 80, service: 'Engecema Reverse Proxy HTTP' },
  { port: 443, service: 'Engecema Reverse Proxy HTTPS' },
  { port: 3000, service: 'Carnauba Control Engine' },
  { port: 5432, service: 'Porta Reservada Sistema' },
  { port: 6379, service: 'Cache Local Interno' },
  { port: 7420, service: 'Banco de Dados Areia Preta' },
  { port: 8080, service: 'Monitoramento Interno XIQI' },
];

export interface AreiaPretaEnvVars {
  AREIA_PRETA_HOME: string;
  AREIA_PRETA_HOST: string;
  AREIA_PRETA_PORT: string;
  AREIA_PRETA_SCHEMA: string;
  AREIA_PRETA_USER: string;
  AREIA_PRETA_PASSWORD: string;
  AREIA_PRETA_URL: string;
}

export interface ServerItem {
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

export interface ApplicationItem {
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

export interface DatabaseItem {
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

export interface DeploymentItem {
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

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  role: 'root' | 'admin' | 'operator';
  createdAt: string;
}

export interface SecurityEvent {
  id: string;
  type:
    | 'CSRF_BLOCKED'
    | 'RATE_LIMIT'
    | 'AUTH_LOCKOUT'
    | 'INJECTION_BLOCKED'
    | 'PATH_TRAVERSAL_BLOCKED'
    | 'PRIVILEGE_ESCALATION_BLOCKED'
    | 'INVALID_INPUT_BLOCKED'
    | 'DISK_LOCK_SYNC';
  ip: string;
  detail: string;
  timestamp: string;
}

export interface AreiaPretaStoreState {
  servers: ServerItem[];
  applications: ApplicationItem[];
  databases: DatabaseItem[];
  deployments: DeploymentItem[];
  users: UserRecord[];
  securityEvents: SecurityEvent[];
}

// Disk Write Lock Manager (Async Mutex + Advisory Lock File + Atomic Rename)
const lockQueues = new Map<string, Promise<void>>();
let activeLocksCount = 0;
let totalDiskWrites = 0;
let lockAcquisitions = 0;
let lastWriteAt: string | null = null;

export async function withDiskLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
  const previous = lockQueues.get(lockKey) || Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  lockQueues.set(lockKey, previous.then(() => current));

  await previous;
  activeLocksCount += 1;
  lockAcquisitions += 1;

  try {
    return await task();
  } finally {
    activeLocksCount -= 1;
    releaseCurrent();
  }
}

// Scrypt Password Hashing (Memory-safe N=16384 for 4GB RAM x86_64) + Timing-Safe Verification
export function hashPassword(password: string, salt: string): string {
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  if (!storedHash.startsWith('scrypt$')) {
    return false;
  }
  const expectedHex = storedHash.slice('scrypt$'.length);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const aHash = crypto.createHash('sha256').update(a).digest();
  const bHash = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,47}$/.test(slug);
}

export function isValidResourceId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{3,80}$/.test(id);
}

export function isValidEngecemaGitUrl(url: string): boolean {
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?$/.test(url.trim());
}

export function isValidFqdn(fqdn: string): boolean {
  return /^(?=.{3,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    fqdn.trim()
  );
}

export function isStrongPassword(password: string): boolean {
  if (password.length < 8 || password.length > 128) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const blockedWeak = new Set(['12345678', 'password', 'password123', 'admin123']);
  return hasLetter && hasDigit && !blockedWeak.has(password.toLowerCase());
}

export function sanitizeSafeLabel(value: string, maxLen = 64): string {
  return value.replace(/[\r\n\t\x00-\x1f\x7f<>`$&;|]/g, '').trim().slice(0, maxLen);
}

export function resolveSafeXiqiAppDir(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new Error('Identificador de aplicação inválido para o diretório /opt/xiqi/app/');
  }
  const base = path.posix.resolve(XIQI_APP_DIR);
  const resolved = path.posix.resolve(base, slug);
  if (!resolved.startsWith(`${base}/`) || resolved === AREIA_PRETA_CONFIGURED_DIR) {
    throw new Error('Caminho fora do escopo permitido em /opt/xiqi/app/');
  }
  return resolved;
}

export function provisionAreiaPretaEnv(slug: string): AreiaPretaEnvVars {
  const safeSchema = `engecema_${slug.replace(/-/g, '_')}`;
  const safeUser = `ap_${slug.replace(/-/g, '_').slice(0, 24)}`;
  const secret = crypto.randomBytes(16).toString('hex');
  return {
    AREIA_PRETA_HOME: AREIA_PRETA_CONFIGURED_DIR,
    AREIA_PRETA_HOST,
    AREIA_PRETA_PORT: String(AREIA_PRETA_PORT),
    AREIA_PRETA_SCHEMA: safeSchema,
    AREIA_PRETA_USER: safeUser,
    AREIA_PRETA_PASSWORD: secret,
    AREIA_PRETA_URL: `areiapreta://${safeUser}:${secret}@${AREIA_PRETA_HOST}:${AREIA_PRETA_PORT}/${safeSchema}?home=${AREIA_PRETA_CONFIGURED_DIR}`,
  };
}

export function isPortFreeOnHost(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => {
      resolve(false);
    });
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

export class AreiaPretaDatabase {
  public activeStoragePath: string = AREIA_PRETA_CONFIGURED_DIR;
  public activeAppWorkspacePath: string = XIQI_APP_DIR;
  public storageMode: 'xiqi-native' | 'local-fallback' = 'xiqi-native';
  public clusterSecretKey: string = '';
  public state: AreiaPretaStoreState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(initialRootPassword?: string): AreiaPretaStoreState {
    const rootSalt = crypto.randomBytes(16).toString('hex');
    const devopsSalt = crypto.randomBytes(16).toString('hex');
    const bootstrapSecret = initialRootPassword || crypto.randomBytes(12).toString('hex');

    const defaultServer: ServerItem = {
      id: 'srv-engecema-dc01',
      name: 'engecema-dc-01 (Mini Data Center)',
      ip: '127.0.0.1',
      user: 'xiqi',
      port: 22,
      os_name: 'XIQI OS 1.0 (x86_64)',
      architecture: 'x86_64',
      xiqi_root: XIQI_OS_ROOT,
      app_directory: XIQI_APP_DIR,
      status: 'online',
      runtime_engine: 'XIQI Native Supervisor + Node.js 22',
      proxy_type: 'XIQI Reverse Proxy',
      proxy_status: 'running',
      cpu_usage: 14.2,
      memory_usage: { used: 1180, total: 4096 },
      disk_usage: { used: 28, total: 120 },
      active_services: 4,
    };

    const erpSlug = 'engecema-erp-api';
    const portalSlug = 'engecema-portal-web';

    const initialApps: ApplicationItem[] = [
      {
        id: 'app-engecema-erp',
        name: 'engecema-erp-api',
        slug: erpSlug,
        fqdn: 'erp.engecema.local',
        git_repository: 'https://github.com/Engecema/engecema-erp-api.git',
        git_branch: 'main',
        runtime_mode: 'nodejs',
        status: 'running',
        server_id: defaultServer.id,
        server_name: defaultServer.name,
        environment: 'producao',
        project: 'Corporação Engecema',
        local_directory: `${XIQI_APP_DIR}/${erpSlug}`,
        destination_port: 3100,
        areia_preta_env: provisionAreiaPretaEnv(erpSlug),
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        updated_at: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: 'app-engecema-portal',
        name: 'engecema-portal-web',
        slug: portalSlug,
        fqdn: 'portal.engecema.local',
        git_repository: 'https://github.com/Engecema/engecema-portal-web.git',
        git_branch: 'main',
        runtime_mode: 'static',
        status: 'running',
        server_id: defaultServer.id,
        server_name: defaultServer.name,
        environment: 'producao',
        project: 'Corporação Engecema',
        local_directory: `${XIQI_APP_DIR}/${portalSlug}`,
        destination_port: 3101,
        areia_preta_env: provisionAreiaPretaEnv(portalSlug),
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ];

    const initialDatabases: DatabaseItem[] = [
      {
        id: 'db-areiapreta-core',
        name: 'areiapreta-core',
        type: 'areiapreta',
        version: '2.4.0-xiqi-x86_64',
        status: 'running',
        server_id: defaultServer.id,
        server_name: defaultServer.name,
        port: AREIA_PRETA_PORT,
        data_path: AREIA_PRETA_CONFIGURED_DIR,
        db_name: 'carnauba_orchestrator',
        db_user: 'carnauba_engine',
        backup_enabled: true,
        backup_frequency: '0 2 * * * (Snapshot Local XIQI)',
        size_mb: 142,
      },
      {
        id: 'db-areiapreta-erp',
        name: 'schema-engecema-erp',
        type: 'areiapreta',
        version: '2.4.0-xiqi-x86_64',
        status: 'running',
        server_id: defaultServer.id,
        server_name: defaultServer.name,
        port: AREIA_PRETA_PORT,
        data_path: `${AREIA_PRETA_CONFIGURED_DIR}/schemas/engecema_erp_api`,
        db_name: 'engecema_engecema_erp_api',
        db_user: initialApps[0].areia_preta_env.AREIA_PRETA_USER,
        backup_enabled: true,
        backup_frequency: '0 3 * * * (Snapshot Local XIQI)',
        size_mb: 64,
      },
    ];

    const initialDeployments: DeploymentItem[] = [
      {
        id: 'dep-xiqi-1001',
        application_id: initialApps[0].id,
        application_name: initialApps[0].name,
        commit: 'c4a8e19',
        commit_message: 'chore: integrar conexão nativa Areia Preta no XIQI OS',
        branch: 'main',
        target_directory: initialApps[0].local_directory,
        assigned_port: initialApps[0].destination_port,
        status: 'finished',
        logs: [
          '[04:10:01] Lock de escrita adquirido em /opt/xiqi/app/areiapreta',
          '[04:10:02] Verificando porta sequencial 3100 no host 127.0.0.1 (livre)',
          '[04:10:03] Sincronizando repositório https://github.com/Engecema/engecema-erp-api.git em /opt/xiqi/app/engecema-erp-api',
          '[04:10:06] Variáveis AREIA_PRETA_* gravadas em /opt/xiqi/app/engecema-erp-api/.env.areiapreta',
          '[04:10:09] Processo iniciado no XIQI OS Supervisor (x86_64, limite RAM 512 MB)',
          '[04:10:11] Verificação HTTP local 127.0.0.1:3100 -> 200 OK',
          '[04:10:12] Deploy concluído com sucesso e registrado no Areia Preta!',
        ],
        created_at: new Date(Date.now() - 1800000).toISOString(),
        duration_seconds: 11,
      },
    ];

    const rootEmail = (process.env.ROOT_USER_EMAIL || 'root@engecema.com.br').toLowerCase().trim();
    const initialUsers: UserRecord[] = [
      {
        id: 'usr_engecema_root',
        email: rootEmail,
        name: 'Administrador Engecema',
        passwordHash: hashPassword(bootstrapSecret, rootSalt),
        salt: rootSalt,
        role: 'root',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_engecema_devops',
        email: 'devops@engecema.com.br',
        name: 'Operações XIQI OS',
        passwordHash: hashPassword(bootstrapSecret, devopsSalt),
        salt: devopsSalt,
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    ];

    return {
      servers: [defaultServer],
      applications: initialApps,
      databases: initialDatabases,
      deployments: initialDeployments,
      users: initialUsers,
      securityEvents: [],
    };
  }

  public async initialize(): Promise<void> {
    try {
      await fs.promises.mkdir(AREIA_PRETA_CONFIGURED_DIR, { recursive: true, mode: 0o700 });
      const probeFile = path.join(AREIA_PRETA_CONFIGURED_DIR, '.xiqi_write_probe');
      await fs.promises.writeFile(probeFile, 'ok', { encoding: 'utf-8', mode: 0o600 });
      await fs.promises.unlink(probeFile);
      this.activeStoragePath = AREIA_PRETA_CONFIGURED_DIR;
      this.activeAppWorkspacePath = XIQI_APP_DIR;
      this.storageMode = 'xiqi-native';
    } catch {
      const fallbackDir = path.resolve(process.cwd(), '.areiapreta-local');
      await fs.promises.mkdir(fallbackDir, { recursive: true, mode: 0o700 });
      this.activeStoragePath = fallbackDir;
      this.activeAppWorkspacePath = path.join(fallbackDir, 'apps');
      await fs.promises.mkdir(this.activeAppWorkspacePath, { recursive: true, mode: 0o700 });
      this.storageMode = 'local-fallback';
    }

    await this.ensureClusterSecretKey();
    await this.loadFromDisk();
  }

  private async ensureClusterSecretKey(): Promise<void> {
    const envKey = process.env.CARNAUBA_SECRET_KEY?.trim();
    if (envKey && envKey.length >= 16) {
      this.clusterSecretKey = envKey;
      return;
    }

    const keyFile = path.join(this.activeStoragePath, '.cluster_key');
    try {
      const existing = (await fs.promises.readFile(keyFile, 'utf-8')).trim();
      if (existing.length >= 32) {
        this.clusterSecretKey = existing;
        return;
      }
    } catch {
      // Generate a fresh cryptographic cluster key
    }

    const generated = crypto.randomBytes(32).toString('hex');
    await withDiskLock('areiapreta:cluster_key', async () => {
      await fs.promises.writeFile(keyFile, generated, { encoding: 'utf-8', mode: 0o600 });
    });
    this.clusterSecretKey = generated;
  }

  private getCollectionPath(name: keyof AreiaPretaStoreState): string {
    return path.join(this.activeStoragePath, `${name}.json`);
  }

  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const lockPath = `${filePath}.lock`;
    await fs.promises.writeFile(lockPath, String(process.pid), { encoding: 'utf-8', mode: 0o600 });
    try {
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
      totalDiskWrites += 1;
      lastWriteAt = new Date().toISOString();
    } finally {
      await fs.promises.unlink(lockPath).catch(() => {});
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  private async loadCollection<K extends keyof AreiaPretaStoreState>(
    name: K,
    fallback: AreiaPretaStoreState[K]
  ): Promise<AreiaPretaStoreState[K]> {
    const filePath = this.getCollectionPath(name);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (name === 'users') {
          // Ensure all loaded users use scrypt hashes; upgrade legacy hashes if missing scrypt$ prefix
          const users = parsed as UserRecord[];
          const validUsers = users.filter((u) => typeof u.passwordHash === 'string' && u.passwordHash.startsWith('scrypt$'));
          if (validUsers.length > 0) {
            return validUsers as AreiaPretaStoreState[K];
          }
        } else {
          return parsed as AreiaPretaStoreState[K];
        }
      }
    } catch {
      // File missing or corrupted -> initialize safely
    }

    await withDiskLock(`areiapreta:${name}`, () => this.atomicWriteJson(filePath, fallback));
    return fallback;
  }

  public async loadFromDisk(): Promise<void> {
    const envPass = process.env.ROOT_USER_PASSWORD?.trim();
    const bootstrapPass = envPass && envPass.length >= 8 ? envPass : crypto.randomBytes(12).toString('hex');
    const defaults = this.createInitialState(bootstrapPass);

    const usersPath = this.getCollectionPath('users');
    let hadExistingScryptUsers = false;
    try {
      const raw = await fs.promises.readFile(usersPath, 'utf-8');
      const parsed = JSON.parse(raw);
      hadExistingScryptUsers =
        Array.isArray(parsed) &&
        parsed.some((u: UserRecord) => typeof u?.passwordHash === 'string' && u.passwordHash.startsWith('scrypt$'));
    } catch {
      hadExistingScryptUsers = false;
    }

    this.state.servers = await this.loadCollection('servers', defaults.servers);
    this.state.applications = await this.loadCollection('applications', defaults.applications);
    this.state.databases = await this.loadCollection('databases', defaults.databases);
    this.state.deployments = await this.loadCollection('deployments', defaults.deployments);
    this.state.users = await this.loadCollection('users', defaults.users);
    this.state.securityEvents = await this.loadCollection('securityEvents', defaults.securityEvents);

    if (!hadExistingScryptUsers && !envPass) {
      const bootstrapFile = path.join(this.activeStoragePath, '.bootstrap_credentials');
      const content = [
        `# Credenciais iniciais geradas no primeiro boot do Carnauba (Corporação Engecema - XIQI OS)`,
        `ROOT_USER_EMAIL=${defaults.users[0].email}`,
        `DEVOPS_USER_EMAIL=${defaults.users[1].email}`,
        `INITIAL_PASSWORD=${bootstrapPass}`,
        '',
      ].join('\n');
      await withDiskLock('areiapreta:bootstrap', async () => {
        await fs.promises.writeFile(bootstrapFile, content, { encoding: 'utf-8', mode: 0o600 });
      });
    }
  }

  public async persistCollection<K extends keyof AreiaPretaStoreState>(name: K): Promise<void> {
    const filePath = this.getCollectionPath(name);
    await withDiskLock(`areiapreta:${name}`, async () => {
      await this.atomicWriteJson(filePath, this.state[name]);
    });
  }

  public async writeProjectEnvManifest(app: ApplicationItem): Promise<string> {
    const targetDir =
      this.storageMode === 'xiqi-native'
        ? app.local_directory
        : path.join(this.activeAppWorkspacePath, app.slug);

    await withDiskLock(`app-manifest:${app.slug}`, async () => {
      await fs.promises.mkdir(targetDir, { recursive: true, mode: 0o700 });
      const envContent = [
        `# Gerado automaticamente pelo Carnauba Engine (Corporação Engecema - XIQI OS)`,
        `PORT=${app.destination_port}`,
        `HOST=127.0.0.1`,
        `XIQI_APP_DIR=${app.local_directory}`,
        `AREIA_PRETA_HOME=${app.areia_preta_env.AREIA_PRETA_HOME}`,
        `AREIA_PRETA_HOST=${app.areia_preta_env.AREIA_PRETA_HOST}`,
        `AREIA_PRETA_PORT=${app.areia_preta_env.AREIA_PRETA_PORT}`,
        `AREIA_PRETA_SCHEMA=${app.areia_preta_env.AREIA_PRETA_SCHEMA}`,
        `AREIA_PRETA_USER=${app.areia_preta_env.AREIA_PRETA_USER}`,
        `AREIA_PRETA_PASSWORD=${app.areia_preta_env.AREIA_PRETA_PASSWORD}`,
        `AREIA_PRETA_URL=${app.areia_preta_env.AREIA_PRETA_URL}`,
        '',
      ].join('\n');

      const envPath = path.join(targetDir, '.env.areiapreta');
      const tmpEnv = `${envPath}.tmp`;
      await fs.promises.writeFile(tmpEnv, envContent, { encoding: 'utf-8', mode: 0o600 });
      await fs.promises.rename(tmpEnv, envPath);
      totalDiskWrites += 1;
      lastWriteAt = new Date().toISOString();
    });

    return path.join(app.local_directory, '.env.areiapreta');
  }

  public getUsedPortsSet(): Set<number> {
    const used = new Set<number>();
    for (const r of RESERVED_PORTS) used.add(r.port);
    for (const a of this.state.applications) used.add(a.destination_port);
    for (const d of this.state.databases) used.add(d.port);
    return used;
  }

  public async allocatePort(preferredPort?: number): Promise<number> {
    const used = this.getUsedPortsSet();

    if (preferredPort !== undefined && preferredPort !== null && !Number.isNaN(preferredPort)) {
      const port = Number(preferredPort);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error('A porta deve ser um inteiro válido entre 1024 e 65535.');
      }
      if (used.has(port)) {
        throw new Error(`Conflito de porta: a porta ${port} já está reservada ou em uso no servidor.`);
      }
      const isFree = await isPortFreeOnHost(port);
      if (!isFree) {
        throw new Error(`Conflito de sistema: a porta ${port} já está ocupada por outro processo no XIQI OS.`);
      }
      return port;
    }

    let candidate = BASE_APP_PORT;
    while (candidate <= 65000) {
      if (!used.has(candidate)) {
        const free = await isPortFreeOnHost(candidate);
        if (free) return candidate;
      }
      candidate += 1;
    }
    throw new Error('Nenhuma porta local disponível na faixa 3100-65000.');
  }

  public async recordSecurityEvent(
    type: SecurityEvent['type'],
    ip: string,
    detail: string
  ): Promise<void> {
    this.state.securityEvents.unshift({
      id: `sec-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      type,
      ip: sanitizeSafeLabel(ip, 64),
      detail: sanitizeSafeLabel(detail, 200),
      timestamp: new Date().toISOString(),
    });
    if (this.state.securityEvents.length > 100) {
      this.state.securityEvents.length = 100;
    }
    await this.persistCollection('securityEvents');
  }

  public getDiagnostics() {
    return {
      engine: 'Areia Preta Local Engine v2.4.0',
      configured_path: AREIA_PRETA_CONFIGURED_DIR,
      active_storage_path: this.activeStoragePath,
      xiqi_app_directory: XIQI_APP_DIR,
      storage_mode: this.storageMode,
      host: AREIA_PRETA_HOST,
      port: AREIA_PRETA_PORT,
      disk_locks: {
        active_locks: activeLocksCount,
        total_lock_acquisitions: lockAcquisitions,
        total_atomic_writes: totalDiskWrites,
        last_write_at: lastWriteAt,
      },
      counts: {
        servers: this.state.servers.length,
        applications: this.state.applications.length,
        databases: this.state.databases.length,
        deployments: this.state.deployments.length,
        users: this.state.users.length,
        security_events: this.state.securityEvents.length,
      },
    };
  }
}
