"use client"

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
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  ChevronDown,
  Bell,
  Sparkles,
  MapPin,
  Camera,
  Plus,
  Wallet,
  Clock3,
  Receipt,
  FileText,
  CalendarOff,
  Package,
  ShieldCheck,
  Sun,
  Moon,
  Database,
} from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"

interface User {
  id: number
  email: string
  firstName?: string
  lastName?: string
  role: string
  companyId?: number
  profileImage?: string
}

type NavItem = {
  name: string
  page: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  group: string
  /** Hide from MANAGER (mobile parity) */
  ownerOnly?: boolean
}

const GROUPS = [
  { id: "ops", label: "Operations" },
  { id: "team", label: "Team & assets" },
  { id: "finance", label: "Finance" },
  { id: "insights", label: "Insights" },
  { id: "account", label: "Account" },
] as const

/** Owner/manager company workspace only — never platform admin tools. */
const OWNER_NAV: NavItem[] = [
  { name: "Dashboard", page: "dashboard", icon: LayoutDashboard, group: "ops" },
  { name: "Jobs", page: "jobs", icon: ClipboardList, group: "ops" },
  { name: "Rota & Schedule", page: "rota", icon: CalendarDays, group: "ops" },
  { name: "Recurring Jobs", page: "recurring-jobs", icon: RefreshCcw, group: "ops" },
  { name: "Issues", page: "issues", icon: AlertCircle, group: "ops" },
  { name: "Team", page: "team", icon: Users, group: "team", ownerOnly: true },
  { name: "Properties", page: "properties", icon: Building2, group: "team" },
  { name: "Safety & GPS", page: "safety", icon: MapPin, group: "team" },
  { name: "Supplies", page: "supplies", icon: Package, group: "team" },
  { name: "Leave", page: "leave", icon: CalendarOff, group: "team" },
  { name: "Payroll", page: "payroll", icon: Wallet, group: "finance" },
  { name: "Working Hours", page: "working-hours", icon: Clock3, group: "finance" },
  { name: "Expenses", page: "expenses", icon: Receipt, group: "finance" },
  { name: "Client Invoices", page: "invoices", icon: FileText, group: "finance" },
  { name: "Reporting", page: "reporting", icon: BarChart3, group: "insights", ownerOnly: true },
  { name: "Quality (QA)", page: "qa", icon: ShieldCheck, group: "insights", ownerOnly: true },
  { name: "TidyFlow AI", page: "ai", icon: Sparkles, group: "insights" },
  { name: "Notifications", page: "notifications", icon: Bell, group: "insights", ownerOnly: true },
  { name: "Sheets Sync", page: "sheets-sync", icon: Database, group: "account", ownerOnly: true },
  { name: "Company Config", page: "company-config", icon: Camera, group: "account" },
  { name: "Settings", page: "settings", icon: Settings, group: "account" },
]

export default function CompanyShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { href: wsHref, companySlug } = useCompanyWorkspace()
  const [user, setUser] = useState<User | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [search, setSearch] = useState("")
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const preferDark = localStorage.getItem("tidyflow-theme") === "dark"
    setDarkMode(preferDark)
    document.documentElement.classList.toggle("dark", preferDark)
    document.documentElement.classList.toggle("light", !preferDark)
  }, [])

  useEffect(() => {
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
        const role = String(res.data.data.user?.role || "").toUpperCase()
        // Hard block platform admins from company shell
        if (role === "SUPER_ADMIN" || role === "ADMIN_UNIQUE") {
          router.replace("/admin/control-center")
          return
        }
        if (!["OWNER", "MANAGER", "COMPANY_ADMIN", "DEVELOPER"].includes(role)) {
          router.replace("/login")
          return
        }
        setUser(res.data.data.user)
        setCompanyName(res.data.data.company?.name || "")
      } catch {
        router.replace("/login")
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const navigation = useMemo(() => {
    if (!user) return []
    return OWNER_NAV.filter((item) => {
      if (item.ownerOnly && user.role === "MANAGER") return false
      return true
    })
  }, [user])

  const filtered = search
    ? navigation.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : navigation

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: filtered.filter((i) => i.group === g.id),
  })).filter((g) => g.items.length > 0)

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
    localStorage.removeItem("userData")
    sessionStorage.removeItem("userData")
    router.push("/login")
  }

  const toggleTheme = () => {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem("tidyflow-theme", next ? "dark" : "light")
    document.documentElement.classList.toggle("dark", next)
    document.documentElement.classList.toggle("light", !next)
  }

  const initials =
    user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "?"
  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.email || "User"

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-control-canvas dark:bg-control-darkCanvas">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
      </div>
    )
  }

  return (
    <div className="h-screen bg-control-canvas dark:bg-control-darkCanvas text-slate-800 dark:text-slate-100 flex overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-navy-950/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-navy-950 text-slate-300 border-r border-navy-900 flex flex-col transform transition-transform lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 px-4 border-b border-navy-900 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-amber-600 flex-shrink-0">
            <img src="/assets/new-icon.png" alt="" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="font-extrabold text-sm text-white truncate">
              Tidy<span className="text-amber-500">Flow</span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {companyName || "Company workspace"}
            </p>
          </div>
          <button
            className="lg:hidden ml-auto p-1 text-slate-400"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-2 bg-navy-900/80 border-b border-navy-900 text-[11px] font-mono flex justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            COMPANY
          </span>
          <span className="text-amber-400 font-bold truncate ml-2">
            {user?.role?.replace(/_/g, " ")}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 text-xs font-medium">
          {grouped.map((group) => (
            <div key={group.id}>
              <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const to = wsHref(item.page)
                  const active = pathname === to || pathname?.startsWith(to + "/")
                  return (
                    <Link
                      key={item.page}
                      href={to}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition ${
                        active
                          ? "bg-amber-600 text-white font-bold"
                          : "text-slate-300 hover:bg-navy-900 hover:text-white"
                      }`}
                    >
                      <item.icon size={16} className={active ? "text-white" : "text-slate-400"} />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-navy-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded bg-navy-800 border border-navy-700 flex items-center justify-center text-amber-400 text-xs font-bold overflow-hidden">
              {user?.profileImage ? (
                <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{displayName}</p>
              <p className="text-[10px] text-slate-400 truncate">{companySlug}</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-navy-900"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white dark:bg-control-darkCard border-b border-control-border dark:border-control-darkBorder px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 text-slate-500"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <div className="relative hidden md:block w-72">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Jump to jobs, payroll, team…"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-navy-900 rounded-lg"
              />
              {search && filtered.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-control-darkCard border border-control-border rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                  {filtered.map((item) => (
                    <Link
                      key={item.page}
                      href={wsHref(item.page)}
                      onClick={() => setSearch("")}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-900"
                    >
                      <item.icon size={14} /> {item.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={wsHref("jobs")}
              className="hidden sm:inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg font-bold text-xs"
            >
              <Plus size={14} /> New Job
            </Link>
            <div className="relative">
              <button
                onClick={() => setUserMenu(!userMenu)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-900"
              >
                <div className="w-8 h-8 rounded-lg bg-navy-100 dark:bg-navy-800 flex items-center justify-center text-sm font-semibold overflow-hidden">
                  {user?.profileImage ? (
                    <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-control-darkCard border border-control-border rounded-lg shadow-lg z-20 p-2">
                    <Link
                      href={wsHref("profile")}
                      onClick={() => setUserMenu(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-slate-50 dark:hover:bg-navy-900"
                    >
                      <Settings size={14} /> Profile
                    </Link>
                    <button
                      onClick={logout}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-red-600 hover:bg-red-50 w-full"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
