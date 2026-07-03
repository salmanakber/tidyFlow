/**
 * TidyFlow domain configuration.
 *
 * - app.tidyflowapp.com  → admin UI (login, /admin)
 * - api.tidyflowapp.com  → REST API (/api) + client pages (/share, /review)
 */

const stripTrailingSlash = (url: string) => url.replace(/\/$/, '');

export function getAppOrigin(): string {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_APP_URL || 'https://app.tidyflowapp.com');
}

export function getApiOrigin(): string {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_API_URL || 'https://api.tidyflowapp.com');
}

export function getAppHostname(): string {
  try {
    return new URL(getAppOrigin()).hostname;
  } catch {
    return 'app.tidyflowapp.com';
  }
}

export function getApiHostname(): string {
  try {
    return new URL(getApiOrigin()).hostname;
  } catch {
    return 'api.tidyflowapp.com';
  }
}

/** Client-facing share/review links (served from API host). */
export function getPublicWebOrigin(): string {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_WEB_URL || getApiOrigin());
}

/** Build absolute API URL. On localhost returns relative path when API origin matches current host. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = getApiOrigin();

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return normalized;
    }
  }

  if (!process.env.NEXT_PUBLIC_API_URL && process.env.NODE_ENV === 'development') {
    return normalized;
  }

  return `${base}${normalized}`;
}

export function isLocalhostHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.split(':')[0].toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    h.endsWith('.local')
  );
}

/** Prefer x-forwarded-host when behind nginx / load balancer. */
export function resolveRequestHost(request: { headers: { get(name: string): string | null } }): string | null {
  return (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host')
  );
}

export function hostMatchesApp(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.split(',')[0].trim().split(':')[0].toLowerCase();
  const expected = getAppHostname().toLowerCase();
  return h === expected || h === `www.${expected}`;
}

export function hostMatchesApi(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.split(',')[0].trim().split(':')[0].toLowerCase();
  const expected = getApiHostname().toLowerCase();
  return h === expected || h === `www.${expected}`;
}
