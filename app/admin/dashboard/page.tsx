"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import Link from "next/link"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import {
  ClipboardList,
  CheckCircle2,
  Timer,
  Clock,
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Calendar,
  Activity,
  ArrowRight,
} from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

interface DashboardStats {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  pendingTasks: number
  totalProperties: number
  totalCleaners: number
  totalCompanies: number
  completionRate: string
  todayJobs: number
  todayCompleted: number
  todayInProgress: number
  upcomingJobs: number
  openIssues: number
  todayCompletionRate: string
  activeCleanersToday: number
}

interface TaskRow {
  id: number
  title: string
  status: string
  createdAt?: string
  scheduledDate?: string | null
  property?: { address: string; clientName?: string | null }
  assignedUser?: { id: number; firstName?: string | null; lastName?: string | null } | null
  taskAssignments?: Array<{
    trackerActive?: boolean
    user?: { id: number; firstName?: string | null; lastName?: string | null }
  }>
}

interface CleanerPerformance {
  cleanerId: number
  name: string
  tasksCompleted: number
}

interface StatusSlice {
  status: string
  count: number
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  PLANNED: "#3b82f6",
  ASSIGNED: "#8b5cf6",
  IN_PROGRESS: "#d97706",
  SUBMITTED: "#06b6d4",
  QA_REVIEW: "#ec4899",
  APPROVED: "#10b981",
  COMPLETED: "#059669",
  REJECTED: "#ef4444",
  ARCHIVED: "#64748b",
  RESERVED: "#6366f1",
  AWAITING: "#f59e0b",
}

function cleanerLabel(task: TaskRow): string {
  if (task.assignedUser) {
    const n = [task.assignedUser.firstName, task.assignedUser.lastName].filter(Boolean).join(" ")
    if (n) return n
  }
  const fromAssign = task.taskAssignments?.[0]?.user
  if (fromAssign) {
    const n = [fromAssign.firstName, fromAssign.lastName].filter(Boolean).join(" ")
    if (n) return n
  }
  return "Unassigned"
}

export default function AdminDashboard() {
  const { href: wsHref } = useCompanyWorkspace()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentTasks, setRecentTasks] = useState<TaskRow[]>([])
  const [todayTasks, setTodayTasks] = useState<TaskRow[]>([])
  const [tasksByStatus, setTasksByStatus] = useState<StatusSlice[]>([])
  const [cleanerPerformance, setCleanerPerformance] = useState<CleanerPerformance[]>([])
  const [revenue, setRevenue] = useState<{
    currentMonthRevenue: number
    percentageChange: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const authHeaders = () => {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
    const companyId = localStorage.getItem("selectedCompanyId")
    return {
      Authorization: `Bearer ${token}`,
      ...(companyId ? { "X-Company-Id": companyId } : {}),
    }
  }

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError("")
      const headers = authHeaders()

      const [overviewRes, analyticsRes, revenueRes] = await Promise.all([
        axios.get("/api/dashboard/overview", { headers }),
        axios.get("/api/dashboard/analytics?days=30", { headers }),
        axios.get("/api/revenue/overview", { headers }).catch(() => null),
      ])

      if (overviewRes.data.success) {
        setStats(overviewRes.data.data.stats)
        setRecentTasks(overviewRes.data.data.recentTasks || [])
        setTodayTasks(overviewRes.data.data.todayTasks || [])
        setTasksByStatus(overviewRes.data.data.tasksByStatus || [])
      } else {
        setError(overviewRes.data.message || "Failed to load dashboard")
      }

      if (analyticsRes.data.success) {
        setCleanerPerformance(analyticsRes.data.data.cleanerPerformance || [])
      }

      if (revenueRes?.data?.success) {
        setRevenue({
          currentMonthRevenue: revenueRes.data.data.currentMonthRevenue ?? 0,
          percentageChange: revenueRes.data.data.percentageChange ?? 0,
        })
      }

      setLastUpdated(new Date())
    } catch (err: any) {
      console.error("Error loading dashboard:", err)
      setError(err.response?.data?.message || "Could not load dashboard data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  if (loading && !stats) {
    return <DashboardSkeleton />
  }

  const pieData = tasksByStatus
    .filter((s) => s.count > 0)
    .map((s) => ({
      name: s.status.replace(/_/g, " "),
      value: s.count,
      status: s.status,
    }))

  const barData = cleanerPerformance.slice(0, 6).map((c) => ({
    name: (c.name || "Cleaner").split(" ")[0] || "—",
    jobs: c.tasksCompleted,
  }))

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white tracking-tight">
              Operations Dashboard
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Live overview · updated{" "}
              {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-control-darkCard border border-control-border dark:border-control-darkBorder rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-amber-600 hover:text-amber-700 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {stats && stats.openIssues > 0 && (
          <section className="bg-navy-900 text-white rounded-xl p-4 border border-navy-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-amber-400 font-mono">ATTENTION</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-200">
                    {stats.openIssues} open issue{stats.openIssues === 1 ? "" : "s"} need review
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Resolve blockers before they delay today&apos;s jobs.
                </p>
              </div>
            </div>
            <Link
              href={wsHref("issues")}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold font-mono rounded-lg shadow-sm transition inline-flex items-center gap-1.5"
            >
              Review issues <ArrowRight size={14} />
            </Link>
          </section>
        )}

        {stats && (
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              label="Today's jobs"
              value={stats.todayJobs}
              icon={Calendar}
              accent="amber"
            />
            <KpiCard
              label="In progress"
              value={stats.todayInProgress}
              icon={Timer}
              accent="amber"
            />
            <KpiCard
              label="Completed today"
              value={stats.todayCompleted}
              icon={CheckCircle2}
              accent="emerald"
            />
            <KpiCard
              label="Upcoming (7d)"
              value={stats.upcomingJobs}
              icon={Clock}
              accent="navy"
            />
            <KpiCard
              label="Active cleaners"
              value={stats.activeCleanersToday}
              icon={Activity}
              accent="emerald"
              hint={`${stats.totalCleaners} on roster`}
            />
            <KpiCard
              label="Open issues"
              value={stats.openIssues}
              icon={AlertCircle}
              accent={stats.openIssues > 0 ? "red" : "navy"}
            />
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {stats && (
            <div className="bg-white dark:bg-control-darkCard rounded-xl p-5 border border-control-border dark:border-control-darkBorder shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Today completion
              </p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-extrabold text-navy-900 dark:text-white">
                  {stats.todayCompletionRate}%
                </span>
              </div>
              <div className="mt-4 w-full bg-slate-100 dark:bg-navy-900 rounded-full h-2">
                <div
                  className="bg-amber-600 h-2 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, Number(stats.todayCompletionRate) || 0)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {stats.todayCompleted} of {stats.todayJobs} jobs scheduled today
              </p>
            </div>
          )}

          <div className="bg-white dark:bg-control-darkCard rounded-xl p-5 border border-control-border dark:border-control-darkBorder shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Month revenue
            </p>
            {revenue ? (
              <>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-navy-900 dark:text-white">
                    {formatMoney(revenue.currentMonthRevenue)}
                  </span>
                  <span
                    className={`text-sm font-semibold mb-1 flex items-center ${
                      revenue.percentageChange >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {revenue.percentageChange >= 0 ? (
                      <TrendingUp size={14} className="mr-1" />
                    ) : (
                      <TrendingDown size={14} className="mr-1" />
                    )}
                    {Math.abs(revenue.percentageChange).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-4">
                  From job budgets · vs previous month
                </p>
              </>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Revenue data unavailable</p>
            )}
          </div>

          {stats && (
            <div className="bg-white dark:bg-control-darkCard rounded-xl p-5 border border-control-border dark:border-control-darkBorder shadow-sm flex items-center justify-between gap-4">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Properties
                  </p>
                  <p className="text-3xl font-extrabold text-navy-900 dark:text-white mt-1">
                    {stats.totalProperties}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Team cleaners
                  </p>
                  <p className="text-3xl font-extrabold text-navy-900 dark:text-white mt-1">
                    {stats.totalCleaners}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="w-12 h-12 rounded-xl bg-navy-50 dark:bg-navy-900 text-navy-700 dark:text-amber-400 flex items-center justify-center">
                  <Building2 size={22} />
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                  <Users size={22} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white dark:bg-control-darkCard rounded-xl border border-control-border dark:border-control-darkBorder shadow-sm flex flex-col">
            <div className="p-5 border-b border-control-border dark:border-control-darkBorder flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-navy-900 dark:text-white">
                  Today&apos;s schedule
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Jobs scheduled for today</p>
              </div>
              <Link
                href={wsHref("jobs")}
                className="text-xs font-bold text-amber-600 hover:text-amber-700"
              >
                View all jobs
              </Link>
            </div>
            <div className="flex-1 overflow-auto max-h-[420px]">
              {todayTasks.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] text-slate-500 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-5 py-3 font-bold">Job</th>
                      <th className="px-5 py-3 font-bold">Property</th>
                      <th className="px-5 py-3 font-bold">Cleaner</th>
                      <th className="px-5 py-3 font-bold">Status</th>
                      <th className="px-5 py-3 font-bold text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                    {todayTasks.map((task) => (
                      <tr
                        key={task.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-navy-900/50 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/tasks`}
                            className="font-semibold text-sm text-navy-900 dark:text-white hover:text-amber-600"
                          >
                            {task.title}
                          </Link>
                          <div className="text-[11px] text-slate-400 font-mono">#{task.id}</div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300 max-w-[180px] truncate">
                          {task.property?.address || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">
                          {cleanerLabel(task)}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={task.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm text-slate-500 font-mono">
                          {task.scheduledDate
                            ? new Date(task.scheduledDate).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="No jobs scheduled for today" />
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border dark:border-control-darkBorder shadow-sm p-5 flex flex-col">
            <h2 className="text-base font-bold text-navy-900 dark:text-white">Job status mix</h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">All jobs by status</p>
            {pieData.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={STATUS_COLORS[entry.status] || "#94a3b8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState message="No status data yet" />
            )}
            {stats && (
              <p className="mt-auto text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-navy-900">
                Overall completion {stats.completionRate}% · {stats.totalTasks} total jobs
              </p>
            )}
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { page: "jobs", label: "Jobs" },
            { page: "rota", label: "Rota" },
            { page: "payroll", label: "Payroll" },
            { page: "working-hours", label: "Hours" },
            { page: "expenses", label: "Expenses" },
            { page: "invoices", label: "Invoices" },
            { page: "leave", label: "Leave" },
            { page: "supplies", label: "Supplies" },
            { page: "qa", label: "QA" },
            { page: "safety", label: "GPS" },
            { page: "properties", label: "Properties" },
            { page: "team", label: "Team" },
          ].map((l) => (
            <Link
              key={l.page}
              href={wsHref(l.page)}
              className="text-center text-xs font-bold px-2 py-3 rounded-xl bg-white dark:bg-control-darkCard border border-control-border dark:border-control-darkBorder hover:border-amber-600 hover:text-amber-700 transition"
            >
              {l.label}
            </Link>
          ))}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white dark:bg-control-darkCard rounded-xl border border-control-border dark:border-control-darkBorder shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-navy-900 dark:text-white">
                  Cleaner activity (30d)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Jobs assigned per cleaner</p>
              </div>
              <Link
                href={wsHref("reporting")}
                className="text-xs font-bold text-amber-600 hover:text-amber-700"
              >
                Full reports
              </Link>
            </div>
            {barData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="jobs" fill="#D97706" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState message="No cleaner performance data for this period" />
            )}
          </div>

          <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border dark:border-control-darkBorder shadow-sm flex flex-col">
            <div className="p-5 border-b border-control-border dark:border-control-darkBorder">
              <h2 className="text-base font-bold text-navy-900 dark:text-white">Recent jobs</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-navy-900 flex-1">
              {recentTasks.length > 0 ? (
                recentTasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-navy-900/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy-900 dark:text-white truncate">
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {task.property?.address || "No property"}
                        </p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState message="No recent jobs" />
              )}
            </div>
            <div className="p-3 border-t border-control-border dark:border-control-darkBorder">
              <Link
                href={wsHref("jobs")}
                className="flex items-center justify-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-amber-600"
              >
                <ClipboardList size={14} /> Open job board
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `£${Math.round(n)}`
  }
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string
  value: number
  icon: any
  accent: "amber" | "emerald" | "navy" | "red"
  hint?: string
}) {
  const accents = {
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    navy: "bg-navy-50 text-navy-700 dark:bg-navy-900 dark:text-navy-200",
    red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  }
  return (
    <div className="bg-white dark:bg-control-darkCard rounded-xl p-4 border border-control-border dark:border-control-darkBorder shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1.5 tabular-nums">
            {value}
          </p>
          {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
        </div>
        <div className={`p-2 rounded-lg ${accents[accent]}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
    PLANNED: "bg-blue-50 text-blue-700 border-blue-200",
    ASSIGNED: "bg-violet-50 text-violet-700 border-violet-200",
    IN_PROGRESS: "bg-amber-50 text-amber-800 border-amber-200",
    SUBMITTED: "bg-cyan-50 text-cyan-700 border-cyan-200",
    QA_REVIEW: "bg-pink-50 text-pink-700 border-pink-200",
    APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    REJECTED: "bg-red-50 text-red-700 border-red-200",
    ARCHIVED: "bg-slate-100 text-slate-500 border-slate-200",
    RESERVED: "bg-indigo-50 text-indigo-700 border-indigo-200",
    AWAITING: "bg-amber-50 text-amber-700 border-amber-200",
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${
        styles[status] || "bg-slate-50 text-slate-600 border-slate-200"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <div className="bg-slate-50 dark:bg-navy-900 p-3 rounded-full mb-3">
        <AlertCircle className="text-slate-400" size={22} />
      </div>
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <AdminLayout>
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-navy-800 rounded w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-navy-800 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 bg-slate-200 dark:bg-navy-800 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 h-80 bg-slate-200 dark:bg-navy-800 rounded-xl" />
          <div className="h-80 bg-slate-200 dark:bg-navy-800 rounded-xl" />
        </div>
      </div>
    </AdminLayout>
  )
}
