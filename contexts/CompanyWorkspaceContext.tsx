"use client"

import React, { createContext, useContext, useMemo } from "react"
import { useParams, usePathname } from "next/navigation"
import {
  buildCompanySlug,
  companyPath,
  COMPANY_ROUTE_MAP,
  isReservedPathSegment,
  parseCompanyIdFromSlug,
} from "@/lib/company-slug"

interface CompanyWorkspaceValue {
  /** True when URL is /{companySlug}/... */
  isCompanyWorkspace: boolean
  companySlug: string | null
  companyIdFromSlug: number | null
  /** Prefix for all nav links: "" for platform, "/acme-42" for company */
  basePath: string
  href: (page: string) => string
}

const CompanyWorkspaceContext = createContext<CompanyWorkspaceValue>({
  isCompanyWorkspace: false,
  companySlug: null,
  companyIdFromSlug: null,
  basePath: "/admin",
  href: (page) => `/admin/${page.replace(/^\//, "")}`,
})

export function CompanyWorkspaceProvider({
  children,
  companySlug: slugProp,
}: {
  children: React.ReactNode
  companySlug?: string
}) {
  const params = useParams()
  const pathname = usePathname()

  const value = useMemo(() => {
    const fromParams =
      slugProp ||
      (typeof params?.companySlug === "string" ? params.companySlug : null)
    const fromPath = pathname?.split("/").filter(Boolean)[0] || null
    const candidate = fromParams || fromPath
    const isCompany =
      !!candidate &&
      !isReservedPathSegment(candidate) &&
      !!parseCompanyIdFromSlug(candidate)

    const companySlug = isCompany ? candidate : null
    const companyIdFromSlug = companySlug ? parseCompanyIdFromSlug(companySlug) : null
    const basePath = companySlug ? `/${companySlug}` : "/admin"

    return {
      isCompanyWorkspace: !!companySlug,
      companySlug,
      companyIdFromSlug,
      basePath,
      href: (page: string) => {
        const clean = page.replace(/^\//, "").replace(/^admin\//, "")
        if (companySlug) {
          // Prefer mobile-friendly segments (jobs, team, invoices)
          const pretty =
            clean === "tasks"
              ? "jobs"
              : clean === "users-management"
                ? "team"
                : clean === "client-invoices"
                  ? "invoices"
                  : clean
          return companyPath(companySlug, pretty)
        }
        const adminFolder = COMPANY_ROUTE_MAP[clean] || clean
        return `/admin/${adminFolder}`
      },
    }
  }, [slugProp, params, pathname])

  return (
    <CompanyWorkspaceContext.Provider value={value}>
      {children}
    </CompanyWorkspaceContext.Provider>
  )
}

export function useCompanyWorkspace() {
  return useContext(CompanyWorkspaceContext)
}

export function workspaceHrefFromCompany(
  company: { id: number; name?: string | null } | null | undefined,
  page = "dashboard"
) {
  if (!company?.id) return `/admin/${page}`
  return companyPath(buildCompanySlug(company), page)
}
