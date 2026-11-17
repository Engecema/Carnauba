let cachedCsrfToken: string | null = null;

export async function ensureCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken;
  }
  const res = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error('Falha ao obter token CSRF de segurança');
  }
  const data = await res.json();
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken as string;
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
  authToken?: string | null
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  const headers = new Headers(options.headers || {});
  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  if (isMutating) {
    const csrf = await ensureCsrfToken();
    headers.set('X-CSRF-Token', csrf);
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  if (isMutating && response.status === 403) {
    const clone = response.clone();
    try {
      const errData = await clone.json();
      if (errData?.code === 'CSRF_VALIDATION_FAILED') {
        const freshCsrf = await ensureCsrfToken(true);
        headers.set('X-CSRF-Token', freshCsrf);
        response = await fetch(url, {
          ...options,
          headers,
          credentials: 'same-origin',
        });
      }
    } catch {
      // Ignore parse errors and return original response
    }
  }

  return response;
}
