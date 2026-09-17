"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import {
  buildCompanySlug,
  isCompanyWorkspaceRole,
} from "@/lib/company-slug"

/**
 * Hard gate: /admin is PLATFORM ONLY.
 * Company owners/managers are redirected to their company workspace.
 */
export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
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

        if (isCompanyWorkspaceRole(role)) {
          const slug =
            company?.slug ||
            (user.companyId
              ? buildCompanySlug({ id: user.companyId, name: company?.name })
              : null)
          router.replace(slug ? `/${slug}/dashboard` : "/login")
          return
        }

        if (!["SUPER_ADMIN", "ADMIN_UNIQUE", "DEVELOPER"].includes(role)) {
          router.replace("/login")
          return
        }

        if (!cancelled) setOk(true)
      } catch {
        router.replace("/login")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  if (!ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return <>{children}</>
}
