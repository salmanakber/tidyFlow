"use client"

/**
 * Post-login destination — company owners/managers → /{companySlug}/dashboard.
 * Platform SUPER_ADMIN stays on /admin.
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

  if (
    (role === "OWNER" ||
      role === "MANAGER" ||
      role === "COMPANY_ADMIN" ||
      role === "DEVELOPER") &&
    slug
  ) {
    return `/${slug}/dashboard`
  }

  if (role === "DEVELOPER") {
    return "/admin/control-center"
  }

  return "/login"
}
