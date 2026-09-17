"use client"

/**
 * PLATFORM ADMIN SHELL
 * Full original admin surface for SUPER_ADMIN / DEVELOPER / ADMIN_UNIQUE.
 * Company OWNER / MANAGER never stay here — redirected to /{companySlug}.
 * AI / Sheets Sync / Company Config live here (platform), not in owner workspace.
 */

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import axios from "axios"
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  CalendarDays,
  RefreshCcw,
  AlertCircle,
  Database,
  Users,
  BarChart3,
  Settings,
  Command,
  LogOut,
  Menu,
  X,
  Search,
  ChevronDown,
  Bell,
  Ticket,
  UserMinus,
  Code,
  Sparkles,
  Shield,
  MapPin,
  CreditCard,
  Camera,
  SlidersHorizontal,
  Target,
  Handshake,
  Sun,
  Moon,
} from "lucide-react"
import CompanySelector from "./CompanySelector"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import {
  buildCompanySlug,
  isCompanyWorkspaceRole,
} from "@/lib/company-slug"
import { OpsStatusLegend } from "@/components/ops/OpsChrome"

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
  group: string
}

const GROUPS = [
  { id: "ops", label: "Company operations" },
  { id: "platform", label: "Platform" },
  { id: "system", label: "System" },
] as const

/** Restored full admin menu (pre–owner-web-app). */
const ADMIN_NAV: NavItem[] = [
  { name: "Control Center", href: "/admin/control-center", icon: Command, permission: "system.admin", roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "platform" },
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "ops" },
  { name: "Properties", href: "/admin/properties", icon: Building2, permission: "properties.view", roles: null, group: "ops" },
  { name: "Tasks", href: "/admin/tasks", icon: ClipboardList, permission: "tasks.view", roles: null, group: "ops" },
  { name: "Rota Builder", href: "/admin/rota", icon: CalendarDays, permission: "tasks.view", roles: null, group: "ops" },
  { name: "Recurring Jobs", href: "/admin/recurring-jobs", icon: RefreshCcw, permission: "tasks.view", roles: null, group: "ops" },
  { name: "Issues", href: "/admin/issues", icon: AlertCircle, permission: "tasks.view", roles: null, group: "ops" },
  { name: "User Management", href: "/admin/users-management", icon: Users, permission: "users.view", roles: null, group: "ops" },
  { name: "Safety & GPS", href: "/admin/safety", icon: MapPin, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "ops" },
  { name: "Reporting", href: "/admin/reporting", icon: BarChart3, permission: "reports.view", roles: null, group: "ops" },
  { name: "Notifications", href: "/admin/notifications", icon: Bell, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "ops" },
  { name: "Company Config", href: "/admin/company-config", icon: Camera, permission: "settings.view", roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "ops" },
  { name: "Sheets Sync", href: "/admin/sheets-sync", icon: Database, permission: "system.admin", roles: ["SUPER_ADMIN", "DEVELOPER"], group: "ops" },
  { name: "TidyFlow AI", href: "/admin/ai", icon: Sparkles, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "platform" },
  { name: "AI Sales Agent", href: "/admin/marketing/ai-sales-agent", icon: Target, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "platform" },
  { name: "Partners & Investors", href: "/admin/partners", icon: Handshake, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "platform" },
  { name: "Admin Management", href: "/admin/admin-management", icon: Shield, permission: "users.manage_admins", roles: null, group: "platform" },
  { name: "Support Tickets", href: "/admin/support-tickets", icon: Ticket, permission: "support_tickets.view", roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "platform" },
  { name: "Account Deletion", href: "/admin/account-deletion", icon: UserMinus, permission: "users.delete_account_request", roles: null, group: "platform" },
  { name: "Subscription Plans", href: "/admin/subscription", icon: Shield, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "platform" },
  { name: "Stripe Billing", href: "/admin/stripe", icon: CreditCard, permission: null, roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "platform" },
  { name: "Admin Configurations", href: "/admin/control-center/configurations", icon: SlidersHorizontal, permission: "system.admin", roles: ["SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"], group: "system" },
  { name: "Settings", href: "/admin/settings", icon: Settings, permission: "settings.view", roles: null, group: "system" },
  { name: "Developer Tools", href: "/admin/developer", icon: Code, permission: "system.developer", roles: ["SUPER_ADMIN", "DEVELOPER"], group: "system" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isCompanyWorkspace } = useCompanyWorkspace()
  const [user, setUser] = useState<User | null>(null)
  const [perms, setPerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [search, setSearch] = useState("")
  const [ticketCount, setTicketCount] = useState(0)
  const [darkMode, setDarkMode] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null
    const s = localStorage.getItem("selectedCompanyId")
    return s ? parseInt(s, 10) : null
  })

  useEffect(() => {
    const preferDark = localStorage.getItem("tidyflow-theme") === "dark"
    setDarkMode(preferDark)
    document.documentElement.classList.toggle("dark", preferDark)
    document.documentElement.classList.toggle("light", !preferDark)
  }, [])

  useEffect(() => {
    if (isCompanyWorkspace) {
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
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
            (u.companyId ? buildCompanySlug({ id: u.companyId, name: company?.name }) : null)
          router.replace(slug ? `/${slug}/dashboard` : "/login")
          return
        }
        if (!["SUPER_ADMIN", "ADMIN_UNIQUE", "DEVELOPER"].includes(role)) {
          router.replace("/login")
          return
        }
        setUser(u)

        try {
          const p = await axios.get("/api/auth/permissions", {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (p.data.success) setPerms(p.data.data.permissions || [])
        } catch {
          /* ignore */
        }
        try {
          const t = await axios.get("/api/admin/support-tickets/unread-count", {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (t.data?.success) setTicketCount(t.data.data?.count || 0)
        } catch {
          /* ignore */
        }
      } catch {
        router.replace("/login")
      } finally {
        setLoading(false)
      }
    })()
  }, [isCompanyWorkspace, router])

  const navigation = useMemo(() => {
    if (!user) return []
    return ADMIN_NAV.filter((item) => {
      if (item.roles && user.role && !item.roles.includes(user.role)) return false
      if (item.permission) {
        if (user.role === "DEVELOPER" || user.isHeadSuperAdmin) return true
        return perms.includes(item.permission)
      }
      return true
    })
  }, [user, perms])

  const filtered = search
    ? navigation.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : navigation

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: filtered.filter((i) => i.group === g.id),
  })).filter((g) => g.items.length > 0)

  const logout = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (token) await axios.post("/api/auth/logout", {}, { headers: { Authorization: `Bearer ${token}` } })
    } catch {
      /* ignore */
    }
    localStorage.removeItem("authToken")
    sessionStorage.removeItem("authToken")
    router.push("/login")
  }

  const toggleTheme = () => {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem("tidyflow-theme", next ? "dark" : "light")
    document.documentElement.classList.toggle("dark", next)
    document.documentElement.classList.toggle("light", !next)
  }

  // Company workspace pages reuse AdminLayout as a pass-through (CompanyShell wraps).
  if (isCompanyWorkspace) return <>{children}</>

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-control-canvas dark:bg-control-darkCanvas">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-amber-600" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-control-canvas font-sans text-slate-800 antialiased dark:bg-control-darkCanvas dark:text-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col border-r border-navy-900 bg-navy-950 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-navy-900 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logot-transparent.png"
              alt="TidyFlow"
              className="h-9 w-9 flex-shrink-0 rounded-lg bg-white/5 object-contain p-0.5"
              onError={(e) => {
                const el = e.currentTarget
                if (!el.src.includes("new-icon.png")) {
                  el.src = "/assets/new-icon.png"
                }
              }}
            />
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tight text-white">
                  Tidy<span className="text-amber-500">Flow</span>
                </span>
                <span className="rounded border border-amber-500/40 bg-amber-500/20 px-1 py-0.5 font-mono text-[9px] font-bold text-amber-300">
                  ADMIN
                </span>
              </div>
              <p className="truncate text-[11px] font-medium text-slate-400">Platform console</p>
            </div>
          </div>
          <button className="p-1 text-slate-400 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-navy-900 bg-navy-900/80 px-4 py-2 font-mono text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-slate-300">PLATFORM</span>
          </div>
          <span className="truncate font-bold text-amber-400">
            {user?.role?.replace(/_/g, " ")}
          </span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 text-xs font-medium">
          {grouped.map((g) => (
            <div key={g.id}>
              <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(item.href + "/")
                  return (
                    <Link
                      key={item.href + item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition ${
                        active
                          ? "bg-amber-600 font-bold text-white"
                          : "text-slate-300 hover:bg-navy-900 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <item.icon
                          size={16}
                          className={active ? "text-white" : "text-slate-400"}
                        />
                        {item.name}
                      </span>
                      {item.name === "Support Tickets" && ticketCount > 0 && (
                        <span className="rounded-full bg-navy-950 px-1.5 font-mono text-[10px] font-bold text-amber-300">
                          {ticketCount > 99 ? "99+" : ticketCount}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-navy-900 p-3">
          <button
            onClick={logout}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-red-300 hover:bg-red-950/40"
          >
            <LogOut size={14} /> Sign out
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-900 hover:text-amber-400"
            title="Toggle theme"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-control-border bg-white px-4 dark:border-control-darkBorder dark:bg-control-darkCard sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-2 text-slate-500 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <div className="relative hidden w-48 sm:block md:w-72">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter pages…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs font-medium focus:border-amber-600 focus:outline-none dark:border-navy-900 dark:bg-navy-950"
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
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-navy-900"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-navy-200 bg-navy-100 text-sm font-semibold text-navy-800 dark:border-navy-700 dark:bg-navy-800 dark:text-amber-400">
                  {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase()}
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-control-border bg-white p-2 shadow-lg dark:border-control-darkBorder dark:bg-control-darkCard">
                    <p className="truncate px-2 py-1 text-xs text-slate-500">{user?.email}</p>
                    <Link
                      href="/admin/profile"
                      onClick={() => setUserMenu(false)}
                      className="block rounded px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-900"
                    >
                      Profile
                    </Link>
                    <button
                      onClick={logout}
                      className="w-full rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto max-w-[1600px] space-y-6">
            <OpsStatusLegend compact />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
