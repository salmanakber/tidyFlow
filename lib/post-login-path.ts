"use client"

/**
 * Post-login routing — strict separation:
 * - OWNER / MANAGER / COMPANY_ADMIN → /{companySlug}/dashboard
 * - SUPER_ADMIN / ADMIN_UNIQUE → /admin/control-center
 * - DEVELOPER with company → company workspace; else platform admin
 */
import { buildCompanySlug } from "@/lib/company-slug"

export function resolvePostLoginPath(opts: {
  role?: string | null
  companyId?: number | null
  companyName?: string | null
  companySlug?: string | null
}): string {
  const role = String(opts.role || "").toUpperCase()

  if (role === "SUPER_ADMIN" || role === "ADMIN_UNIQUE") {
    return "/admin/control-center"
  }

  const slug =
    opts.companySlug ||
    (opts.companyId
      ? buildCompanySlug({ id: opts.companyId, name: opts.companyName })
      : null)

  if (role === "OWNER" || role === "MANAGER" || role === "COMPANY_ADMIN") {
    return slug ? `/${slug}/dashboard` : "/login"
  }

  if (role === "DEVELOPER") {
    return slug ? `/${slug}/dashboard` : "/admin/control-center"
  }

  return "/login"
}
