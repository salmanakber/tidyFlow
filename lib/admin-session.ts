import axios, { type AxiosRequestConfig } from 'axios'
import { DEFAULT_CURRENCY, normalizeCurrencyCode } from '@/lib/stripe-currencies'

/** Module-level currency synced by CurrencyProvider (GET /api/company/currency). */
let activeCurrency = DEFAULT_CURRENCY

export function setActiveCurrency(code: string) {
  activeCurrency = normalizeCurrencyCode(code)
}

export function getActiveCurrency() {
  return activeCurrency
}

/** Auth + company headers used by admin UI pages (same pattern as tasks/dashboard). */
export function getAdminAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
  const companyId = localStorage.getItem('selectedCompanyId')
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (companyId) headers['X-Company-Id'] = companyId
  return headers
}

export function getSelectedCompanyId(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('selectedCompanyId')
  if (!raw) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

export function withCompanyParams(params: Record<string, any> = {}) {
  const companyId = getSelectedCompanyId()
  if (companyId) return { ...params, companyId }
  return params
}

export async function adminGet<T = any>(url: string, config?: AxiosRequestConfig) {
  return axios.get<T>(url, {
    ...config,
    headers: { ...getAdminAuthHeaders(), ...(config?.headers || {}) },
    params: withCompanyParams(config?.params || {}),
  })
}

export async function adminPost<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
  return axios.post<T>(url, data, {
    ...config,
    headers: { ...getAdminAuthHeaders(), ...(config?.headers || {}) },
    params: withCompanyParams(config?.params || {}),
  })
}

export async function adminPatch<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
  return axios.patch<T>(url, data, {
    ...config,
    headers: { ...getAdminAuthHeaders(), ...(config?.headers || {}) },
    params: withCompanyParams(config?.params || {}),
  })
}

export async function adminDelete<T = any>(url: string, config?: AxiosRequestConfig) {
  return axios.delete<T>(url, {
    ...config,
    headers: { ...getAdminAuthHeaders(), ...(config?.headers || {}) },
    params: withCompanyParams(config?.params || {}),
  })
}

export function formatMoney(n: number | null | undefined, currency?: string) {
  const value = Number(n) || 0
  const code = normalizeCurrencyCode(currency || activeCurrency)
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${code} ${value.toFixed(2)}`
  }
}

export function formatDate(d?: string | Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function statusBadgeClass(status: string) {
  const s = (status || '').toLowerCase()
  if (['approved', 'paid', 'active', 'completed', 'resolved'].includes(s)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (['pending', 'submitted', 'open', 'in_progress'].includes(s)) {
    return 'bg-amber-50 text-amber-800 border-amber-200'
  }
  if (['rejected', 'cancelled', 'inactive', 'failed'].includes(s)) {
    return 'bg-red-50 text-red-700 border-red-200'
  }
  return 'bg-slate-100 text-slate-600 border-slate-200'
}
