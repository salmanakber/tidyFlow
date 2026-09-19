"use client"

/**
 * Post-login routing — strict separation:
 * - OWNER / MANAGER / COMPANY_ADMIN → /{companySlug}/dashboard
 * - SUPER_ADMIN / ADMIN_UNIQUE → /admin/control-center
 * - DEVELOPER with company → company workspace; else platform admin
 * - Company without active plan/trial → /account/billing
 */
import { buildCompanySlug } from "@/lib/company-slug"
import { isTrialCurrentlyActive } from "@/lib/customer-account"

export type PostLoginPlanFields = {
  subscriptionStatus?: string | null
  planTier?: string | null
  isTrialActive?: boolean | null
  trialEndsAt?: string | null
  needsPlan?: boolean | null
}

/** True when the company must pick/activate a plan before using the workspace. */
export function companyNeedsPlan(opts: PostLoginPlanFields): boolean {
  if (typeof opts.needsPlan === "boolean") return opts.needsPlan

  const status = String(opts.subscriptionStatus || "")
    .toLowerCase()
    .trim()
  const hasPlan = ["STARTUP", "STANDARD", "PREMIUM"].includes(
    String(opts.planTier || "").toUpperCase()
  )

  if (isTrialCurrentlyActive(opts.isTrialActive, opts.trialEndsAt)) return false
  if (["active", "trialing", "past_due", "canceling"].includes(status) && hasPlan) return false

  const unpaid = ["unpaid", "incomplete", "incomplete_expired", "canceled", ""].includes(status)
  return unpaid || !hasPlan
}

export function resolvePostLoginPath(opts: {
  role?: string | null
  companyId?: number | null
  companyName?: string | null
  companySlug?: string | null
} & PostLoginPlanFields): string {
  const role = String(opts.role || "").toUpperCase()

  if (role === "SUPER_ADMIN" || role === "ADMIN_UNIQUE") {
    return "/admin/control-center"
  }

  const slug =
    opts.companySlug ||
    (opts.companyId
      ? buildCompanySlug({ id: opts.companyId, name: opts.companyName })
      : null)

  const companyRoles = ["OWNER", "MANAGER", "COMPANY_ADMIN", "DEVELOPER"]
  if (companyRoles.includes(role) && companyNeedsPlan(opts)) {
    return "/account/billing?tab=plans&from=login"
  }

  if (role === "OWNER" || role === "MANAGER" || role === "COMPANY_ADMIN") {
    return slug ? `/${slug}/dashboard` : "/login"
  }

  if (role === "DEVELOPER") {
    return slug ? `/${slug}/dashboard` : "/admin/control-center"
  }

  return "/login"
}
