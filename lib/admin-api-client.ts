import axios from 'axios';
import { apiUrl, getApiOrigin } from '@/lib/domains';

let configured = false;
let fetchPatched = false;
let originalFetch: typeof fetch | null = null;

/** Point admin UI HTTP clients at api.tidyflowapp.com (or localhost relative paths in dev). */
export function configureAdminApiClient() {
  if (typeof window === 'undefined' || configured) return;

  const origin = getApiOrigin();
  const host = window.location.hostname;
  const useAbsoluteApi =
    origin &&
    !host.includes('localhost') &&
    !host.includes('127.0.0.1') &&
    host !== new URL(origin).hostname;

  if (useAbsoluteApi) {
    axios.defaults.baseURL = origin;
  }

  if (!fetchPatched && useAbsoluteApi) {
    originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        return originalFetch!(apiUrl(input), init);
      }
      if (input instanceof Request && input.url.startsWith('/api/')) {
        return originalFetch!(apiUrl(input.url), init);
      }
      return originalFetch!(input, init);
    };
    fetchPatched = true;
  }

  configured = true;
}

export function getAdminAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token =
    localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}
