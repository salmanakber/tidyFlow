"use client"

import React, { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
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
  ChevronLeft,
  ChevronRight,
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
  Plus,
  Wallet,
  Clock3,
  Receipt,
  FileText,
  CalendarOff,
  Package,
  ShieldCheck,
} from "lucide-react"
import CompanySelector from "./CompanySelector"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import { isCompanyWorkspaceRole } from "@/lib/company-slug"

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

interface NavItem {
  name: string
  /** Path segment under /admin or /{companySlug} */
  page: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  permission: string | null
  roles: string[] | null
  group: string
  /** Hide from company owner/manager workspace (platform-only) */
  platformOnly?: boolean
  /** Owner-only (hide from managers) — matches mobile */
  ownerOnly?: boolean
}

interface AdminLayoutProps {
  children: React.ReactNode
}

const NAV_GROUPS = [
  { id: "mission", label: "Mission Control" },
  { id: "fleet", label: "Team & Assets" },
  { id: "finance", label: "Finance & HR" },
  { id: "insights", label: "Insights" },
  { id: "config", label: "Configuration" },
  { id: "platform", label: "Platform" },
] as const

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { isCompanyWorkspace, href: wsHref } = useCompanyWorkspace()
  const [user, setUser] = useState<User | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [userPermissions, setUserPermissions] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [darkMode, setDarkMode] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("selectedCompanyId")
      return stored ? parseInt(stored) : null
    }
    return null
  })
  const [openTicketCount, setOpenTicketCount] = useState<number>(0)

  // Light is default; dark is opt-in via localStorage
  useEffect(() => {
    const stored = localStorage.getItem("tidyflow-theme")
    const preferDark = stored === "dark"
    setDarkMode(preferDark)
    document.documentElement.classList.toggle("dark", preferDark)
    document.documentElement.classList.toggle("light", !preferDark)
  }, [])

  const toggleTheme = () => {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem("tidyflow-theme", next ? "dark" : "light")
    document.documentElement.classList.toggle("dark", next)
    document.documentElement.classList.toggle("light", !next)
  }

  const handleCompanyChange = (companyId: number | null) => {
    setSelectedCompanyId(companyId)
    if (companyId) {
      localStorage.setItem("selectedCompanyId", companyId.toString())
    } else {
      localStorage.removeItem("selectedCompanyId")
    }
  }

  useEffect(() => {
    loadUser()
    loadOpenTicketCount()
  }, [])

  useEffect(() => {
    if (user) {
      loadUserPermissions()
    }
  }, [user])

  const loadOpenTicketCount = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (!token) return

      const response = await axios.get("/api/admin/support-tickets/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data?.success) {
        setOpenTicketCount(response.data.data?.count || 0)
      }
    } catch (error) {
      console.error("Error loading support ticket count:", error)
    }
  }

  const loadUser = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const customerToken =
        localStorage.getItem("customerAuthToken") || sessionStorage.getItem("customerAuthToken")

      if (!token && customerToken) {
        router.push("/login")
        return
      }

      if (!token) {
        try {
          const response = await axios.get("/api/auth/me")
          if (response.data.success) {
            setUser(response.data.data.user)
            const company = response.data.data.company
            if (company?.name) setCompanyName(company.name)
            if (company?.id) localStorage.setItem("selectedCompanyId", String(company.id))
            if (response.data.data.token) {
              localStorage.setItem("authToken", response.data.data.token)
            }
            setLoading(false)
            return
          }
        } catch {
          router.push("/login")
          return
        }
      }

      const response = await axios.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setUser(response.data.data.user)
        const company = response.data.data.company
        if (company?.name) setCompanyName(company.name)
        if (company?.id) {
          localStorage.setItem("selectedCompanyId", String(company.id))
        }

        // Owners/managers should use /{companySlug}/… not /admin
        const role = response.data.data.user?.role
        if (
          isCompanyWorkspaceRole(role) &&
          pathname?.startsWith("/admin") &&
          !pathname.startsWith("/admin/control-center") &&
          company?.slug
        ) {
          const rest = pathname.replace(/^\/admin\/?/, "") || "dashboard"
          const mapped =
            rest === "tasks"
              ? "jobs"
              : rest === "users-management"
                ? "team"
                : rest === "client-invoices"
                  ? "invoices"
                  : rest
          router.replace(`/${company.slug}/${mapped}`)
          return
        }
      } else {
        localStorage.removeItem("authToken")
        sessionStorage.removeItem("authToken")
        router.push("/login")
      }
    } catch (error: any) {
      console.error("Error loading user:", error)
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem("authToken")
        sessionStorage.removeItem("authToken")
        router.push("/login")
      } else {
        setLoading(false)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadUserPermissions = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (!token) return

      const response = await axios.get("/api/auth/permissions", {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setUserPermissions(response.data.data.permissions || [])
      }
    } catch (error) {
      console.error("Error loading permissions:", error)
      setUserPermissions([])
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("authToken")
    localStorage.removeItem("userData")
    sessionStorage.removeItem("authToken")
    sessionStorage.removeItem("userData")
    router.push("/login")
  }

  const performLogout = async () => {
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      if (token) {
        await axios.post(
          "/api/auth/logout",
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }
    } catch (error) {
      console.error("Error during logout:", error)
    } finally {
      handleLogout()
    }
  }

  const baseNavigation: NavItem[] = [
    {
      name: "Dashboard",
      page: "dashboard",
      icon: LayoutDashboard,
      permission: null,
      roles: null,
      group: "mission",
    },
    {
      name: "Jobs",
      page: "jobs",
      icon: ClipboardList,
      permission: "tasks.view",
      roles: null,
      group: "mission",
    },
    {
      name: "Rota & Schedule",
      page: "rota",
      icon: CalendarDays,
      permission: "tasks.view",
      roles: null,
      group: "mission",
    },
    {
      name: "Recurring Jobs",
      page: "recurring-jobs",
      icon: RefreshCcw,
      permission: "tasks.view",
      roles: null,
      group: "mission",
    },
    {
      name: "Issues",
      page: "issues",
      icon: AlertCircle,
      permission: "tasks.view",
      roles: null,
      group: "mission",
    },
    {
      name: "Team",
      page: "team",
      icon: Users,
      permission: "users.view",
      roles: null,
      group: "fleet",
      ownerOnly: true,
    },
    {
      name: "Properties",
      page: "properties",
      icon: Building2,
      permission: "properties.view",
      roles: null,
      group: "fleet",
    },
    {
      name: "Safety & GPS",
      page: "safety",
      icon: MapPin,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "fleet",
    },
    {
      name: "Supplies",
      page: "supplies",
      icon: Package,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "fleet",
    },
    {
      name: "Leave",
      page: "leave",
      icon: CalendarOff,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "fleet",
    },
    {
      name: "Payroll",
      page: "payroll",
      icon: Wallet,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "finance",
    },
    {
      name: "Working Hours",
      page: "working-hours",
      icon: Clock3,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "finance",
    },
    {
      name: "Expenses",
      page: "expenses",
      icon: Receipt,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "finance",
    },
    {
      name: "Client Invoices",
      page: "invoices",
      icon: FileText,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "finance",
    },
    {
      name: "Reporting",
      page: "reporting",
      icon: BarChart3,
      permission: "reports.view",
      roles: null,
      group: "insights",
      ownerOnly: true,
    },
    {
      name: "Quality (QA)",
      page: "qa",
      icon: ShieldCheck,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "insights",
      ownerOnly: true,
    },
    {
      name: "TidyFlow AI",
      page: "ai",
      icon: Sparkles,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "MANAGER", "DEVELOPER", "SUPER_ADMIN"],
      group: "insights",
    },
    {
      name: "Notifications",
      page: "notifications",
      icon: Bell,
      permission: null,
      roles: ["COMPANY_ADMIN", "OWNER", "DEVELOPER", "SUPER_ADMIN"],
      group: "insights",
      ownerOnly: true,
    },
    {
      name: "Company Config",
      page: "company-config",
      icon: Camera,
      permission: "settings.view",
      roles: ["OWNER", "COMPANY_ADMIN", "MANAGER", "SUPER_ADMIN", "DEVELOPER", "ADMIN_UNIQUE"],
      group: "config",
    },
    {
      name: "Settings",
      page: "settings",
      icon: Settings,
      permission: "settings.view",
      roles: null,
      group: "config",
    },
    {
      name: "Sheets Sync",
      page: "sheets-sync",
      icon: Database,
      permission: "system.admin",
      roles: ["DEVELOPER", "OWNER", "SUPER_ADMIN"],
      group: "config",
    },
    {
      name: "Admin Configurations",
      page: "control-center/configurations",
      icon: SlidersHorizontal,
      permission: "system.admin",
      roles: ["SUPER_ADMIN", "DEVELOPER", "OWNER", "ADMIN_UNIQUE"],
      group: "config",
    },
    {
      name: "Admin Management",
      page: "admin-management",
      icon: Shield,
      permission: "users.manage_admins",
      roles: null,
      group: "platform",
    },
    {
      name: "Support Tickets",
      page: "support-tickets",
      icon: Ticket,
      permission: "support_tickets.view",
      roles: ["COMPANY_ADMIN", "OWNER", "DEVELOPER", "SUPER_ADMIN"],
      group: "platform",
    },
    {
      name: "Account Deletion",
      page: "account-deletion",
      icon: UserMinus,
      permission: "users.delete_account_request",
      roles: null,
      group: "platform",
    },
    {
      name: "Subscription Plans",
      page: "subscription",
      icon: Shield,
      permission: null,
      roles: ["DEVELOPER", "SUPER_ADMIN", "ADMIN_UNIQUE"],
      group: "platform",
    },
    {
      name: "Stripe Billing",
      page: "stripe",
      icon: CreditCard,
      permission: null,
      roles: ["DEVELOPER", "SUPER_ADMIN", "ADMIN_UNIQUE"],
      group: "platform",
    },
    {
      name: "AI Sales Agent",
      page: "marketing/ai-sales-agent",
      icon: Target,
      permission: null,
      roles: ["DEVELOPER", "OWNER", "SUPER_ADMIN", "ADMIN_UNIQUE"],
      group: "platform",
    },
    {
      name: "Partners & Investors",
      page: "partners",
      icon: Handshake,
      permission: null,
      roles: ["DEVELOPER", "SUPER_ADMIN", "ADMIN_UNIQUE", "OWNER"],
      group: "platform",
    },
  ]

  if (user?.role === "DEVELOPER" || user?.role === "OWNER" || user?.role === "SUPER_ADMIN") {
    baseNavigation.push({
      name: "Developer Tools",
      page: "developer",
      icon: Code,
      permission: "system.developer",
      roles: ["DEVELOPER", "OWNER", "SUPER_ADMIN"],
      group: "platform",
    })
  }

  const navigation = React.useMemo(() => {
    if (!user) return [] as NavItem[]

    let filtered = baseNavigation.filter((item) => {
      // Company owner/manager workspace: hide platform-only tools
      if (isCompanyWorkspace && (item.platformOnly || item.group === "platform")) {
        return false
      }
      if (isCompanyWorkspace && item.page.startsWith("control-center")) {
        return false
      }
      // Mobile parity: managers don't see Team / Announcements / QA / Analytics
      if (isCompanyWorkspace && user.role === "MANAGER" && item.ownerOnly) {
        return false
      }
      if (item.roles && user.role) {
        if (!item.roles.includes(user.role)) {
          return false
        }
      }

      if (item.permission) {
        if (user.role === "DEVELOPER" || user.role === "OWNER" || user.isHeadSuperAdmin) {
          return true
        }
        return userPermissions.includes(item.permission)
      }

      return true
    })

    const isHeadAdmin = user.isHeadSuperAdmin
    const hasSystemAccess =
      user.role === "DEVELOPER" ||
      user.role === "OWNER" ||
      isHeadAdmin ||
      ["system.admin", "system.developer"].some((key) => userPermissions.includes(key))

    if (
      !isCompanyWorkspace &&
      (user.role === "SUPER_ADMIN" || user.role === "OWNER" || user.role === "DEVELOPER") &&
      hasSystemAccess
    ) {
      filtered = [
        {
          name: "Control Center",
          page: "control-center",
          icon: Command,
          permission: "system.admin",
          roles: null,
          group: "platform",
          platformOnly: true,
        },
        ...filtered,
      ]
    }

    return filtered
  }, [user, userPermissions, isCompanyWorkspace])

  const filteredNavigation = searchTerm
    ? navigation.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : navigation

  const groupedNav = NAV_GROUPS.map((group) => ({
    ...group,
    items: filteredNavigation.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0)

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchTerm) {
      const matched = navigation.find((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      if (matched) {
        router.push(wsHref(matched.page))
        setSearchTerm("")
        setSidebarOpen(false)
      }
    }
  }

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.email || "User"
  const initials =
    user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "?"

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-control-canvas dark:bg-control-darkCanvas">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Loading TidyFlow…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-control-canvas dark:bg-control-darkCanvas text-slate-800 dark:text-slate-100 flex overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-navy-950/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Navy ops sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-navy-950 text-slate-300 border-r border-navy-900 flex flex-col transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "w-20" : "w-64"}`}
      >
        <div className="h-16 px-4 border-b border-navy-900 flex items-center justify-between flex-shrink-0">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg overflow-hidden shadow-amber-glow flex-shrink-0 bg-amber-600">
                <img
                  src="/assets/new-icon.png"
                  alt="TidyFlow"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="leading-tight truncate">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight text-white">
                    Tidy<span className="text-amber-500">Flow</span>
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">
                    OS
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  {isCompanyWorkspace
                    ? companyName || "Company workspace"
                    : "Operations Console"}
                </p>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg overflow-hidden mx-auto bg-amber-600">
              <img
                src="/assets/new-icon.png"
                alt="TidyFlow"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-1 rounded-md text-slate-400 hover:text-white hover:bg-navy-900"
              title={sidebarCollapsed ? "Expand" : "Collapse"}
            >
              {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md text-slate-400 hover:text-white hover:bg-navy-900"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <div className="px-4 py-2 bg-navy-900/80 border-b border-navy-900 flex items-center justify-between text-[11px] font-mono flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-300">LIVE</span>
            </div>
            <span className="text-amber-400 font-bold truncate ml-2">
              {user?.role?.replace(/_/g, " ")}
            </span>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 text-xs font-medium">
          {groupedNav.map((group) => (
            <div key={group.id}>
              {!sidebarCollapsed && (
                <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const itemHref = wsHref(item.page)
                  const isActive =
                    pathname === itemHref || pathname?.startsWith(itemHref + "/")
                  return (
                    <Link
                      key={item.name}
                      href={itemHref}
                      onClick={() => setSidebarOpen(false)}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`flex items-center ${
                        sidebarCollapsed ? "justify-center" : "justify-between"
                      } px-2.5 py-2 rounded-lg transition ${
                        isActive
                          ? "bg-amber-600 text-white font-bold"
                          : "text-slate-300 hover:bg-navy-900 hover:text-white"
                      }`}
                    >
                      <div
                        className={`flex items-center ${sidebarCollapsed ? "" : "space-x-2.5"}`}
                      >
                        <item.icon
                          size={16}
                          className={
                            isActive ? "text-white" : "text-slate-400"
                          }
                        />
                        {!sidebarCollapsed && <span>{item.name}</span>}
                      </div>
                      {!sidebarCollapsed &&
                        item.name === "Support Tickets" &&
                        openTicketCount > 0 && (
                          <span className="text-[10px] font-mono font-bold bg-navy-950 text-amber-300 px-1.5 py-0.5 rounded">
                            {openTicketCount > 99 ? "99+" : openTicketCount}
                          </span>
                        )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-navy-900 bg-navy-950/60 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            {!sidebarCollapsed ? (
              <div className="flex items-center space-x-2.5 overflow-hidden min-w-0">
                <div className="w-8 h-8 rounded bg-navy-800 border border-navy-700 flex items-center justify-center font-bold text-amber-400 text-xs flex-shrink-0 overflow-hidden">
                  {user?.profileImage ? (
                    <img
                      src={user.profileImage}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="leading-tight truncate">
                  <p className="text-xs font-bold text-white truncate">{displayName}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate capitalize">
                    {user?.role?.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded bg-navy-800 border border-navy-700 flex items-center justify-center font-bold text-amber-400 text-xs mx-auto overflow-hidden">
                {user?.profileImage ? (
                  <img
                    src={user.profileImage}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
            )}
            <button
              id="themeBtn"
              onClick={toggleTheme}
              className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-navy-900 transition flex-shrink-0"
              title="Toggle light / dark"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main surface */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white dark:bg-control-darkCard border-b border-control-border dark:border-control-darkBorder px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-900 rounded-md"
            >
              <Menu size={22} />
            </button>

            <div className="relative hidden md:block w-80 max-w-full">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                size={14}
              />
              <input
                type="text"
                placeholder="Jump to: jobs, properties, team…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleSearchKeyPress}
                className="w-full pl-9 pr-12 py-1.5 text-xs bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-navy-900 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-600 font-medium transition"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-white dark:bg-navy-900 px-1 rounded border border-slate-200 dark:border-navy-800">
                ⌘K
              </span>
              {searchTerm && filteredNavigation.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-control-darkCard border border-control-border dark:border-control-darkBorder rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  {filteredNavigation.map((item) => (
                    <Link
                      key={item.page}
                      href={wsHref(item.page)}
                      onClick={() => {
                        setSearchTerm("")
                        setSidebarOpen(false)
                      }}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-navy-900 transition-colors"
                    >
                      <item.icon size={16} className="text-slate-400" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {item.name}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {(user?.role === "SUPER_ADMIN" ||
              user?.role === "DEVELOPER") &&
              !isCompanyWorkspace && (
              <>
                <CompanySelector
                  selectedCompanyId={selectedCompanyId}
                  onCompanyChange={handleCompanyChange}
                  userRole={user?.role || ""}
                />
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
              </>
            )}

            <Link
              href={wsHref("jobs")}
              className="hidden sm:inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg font-bold text-xs shadow-amber-glow transition active:scale-95"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>New Job</span>
            </Link>

            <button
              onClick={performLogout}
              className="hidden sm:flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>

            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-900 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-navy-100 dark:bg-navy-800 border border-navy-200 dark:border-navy-700 flex items-center justify-center text-navy-800 dark:text-amber-400 font-semibold text-sm overflow-hidden">
                  {user?.profileImage ? (
                    <img
                      src={user.profileImage}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <span className="hidden sm:block text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                  {user?.firstName || user?.email?.split("@")[0] || "User"}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform ${
                    userDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-control-darkCard border border-control-border dark:border-control-darkBorder rounded-lg shadow-lg z-20">
                    <div className="p-2">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-navy-800">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {displayName}
                        </div>
                        <p className="text-xs text-slate-500 capitalize mt-1">
                          {user?.role?.replace(/_/g, " ").toLowerCase()}
                        </p>
                      </div>
                      <Link
                        href={wsHref("profile")}
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-navy-900 transition-colors"
                      >
                        <Settings size={16} />
                        <span>My Profile</span>
                      </Link>
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false)
                          performLogout()
                        }}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors w-full text-left"
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </div>
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
