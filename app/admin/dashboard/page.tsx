"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import Link from "next/link"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsTableShell,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import {
  CheckCircle2,
  Timer,
  MapPin,
  RefreshCw,
  AlertCircle,
  Calendar,
  Activity,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { JobStatusBadge } from "@/components/ops/JobInspectorDrawer"

interface DashboardStats {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  pendingTasks: number
  totalProperties: number
  totalCleaners: number
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

function formatMoney(n: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(n || 0)
  } catch {
    return `£${Math.round(n || 0)}`
  }
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

function scheduleLabel(iso?: string | null) {
  if (!iso) return "Unscheduled"
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function actionForStatus(status: string) {
  const s = status.toUpperCase()
  if (["PLANNED", "DRAFT"].includes(s))
    return { label: "DISPATCH NOW", solid: true }
  if (["ASSIGNED", "IN_PROGRESS"].includes(s))
    return { label: "ON-SITE LIVE", solid: false }
  if (["COMPLETED", "APPROVED", "ARCHIVED"].includes(s))
    return { label: "CLOSED", solid: false, muted: true }
  return { label: "OPEN", solid: false }
}

export default function AdminDashboard() {
  const { href: wsHref } = useCompanyWorkspace()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [todayTasks, setTodayTasks] = useState<TaskRow[]>([])
  const [recentTasks, setRecentTasks] = useState<TaskRow[]>([])
  const [revenue, setRevenue] = useState<{
    currentMonthRevenue: number
    percentageChange: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [queueTab, setQueueTab] = useState("all")

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const companyId = localStorage.getItem("selectedCompanyId")
      const headers = {
        Authorization: `Bearer ${token}`,
        ...(companyId ? { "X-Company-Id": companyId } : {}),
      }

      const [overviewRes, revenueRes] = await Promise.all([
        axios.get("/api/dashboard/overview", { headers }),
        axios.get("/api/revenue/overview", { headers }).catch(() => null),
      ])

      if (overviewRes.data.success) {
        setStats(overviewRes.data.data.stats)
        setTodayTasks(overviewRes.data.data.todayTasks || [])
        setRecentTasks(overviewRes.data.data.recentTasks || [])
      } else {
        setError(overviewRes.data.message || "Failed to load dashboard")
      }

      if (revenueRes?.data?.success) {
        setRevenue({
          currentMonthRevenue: revenueRes.data.data.currentMonthRevenue ?? 0,
          percentageChange: revenueRes.data.data.percentageChange ?? 0,
        })
      }
      setLastUpdated(new Date())
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load dashboard data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const queue = useMemo(() => {
    const base = todayTasks.length ? todayTasks : recentTasks
    if (queueTab === "active")
      return base.filter((t) =>
        ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "QA_REVIEW"].includes(t.status)
      )
    if (queueTab === "exceptions")
      return base.filter((t) => ["REJECTED", "DRAFT"].includes(t.status) || !t.assignedUser)
    if (queueTab === "completed")
      return base.filter((t) =>
        ["COMPLETED", "APPROVED", "ARCHIVED"].includes(t.status)
      )
    return base
  }, [todayTasks, recentTasks, queueTab])

  if (loading && !stats) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <RefreshCw className="animate-spin text-amber-600" size={28} />
        </div>
      </AdminLayout>
    )
  }

  const completion = Number(stats?.todayCompletionRate || 0)
  const atRisk = (stats?.openIssues || 0) + queue.filter((t) => !t.assignedUser).length

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Mission control"
          title="Dispatch board"
          subtitle={`Live overview · updated ${lastUpdated.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`}
          actions={<OpsRefreshButton onClick={loadDashboard} loading={loading} />}
        />

        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {stats && (stats.openIssues > 0 || atRisk > 0) && (
          <section className="flex flex-col justify-between gap-4 rounded-xl border border-navy-800 bg-navy-900 p-4 text-white shadow-sm lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="font-bold text-amber-400">AUTONOMOUS DISPATCH SENTINEL</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-200">
                    {stats.openIssues > 0
                      ? `${stats.openIssues} critical issue${stats.openIssues === 1 ? "" : "s"} require attention`
                      : `${atRisk} shift${atRisk === 1 ? "" : "s"} need assignment`}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Resolve conflicts before they delay today&apos;s cleanings.
                </p>
              </div>
            </div>
            <Link
              href={stats.openIssues > 0 ? wsHref("issues") : wsHref("jobs")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 font-mono text-xs font-bold text-white shadow-sm transition hover:bg-amber-700"
            >
              {stats.openIssues > 0 ? "REVIEW ISSUES" : "AUTO-ASSIGN"} <ArrowRight size={14} />
            </Link>
          </section>
        )}

        {stats && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <TelemetryKpi
              label="Scheduled today"
              value={stats.todayJobs}
              hint={`${stats.upcomingJobs} upcoming`}
              pct={100}
              bar="navy"
              icon={Calendar}
            />
            <TelemetryKpi
              label="In progress"
              value={stats.todayInProgress}
              hint="Live shifts"
              pct={stats.todayJobs ? (stats.todayInProgress / stats.todayJobs) * 100 : 0}
              bar="amber"
              icon={Timer}
            />
            <TelemetryKpi
              label="Shift at-risk"
              value={atRisk}
              hint="Action needed"
              pct={atRisk ? 60 : 0}
              bar="amber"
              icon={AlertCircle}
              emphasize
            />
            <TelemetryKpi
              label="Completed today"
              value={stats.todayCompleted}
              hint={`${completion}% rate`}
              pct={completion}
              bar="emerald"
              icon={CheckCircle2}
            />
            <TelemetryKpi
              label="GPS / active"
              value={stats.activeCleanersToday}
              hint={`${stats.totalCleaners} on roster`}
              pct={
                stats.totalCleaners
                  ? (stats.activeCleanersToday / stats.totalCleaners) * 100
                  : 0
              }
              bar="emerald"
              icon={Activity}
            />
            <TelemetryKpi
              label="Invoiced month"
              value={revenue ? formatMoney(revenue.currentMonthRevenue) : "—"}
              hint={
                revenue
                  ? `${revenue.percentageChange >= 0 ? "+" : ""}${revenue.percentageChange.toFixed(1)}%`
                  : "Revenue"
              }
              pct={70}
              bar="navy"
              icon={revenue && revenue.percentageChange >= 0 ? TrendingUp : TrendingDown}
            />
          </section>
        )}

        <OpsTableShell
          title="Active dispatch queue"
          badge={
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {queue.length}
            </span>
          }
          tabs={[
            { id: "all", label: "All" },
            { id: "active", label: "Active" },
            { id: "exceptions", label: "Exceptions" },
            { id: "completed", label: "Completed" },
          ]}
          activeTab={queueTab}
          onTabChange={setQueueTab}
          footer={
            <>
              <span>
                SHOWING {queue.length} JOB{queue.length === 1 ? "" : "S"}
              </span>
              <span className="text-emerald-600">QUICKBOOKS · READY</span>
            </>
          }
        >
          {queue.length === 0 ? (
            <OpsEmpty message="No jobs in this queue" />
          ) : (
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Shift ID</th>
                  <th className={opsTh}>Job / site</th>
                  <th className={opsTh}>Assigned crew</th>
                  <th className={opsTh}>Schedule</th>
                  <th className={opsTh}>Status</th>
                  <th className={`${opsTh} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {queue.map((task) => {
                  const action = actionForStatus(task.status)
                  const live = task.taskAssignments?.some((a) => a.trackerActive)
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10"
                    >
                      <td className={`${opsTd} font-mono text-xs font-bold text-amber-700`}>
                        #JOB-{task.id}
                      </td>
                      <td className={opsTd}>
                        <p className="font-bold text-navy-900 dark:text-white">{task.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          <MapPin size={10} />
                          {task.property?.address || "—"}
                        </p>
                      </td>
                      <td className={opsTd}>
                        {cleanerLabel(task) === "Unassigned" ? (
                          <span className="text-xs font-bold text-amber-700">Unassigned shift</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-100 text-[10px] font-bold text-navy-800 dark:bg-navy-800 dark:text-amber-400">
                              {cleanerLabel(task)[0]}
                            </span>
                            <div>
                              <p className="text-sm font-semibold">{cleanerLabel(task)}</p>
                              {live && (
                                <p className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  On-site live
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className={`${opsTd} font-mono text-xs text-slate-600`}>
                        {scheduleLabel(task.scheduledDate)}
                      </td>
                      <td className={opsTd}>
                        <JobStatusBadge status={task.status} />
                      </td>
                      <td className={`${opsTd} text-right`}>
                        <Link
                          href={`${wsHref("jobs")}?id=${task.id}`}
                          className={`inline-flex rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                            action.solid
                              ? "bg-amber-600 text-white shadow-amber-glow hover:bg-amber-700"
                              : action.muted
                                ? "border border-slate-200 text-slate-400"
                                : "border border-navy-200 text-navy-800 hover:border-amber-600 hover:text-amber-700 dark:border-navy-700 dark:text-slate-200"
                          }`}
                        >
                          {action.label}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </OpsTableShell>

        <div className="flex flex-wrap gap-3 text-xs">
          <Link
            href={wsHref("rota")}
            className="rounded-lg border border-control-border bg-white px-3 py-2 font-bold text-navy-900 hover:border-amber-600 dark:border-control-darkBorder dark:bg-control-darkCard dark:text-white"
          >
            Open rota matrix →
          </Link>
          <Link
            href={wsHref("calendar")}
            className="rounded-lg border border-control-border bg-white px-3 py-2 font-bold text-navy-900 hover:border-amber-600 dark:border-control-darkBorder dark:bg-control-darkCard dark:text-white"
          >
            Open calendar →
          </Link>
          <Link
            href={wsHref("reporting")}
            className="rounded-lg border border-control-border bg-white px-3 py-2 font-bold text-navy-900 hover:border-amber-600 dark:border-control-darkBorder dark:bg-control-darkCard dark:text-white"
          >
            Analytics & margins →
          </Link>
        </div>
      </div>
    </AdminLayout>
  )
}

function TelemetryKpi({
  label,
  value,
  hint,
  pct,
  bar,
  icon: Icon,
  emphasize,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  pct: number
  bar: "navy" | "amber" | "emerald"
  icon: React.ComponentType<{ className?: string; size?: number }>
  emphasize?: boolean
}) {
  const barCls =
    bar === "amber" ? "bg-amber-600" : bar === "emerald" ? "bg-emerald-500" : "bg-navy-900 dark:bg-amber-500"
  return (
    <div
      className={`rounded-xl border bg-white p-3.5 dark:bg-control-darkCard ${
        emphasize
          ? "border-l-4 border-l-amber-600 border-control-border dark:border-control-darkBorder"
          : "border-control-border dark:border-control-darkBorder"
      }`}
    >
      <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase text-slate-400">
        <span>{label}</span>
        <Icon
          size={14}
          className={emphasize ? "text-amber-500" : "text-slate-400"}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-2xl font-black ${
            emphasize ? "text-amber-600" : "text-navy-950 dark:text-white"
          }`}
        >
          {value}
        </span>
        {hint && (
          <span
            className={`truncate font-mono text-[10px] font-bold ${
              emphasize ? "text-amber-600" : "text-slate-500"
            }`}
          >
            {hint}
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-1.5 rounded-full ${barCls}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  )
}
