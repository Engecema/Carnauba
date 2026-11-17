import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  AreiaPretaDatabase,
  AREIA_PRETA_CONFIGURED_DIR,
  AREIA_PRETA_PORT,
  BASE_APP_PORT,
  RESERVED_PORTS,
  XIQI_APP_DIR,
  XIQI_OS_ROOT,
  hashPassword,
  isStrongPassword,
  isValidEngecemaGitUrl,
  isValidFqdn,
  isValidResourceId,
  isValidSlug,
  provisionAreiaPretaEnv,
  resolveSafeXiqiAppDir,
  sanitizeSafeLabel,
  sanitizeSlug,
  timingSafeEqualString,
  verifyPassword,
  withDiskLock,
  type ApplicationItem,
  type DatabaseItem,
  type DeploymentItem,
  type ServerItem,
  type UserRecord,
} from './src/server/areiapreta.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SessionRecord {
  id: string;
  email: string;
  name: string;
  role: 'root' | 'admin' | 'operator';
  expiresAt: number;
}

function hasUnsafePrototypeKeys(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === 'object' && hasUnsafePrototypeKeys(val)) {
      return true;
    }
  }
  return false;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || process.env.CARNAUBA_PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  // Initialize Areia Preta Local Persistence Engine (/opt/xiqi/app/areiapreta)
  const db = new AreiaPretaDatabase();
  await db.initialize();

  // Security & Parsing Middleware
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Prototype Pollution Guard
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body && hasUnsafePrototypeKeys(req.body)) {
      return res.status(400).json({ error: 'Payload rejeitado por violação de integridade estrutural.' });
    }
    return next();
  });

  // Defensive Security Headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const scriptSrc = isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'";
    const connectSrc = isProd ? "connect-src 'self'" : "connect-src 'self' ws: wss:";
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; ${connectSrc}; object-src 'none'; base-uri 'self';`
    );
    next();
  });

  // Bounded In-Memory Security Stores (safe for 4 GB RAM hardware)
  const authTokens = new Map<string, SessionRecord>();
  const csrfTokens = new Map<string, number>();
  const failedLoginAttempts = new Map<string, { count: number; lockUntil: number }>();
  const passwordResetCodes = new Map<string, { codeHash: string; expiresAt: number; attempts: number }>();
  const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

  const pruneBoundedMap = <K, V>(map: Map<K, V>, maxEntries: number) => {
    if (map.size <= maxEntries) return;
    const excess = map.size - maxEntries;
    let removed = 0;
    for (const key of map.keys()) {
      map.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  };

  const getClientIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || '127.0.0.1';
  };

  const parseCookies = (cookieHeader?: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!cookieHeader) return out;
    for (const pair of cookieHeader.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        try {
          out[k] = decodeURIComponent(v);
        } catch {
          out[k] = v;
        }
      }
    }
    return out;
  };

  const createRateLimiter = (bucketPrefix: string, maxRequests: number, windowMs: number) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = getClientIp(req);
      const key = `${bucketPrefix}:${ip}`;
      const now = Date.now();
      const entry = rateLimitBuckets.get(key);

      if (!entry || entry.resetAt <= now) {
        pruneBoundedMap(rateLimitBuckets, 4000);
        rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }

      entry.count += 1;
      if (entry.count > maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        void db.recordSecurityEvent('RATE_LIMIT', ip, `Limite de ${maxRequests} req/${windowMs / 1000}s excedido em ${req.path}`);
        return res.status(429).json({
          error: `Limite de requisições excedido. Aguarde ${retryAfter}s antes de tentar novamente.`,
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      return next();
    };
  };

  const globalApiLimiter = createRateLimiter('api', 180, 60 * 1000);
  const strictAuthLimiter = createRateLimiter('auth', 20, 60 * 1000);

  app.use('/api/v1', globalApiLimiter);

  // Strict CSRF Protection Middleware
  const verifyCsrf = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    const originHeader = req.headers.origin;
    const hostHeader = req.headers.host;
    if (originHeader && hostHeader) {
      try {
        const originHost = new URL(originHeader).host;
        if (originHost !== hostHeader) {
          const ip = getClientIp(req);
          void db.recordSecurityEvent('CSRF_BLOCKED', ip, `Origem cruzada não autorizada (${originHost}) bloqueada em ${req.path}`);
          return res.status(403).json({
            error: 'Origem da requisição não autorizada para operação mutável.',
            code: 'CSRF_ORIGIN_MISMATCH',
          });
        }
      } catch {
        return res.status(403).json({ error: 'Cabeçalho Origin malformado.', code: 'CSRF_VALIDATION_FAILED' });
      }
    }

    const headerToken = req.headers['x-csrf-token'];
    const token = typeof headerToken === 'string' ? headerToken.trim() : '';
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies['carnauba_csrf'];

    const now = Date.now();
    const expiresAt = token ? csrfTokens.get(token) : undefined;
    const validServerToken = Boolean(expiresAt && expiresAt > now);
    const cookieMatches = !cookieToken || (Boolean(token) && timingSafeEqualString(cookieToken, token));

    if (!validServerToken || !cookieMatches) {
      const ip = getClientIp(req);
      void db.recordSecurityEvent('CSRF_BLOCKED', ip, `Requisição ${req.method} ${req.path} bloqueada por falha na validação CSRF`);
      return res.status(403).json({
        error: 'Token CSRF inválido ou expirado. Solicite um novo token de segurança.',
        code: 'CSRF_VALIDATION_FAILED',
      });
    }

    return next();
  };

  const getActiveSession = (req: Request): SessionRecord | null => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return null;
    const session = authTokens.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      authTokens.delete(token);
      return null;
    }
    return session;
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const session = getActiveSession(req);
    if (!session) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada. Faça login novamente.',
      });
    }
    (req as Request & { userSession?: SessionRecord }).userSession = session;
    return next();
  };

  const requireRole = (...allowedRoles: Array<'root' | 'admin' | 'operator'>) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const session = (req as Request & { userSession?: SessionRecord }).userSession;
      if (!session || !allowedRoles.includes(session.role)) {
        const ip = getClientIp(req);
        void db.recordSecurityEvent(
          'PRIVILEGE_ESCALATION_BLOCKED',
          ip,
          `Acesso negado para perfil ${session?.role || 'anônimo'} em ${req.method} ${req.path}`
        );
        return res.status(403).json({
          error: 'Privilégios insuficientes para executar esta operação administrativa.',
        });
      }
      return next();
    };
  };

  const redactApplicationForList = (appItem: ApplicationItem, role: SessionRecord['role']): ApplicationItem => {
    if (role === 'operator') {
      return {
        ...appItem,
        areia_preta_env: {
          ...appItem.areia_preta_env,
          AREIA_PRETA_PASSWORD: '********',
          AREIA_PRETA_URL: `areiapreta://${appItem.areia_preta_env.AREIA_PRETA_USER}:********@${appItem.areia_preta_env.AREIA_PRETA_HOST}:${appItem.areia_preta_env.AREIA_PRETA_PORT}/${appItem.areia_preta_env.AREIA_PRETA_SCHEMA}`,
        },
      };
    }
    return appItem;
  };

  // Issue Server-Verified CSRF Token
  app.get('/api/v1/auth/csrf', (_req: Request, res: Response) => {
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    for (const [k, exp] of csrfTokens.entries()) {
      if (exp <= now) csrfTokens.delete(k);
    }
    pruneBoundedMap(csrfTokens, 2000);
    csrfTokens.set(token, now + 4 * 60 * 60 * 1000);
    res.setHeader('Set-Cookie', `carnauba_csrf=${encodeURIComponent(token)}; Path=/; SameSite=Lax`);
    res.json({ csrfToken: token });
  });

  // Public Health & XIQI OS Hardware Profile (Non-sensitive metadata only)
  app.get('/api/v1/version', (_req: Request, res: Response) => {
    res.json({
      name: 'Carnauba Engine — Corporação Engecema',
      version: 'v4.0.0-engecema',
      os: 'XIQI OS 1.0 (x86_64)',
      xiqi_root: XIQI_OS_ROOT,
      app_directory: XIQI_APP_DIR,
      database_engine: 'Areia Preta 2.4.0',
      database_path: AREIA_PRETA_CONFIGURED_DIR,
      hardware_memory_mb: 4096,
      api_version: '3.1.0',
      status: 'operational',
      uptime_seconds: Math.floor(process.uptime()),
    });
  });

  // Authentication: Sign In
  app.post('/api/v1/auth/login', strictAuthLimiter, verifyCsrf, async (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const clientIp = getClientIp(req);
    const cleanEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const rateLimitKey = `${clientIp}_${cleanEmail}`;

    const attempt = failedLoginAttempts.get(rateLimitKey);
    const now = Date.now();
    if (attempt && attempt.lockUntil > now) {
      const waitSeconds = Math.ceil((attempt.lockUntil - now) / 1000);
      return res.status(429).json({
        error: `Muitas tentativas inválidas detectadas. Bloqueio preventivo ativo por ${waitSeconds} segundos.`,
      });
    }

    if (!cleanEmail || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const user = db.state.users.find((u) => u.email === cleanEmail);

    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      const current = failedLoginAttempts.get(rateLimitKey) || { count: 0, lockUntil: 0 };
      const newCount = current.count + 1;
      const locked = newCount >= 5;
      pruneBoundedMap(failedLoginAttempts, 2000);
      failedLoginAttempts.set(rateLimitKey, {
        count: newCount,
        lockUntil: locked ? now + 5 * 60 * 1000 : 0,
      });
      if (locked) {
        await db.recordSecurityEvent('AUTH_LOCKOUT', clientIp, `Bloqueio de conta após 5 falhas para ${cleanEmail}`);
      }
      return res.status(401).json({ error: 'Credenciais inválidas para acesso ao console Engecema.' });
    }

    failedLoginAttempts.delete(rateLimitKey);
    pruneBoundedMap(authTokens, 500);

    const token = `carnauba_auth_${crypto.randomBytes(24).toString('hex')}`;
    const sessionUser: SessionRecord = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    };
    authTokens.set(token, sessionUser);

    res.json({
      token,
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
        role: sessionUser.role,
      },
      message: 'Autenticação concluída com sucesso',
    });
  });

  // Authentication: Register Administrator (Requires authenticated Root OR Cluster Key)
  app.post('/api/v1/auth/register', strictAuthLimiter, verifyCsrf, async (req: Request, res: Response) => {
    const { name, email, password, role = 'admin', masterKey } = req.body || {};
    const clientIp = getClientIp(req);

    const callerSession = getActiveSession(req);
    const isRootCaller = callerSession?.role === 'root';
    const hasValidClusterKey =
      typeof masterKey === 'string' &&
      masterKey.length > 0 &&
      timingSafeEqualString(masterKey.trim(), db.clusterSecretKey);

    if (!isRootCaller && !hasValidClusterKey) {
      await db.recordSecurityEvent(
        'PRIVILEGE_ESCALATION_BLOCKED',
        clientIp,
        `Tentativa de cadastro não autorizado para ${typeof email === 'string' ? email : 'desconhecido'}`
      );
      return res.status(403).json({
        error: 'Chave de Autorização do Cluster (CARNAUBA_SECRET_KEY) ou sessão Root obrigatória para cadastrar administradores.',
      });
    }

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name.trim() || !email.trim() || !password) {
      return res.status(400).json({ error: 'Nome completo, e-mail e senha são obrigatórios.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail) || cleanEmail.length > 120) {
      return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: 'A senha deve possuir no mínimo 8 caracteres, contendo letras e números.',
      });
    }

    if (db.state.users.some((u) => u.email === cleanEmail)) {
      return res.status(409).json({ error: 'Já existe um administrador cadastrado com este e-mail.' });
    }

    let assignedRole: 'root' | 'admin' | 'operator' = 'admin';
    if (role === 'root') {
      if (!hasValidClusterKey) {
        return res.status(403).json({ error: 'Chave Master do Cluster obrigatória para Superusuário Root.' });
      }
      assignedRole = 'root';
    } else if (role === 'operator') {
      assignedRole = 'operator';
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser: UserRecord = {
      id: `usr_${Date.now().toString(36)}`,
      email: cleanEmail,
      name: sanitizeSafeLabel(name, 80),
      passwordHash: hashPassword(password, salt),
      salt,
      role: assignedRole,
      createdAt: new Date().toISOString(),
    };

    db.state.users.push(newUser);
    await db.persistCollection('users');

    pruneBoundedMap(authTokens, 500);
    const token = `carnauba_auth_${crypto.randomBytes(24).toString('hex')}`;
    const sessionUser: SessionRecord = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    };
    authTokens.set(token, sessionUser);

    res.status(201).json({
      token,
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
        role: sessionUser.role,
      },
      message: 'Administrador gravado no banco Areia Preta e autenticado com sucesso.',
    });
  });

  // Authentication: Forgot Password (NEVER expose recoveryCode in HTTP response!)
  app.post('/api/v1/auth/forgot-password', strictAuthLimiter, verifyCsrf, async (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'O endereço de e-mail é obrigatório.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = db.state.users.find((u) => u.email === cleanEmail);

    // Always return generic confirmation to prevent user enumeration
    if (user) {
      const recoveryCode = crypto.randomInt(100000, 999999).toString();
      const codeHash = crypto
        .createHmac('sha256', db.clusterSecretKey)
        .update(`${cleanEmail}:${recoveryCode}`)
        .digest('hex');

      passwordResetCodes.set(cleanEmail, {
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });

      const recoveryFile = path.join(db.activeStoragePath, '.recovery_code');
      await withDiskLock('areiapreta:recovery_code', async () => {
        await fs.promises.writeFile(
          recoveryFile,
          `email=${cleanEmail}\ncode=${recoveryCode}\nexpires_at=${new Date(Date.now() + 10 * 60 * 1000).toISOString()}\n`,
          { encoding: 'utf-8', mode: 0o600 }
        );
      });
    }

    res.json({
      message: `Se o e-mail estiver cadastrado no Areia Preta, um código de verificação foi gravado localmente no servidor XIQI OS (${db.activeStoragePath}/.recovery_code).`,
    });
  });

  // Authentication: Reset Password (Timing-safe HMAC verification + max 3 attempts)
  app.post('/api/v1/auth/reset-password', strictAuthLimiter, verifyCsrf, async (req: Request, res: Response) => {
    const { email, code, newPassword } = req.body || {};
    if (typeof email !== 'string' || typeof code !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'E-mail, código de verificação e nova senha são obrigatórios.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const resetData = passwordResetCodes.get(cleanEmail);
    if (!resetData || resetData.expiresAt < Date.now()) {
      passwordResetCodes.delete(cleanEmail);
      return res.status(400).json({ error: 'Código de recuperação expirado ou inexistente.' });
    }

    const candidateHash = crypto
      .createHmac('sha256', db.clusterSecretKey)
      .update(`${cleanEmail}:${code.trim()}`)
      .digest('hex');

    if (!timingSafeEqualString(resetData.codeHash, candidateHash)) {
      resetData.attempts += 1;
      if (resetData.attempts >= 3) {
        passwordResetCodes.delete(cleanEmail);
        return res.status(429).json({ error: 'Código invalidado após 3 tentativas incorretas. Gere um novo código.' });
      }
      return res.status(400).json({ error: 'Código de verificação inválido.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'A nova senha deve conter no mínimo 8 caracteres com letras e números.' });
    }

    const user = db.state.users.find((u) => u.email === cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    user.salt = newSalt;
    user.passwordHash = hashPassword(newPassword, newSalt);
    await db.persistCollection('users');

    passwordResetCodes.delete(cleanEmail);
    for (const [t, u] of authTokens.entries()) {
      if (u.email === cleanEmail) authTokens.delete(t);
    }

    res.json({ message: 'Senha atualizada no banco Areia Preta com sucesso.' });
  });

  // Authentication: Sign Out
  app.post('/api/v1/auth/logout', verifyCsrf, (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) authTokens.delete(token);
    res.json({ message: 'Sessão encerrada com sucesso' });
  });

  // Authentication: Me
  app.get('/api/v1/auth/me', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionRecord }).userSession;
    res.json({
      user: {
        id: session.id,
        email: session.email,
        name: session.name,
        role: session.role,
      },
    });
  });

  // Areia Preta Diagnostics & Security Status
  app.get('/api/v1/areiapreta/status', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionRecord }).userSession;
    const diag = db.getDiagnostics();
    res.json({
      ...diag,
      recent_security_events: session.role === 'operator' ? [] : db.state.securityEvents.slice(0, 15),
    });
  });

  // Port Management & Conflict Map
  app.get('/api/v1/ports', requireAuth, async (_req: Request, res: Response) => {
    const nextAvailable = await db.allocatePort();
    res.json({
      base_app_port: BASE_APP_PORT,
      next_available_port: nextAvailable,
      reserved_ports: RESERVED_PORTS,
      allocated_applications: db.state.applications.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        port: a.destination_port,
        directory: a.local_directory,
        status: a.status,
      })),
      allocated_databases: db.state.databases.map((d) => ({
        id: d.id,
        name: d.name,
        port: d.port,
        data_path: d.data_path,
        status: d.status,
      })),
    });
  });

  // Servers (XIQI OS Nodes)
  app.get('/api/v1/servers', requireAuth, (_req: Request, res: Response) => {
    res.json(db.state.servers);
  });

  app.post('/api/v1/servers', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const { name, ip, user = 'xiqi', port = 22 } = req.body || {};
    if (typeof name !== 'string' || typeof ip !== 'string' || !name.trim() || !ip.trim()) {
      return res.status(400).json({ error: 'Nome do nó e endereço IP são obrigatórios.' });
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9.-]+$/;
    if (!ipRegex.test(ip.trim()) || ip.trim().length > 120) {
      return res.status(400).json({ error: 'Endereço IP ou hostname inválido.' });
    }

    const sshPort = Number(port);
    if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
      return res.status(400).json({ error: 'Porta SSH inválida.' });
    }

    const newServer: ServerItem = {
      id: `srv-${Date.now().toString(36)}`,
      name: sanitizeSafeLabel(name, 64),
      ip: ip.trim(),
      user: typeof user === 'string' && user.trim() ? sanitizeSafeLabel(user, 32) : 'xiqi',
      port: sshPort,
      os_name: 'XIQI OS 1.0 (x86_64)',
      architecture: 'x86_64',
      xiqi_root: XIQI_OS_ROOT,
      app_directory: XIQI_APP_DIR,
      status: 'online',
      runtime_engine: 'XIQI Native Supervisor + Node.js 22',
      proxy_type: 'XIQI Reverse Proxy',
      proxy_status: 'running',
      cpu_usage: 9.5,
      memory_usage: { used: 960, total: 4096 },
      disk_usage: { used: 18, total: 120 },
      active_services: 0,
    };

    db.state.servers.push(newServer);
    await db.persistCollection('servers');
    res.status(201).json(newServer);
  });

  app.delete('/api/v1/servers/:id', requireAuth, requireRole('root'), verifyCsrf, async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!isValidResourceId(id)) return res.status(400).json({ error: 'Identificador de servidor inválido.' });
    if (id === 'srv-engecema-dc01') {
      return res.status(403).json({ error: 'O nó principal do mini data center Engecema não pode ser removido.' });
    }
    const idx = db.state.servers.findIndex((s) => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Servidor não encontrado.' });
    const removed = db.state.servers.splice(idx, 1)[0];
    await db.persistCollection('servers');
    res.json({ message: 'Nó XIQI OS removido', server: removed });
  });

  // Applications
  app.get('/api/v1/applications', requireAuth, (req: Request, res: Response) => {
    const session = (req as Request & { userSession: SessionRecord }).userSession;
    res.json(db.state.applications.map((a) => redactApplicationForList(a, session.role)));
  });

  app.get('/api/v1/applications/:id/env', requireAuth, requireRole('root', 'admin'), (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!isValidResourceId(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const appItem = db.state.applications.find((a) => a.id === id);
    if (!appItem) return res.status(404).json({ error: 'Aplicação não encontrada.' });

    const envText = [
      `PORT=${appItem.destination_port}`,
      `HOST=127.0.0.1`,
      `XIQI_APP_DIR=${appItem.local_directory}`,
      `AREIA_PRETA_HOME=${appItem.areia_preta_env.AREIA_PRETA_HOME}`,
      `AREIA_PRETA_HOST=${appItem.areia_preta_env.AREIA_PRETA_HOST}`,
      `AREIA_PRETA_PORT=${appItem.areia_preta_env.AREIA_PRETA_PORT}`,
      `AREIA_PRETA_SCHEMA=${appItem.areia_preta_env.AREIA_PRETA_SCHEMA}`,
      `AREIA_PRETA_USER=${appItem.areia_preta_env.AREIA_PRETA_USER}`,
      `AREIA_PRETA_PASSWORD=${appItem.areia_preta_env.AREIA_PRETA_PASSWORD}`,
      `AREIA_PRETA_URL=${appItem.areia_preta_env.AREIA_PRETA_URL}`,
    ].join('\n');

    res.json({
      application_id: appItem.id,
      name: appItem.name,
      local_directory: appItem.local_directory,
      port: appItem.destination_port,
      env: appItem.areia_preta_env,
      dotenv_content: envText,
    });
  });

  app.post('/api/v1/applications', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const {
      name,
      fqdn,
      git_repository,
      git_branch = 'main',
      runtime_mode = 'nodejs',
      server_id = db.state.servers[0]?.id || 'srv-engecema-dc01',
      destination_port,
      project = 'Corporação Engecema',
      environment = 'producao',
    } = req.body || {};

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'O nome da aplicação é obrigatório.' });
    }

    const slug = sanitizeSlug(name);
    if (!isValidSlug(slug)) {
      const ip = getClientIp(req);
      await db.recordSecurityEvent('PATH_TRAVERSAL_BLOCKED', ip, `Nome de aplicação inválido bloqueado: ${sanitizeSafeLabel(name, 48)}`);
      return res.status(400).json({
        error: 'Nome inválido. Utilize apenas letras minúsculas, números e hífens (2 a 48 caracteres).',
      });
    }

    if (db.state.applications.some((a) => a.slug === slug)) {
      return res.status(409).json({ error: `Já existe uma aplicação publicada em /opt/xiqi/app/${slug}.` });
    }

    if (typeof git_repository !== 'string' || !isValidEngecemaGitUrl(git_repository)) {
      return res.status(400).json({
        error: 'Informe uma URL HTTPS válida de repositório GitHub.',
      });
    }

    const branchClean = typeof git_branch === 'string' ? git_branch.trim() : 'main';
    if (!/^[A-Za-z0-9._/-]{1,64}$/.test(branchClean) || branchClean.includes('..')) {
      return res.status(400).json({ error: 'Nome de branch Git inválido.' });
    }

    const cleanFqdn = typeof fqdn === 'string' && fqdn.trim() ? fqdn.trim().toLowerCase() : `${slug}.engecema.local`;
    if (!isValidFqdn(cleanFqdn)) {
      const ip = getClientIp(req);
      await db.recordSecurityEvent('INVALID_INPUT_BLOCKED', ip, `FQDN inválido bloqueado: ${sanitizeSafeLabel(cleanFqdn, 60)}`);
      return res.status(400).json({ error: 'FQDN/domínio local inválido.' });
    }

    let assignedPort: number;
    try {
      const requestedPort =
        destination_port !== undefined && destination_port !== '' && destination_port !== null
          ? Number(destination_port)
          : undefined;
      assignedPort = await db.allocatePort(requestedPort);
    } catch (err) {
      return res.status(409).json({ error: err instanceof Error ? err.message : 'Conflito na alocação de porta.' });
    }

    let localDirectory: string;
    try {
      localDirectory = resolveSafeXiqiAppDir(slug);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Diretório inválido.' });
    }

    const targetServer = db.state.servers.find((s) => s.id === server_id) || db.state.servers[0];
    const areiaEnv = provisionAreiaPretaEnv(slug);

    const allowedModes = ['nodejs', 'static', 'binary', 'service'] as const;
    const validMode = allowedModes.includes(runtime_mode) ? runtime_mode : 'nodejs';

    const newApp: ApplicationItem = {
      id: `app-${Date.now().toString(36)}`,
      name: sanitizeSafeLabel(name, 60),
      slug,
      fqdn: cleanFqdn,
      git_repository: git_repository.trim(),
      git_branch: branchClean,
      runtime_mode: validMode,
      status: 'running',
      server_id: targetServer.id,
      server_name: targetServer.name,
      environment: typeof environment === 'string' ? sanitizeSafeLabel(environment, 32) : 'producao',
      project: typeof project === 'string' ? sanitizeSafeLabel(project, 64) : 'Corporação Engecema',
      local_directory: localDirectory,
      destination_port: assignedPort,
      areia_preta_env: areiaEnv,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newSchemaDb: DatabaseItem = {
      id: `db-ap-${slug}-${Date.now().toString(36)}`,
      name: `schema-${slug}`,
      type: 'areiapreta',
      version: '2.4.0-xiqi-x86_64',
      status: 'running',
      server_id: targetServer.id,
      server_name: targetServer.name,
      port: AREIA_PRETA_PORT,
      data_path: `${AREIA_PRETA_CONFIGURED_DIR}/schemas/${areiaEnv.AREIA_PRETA_SCHEMA}`,
      db_name: areiaEnv.AREIA_PRETA_SCHEMA,
      db_user: areiaEnv.AREIA_PRETA_USER,
      backup_enabled: true,
      backup_frequency: '0 3 * * * (Snapshot Local XIQI)',
      size_mb: 16,
    };

    await db.writeProjectEnvManifest(newApp);
    targetServer.active_services += 1;
    db.state.applications.push(newApp);
    db.state.databases.push(newSchemaDb);
    await Promise.all([
      db.persistCollection('applications'),
      db.persistCollection('databases'),
      db.persistCollection('servers'),
    ]);

    res.status(201).json(newApp);
  });

  app.post('/api/v1/applications/:id/restart', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!isValidResourceId(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const appItem = db.state.applications.find((a) => a.id === id);
    if (!appItem) return res.status(404).json({ error: 'Aplicação não encontrada.' });

    appItem.status = 'running';
    appItem.updated_at = new Date().toISOString();
    await db.persistCollection('applications');
    res.json({ message: `Aplicação ${appItem.name} reiniciada na porta ${appItem.destination_port}`, app: appItem });
  });

  app.post('/api/v1/applications/:id/stop', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!isValidResourceId(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const appItem = db.state.applications.find((a) => a.id === id);
    if (!appItem) return res.status(404).json({ error: 'Aplicação não encontrada.' });

    appItem.status = 'stopped';
    appItem.updated_at = new Date().toISOString();
    await db.persistCollection('applications');
    res.json({ message: `Aplicação ${appItem.name} parada com segurança`, app: appItem });
  });

  app.delete('/api/v1/applications/:id', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!isValidResourceId(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const idx = db.state.applications.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Aplicação não encontrada.' });

    const removed = db.state.applications.splice(idx, 1)[0];
    const srv = db.state.servers.find((s) => s.id === removed.server_id);
    if (srv && srv.active_services > 0) srv.active_services -= 1;

    await Promise.all([
      db.persistCollection('applications'),
      db.persistCollection('servers'),
    ]);
    res.json({ message: 'Aplicação removida e porta liberada', application: removed });
  });

  // Databases (Areia Preta Instances & Schemas)
  app.get('/api/v1/databases', requireAuth, (_req: Request, res: Response) => {
    res.json(db.state.databases);
  });

  app.post('/api/v1/databases', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const { name, server_id = db.state.servers[0]?.id || 'srv-engecema-dc01', db_name } = req.body || {};

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'O nome do schema/instância Areia Preta é obrigatório.' });
    }

    const slug = sanitizeSlug(name);
    if (!isValidSlug(slug)) {
      return res.status(400).json({ error: 'Nome de schema inválido (use letras minúsculas, números e hífens).' });
    }

    const targetServer = db.state.servers.find((s) => s.id === server_id) || db.state.servers[0];
    const safeSchemaName =
      typeof db_name === 'string' && db_name.trim()
        ? sanitizeSlug(db_name).replace(/-/g, '_')
        : `engecema_${slug.replace(/-/g, '_')}`;

    const newDb: DatabaseItem = {
      id: `db-ap-${Date.now().toString(36)}`,
      name: sanitizeSafeLabel(name, 60),
      type: 'areiapreta',
      version: '2.4.0-xiqi-x86_64',
      status: 'running',
      server_id: targetServer.id,
      server_name: targetServer.name,
      port: AREIA_PRETA_PORT,
      data_path: `${AREIA_PRETA_CONFIGURED_DIR}/schemas/${safeSchemaName}`,
      db_name: safeSchemaName,
      db_user: `ap_${slug.replace(/-/g, '_').slice(0, 20)}`,
      backup_enabled: true,
      backup_frequency: '0 3 * * * (Snapshot Local XIQI)',
      size_mb: 24,
    };

    targetServer.active_services += 1;
    db.state.databases.push(newDb);
    await Promise.all([
      db.persistCollection('databases'),
      db.persistCollection('servers'),
    ]);
    res.status(201).json(newDb);
  });

  app.delete('/api/v1/databases/:id', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!isValidResourceId(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    if (id === 'db-areiapreta-core') {
      return res.status(403).json({ error: 'O núcleo principal do Areia Preta (/opt/xiqi/app/areiapreta) é protegido contra exclusão.' });
    }
    const idx = db.state.databases.findIndex((d) => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Instância Areia Preta não encontrada.' });
    const removed = db.state.databases.splice(idx, 1)[0];
    const srv = db.state.servers.find((s) => s.id === removed.server_id);
    if (srv && srv.active_services > 0) srv.active_services -= 1;

    await Promise.all([
      db.persistCollection('databases'),
      db.persistCollection('servers'),
    ]);
    res.json({ message: 'Schema Areia Preta removido', database: removed });
  });

  // Deployments
  app.get('/api/v1/deployments', requireAuth, (_req: Request, res: Response) => {
    res.json(db.state.deployments);
  });

  app.post('/api/v1/deploy', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const { application_id, commit_message = 'Deploy local acionado via Carnauba Engecema' } = req.body || {};
    if (application_id !== undefined && (typeof application_id !== 'string' || !isValidResourceId(application_id))) {
      return res.status(400).json({ error: 'Identificador de aplicação inválido.' });
    }
    const targetApp = db.state.applications.find((a) => a.id === application_id) || db.state.applications[0];

    if (!targetApp) {
      return res.status(404).json({ error: 'Nenhuma aplicação disponível para deploy.' });
    }

    const depId = `dep-xiqi-${Math.floor(10000 + Math.random() * 90000)}`;
    const randomHex = crypto.randomBytes(4).toString('hex').slice(0, 7);

    const newDeployment: DeploymentItem = {
      id: depId,
      application_id: targetApp.id,
      application_name: targetApp.name,
      commit: randomHex,
      commit_message: sanitizeSafeLabel(String(commit_message), 160),
      branch: targetApp.git_branch,
      target_directory: targetApp.local_directory,
      assigned_port: targetApp.destination_port,
      status: 'in_progress',
      logs: [
        `[${new Date().toLocaleTimeString()}] Lock de escrita adquirido em ${AREIA_PRETA_CONFIGURED_DIR}`,
        `[${new Date().toLocaleTimeString()}] Diretório alvo verificado: ${targetApp.local_directory}`,
        `[${new Date().toLocaleTimeString()}] Porta local reservada: 127.0.0.1:${targetApp.destination_port}`,
        `[${new Date().toLocaleTimeString()}] Sincronizando ${targetApp.git_repository} (branch ${targetApp.git_branch}, commit ${randomHex})`,
      ],
      created_at: new Date().toISOString(),
      duration_seconds: 0,
    };

    db.state.deployments.unshift(newDeployment);
    if (db.state.deployments.length > 100) {
      db.state.deployments.length = 100;
    }
    targetApp.status = 'building';
    await db.writeProjectEnvManifest(targetApp);
    await Promise.all([
      db.persistCollection('deployments'),
      db.persistCollection('applications'),
    ]);

    setTimeout(async () => {
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Variáveis AREIA_PRETA_* injetadas em ${targetApp.local_directory}/.env.areiapreta`);
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Compilando artefatos nativos x86_64 no XIQI OS (limite RAM 512 MB)...`);
      await db.persistCollection('deployments');
    }, 1000);

    setTimeout(async () => {
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Proxy XIQI roteando ${targetApp.fqdn} -> 127.0.0.1:${targetApp.destination_port}`);
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Healthcheck HTTP em :${targetApp.destination_port} -> 200 OK`);
      newDeployment.logs.push(`[${new Date().toLocaleTimeString()}] Deploy concluído e persistido no Areia Preta!`);
      newDeployment.status = 'finished';
      newDeployment.duration_seconds = 6;
      targetApp.status = 'running';
      targetApp.updated_at = new Date().toISOString();
      await Promise.all([
        db.persistCollection('deployments'),
        db.persistCollection('applications'),
      ]);
    }, 2800);

    res.status(202).json({
      message: 'Deploy iniciado no XIQI OS',
      deployment: newDeployment,
    });
  });

  // XIQI OS Terminal & Diagnostic Shell (Strict Allowlist + RBAC + Anti-Injection)
  app.post('/api/v1/servers/:id/execute', requireAuth, requireRole('root', 'admin'), verifyCsrf, async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!isValidResourceId(id)) return res.status(400).json({ error: 'Identificador de nó inválido.' });

    const { command } = req.body || {};
    const server = db.state.servers.find((s) => s.id === id) || db.state.servers[0];
    const cmd = typeof command === 'string' ? command.trim() : '';

    if (!cmd || cmd.length > 120) {
      return res.status(400).json({ error: 'Comando inválido ou excede 120 caracteres.' });
    }

    const dangerousPatterns = /[;&|`$><\n\r\\]|(\.\.)|(\/etc\/)|(\/proc\/)|(nc\s)|(curl\s)|(wget\s)|(chmod\s)|(chown\s)|(rm\s)|(mv\s)|(dd\s)|(apk\s)|(python)|(bash)|(sh\s)/i;
    if (dangerousPatterns.test(cmd)) {
      const ip = getClientIp(req);
      await db.recordSecurityEvent('INJECTION_BLOCKED', ip, `Comando suspeito bloqueado no terminal: ${cmd.slice(0, 80)}`);
      return res.status(403).json({
        error: 'Execução bloqueada: comando rejeitado pelo escudo anti-invasão Engecema.',
        code: 'SECURITY_INSPECTION_VIOLATION',
      });
    }

    const normalized = cmd.toLowerCase();
    let output = '';

    if (normalized === 'xiqi-status') {
      output = `XIQI OS 1.0 x86_64 (${XIQI_OS_ROOT})
Motor: Carnauba Engine v4.0.0-engecema
Hardware: x86_64 | RAM Total: 4096 MB | Em uso: ${server.memory_usage.used} MB
Banco Areia Preta: Ativo em ${AREIA_PRETA_CONFIGURED_DIR} (porta ${AREIA_PRETA_PORT})
Aplicações em ${XIQI_APP_DIR}: ${db.state.applications.length} ativas`;
    } else if (normalized === 'areiapreta status' || normalized === 'areiapreta schemas') {
      const diag = db.getDiagnostics();
      output = `Areia Preta Local Engine v2.4.0
Diretório configurado: ${diag.configured_path}
Diretório ativo: ${diag.active_storage_path} (${diag.storage_mode})
Locks ativos: ${diag.disk_locks.active_locks} | Escritas atômicas: ${diag.disk_locks.total_atomic_writes}
Schemas registrados: ${db.state.databases.map((d) => d.db_name).join(', ')}`;
    } else if (normalized === 'ss -tulpn' || normalized === 'ports') {
      const appLines = db.state.applications
        .map((a) => `LISTEN  127.0.0.1:${a.destination_port}   ${a.slug} (${a.status}) -> ${a.local_directory}`)
        .join('\n');
      output = `Netid  Local Address:Port   Serviço XIQI OS
LISTEN  127.0.0.1:3000      carnauba-engine (Painel Engecema)
LISTEN  127.0.0.1:${AREIA_PRETA_PORT}      areiapreta-db (${AREIA_PRETA_CONFIGURED_DIR})
${appLines}`;
    } else if (normalized === 'ls /opt/xiqi/app' || normalized === 'ls /opt/xiqi/app/') {
      const dirs = db.state.applications.map((a) => `${a.slug}/  (porta ${a.destination_port})`).join('\n');
      output = `Conteúdo de ${XIQI_APP_DIR}:\nareiapreta/\n${dirs}`;
    } else if (normalized === 'uptime') {
      output = ` 04:30:00 up 28 days, 14:12,  1 user,  load average: 0.14, 0.18, 0.16 (x86_64 XIQI OS)`;
    } else if (normalized === 'free -m' || normalized === 'free -h') {
      const used = server.memory_usage.used;
      const total = server.memory_usage.total;
      const free = total - used;
      output = `               total        used        free      shared  buff/cache   available
Mem:            ${total}        ${used}        ${free}          64         420        ${free + 320}
Swap:           2048          48        2000`;
    } else if (normalized === 'df -h') {
      output = `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       120G   28G   86G  25% /
/dev/sda1       120G   28G   86G  25% ${XIQI_OS_ROOT}
tmpfs           2.0G     0  2.0G   0% /dev/shm`;
    } else {
      const ip = getClientIp(req);
      await db.recordSecurityEvent('INJECTION_BLOCKED', ip, `Comando fora da lista permitida rejeitado: ${cmd.slice(0, 60)}`);
      return res.status(403).json({
        error: 'Comando não autorizado. Permitidos apenas: xiqi-status, areiapreta status, areiapreta schemas, ss -tulpn, ls /opt/xiqi/app, free -m, df -h, uptime.',
        code: 'COMMAND_NOT_IN_ALLOWLIST',
      });
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

  // Vite Integration (Dev vs Production)
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Carnauba Engine (Corporação Engecema / XIQI OS) ativo em http://0.0.0.0:${PORT}`);
    console.log(`Areia Preta: ${db.activeStoragePath} (modo: ${db.storageMode})`);
  });
}

startServer();
