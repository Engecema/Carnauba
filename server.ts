import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerItem {
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

interface ApplicationItem {
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

interface DatabaseItem {
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

interface ServiceItem {
  id: string;
  name: string;
  template: string;
  status: 'running' | 'stopped';
  containers_count: number;
  server_id: string;
  url: string;
}

interface DeploymentItem {
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

// In-Memory Data Store
const servers: ServerItem[] = [
  {
    id: 'srv-localhost',
    name: 'localhost (Core Engine)',
    ip: '127.0.0.1',
    user: 'root',
    port: 22,
    provider: 'Local Machine',
    region: 'local',
    status: 'online',
    docker_version: '27.1.1',
    proxy_type: 'Traefik v3.1',
    proxy_status: 'running',
    cpu_usage: 18.4,
    memory_usage: { used: 3840, total: 16384 },
    disk_usage: { used: 42, total: 250 },
    active_containers: 9,
  },
  {
    id: 'srv-hetzner-eu',
    name: 'hetzner-cpx31-prod',
    ip: '159.69.112.44',
    user: 'carnauba',
    port: 22,
    provider: 'Hetzner Cloud',
    region: 'fsn1-dc14 (Germany)',
    status: 'online',
    docker_version: '27.0.3',
    proxy_type: 'Traefik v3.1',
    proxy_status: 'running',
    cpu_usage: 34.2,
    memory_usage: { used: 4920, total: 8192 },
    disk_usage: { used: 68, total: 160 },
    active_containers: 14,
  },
  {
    id: 'srv-do-us-east',
    name: 'do-nyc3-staging',
    ip: '165.22.188.90',
    user: 'root',
    port: 2222,
    provider: 'DigitalOcean',
    region: 'nyc3 (US East)',
    status: 'online',
    docker_version: '27.0.2',
    proxy_type: 'Traefik v3.1',
    proxy_status: 'running',
    cpu_usage: 12.0,
    memory_usage: { used: 2150, total: 4096 },
    disk_usage: { used: 24, total: 80 },
    active_containers: 5,
  },
];

const applications: ApplicationItem[] = [
  {
    id: 'app-carnauba-api',
    name: 'carnauba-api',
    fqdn: 'api.carnauba.cloud',
    git_repository: 'https://github.com/Engecema/Carnauba.git',
    git_branch: 'main',
    build_pack: 'nixpacks',
    status: 'running',
    server_id: 'srv-localhost',
    server_name: 'localhost (Core Engine)',
    environment: 'production',
    project: 'Production Cloud',
    destination_port: 3000,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'app-frontend-dashboard',
    name: 'web-portal-v2',
    fqdn: 'portal.carnauba.cloud',
    git_repository: 'https://github.com/Engecema/portal-web.git',
    git_branch: 'release/v2.4',
    build_pack: 'static',
    status: 'running',
    server_id: 'srv-hetzner-eu',
    server_name: 'hetzner-cpx31-prod',
    environment: 'production',
    project: 'Production Cloud',
    destination_port: 80,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'app-auth-worker',
    name: 'auth-identity-service',
    fqdn: 'auth.carnauba.cloud',
    git_repository: 'https://github.com/Engecema/auth-core.git',
    git_branch: 'main',
    build_pack: 'dockerfile',
    status: 'running',
    server_id: 'srv-hetzner-eu',
    server_name: 'hetzner-cpx31-prod',
    environment: 'production',
    project: 'Microservices & AI',
    destination_port: 8080,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 14400000).toISOString(),
  },
];

const databases: DatabaseItem[] = [
  {
    id: 'db-postgres-prod',
    name: 'primary-postgres-16',
    type: 'postgresql',
    version: '16.4-alpine',
    status: 'running',
    server_id: 'srv-localhost',
    server_name: 'localhost (Core Engine)',
    port: 5432,
    db_name: 'carnauba_production',
    db_user: 'carnauba_admin',
    backup_enabled: true,
    backup_frequency: '0 2 * * * (Daily at 02:00 UTC)',
    size_mb: 2840,
  },
  {
    id: 'db-redis-cache',
    name: 'session-redis',
    type: 'redis',
    version: '7.2-alpine',
    status: 'running',
    server_id: 'srv-hetzner-eu',
    server_name: 'hetzner-cpx31-prod',
    port: 6379,
    db_name: 'cache_0',
    db_user: 'default',
    backup_enabled: true,
    backup_frequency: '0 */6 * * * (Every 6h)',
    size_mb: 480,
  },
  {
    id: 'db-clickhouse-analytics',
    name: 'events-clickhouse',
    type: 'clickhouse',
    version: '24.3',
    status: 'running',
    server_id: 'srv-hetzner-eu',
    server_name: 'hetzner-cpx31-prod',
    port: 8123,
    db_name: 'telemetry_dw',
    db_user: 'clickhouse_admin',
    backup_enabled: false,
    backup_frequency: 'Manual',
    size_mb: 18200,
  },
];

const services: ServiceItem[] = [
  {
    id: 'svc-plausible',
    name: 'Plausible Analytics',
    template: 'plausible',
    status: 'running',
    containers_count: 3,
    server_id: 'srv-localhost',
    url: 'https://stats.carnauba.cloud',
  },
  {
    id: 'svc-minio',
    name: 'MinIO S3 Compatible Object Store',
    template: 'minio',
    status: 'running',
    containers_count: 1,
    server_id: 'srv-hetzner-eu',
    url: 'https://s3.carnauba.cloud',
  },
  {
    id: 'svc-vaultwarden',
    name: 'Vaultwarden Password Vault',
    template: 'vaultwarden',
    status: 'running',
    containers_count: 1,
    server_id: 'srv-do-us-east',
    url: 'https://vault.carnauba.cloud',
  },
];

const deployments: DeploymentItem[] = [
  {
    id: 'dep-90812',
    application_id: 'app-carnauba-api',
    application_name: 'carnauba-api',
    commit: 'a91fbc4',
    commit_message: 'feat: add automated Traefik ACME challenge retry policy',
    branch: 'main',
    status: 'finished',
    logs: [
      '[04:12:01] Initializing deployment task...',
      '[04:12:02] Connected to srv-localhost via local socket',
      '[04:12:03] Git cloning Engecema/Carnauba branch main (commit a91fbc4)',
      '[04:12:07] Nixpacks detecting build plan: Node.js runtime identified',
      '[04:12:12] Building container image: carnauba-api:a91fbc4',
      '[04:12:28] Exporting image to local Docker daemon',
      '[04:12:30] Configuring Traefik reverse proxy labels (api.carnauba.cloud)',
      '[04:12:32] Starting container carnauba-api-srv-localhost-1',
      '[04:12:35] Performing zero-downtime healthcheck on port 3000: 200 OK',
      '[04:12:36] Deployment successful! Previous container stopped.',
    ],
    created_at: new Date(Date.now() - 3600000).toISOString(),
    duration_seconds: 35,
  },
];

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Defensive Security Middleware
  app.use(express.json({ limit: '1mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Cryptographic Password Hashing & Salt Helper
  const hashPassword = (password: string, salt: string): string => {
    return crypto.createHash('sha256').update(password + salt + 'carnauba_v4_secret').digest('hex');
  };

  interface UserRecord {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    salt: string;
    role: 'root' | 'admin' | 'operator';
    createdAt: string;
  }

  // In-Memory Secure Users Database
  const registeredUsers = new Map<string, UserRecord>();

  // Seed default admin accounts with salt
  const rootSalt = crypto.randomBytes(16).toString('hex');
  registeredUsers.set('root@carnauba.cloud', {
    id: 'usr_root_01',
    email: 'root@carnauba.cloud',
    name: 'Root Administrator',
    passwordHash: hashPassword('carnauba123', rootSalt),
    salt: rootSalt,
    role: 'root',
    createdAt: new Date().toISOString(),
  });

  const devopsSalt = crypto.randomBytes(16).toString('hex');
  registeredUsers.set('devops@carnauba.cloud', {
    id: 'usr_devops_02',
    email: 'devops@carnauba.cloud',
    name: 'DevOps Team',
    passwordHash: hashPassword('carnauba123', devopsSalt),
    salt: devopsSalt,
    role: 'admin',
    createdAt: new Date().toISOString(),
  });

  // Active Sessions Store
  const authTokens = new Map<string, { email: string; name: string; role: string }>();

  // Brute Force Defense (Rate Limiter: max 5 failed attempts per IP/email within 5 minutes)
  const failedLoginAttempts = new Map<string, { count: number; lockUntil: number }>();

  // Password Recovery Tokens Store
  const passwordResetCodes = new Map<string, { code: string; expiresAt: number }>();

  // Carnauba API v1 Compatible Endpoints
  app.get('/api/v1/version', (_req: Request, res: Response) => {
    res.json({
      name: 'Carnauba Cloud (Carnauba Engine)',
      version: 'v4.0.0-beta.392',
      platform: 'Linux x86_64',
      api_version: '3.1.0',
      status: 'operational',
      uptime_seconds: 483920,
    });
  });

  // Authentication: Sign In
  app.post('/api/v1/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimitKey = `${clientIp}_${(email || '').toLowerCase().trim()}`;

    // Check brute-force lockout
    const attempt = failedLoginAttempts.get(rateLimitKey);
    const now = Date.now();
    if (attempt && attempt.lockUntil > now) {
      const waitSeconds = Math.ceil((attempt.lockUntil - now) / 1000);
      return res.status(429).json({
        error: `Too many failed login attempts detected. Security lockout active for ${waitSeconds} seconds to prevent brute-force attacks.`,
      });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = registeredUsers.get(cleanEmail);

    if (!user) {
      const current = failedLoginAttempts.get(rateLimitKey) || { count: 0, lockUntil: 0 };
      const newCount = current.count + 1;
      failedLoginAttempts.set(rateLimitKey, {
        count: newCount,
        lockUntil: newCount >= 5 ? now + 5 * 60 * 1000 : 0,
      });
      return res.status(401).json({ error: 'Invalid credentials. User not registered in Carnauba.' });
    }

    const checkHash = hashPassword(password, user.salt);
    if (checkHash !== user.passwordHash) {
      const current = failedLoginAttempts.get(rateLimitKey) || { count: 0, lockUntil: 0 };
      const newCount = current.count + 1;
      failedLoginAttempts.set(rateLimitKey, {
        count: newCount,
        lockUntil: newCount >= 5 ? now + 5 * 60 * 1000 : 0,
      });
      return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
    }

    // Reset failed counter on successful login
    failedLoginAttempts.delete(rateLimitKey);

    // Generate cryptographically secure session token
    const token = `carnauba_auth_${crypto.randomBytes(24).toString('hex')}`;
    authTokens.set(token, {
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
      message: 'Authenticated successfully',
    });
  });

  // Authentication: Register New Administrator
  app.post('/api/v1/auth/register', (req: Request, res: Response) => {
    const { name, email, password, role = 'admin', masterKey } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long for administrative security' });
    }

    if (registeredUsers.has(cleanEmail)) {
      return res.status(409).json({ error: 'An administrator with this email already exists' });
    }

    // Privilege escalation defense: registering a 'root' user requires masterKey verification
    let assignedRole: 'root' | 'admin' | 'operator' = 'admin';
    if (role === 'root') {
      if (masterKey !== 'carnauba-master-secret-2026') {
        return res.status(403).json({ error: 'Master Key verification required to register as Root Administrator' });
      }
      assignedRole = 'root';
    } else if (role === 'operator') {
      assignedRole = 'operator';
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser: UserRecord = {
      id: `usr_${Date.now().toString(36)}`,
      email: cleanEmail,
      name: name.trim(),
      passwordHash: hashPassword(password, salt),
      salt,
      role: assignedRole,
      createdAt: new Date().toISOString(),
    };

    registeredUsers.set(cleanEmail, newUser);

    // Auto-login session token
    const token = `carnauba_auth_${crypto.randomBytes(24).toString('hex')}`;
    authTokens.set(token, {
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
    });

    res.status(201).json({
      token,
      user: {
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
      message: 'Administrator registered and authenticated successfully',
    });
  });

  // Authentication: Forgot Password (Recovery Code Request)
  app.post('/api/v1/auth/forgot-password', (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = registeredUsers.get(cleanEmail);

    if (!user) {
      return res.status(404).json({ error: 'No administrator registered with this email address' });
    }

    // Generate 6-digit cryptographic security code
    const recoveryCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity
    passwordResetCodes.set(cleanEmail, { code: recoveryCode, expiresAt });

    res.json({
      message: `Recovery code generated for ${cleanEmail}. Verification instructions ready.`,
      recoveryCode, // Provided for user confirmation
    });
  });

  // Authentication: Reset Password (Confirm with Recovery Code)
  app.post('/api/v1/auth/reset-password', (req: Request, res: Response) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, recovery code, and new password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const resetData = passwordResetCodes.get(cleanEmail);

    if (!resetData || resetData.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Recovery code has expired or does not exist. Please request a new one.' });
    }

    if (resetData.code !== code.trim()) {
      return res.status(400).json({ error: 'Invalid recovery code. Please check and try again.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    const user = registeredUsers.get(cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update password with new cryptographic salt
    const newSalt = crypto.randomBytes(16).toString('hex');
    user.salt = newSalt;
    user.passwordHash = hashPassword(newPassword, newSalt);

    passwordResetCodes.delete(cleanEmail);

    // Invalidate existing sessions for this user to prevent unauthorized access
    for (const [t, u] of authTokens.entries()) {
      if (u.email === cleanEmail) authTokens.delete(t);
    }

    res.json({ message: 'Password updated successfully. You can now log in with your new password.' });
  });

  // Authentication: Sign Out
  app.post('/api/v1/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (token) authTokens.delete(token);
    res.json({ message: 'Logged out successfully' });
  });

  // Authentication: Me
  app.get('/api/v1/auth/me', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token || !authTokens.has(token)) {
      return res.status(401).json({ error: 'Unauthorized session' });
    }
    res.json({ user: authTokens.get(token) });
  });

  // Servers
  app.get('/api/v1/servers', (_req: Request, res: Response) => {
    res.json(servers);
  });

  app.post('/api/v1/servers', (req: Request, res: Response) => {
    const { name, ip, user = 'root', port = 22, provider = 'Custom VPS', region = 'custom' } = req.body;
    if (!name || !ip) {
      return res.status(400).json({ error: 'Server name and IP address are required' });
    }
    const newServer: ServerItem = {
      id: `srv-${Date.now().toString(36)}`,
      name,
      ip,
      user,
      port: Number(port) || 22,
      provider,
      region,
      status: 'online',
      docker_version: '27.1.1',
      proxy_type: 'Traefik v3.1',
      proxy_status: 'running',
      cpu_usage: Number((Math.random() * 15 + 5).toFixed(1)),
      memory_usage: { used: 1500, total: 8192 },
      disk_usage: { used: 18, total: 100 },
      active_containers: 0,
    };
    servers.push(newServer);
    res.status(201).json(newServer);
  });

  app.delete('/api/v1/servers/:id', (req: Request, res: Response) => {
    const idx = servers.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Server not found' });
    const removed = servers.splice(idx, 1)[0];
    res.json({ message: 'Server removed', server: removed });
  });

  // Applications
  app.get('/api/v1/applications', (_req: Request, res: Response) => {
    res.json(applications);
  });

  app.post('/api/v1/applications', (req: Request, res: Response) => {
    const {
      name,
      fqdn,
      git_repository,
      git_branch = 'main',
      build_pack = 'nixpacks',
      server_id = servers[0]?.id || 'srv-localhost',
      destination_port = 3000,
      project = 'Production Cloud',
      environment = 'production',
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Application name is required' });
    }

    const targetServer = servers.find(s => s.id === server_id) || servers[0];

    const newApp: ApplicationItem = {
      id: `app-${Date.now().toString(36)}`,
      name,
      fqdn: fqdn || `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.carnauba.cloud`,
      git_repository: git_repository || 'https://github.com/Engecema/sample-app.git',
      git_branch,
      build_pack,
      status: 'running',
      server_id: targetServer.id,
      server_name: targetServer.name,
      environment,
      project,
      destination_port: Number(destination_port) || 3000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    targetServer.active_containers += 1;
    applications.push(newApp);
    res.status(201).json(newApp);
  });

  app.post('/api/v1/applications/:id/restart', (req: Request, res: Response) => {
    const appItem = applications.find(a => a.id === req.params.id);
    if (!appItem) return res.status(404).json({ error: 'Application not found' });

    appItem.status = 'running';
    appItem.updated_at = new Date().toISOString();
    res.json({ message: `Application ${appItem.name} restarted successfully`, app: appItem });
  });

  app.post('/api/v1/applications/:id/stop', (req: Request, res: Response) => {
    const appItem = applications.find(a => a.id === req.params.id);
    if (!appItem) return res.status(404).json({ error: 'Application not found' });

    appItem.status = 'stopped';
    appItem.updated_at = new Date().toISOString();
    res.json({ message: `Application ${appItem.name} stopped`, app: appItem });
  });

  app.delete('/api/v1/applications/:id', (req: Request, res: Response) => {
    const idx = applications.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Application not found' });
    const removed = applications.splice(idx, 1)[0];
    const srv = servers.find(s => s.id === removed.server_id);
    if (srv && srv.active_containers > 0) srv.active_containers -= 1;
    res.json({ message: 'Application deleted', application: removed });
  });

  // Databases
  app.get('/api/v1/databases', (_req: Request, res: Response) => {
    res.json(databases);
  });

  app.post('/api/v1/databases', (req: Request, res: Response) => {
    const {
      name,
      type = 'postgresql',
      version = '16.4-alpine',
      server_id = servers[0]?.id || 'srv-localhost',
      port,
      db_name,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Database name is required' });

    const targetServer = servers.find(s => s.id === server_id) || servers[0];
    const defaultPorts: Record<string, number> = {
      postgresql: 5432,
      redis: 6379,
      mysql: 3306,
      mongodb: 27017,
      clickhouse: 8123,
    };

    const newDb: DatabaseItem = {
      id: `db-${Date.now().toString(36)}`,
      name,
      type,
      version: version || 'latest',
      status: 'running',
      server_id: targetServer.id,
      server_name: targetServer.name,
      port: Number(port) || defaultPorts[type] || 5432,
      db_name: db_name || `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_db`,
      db_user: 'carnauba_user',
      backup_enabled: true,
      backup_frequency: '0 3 * * * (Daily at 03:00 UTC)',
      size_mb: 120,
    };

    targetServer.active_containers += 1;
    databases.push(newDb);
    res.status(201).json(newDb);
  });

  app.delete('/api/v1/databases/:id', (req: Request, res: Response) => {
    const idx = databases.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Database not found' });
    const removed = databases.splice(idx, 1)[0];
    const srv = servers.find(s => s.id === removed.server_id);
    if (srv && srv.active_containers > 0) srv.active_containers -= 1;
    res.json({ message: 'Database deleted', database: removed });
  });

  // Services
  app.get('/api/v1/services', (_req: Request, res: Response) => {
    res.json(services);
  });

  // Deployments
  app.get('/api/v1/deployments', (_req: Request, res: Response) => {
    res.json(deployments);
  });

  app.post('/api/v1/deploy', (req: Request, res: Response) => {
    const { application_id, commit_message = 'Manual deployment triggered from dashboard' } = req.body;
    const targetApp = applications.find(a => a.id === application_id) || applications[0];

    const depId = `dep-${Math.floor(10000 + Math.random() * 90000)}`;
    const randomHex = Math.random().toString(16).substring(2, 9);

    const newDeployment: DeploymentItem = {
      id: depId,
      application_id: targetApp.id,
      application_name: targetApp.name,
      commit: randomHex,
      commit_message,
      branch: targetApp.git_branch,
      status: 'in_progress',
      logs: [
        `[${new Date().toLocaleTimeString()}] Deployment initiated for ${targetApp.name}`,
        `[${new Date().toLocaleTimeString()}] Target Server: ${targetApp.server_name}`,
        `[${new Date().toLocaleTimeString()}] Fetching source code from ${targetApp.git_repository}...`,
        `[${new Date().toLocaleTimeString()}] Commit: ${randomHex} on branch ${targetApp.git_branch}`,
        `[${new Date().toLocaleTimeString()}] Analyzing buildpack with Nixpacks / Docker daemon...`,
      ],
      created_at: new Date().toISOString(),
      duration_seconds: 0,
    };

    deployments.unshift(newDeployment);
    targetApp.status = 'building';

    // Simulate progressive deployment execution
    setTimeout(() => {
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Building container image layer [1/5]: base OS image pulled`);
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Compiling assets and bundling production artifacts`);
    }, 1200);

    setTimeout(() => {
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Image built successfully: ${targetApp.name}:${randomHex}`);
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Routing through Traefik reverse proxy on ${targetApp.fqdn}`);
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Performing HTTP health check on :${targetApp.destination_port} -> 200 OK`);
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Deployment finished successfully with zero downtime!`);
      newDeployment.status = 'finished';
      newDeployment.duration_seconds = 8;
      targetApp.status = 'running';
      targetApp.updated_at = new Date().toISOString();
    }, 3500);

    res.status(202).json({
      message: 'Deployment triggered',
      deployment: newDeployment,
    });
  });

  // Terminal & Command Executor API (Protected with Anti-Injection & Sandboxing)
  app.post('/api/v1/servers/:id/execute', (req: Request, res: Response) => {
    // Check authentication
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token || !authTokens.has(token)) {
      return res.status(401).json({ error: 'Unauthorized: Command execution requires authenticated administrator session' });
    }

    const { command } = req.body;
    const server = servers.find(s => s.id === req.params.id) || servers[0];
    const cmd = (command || '').trim();

    if (!cmd) {
      return res.status(400).json({ error: 'Command string is required' });
    }

    // Defensive check: Anti-injection & Metacharacter detection
    const dangerousPatterns = /[;&|`$><\n\r]|(\.\.\/)|(\/etc\/shadow)|(\/etc\/passwd)|(nc\s)|(curl\s)|(wget\s)|(chmod\s)|(rm\s-rf)/i;
    if (dangerousPatterns.test(cmd)) {
      return res.status(403).json({
        error: 'Execution blocked: Command contains unsafe metacharacters or dangerous patterns rejected by Carnauba Security Shield.',
        code: 'SECURITY_INSPECTION_VIOLATION',
      });
    }

    // Safe command allowlist
    const normalized = cmd.toLowerCase();
    let output = '';

    if (normalized.startsWith('docker ps')) {
      output = `CONTAINER ID   IMAGE                               COMMAND                  CREATED         STATUS         PORTS                    NAMES
8f921ab04c1    carnauba-api:latest                 "docker-entrypoint.s…"   2 days ago      Up 2 days      0.0.0.0:3000->3000/tcp   carnauba-api-1
7a2b0c3d4e5    postgres:16.4-alpine                "docker-entrypoint.s…"   5 days ago      Up 5 days      0.0.0.0:5432->5432/tcp   carnauba-postgres
5e4d3c2b1a0    traefik:v3.1                        "/entrypoint.sh trae…"   12 days ago     Up 12 days     0.0.0.0:80->80/tcp       carnauba-proxy
11a22b33c44    carnauba/sentinel:latest            "/sentinel"              12 days ago     Up 12 days                              carnauba-sentinel`;
    } else if (normalized.startsWith('docker stats')) {
      output = `CONTAINER ID   NAME                 CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O         PIDS
8f921ab04c1    carnauba-api-1       1.24%     284MiB / 15.63GiB     1.77%     84.2MB / 120MB    12.4MB / 4.1MB    28
7a2b0c3d4e5    carnauba-postgres    0.45%     412MiB / 15.63GiB     2.57%     14.5MB / 9.8MB    84.1MB / 18.2MB   14
5e4d3c2b1a0    carnauba-proxy       0.12%     94MiB / 15.63GiB      0.58%     240MB / 310MB     4.1MB / 820kB     9`;
    } else if (normalized.startsWith('docker logs')) {
      output = `[carnauba-system] Traefik TLS automatic certificate renewal active
[carnauba-system] Sentinel daemon listening on socket /var/run/docker.sock
[carnauba-system] Health check probes responding: 200 OK (all services nominal)`;
    } else if (normalized === 'uptime') {
      output = ` 12:54:19 up 14 days,  3:22,  2 users,  load average: 0.18, 0.22, 0.19`;
    } else if (normalized === 'free -m' || normalized === 'free -h') {
      output = `               total        used        free      shared  buff/cache   available
Mem:           16384        3840        9120         180        3424       12150
Swap:           4096         120        3976`;
    } else if (normalized === 'df -h') {
      output = `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       250G   42G  196G  18% /
tmpfs           8.0G     0  8.0G   0% /dev/shm
/dev/sda2       100M  6.2M   94M   7% /boot/efi`;
    } else if (normalized.includes('carnauba')) {
      output = `Carnauba Engine v4.0.0-beta.392 (Production Hardened)
Security Shield: Active (Anti-injection, Rate Limiting, RBAC)
Proxy: Traefik v3.1 (healthy)
Sentinel: Active (polling every 10s)
Docker: Docker Engine v27.1.1 (API 1.46)`;
    } else {
      output = `[carnauba@${server.name}]: Executed: ${cmd.replace(/[^a-zA-Z0-9 _-]/g, '')}\nDiagnostic inspection completed safely with exit code 0.`;
    }

    res.json({
      server_id: server.id,
      command: cmd,
      stdout: output,
      stderr: '',
      exit_code: 0,
      timestamp: new Date().toISOString(),
    });
  });

  // Vite Integration
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Carnauba Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
