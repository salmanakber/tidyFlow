/**
 * Company workspace URL slugs — no DB migration required.
 * Format: {slugified-company-name}-{companyId}
 * Example: /acme-cleaning-services-42/dashboard
 */

export const RESERVED_PATH_SEGMENTS = new Set([
  'admin',
  'api',
  'login',
  'account',
  'subscribe',
  'share',
  'review',
  'partner',
  'support',
  'privacy',
  'terms',
  'account-deletion',
  'assets',
  '_next',
  'favicon.ico',
  'robots.txt',
  'manifest.json',
  'icon.png',
  'c', // optional short prefix if needed later
])

/** Map pretty company paths → existing /admin page folders */
export const COMPANY_ROUTE_MAP: Record<string, string> = {
  dashboard: 'dashboard',
  jobs: 'tasks',
  tasks: 'tasks',
  rota: 'rota',
  schedule: 'rota',
  'recurring-jobs': 'recurring-jobs',
  issues: 'issues',
  properties: 'properties',
  team: 'users-management',
  users: 'users-management',
  leave: 'leave',
  supplies: 'supplies',
  payroll: 'payroll',
  'working-hours': 'working-hours',
  hours: 'working-hours',
  expenses: 'expenses',
  invoices: 'client-invoices',
  'client-invoices': 'client-invoices',
  qa: 'qa',
  reporting: 'reporting',
  analytics: 'reporting',
  safety: 'safety',
  tracking: 'safety',
  calendar: 'calendar',
  announcements: 'announcements',
  billing: 'billing',
  integrations: 'integrations',
  compliance: 'compliance',
  settings: 'settings',
  profile: 'profile',
  'checklist-templates': 'checklist-templates',
  // Intentionally NOT mapped for company workspace (platform admin only):
  // ai, sheets-sync, company-config, notifications (platform)
}

export function slugifyCompanyName(name: string): string {
  return (
    String(name || 'company')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'company'
  )
}

export function buildCompanySlug(company: { id: number; name?: string | null }): string {
  const id = Number(company.id)
  const base = slugifyCompanyName(company.name || `company-${id}`)
  return `${base}-${id}`
}

/** Extract company id from trailing -{id} in slug */
export function parseCompanyIdFromSlug(slug: string): number | null {
  if (!slug || RESERVED_PATH_SEGMENTS.has(slug.toLowerCase())) return null
  const match = String(slug).match(/-(\d+)$/)
  if (!match) return null
  const id = parseInt(match[1], 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function isReservedPathSegment(segment: string): boolean {
  return RESERVED_PATH_SEGMENTS.has(String(segment || '').toLowerCase())
}

export function companyPath(slug: string, page: string): string {
  const clean = page.replace(/^\//, '')
  return `/${slug}/${clean}`
}

/** Roles that use the company workspace (not platform /admin). */
export const COMPANY_WORKSPACE_ROLES = new Set([
  'OWNER',
  'MANAGER',
  'COMPANY_ADMIN',
])

export function isCompanyWorkspaceRole(role?: string | null): boolean {
  return COMPANY_WORKSPACE_ROLES.has(String(role || '').toUpperCase())
}

/** Platform /admin only — never company ops UI */
export function isPlatformAdminRole(role?: string | null): boolean {
  const r = String(role || '').toUpperCase()
  return r === 'SUPER_ADMIN' || r === 'ADMIN_UNIQUE'
}
