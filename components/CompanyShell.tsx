"use client"

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import axios from "axios"
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  CalendarDays,
  Calendar,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  ChevronDown,
  Megaphone,
  MapPin,
  Plus,
  Wallet,
  Receipt,
  FileText,
  CalendarOff,
  Package,
  ShieldCheck,
  Sun,
  Moon,
  Puzzle,
  CreditCard,
  Shield,
  Clock3,
  RefreshCcw,
  AlertCircle,
  Sheet,
  CornerDownLeft,
  Bell,
  Sparkles,
  Crosshair,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import { CurrencyProvider } from "@/contexts/CurrencyContext"
import { OpsStatusLegend } from "@/components/ops/OpsChrome"
import HeaderNotifications from "@/components/ops/HeaderNotifications"
import OpsCriticalBanner from "@/components/ops/OpsCriticalBanner"
import OpsOnboardingCard from "@/components/ops/OpsOnboardingCard"
import { OpsLoader } from "@/components/ops/OpsLoader"
import { useOpsRealtime } from "@/hooks/useOpsRealtime"
import { parseOpsCommand, type ParsedCommand } from "@/lib/ops-command-parse"
import { getAiOpsCommands } from "@/lib/ops-ai"

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
  /** If set, only these roles see the item (mobile Sidebar parity) */
  roles?: string[]
}

/**
 * Owner/Manager company workspace nav.
 * Platform-only (excluded): Company Config, TidyFlow AI platform config.
 * Sheets / Task Sync ARE available to owners (mobile parity + desktop control).
 */
const GROUPS = [
  { id: "navigate", label: "Navigate" },
  { id: "manage", label: "Manage" },
  { id: "finance", label: "Finance & reports" },
  { id: "account", label: "Account" },
] as const

const OWNER_NAV: NavItem[] = [
  // Navigate
  { name: "Home", page: "dashboard", icon: LayoutDashboard, group: "navigate" },
  { name: "Tasks", page: "jobs", icon: ClipboardList, group: "navigate" },
  { name: "Live monitor", page: "monitor", icon: Crosshair, group: "navigate" },
  { name: "Calendar", page: "calendar", icon: Calendar, group: "navigate" },
  {
    name: "Task Sync",
    page: "sheets",
    icon: Sheet,
    group: "navigate",
    roles: ["OWNER", "MANAGER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  // Manage — Safety near top (managers)
  { name: "Properties", page: "properties", icon: Building2, group: "manage" },
  { name: "Safety & GPS", page: "safety", icon: MapPin, group: "manage" },
  { name: "Rota Builder", page: "rota", icon: CalendarDays, group: "manage" },
  {
    name: "Team",
    page: "team",
    icon: Users,
    group: "manage",
    roles: ["OWNER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  { name: "Leave Requests", page: "leave", icon: CalendarOff, group: "manage" },
  { name: "Supplies", page: "supplies", icon: Package, group: "manage" },
  {
    name: "Announcements",
    page: "announcements",
    icon: Megaphone,
    group: "manage",
    roles: ["OWNER", "DEVELOPER"],
  },
  { name: "Recurring Jobs", page: "recurring-jobs", icon: RefreshCcw, group: "manage" },
  { name: "Issues", page: "issues", icon: AlertCircle, group: "manage" },
  { name: "Working Hours", page: "working-hours", icon: Clock3, group: "manage" },
  // Finance & reports — Payroll / Integrations / Billing / Analytics: not for MANAGER
  {
    name: "Payroll",
    page: "payroll",
    icon: Wallet,
    group: "finance",
    roles: ["OWNER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  { name: "Client Invoices", page: "invoices", icon: FileText, group: "finance" },
  { name: "Expenses", page: "expenses", icon: Receipt, group: "finance" },
  {
    name: "Integrations",
    page: "integrations",
    icon: Puzzle,
    group: "finance",
    roles: ["OWNER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  {
    name: "Billing",
    page: "billing",
    icon: CreditCard,
    group: "finance",
    roles: ["OWNER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  {
    name: "QA Performance",
    page: "qa",
    icon: ShieldCheck,
    group: "finance",
    roles: ["OWNER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  { name: "Compliance", page: "compliance", icon: Shield, group: "finance", roles: ["OWNER", "COMPANY_ADMIN", "DEVELOPER"] },
  {
    name: "Analytics",
    page: "reporting",
    icon: BarChart3,
    group: "finance",
    roles: ["OWNER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  { name: "Notifications", page: "notifications", icon: Bell, group: "account" },
  {
    name: "Digests",
    page: "digests",
    icon: Mail,
    group: "account",
    roles: ["OWNER", "MANAGER", "COMPANY_ADMIN", "DEVELOPER"],
  },
  { name: "Profile", page: "profile", icon: Settings, group: "account" },
]

type CmdEntry =
  | {
      kind: "action"
      id: string
      name: string
      href: string
      icon: NavItem["icon"]
      detail?: string
    }
  | {
      kind: "page"
      id: string
      name: string
      href: string
      icon: NavItem["icon"]
      page: string
      detail?: string
    }

export default function CompanyShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { href: wsHref, companySlug } = useCompanyWorkspace()
  const [user, setUser] = useState<User | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [search, setSearch] = useState("")
  const [darkMode, setDarkMode] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdIndex, setCmdIndex] = useState(0)
  const [aiAsk, setAiAsk] = useState<ParsedCommand[]>([])
  const [aiAskLoading, setAiAskLoading] = useState(false)
  const [aiAskUsed, setAiAskUsed] = useState(false)
  const cmdInputRef = useRef<HTMLInputElement>(null)
  const headerSearchRef = useRef<HTMLInputElement>(null)
  const { status: liveStatus } = useOpsRealtime(() => {}, !loading && !!user)

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("tidyflow-sidebar-collapsed") === "1")
    } catch {
      /* ignore */
    }
  }, [])

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem("tidyflow-sidebar-collapsed", next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const openCommandPalette = useCallback(() => {
    setCmdOpen(true)
    setSearch("")
    setCmdIndex(0)
    setAiAsk([])
    setAiAskUsed(false)
    setTimeout(() => cmdInputRef.current?.focus(), 30)
  }, [])

  const closeCommandPalette = useCallback(() => {
    setCmdOpen(false)
    setSearch("")
    setCmdIndex(0)
    setAiAsk([])
    setAiAskUsed(false)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (cmdOpen) closeCommandPalette()
        else openCommandPalette()
        return
      }
      if (e.key === "Escape" && cmdOpen) {
        e.preventDefault()
        closeCommandPalette()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cmdOpen, openCommandPalette, closeCommandPalette])

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
        if (role === "SUPER_ADMIN" || role === "ADMIN_UNIQUE") {
          router.replace("/admin/control-center")
          return
        }
        if (!["OWNER", "MANAGER", "COMPANY_ADMIN", "DEVELOPER"].includes(role)) {
          router.replace("/login")
          return
        }
        if (res.data.data?.needsPlan) {
          try {
            localStorage.setItem("customerAuthToken", token)
            localStorage.setItem(
              "customerUserData",
              JSON.stringify(res.data.data.user || {})
            )
          } catch {
            /* ignore */
          }
          window.location.href = "/account/billing?tab=plans&from=app"
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
    const role = user.role
    return OWNER_NAV.filter((item) => {
      if (item.roles && !item.roles.includes(role)) return false
      return true
    })
  }, [user])

  const actionCommands = useMemo((): CmdEntry[] => {
    return [
      {
        kind: "action",
        id: "smart-assign",
        name: "Smart assign / AI recommend",
        href: `${wsHref("jobs")}?smart=1`,
        icon: Sparkles,
      },
      {
        kind: "action",
        id: "live-map",
        name: "Open live map / GPS",
        href: wsHref("monitor"),
        icon: Crosshair,
      },
      {
        kind: "action",
        id: "unassigned",
        name: "Today unassigned",
        href: `${wsHref("jobs")}?status=unassigned`,
        icon: Crosshair,
      },
      {
        kind: "action",
        id: "create-job",
        name: "Create job",
        href: `${wsHref("jobs")}?create=1`,
        icon: Plus,
      },
      {
        kind: "action",
        id: "draft-invoices",
        name: "Draft client invoices (ready to bill)",
        href: `${wsHref("invoices")}?create=1`,
        icon: FileText,
      },
      {
        kind: "action",
        id: "smart-fill-rota",
        name: "Rota AI smart fill",
        href: `${wsHref("rota")}?smart=1`,
        icon: CalendarDays,
      },
      {
        kind: "action",
        id: "send-digest",
        name: "Send digest",
        href: wsHref("digests"),
        icon: Mail,
      },
    ]
  }, [wsHref])

  const pageCommands = useMemo((): CmdEntry[] => {
    return navigation.map((item) => ({
      kind: "page" as const,
      id: `page-${item.page}`,
      name: item.name,
      href: wsHref(item.page),
      icon: item.icon,
      page: item.page,
    }))
  }, [navigation, wsHref])

  const cmdEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = (name: string) => !q || name.toLowerCase().includes(q)
    const rules: ParsedCommand[] = q.length >= 2 ? parseOpsCommand(search, wsHref) : []
    // Prefer AI config results when available; otherwise rule parser
    const ask = aiAsk.length > 0 ? aiAsk : rules
    return {
      ask,
      actions: actionCommands.filter((a) => match(a.name)),
      pages: pageCommands.filter((p) => match(p.name)),
      aiAskUsed,
      aiAskLoading,
    }
  }, [actionCommands, pageCommands, search, wsHref, aiAsk, aiAskUsed, aiAskLoading])

  // Debounced call into /api/ai/ops-command (getAIConfig → aiChat)
  useEffect(() => {
    if (!cmdOpen) return
    const q = search.trim()
    if (q.length < 3) {
      setAiAsk([])
      setAiAskUsed(false)
      setAiAskLoading(false)
      return
    }
    let cancelled = false
    setAiAskLoading(true)
    const t = setTimeout(() => {
      void getAiOpsCommands(q).then((res) => {
        if (cancelled) return
        setAiAskLoading(false)
        if (!res.aiGenerated || !res.commands.length) {
          setAiAsk([])
          setAiAskUsed(false)
          return
        }
        setAiAskUsed(true)
        setAiAsk(
          res.commands.map((c) => ({
            id: `ai-${c.id}`,
            label: c.label,
            href: `${wsHref(c.hrefKey)}${c.query ? `?${c.query}` : ""}`,
            detail: c.detail,
            confidence: "high" as const,
          }))
        )
      })
    }, 380)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [search, cmdOpen, wsHref])

  const flatCmd = useMemo(() => {
    const askAs: CmdEntry[] = cmdEntries.ask.map((a) => ({
      kind: "action" as const,
      id: a.id,
      name: a.label,
      href: a.href,
      icon: Sparkles,
      detail: a.detail,
    }))
    return [...askAs, ...cmdEntries.actions, ...cmdEntries.pages]
  }, [cmdEntries])

  useEffect(() => {
    setCmdIndex(0)
  }, [search])

  const jumpToHref = (href: string) => {
    closeCommandPalette()
    router.push(href)
  }

  const onCmdKeyDown = (e: React.KeyboardEvent) => {
    if (!flatCmd.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCmdIndex((i) => (i + 1) % flatCmd.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCmdIndex((i) => (i - 1 + flatCmd.length) % flatCmd.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = flatCmd[cmdIndex]
      if (item) jumpToHref(item.href)
    }
  }

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: navigation.filter((i) => i.group === g.id),
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
      <div className="flex min-h-screen items-center justify-center bg-control-canvas dark:bg-control-darkCanvas">
        <OpsLoader message="Opening company workspace…" size="lg" />
      </div>
    )
  }

  return (
    <CurrencyProvider>
    <div className="flex h-screen overflow-hidden bg-control-canvas font-sans text-slate-800 antialiased dark:bg-control-darkCanvas dark:text-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col border-r border-amber-900/30 bg-navy-950 text-slate-300 transition-all duration-200 lg:static lg:translate-x-0 ${
          sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div
          className={`flex h-16 items-center justify-between border-b border-amber-900/30 px-4 ${
            sidebarCollapsed ? "lg:justify-center lg:px-2" : ""
          }`}
        >
          <div
            className={`flex min-w-0 items-center gap-2.5 ${
              sidebarCollapsed ? "lg:justify-center lg:gap-0" : ""
            }`}
          >
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
            <div
              className={`min-w-0 leading-tight ${sidebarCollapsed ? "lg:hidden" : ""}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tight text-white">
                  Tidy<span className="text-amber-500">Flow</span>
                </span>
                <span className="rounded border border-amber-500/40 bg-amber-500/20 px-1 py-0.5 font-mono text-[9px] font-bold text-amber-300">
                  OS
                </span>
              </div>
              <p className="truncate text-[11px] font-medium text-slate-400">
                {companyName || "Company workspace"}
              </p>
            </div>
          </div>
          <button className="p-1 text-slate-400 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div
          className={`flex items-center justify-between border-b border-amber-900/30 bg-navy-900/80 px-4 py-2 font-mono text-[11px] ${
            sidebarCollapsed ? "lg:hidden" : ""
          }`}
        >
          <div
            className="flex items-center gap-1.5"
            title={
              liveStatus === "live"
                ? "Realtime connected"
                : liveStatus === "connecting"
                  ? "Connecting…"
                  : "Realtime offline — polling"
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                liveStatus === "live"
                  ? "animate-pulse bg-emerald-500"
                  : liveStatus === "connecting"
                    ? "animate-pulse bg-amber-400"
                    : "bg-slate-500"
              }`}
            />
            <span className="text-slate-300">
              {liveStatus === "live" ? "LIVE" : liveStatus === "connecting" ? "SYNC…" : "OFFLINE"}
            </span>
          </div>
          <span className="truncate font-bold text-amber-400">
            {user?.role?.replace(/_/g, " ")}
          </span>
        </div>

        <nav
          className={`flex-1 space-y-5 overflow-y-auto px-3 py-4 text-xs font-medium ${
            sidebarCollapsed ? "lg:space-y-1 lg:px-2" : ""
          }`}
        >
          {grouped.map((group) => (
            <div key={group.id}>
              <div
                className={`mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${
                  sidebarCollapsed ? "lg:hidden" : ""
                }`}
              >
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
                      title={item.name}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
                        sidebarCollapsed ? "lg:justify-center lg:gap-0 lg:px-2" : ""
                      } ${
                        active
                          ? "bg-amber-600 font-bold text-white"
                          : "text-slate-300 hover:bg-navy-900 hover:text-white"
                      }`}
                    >
                      <item.icon
                        size={16}
                        className={active ? "text-white" : "text-slate-400"}
                      />
                      <span className={sidebarCollapsed ? "lg:hidden" : ""}>{item.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={`flex items-center justify-between gap-2 border-t border-amber-900/30 p-3 ${
            sidebarCollapsed ? "lg:flex-col lg:items-center" : ""
          }`}
        >
          <div
            className={`flex min-w-0 items-center gap-2 ${
              sidebarCollapsed ? "lg:justify-center lg:gap-0" : ""
            }`}
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-navy-700 bg-navy-800 text-xs font-bold text-amber-400">
              {user?.profileImage ? (
                <img src={user.profileImage} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className={`min-w-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <p className="truncate text-xs font-bold text-white">{displayName}</p>
              <p className="truncate font-mono text-[10px] text-slate-400">{companySlug}</p>
            </div>
          </div>
          <div
            className={`flex items-center gap-1 ${
              sidebarCollapsed ? "lg:flex-col" : ""
            }`}
          >
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-navy-900 hover:text-amber-400 lg:inline-flex"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button
              onClick={toggleTheme}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-900 hover:text-amber-400"
              title="Toggle theme"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-control-border bg-white px-4 dark:border-amber-900/30 dark:bg-control-darkCard sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="hidden rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-amber-700 lg:inline-flex dark:hover:bg-navy-900 dark:hover:text-amber-400"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <button
              className="rounded-md p-2 text-slate-500 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <div className="relative hidden w-56 sm:block md:w-80">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                ref={headerSearchRef}
                readOnly
                onFocus={openCommandPalette}
                onClick={openCommandPalette}
                placeholder="Ask TidyFlow… ⌘K"
                className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-12 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-amber-600 focus:outline-none dark:border-navy-900 dark:bg-navy-950 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={openCommandPalette}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1 font-mono text-[10px] text-slate-400 hover:border-amber-600 hover:text-amber-700 dark:border-navy-800 dark:bg-navy-900"
              >
                ⌘K
              </button>
            </div>
            <button
              type="button"
              onClick={openCommandPalette}
              className="rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[10px] font-bold text-slate-500 sm:hidden dark:border-navy-800"
              aria-label="Open command palette"
            >
              ⌘K
            </button>
          </div>

          <div className="flex items-center gap-2">
            {user &&
              ["OWNER", "MANAGER", "COMPANY_ADMIN", "DEVELOPER"].includes(
                String(user.role || "").toUpperCase()
              ) && (
                <Link
                  href="/account/billing?tab=usage"
                  className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-300 dark:hover:border-amber-700/50 dark:hover:bg-navy-900 sm:inline-flex"
                >
                  <CreditCard size={14} className="text-amber-600" />
                  Billing &amp; usage
                </Link>
              )}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-300 dark:hover:border-amber-700/40"
              title="Toggle theme"
            >
              {darkMode ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-navy-700" />}
              <span className="hidden sm:inline">{darkMode ? "Dark" : "Light"}</span>
            </button>
            <HeaderNotifications />
            <Link
              href={`${wsHref("jobs")}?create=1`}
              className="hidden items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-amber-glow transition hover:bg-amber-700 active:scale-95 sm:inline-flex"
            >
              <Plus size={14} strokeWidth={2.5} /> New Job
            </Link>
            <div className="relative">
              <button
                onClick={() => setUserMenu(!userMenu)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-navy-900"
              >
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-navy-200 bg-navy-100 text-sm font-semibold text-navy-800 dark:border-navy-700 dark:bg-navy-800 dark:text-amber-400">
                  {user?.profileImage ? (
                    <img src={user.profileImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-control-border bg-white p-2 shadow-lg dark:border-amber-900/30 dark:bg-control-darkCard">
                    <Link
                      href={wsHref("profile")}
                      onClick={() => setUserMenu(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-900"
                    >
                      <Settings size={14} /> Profile
                    </Link>
                    {user &&
                      ["OWNER", "MANAGER", "COMPANY_ADMIN", "DEVELOPER"].includes(
                        String(user.role || "").toUpperCase()
                      ) && (
                        <Link
                          href="/account/billing?tab=usage"
                          onClick={() => setUserMenu(false)}
                          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-900 sm:hidden"
                        >
                          <CreditCard size={14} /> Billing &amp; usage
                        </Link>
                      )}
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto max-w-[1600px] space-y-4 sm:space-y-6">
            <OpsCriticalBanner />
            <OpsOnboardingCard />
            <OpsStatusLegend compact />
            {children}
          </div>
        </main>
      </div>

      {/* ⌘K / Ctrl+K command palette */}
      {cmdOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-navy-950/50 pt-[12vh] backdrop-blur-[2px]">
          <div
            className="fixed inset-0"
            onClick={closeCommandPalette}
            aria-hidden
          />
          <div className="relative z-10 mx-2 w-full max-w-lg overflow-hidden rounded-xl border border-control-border bg-white shadow-2xl dark:border-amber-900/30 dark:bg-control-darkCard">
            <div className="flex items-center gap-2 border-b border-control-border px-4 dark:border-amber-900/30">
              <Search size={16} className="text-amber-600" />
              <input
                ref={cmdInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onCmdKeyDown}
                placeholder="Ask: unassigned tomorrow · bill client · job #42…"
                className="w-full bg-transparent py-3.5 text-sm font-medium text-navy-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
              <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline dark:border-navy-800 dark:bg-navy-950">
                ESC
              </kbd>
            </div>
            <div className="max-h-80 overflow-y-auto py-2">
              {flatCmd.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  Try “unassigned today”, “create invoice”, or a page name
                </p>
              ) : (
                <>
                  {cmdEntries.ask.length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center justify-between gap-2 px-4 py-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                          {cmdEntries.aiAskUsed ? "Ask TidyFlow · AI config" : "Ask TidyFlow"}
                        </span>
                        {cmdEntries.aiAskLoading && (
                          <span className="font-mono text-[9px] text-slate-400">thinking…</span>
                        )}
                      </div>
                      {cmdEntries.ask.map((item) => {
                        const idx = flatCmd.findIndex((f) => f.id === item.id)
                        const active = idx === cmdIndex
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onMouseEnter={() => setCmdIndex(idx)}
                            onClick={() => jumpToHref(item.href)}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                              active
                                ? "bg-amber-50 text-navy-900 dark:bg-amber-950/30 dark:text-white"
                                : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-900"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="flex items-center gap-2.5 font-semibold">
                                <Sparkles
                                  size={15}
                                  className={active ? "text-amber-600" : "text-amber-500/70"}
                                />
                                {item.label}
                              </span>
                              {item.detail && (
                                <span className="mt-0.5 block pl-7 text-[11px] font-normal text-slate-400">
                                  {item.detail}
                                </span>
                              )}
                            </span>
                            {active && (
                              <CornerDownLeft size={14} className="shrink-0 text-amber-600" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {cmdEntries.actions.length > 0 && (
                    <div className="mb-1">
                      <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Actions
                      </div>
                      {cmdEntries.actions.map((item) => {
                        const idx = flatCmd.indexOf(item)
                        const active = idx === cmdIndex
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onMouseEnter={() => setCmdIndex(idx)}
                            onClick={() => jumpToHref(item.href)}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                              active
                                ? "bg-amber-50 text-navy-900 dark:bg-amber-950/30 dark:text-white"
                                : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-900"
                            }`}
                          >
                            <span className="flex items-center gap-2.5 font-semibold">
                              <item.icon
                                size={15}
                                className={active ? "text-amber-600" : "text-slate-400"}
                              />
                              {item.name}
                            </span>
                            {active && (
                              <CornerDownLeft size={14} className="text-amber-600" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {cmdEntries.pages.length > 0 && (
                    <div>
                      <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Pages
                      </div>
                      {cmdEntries.pages.map((item) => {
                        const idx = flatCmd.indexOf(item)
                        const active = idx === cmdIndex
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onMouseEnter={() => setCmdIndex(idx)}
                            onClick={() => jumpToHref(item.href)}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                              active
                                ? "bg-amber-50 text-navy-900 dark:bg-amber-950/30 dark:text-white"
                                : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-900"
                            }`}
                          >
                            <span className="flex items-center gap-2.5 font-semibold">
                              <item.icon
                                size={15}
                                className={active ? "text-amber-600" : "text-slate-400"}
                              />
                              {item.name}
                            </span>
                            {active && (
                              <CornerDownLeft size={14} className="text-amber-600" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-control-border bg-slate-50 px-4 py-2 font-mono text-[10px] text-slate-400 dark:border-amber-900/30 dark:bg-navy-950">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span className="ml-auto">natural language · esc</span>
            </div>
          </div>
        </div>
      )}
    </div>
    </CurrencyProvider>
  )
}
