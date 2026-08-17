import axios from 'axios';
import { getApiHostname, getAppHostname } from '@/lib/domains';

let configured = false;

/**
 * Admin UI on app.tidyflowapp.com uses same-origin /api (same Next.js server).
 * Only force cross-origin API base URL when hostname does not match app or api host.
 */
export function configureAdminApiClient() {
  if (typeof window === 'undefined' || configured) return;

  const host = window.location.hostname.toLowerCase();
  const appHost = getAppHostname().toLowerCase();
  const apiHost = getApiHostname().toLowerCase();

  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.');

  const onAppHost = host === appHost || host === `www.${appHost}`;
  const onApiHost = host === apiHost || host === `www.${apiHost}`;

  // Same server: relative /api paths work on app.* and localhost
  if (isLocal || onAppHost) {
    axios.defaults.baseURL = '';
    configured = true;
    return;
  }

  // Fallback: if admin is opened on another host, point at API subdomain
  if (!onApiHost && apiHost) {
    const protocol = window.location.protocol;
    axios.defaults.baseURL = `${protocol}//${apiHost}`;
  }

  configured = true;
}

export function getAdminAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token =
    localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}
