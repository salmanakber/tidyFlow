"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import axios from "axios"
import { CompanyWorkspaceProvider } from "@/contexts/CompanyWorkspaceContext"
import CompanyShell from "@/components/CompanyShell"
import {
  isCompanyWorkspaceRole,
  isReservedPathSegment,
  parseCompanyIdFromSlug,
} from "@/lib/company-slug"

/**
 * Company owner/manager workspace ONLY.
 * Platform SUPER_ADMIN is blocked and sent to /admin.
 */
export default function CompanySlugLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const router = useRouter()
  const companySlug = typeof params?.companySlug === "string" ? params.companySlug : ""
  const [ready, setReady] = useState(false)
  const [denied, setDenied] = useState("")

  useEffect(() => {
    let cancelled = false

    async function gate() {
      if (!companySlug || isReservedPathSegment(companySlug)) {
        router.replace("/login")
        return
      }

      const companyId = parseCompanyIdFromSlug(companySlug)
      if (!companyId) {
        router.replace("/login")
        return
      }

      try {
        const token =
          localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
        if (!token) {
          router.replace("/login")
          return
        }

        const res = await axios.get("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.data?.success) {
          router.replace("/login")
          return
        }

        const user = res.data.data.user
        const company = res.data.data.company
        const role = String(user?.role || "").toUpperCase()

        // Platform admins do NOT use company workspace
        if (role === "SUPER_ADMIN" || role === "ADMIN_UNIQUE") {
          router.replace("/admin/control-center")
          return
        }

        if (!isCompanyWorkspaceRole(role) && role !== "DEVELOPER") {
          setDenied("This workspace is for company owners and managers only.")
          return
        }

        const userCompanyId = Number(user?.companyId || company?.id)
        if (!userCompanyId || userCompanyId !== companyId) {
          if (role === "DEVELOPER") {
            localStorage.setItem("selectedCompanyId", String(companyId))
          } else {
            setDenied("You do not have access to this company workspace.")
            return
          }
        } else {
          localStorage.setItem("selectedCompanyId", String(companyId))
        }

        if (!cancelled) setReady(true)
      } catch {
        router.replace("/login")
      }
    }

    gate()
    return () => {
      cancelled = true
    }
  }, [companySlug, router])

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-control-canvas p-6">
        <div className="max-w-md bg-white border border-control-border rounded-2xl p-8 text-center space-y-4">
          <h1 className="text-xl font-extrabold text-navy-900">Access denied</h1>
          <p className="text-sm text-slate-600">{denied}</p>
          <a href="/login" className="inline-block text-sm font-bold text-amber-700">
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-control-canvas">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
      </div>
    )
  }

  return (
    <CompanyWorkspaceProvider companySlug={companySlug}>
      <CompanyShell>{children}</CompanyShell>
    </CompanyWorkspaceProvider>
  )
}
