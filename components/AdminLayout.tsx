"use client"

/**
 * PLATFORM ADMIN SHELL ONLY
 * — SUPER_ADMIN / ADMIN_UNIQUE / DEVELOPER (platform tools)
 * — Never shows owner/manager company ops
 * — Company owners/managers redirected to /{companySlug}/dashboard
 */

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import axios from "axios"
import {
  Command,
  LogOut,
  Menu,
  X,
  Search,
  ChevronDown,
  Ticket,
  UserMinus,
  Code,
  Shield,
  CreditCard,
  SlidersHorizontal,
  Target,
  Handshake,
  Database,
  Settings,
  Users,
  Building2,
} from "lucide-react"
import CompanySelector from "./CompanySelector"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import {
  buildCompanySlug,
  isCompanyWorkspaceRole,
} from "@/lib/company-slug"

interface User {
  id: number
  email: string
  firstName?: string
  lastName?: string
  role: string
  companyId?: number
  profileImage?: string
  isHeadSuperAdmin?: boolean
}

type NavItem = {
  name: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  permission: string | null
  roles: string[] | null
}

const PLATFORM_NAV: NavItem[] = [
  {
    name: "Control Center",
    href: "/admin/control-center",
    icon: Command,
    permission: "system.admin",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Companies",
    href: "/admin/control-center",
    icon: Building2,
    permission: "system.admin",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Admin Management",
    href: "/admin/admin-management",
    icon: Shield,
    permission: "users.manage_admins",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Users (platform)",
    href: "/admin/users-management",
    icon: Users,
    permission: "users.view",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Support Tickets",
    href: "/admin/support-tickets",
    icon: Ticket,
    permission: "support_tickets.view",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Account Deletion",
    href: "/admin/account-deletion",
    icon: UserMinus,
    permission: "users.delete_account_request",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Subscription Plans",
    href: "/admin/subscription",
    icon: Shield,
    permission: null,
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Stripe Billing",
    href: "/admin/stripe",
    icon: CreditCard,
    permission: null,
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Admin Configurations",
    href: "/admin/control-center/configurations",
    icon: SlidersHorizontal,
    permission: "system.admin",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "AI Sales Agent",
    href: "/admin/marketing/ai-sales-agent",
    icon: Target,
    permission: null,
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Partners & Investors",
    href: "/admin/partners",
    icon: Handshake,
    permission: null,
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
  {
    name: "Sheets Sync (platform)",
    href: "/admin/sheets-sync",
    icon: Database,
    permission: "system.admin",
    roles: ["SUPER_ADMIN", "DEVELOPER"],
  },
  {
    name: "Developer Tools",
    href: "/admin/developer",
    icon: Code,
    permission: "system.developer",
    roles: ["SUPER_ADMIN", "DEVELOPER"],
  },
  {
    name: "Settings",
    href: "/admin/settings",
    icon: Settings,
    permission: "settings.view",
    roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isCompanyWorkspace } = useCompanyWorkspace()
  const [user, setUser] = useState<User | null>(null)
  const [userPermissions, setUserPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem("selectedCompanyId")
    return stored ? parseInt(stored, 10) : null
  })

  useEffect(() => {
    // Under /{companySlug}*, AdminLayout is a no-op shell (CompanyShell owns chrome)
    if (isCompanyWorkspace) {
      setLoading(false)
      return
    }
    loadUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompanyWorkspace])

  useEffect(() => {
    if (user && !isCompanyWorkspace) loadPermissions()
  }, [user, isCompanyWorkspace])

  const loadPermissions = async () => {
    try {
      const token =
        localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (!token) return
      const res = await axios.get("/api/auth/permissions", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.data.success) setUserPermissions(res.data.data.permissions || [])
    } catch {
      setUserPermissions([])
    }
  }

  const loadUser = async () => {
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

      const u = res.data.data.user
      const company = res.data.data.company
      const role = String(u?.role || "").toUpperCase()

      if (isCompanyWorkspaceRole(role)) {
        const slug =
          company?.slug ||
          (u.companyId
            ? buildCompanySlug({ id: u.companyId, name: company?.name })
            : null)
        router.replace(slug ? `/${slug}/dashboard` : "/login")
        return
      }

      if (!["SUPER_ADMIN", "ADMIN_UNIQUE", "DEVELOPER"].includes(role)) {
        router.replace("/login")
        return
      }

      setUser(u)
    } catch {
      router.replace("/login")
    } finally {
      setLoading(false)
    }
  }

  const navigation = useMemo(() => {
    if (!user) return []
    return PLATFORM_NAV.filter((item) => {
      if (item.roles && !item.roles.includes(user.role)) return false
      if (item.permission) {
        if (user.role === "DEVELOPER" || user.isHeadSuperAdmin) return true
        return userPermissions.includes(item.permission)
      }
      return true
    })
  }, [user, userPermissions])

  const filtered = search
    ? navigation.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : navigation

  const logout = async () => {
    try {
      const token =
        localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (token) {
        await axios.post(
          "/api/auth/logout",
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }
    } catch {
      /* ignore */
    }
    localStorage.removeItem("authToken")
    sessionStorage.removeItem("authToken")
    router.push("/login")
  }

  // Company workspace: pass through content only (CompanyShell wraps outside)
  if (isCompanyWorkspace) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col transform transition-transform lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 px-4 border-b border-slate-800 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            TF
          </div>
          <div>
            <div className="font-bold text-white text-sm">TidyFlow</div>
            <div className="text-[10px] text-indigo-300 font-mono uppercase">
              Platform Admin
            </div>
          </div>
          <button className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Platform
          </p>
          {filtered.map((item) => {
            const active =
              pathname === item.href || pathname?.startsWith(item.href + "/")
            return (
              <Link
                key={item.href + item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${
                  active
                    ? "bg-indigo-600 text-white font-semibold"
                    : "hover:bg-slate-800 text-slate-300"
                }`}
              >
                <item.icon size={16} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-950/40 rounded-lg"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="relative hidden md:block">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter admin pages…"
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-56"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(user?.role === "SUPER_ADMIN" || user?.role === "DEVELOPER") && (
              <CompanySelector
                selectedCompanyId={selectedCompanyId}
                onCompanyChange={(id) => {
                  setSelectedCompanyId(id)
                  if (id) localStorage.setItem("selectedCompanyId", String(id))
                  else localStorage.removeItem("selectedCompanyId")
                }}
                userRole={user?.role || ""}
              />
            )}
            <div className="relative">
              <button
                onClick={() => setUserMenu(!userMenu)}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase()}
                </span>
                <ChevronDown size={14} />
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-20 p-2">
                    <p className="px-2 py-1 text-xs text-slate-500 truncate">{user?.email}</p>
                    <button
                      onClick={logout}
                      className="w-full text-left px-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
