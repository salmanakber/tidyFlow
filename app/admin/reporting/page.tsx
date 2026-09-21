"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import AdminLayout from "@/components/AdminLayout"
import RequirePermission from "@/components/RequirePermission"
import { PERMISSIONS } from "@/lib/permissions"
import {
  OpsPageHeader,
  OpsCard,
  OpsKpi,
  OpsTableShell,
  opsTh,
  opsTd,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsPrimaryButton,
  OpsSkeleton,
  OpsFilterChips,
} from "@/components/ops/OpsChrome"
import {
  adminGet,
  formatDate,
  getAdminAuthHeaders,
  withCompanyParams,
} from "@/lib/admin-session"
import {
  analyzeRevenueReport,
  type RevenueAnalysisReport,
} from "@/lib/ops-ai"
import { useCurrency } from "@/contexts/CurrencyContext"
import axios from "axios"
import {
  Calendar,
  Download,
  Loader2,
  Copy,
  Handshake,
  PiggyBank,
  Wallet,
  Sparkles,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  AlertTriangle,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"

/* ─── Types ─────────────────────────────────────────────────────────────── */

type TabId = "finance" | "operations" | "team" | "collections"

interface OpsReportData {
  taskCompletion: {
    total: number
    completed: number
    inProgress: number
    pending: number
    completionRate: number
  }
  cleanerPerformance: Array<{
    cleanerId: number
    name: string
    tasksCompleted: number
    averageScore: number
    onTimeRate: number
  }>
  issueStats: {
    total: number
    open: number
    resolved: number
    highSeverity: number
  }
  billingSummary: {
    totalRevenue: number
    activeSubscriptions: number
    failedPayments: number
  }
  partnerReport?: {
    summary: {
      platformRevenue: number
      activeMarketers: number
      totalMarketers: number
      activeInvestors: number
      totalInvestors: number
      attributedCustomers: number
      attributedRevenue: number
      totalCommissions: number
      pendingCommissions: number
      paidCommissions: number
      paidOutToMarketers: number
      marketerShareOfRevenuePct: number
      paidShareOfRevenuePct: number
      totalInvested: number
      totalEquityAssigned: number
      retainedRevenue: number
    }
    marketers: Array<{
      partnerId: number
      name: string
      email: string
      referralCode?: string | null
      status: string
      commissionPercent: number
      customersBrought: number
      revenueCollected: number
      commissionEarned: number
      pendingCommission: number
      paidCommission: number
    }>
    investors?: Array<{
      partnerId: number
      name: string
      email: string
      status: string
      investmentAmount: number
      equityPercent: number
      currency: string
    }>
  } | null
  dateRange: { start: string; end: string }
}

interface RevenueSummary {
  totalRevenue: number
  accrualRevenue: number
  cashRevenue: number
  totalExpenses: number
  laborCost: number
  supplyCogs: number
  operatingExpenses: number
  netProfit: number
  accrualProfit: number
  revenueBasis?: "cash" | "accrual"
  outstandingAR: number
  overdueAR: number
  unpaidInvoiceCount: number
  revenueTasksCount?: number
  paidInvoicesCount?: number
  payrollRecordsCount?: number
  expensesCount?: number
}

interface MarginRow {
  key: string
  label: string
  revenue: number
  margin: number
  marginPct: number | null
  jobCount?: number
  expenses?: number
  laborCost?: number
  cogs?: number
}

interface UnpaidInvoice {
  id: number
  invoiceNumber: string
  clientName: string
  amount: number
  status: string
  dueDate?: string | null
  sentAt?: string | null
  createdAt?: string | null
  overdue?: boolean
  propertyAddress?: string | null
}

interface RevenueReportData {
  summary: RevenueSummary
  chartData: Array<{
    date: string
    revenue: number
    expenses: number
    profit: number
    accrualRevenue?: number
    cashRevenue?: number
    laborCost?: number
  }>
  expensesByCategory: Array<{ category: string; amount: number }>
  marginByProperty: MarginRow[]
  marginByClient: MarginRow[]
  unpaidInvoices: UnpaidInvoice[]
}

type DatePreset = "month" | "30d" | "90d" | "custom"
type RevenueBasisView = "cash" | "accrual"

const PIE_COLORS = ["#0D1B2A", "#D97706", "#059669", "#DC2626", "#0284C7", "#7C3AED", "#64748B"]
const CHART_NAVY = "#0D1B2A"
const CHART_AMBER = "#D97706"
const CHART_ROSE = "#E11D48"
const CHART_EMERALD = "#059669"

const TABS: { id: TabId; label: string }[] = [
  { id: "finance", label: "Finance" },
  { id: "operations", label: "Operations" },
  { id: "team", label: "Team" },
  { id: "collections", label: "Collections" },
]

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function toISODate(d: Date) {
  return d.toISOString().split("T")[0]
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function scoreBadgeClass(score: number) {
  if (score >= 4.5) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (score >= 4.0) return "bg-amber-50 text-amber-800 border-amber-200"
  return "bg-slate-100 text-slate-600 border-slate-200"
}

function ratingClass(rating: string) {
  switch (rating) {
    case "strong":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "stable":
      return "bg-sky-50 text-sky-700 border-sky-200"
    case "weak":
      return "bg-amber-50 text-amber-800 border-amber-200"
    case "critical":
      return "bg-red-50 text-red-700 border-red-200"
    default:
      return "bg-slate-100 text-slate-600 border-slate-200"
  }
}

function priorityClass(p: string) {
  if (p === "high") return "bg-red-50 text-red-700 border-red-200"
  if (p === "medium") return "bg-amber-50 text-amber-800 border-amber-200"
  return "bg-slate-100 text-slate-600 border-slate-200"
}

function QuickDateBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-white px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm dark:bg-navy-800 dark:text-amber-400"
          : "rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-navy-900 dark:hover:text-white"
      }
    >
      {label}
    </button>
  )
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {eyebrow}
          </p>
        )}
        <h2 className="text-sm font-bold text-navy-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <OpsCard key={i}>
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200 dark:bg-navy-800" />
          <div className="mt-3 h-7 w-24 animate-pulse rounded bg-slate-100 dark:bg-navy-900" />
        </OpsCard>
      ))}
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function ReportingPage() {
  const { formatMoney, currency } = useCurrency()
  const [tab, setTab] = useState<TabId>("finance")
  const [opsData, setOpsData] = useState<OpsReportData | null>(null)
  const [revenueData, setRevenueData] = useState<RevenueReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [dateRange, setDateRange] = useState(() => ({
    start: toISODate(daysAgo(30)),
    end: toISODate(new Date()),
  }))
  const [activeFilter, setActiveFilter] = useState<DatePreset>("30d")
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv")
  const [basisView, setBasisView] = useState<RevenueBasisView>("cash")
  const [partnerOpen, setPartnerOpen] = useState(false)

  const [aiLoading, setAiLoading] = useState(false)
  const [aiReport, setAiReport] = useState<RevenueAnalysisReport | null>(null)

  const loadReports = useCallback(async () => {
    try {
      setLoading(true)
      setError("")

      const [opsRes, revRes] = await Promise.all([
        adminGet("/api/admin/reporting", {
          params: { startDate: dateRange.start, endDate: dateRange.end },
        }),
        adminGet("/api/revenue/report", {
          params: { from: dateRange.start, to: dateRange.end },
        }),
      ])

      if (opsRes.data?.success) {
        setOpsData(opsRes.data.data as OpsReportData)
      } else {
        setOpsData(null)
      }

      if (revRes.data?.success) {
        const payload = revRes.data.data as RevenueReportData
        setRevenueData(payload)
        if (payload.summary?.revenueBasis) {
          setBasisView(payload.summary.revenueBasis)
        }
      } else {
        setRevenueData(null)
      }

      if (!opsRes.data?.success && !revRes.data?.success) {
        setError(
          opsRes.data?.message ||
            revRes.data?.message ||
            "Failed to load reports"
        )
      }
    } catch (err: unknown) {
      console.error("Error loading reports:", err)
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Could not load workspace reports"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    loadReports()
    setAiReport(null)
  }, [loadReports])

  const applyPreset = (preset: DatePreset) => {
    const end = new Date()
    if (preset === "month") {
      setDateRange({ start: toISODate(startOfMonth()), end: toISODate(end) })
      setActiveFilter("month")
      return
    }
    if (preset === "30d") {
      setDateRange({ start: toISODate(daysAgo(30)), end: toISODate(end) })
      setActiveFilter("30d")
      return
    }
    if (preset === "90d") {
      setDateRange({ start: toISODate(daysAgo(90)), end: toISODate(end) })
      setActiveFilter("90d")
    }
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const response = await axios.get("/api/analytics/export", {
        headers: getAdminAuthHeaders(),
        params: withCompanyParams({
          format: exportFormat,
          startDate: dateRange.start,
          endDate: dateRange.end,
        }),
        responseType: "blob",
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute(
        "download",
        `tidyflow-report-${dateRange.start}-${dateRange.end}.${exportFormat}`
      )
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setFlash({ ok: true, text: "Report downloaded." })
    } catch (err) {
      console.error("Error exporting report:", err)
      setFlash({ ok: false, text: "Failed to export report." })
    } finally {
      setIsExporting(false)
    }
  }

  const runAiAnalysis = async () => {
    if (!revenueData || aiLoading) return
    try {
      setAiLoading(true)
      const analysis = await analyzeRevenueReport({
        from: dateRange.start,
        to: dateRange.end,
        focus: "overall",
        report: {
          summary: revenueData.summary as unknown as Record<string, unknown>,
          marginByProperty: revenueData.marginByProperty as unknown as Array<
            Record<string, unknown>
          >,
          marginByClient: revenueData.marginByClient as unknown as Array<
            Record<string, unknown>
          >,
          expensesByCategory: revenueData.expensesByCategory,
          unpaidInvoices: revenueData.unpaidInvoices as unknown as Array<
            Record<string, unknown>
          >,
        },
      })
      setAiReport(analysis)
      setFlash({ ok: true, text: "AI analysis ready." })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ||
        (err as { message?: string })?.message ||
        "Could not generate AI revenue analysis."
      setFlash({ ok: false, text: msg })
    } finally {
      setAiLoading(false)
    }
  }

  /* Finance derived */
  const summary = revenueData?.summary
  const useCashView = basisView === "cash"
  const displayRevenue = summary
    ? useCashView
      ? summary.cashRevenue ?? summary.totalRevenue
      : summary.accrualRevenue ?? summary.totalRevenue
    : 0
  const displayProfit = summary
    ? useCashView
      ? summary.netProfit
      : summary.accrualProfit ?? summary.netProfit
    : 0
  const displayExpenses = summary?.totalExpenses ?? 0
  const marginPct =
    displayRevenue > 0
      ? Math.round((displayProfit / displayRevenue) * 1000) / 10
      : 0

  const chartSeries = useMemo(() => {
    const rows = revenueData?.chartData || []
    return rows.map((d) => {
      const revenue = useCashView
        ? d.cashRevenue ?? d.revenue
        : d.accrualRevenue ?? d.revenue
      const expenses = d.expenses
      return {
        date: d.date,
        label: d.date.slice(5),
        revenue,
        expenses,
        profit: revenue - expenses,
      }
    })
  }, [revenueData, useCashView])

  const expensePie = useMemo(() => {
    const rows = [...(revenueData?.expensesByCategory || [])].sort(
      (a, b) => b.amount - a.amount
    )
    return rows.map((r, i) => ({
      name: r.category,
      value: r.amount,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))
  }, [revenueData])

  const issueChartData = opsData
    ? [
        { name: "Resolved", value: opsData.issueStats.resolved, color: CHART_EMERALD },
        { name: "Open", value: opsData.issueStats.open, color: CHART_AMBER },
        { name: "High sev", value: opsData.issueStats.highSeverity, color: CHART_ROSE },
      ]
    : []

  /* Partner block */
  const partner = opsData?.partnerReport
  const partnerSummary = partner?.summary
  const platformRev =
    partnerSummary?.platformRevenue || opsData?.billingSummary.totalRevenue || 0
  const paidPct =
    platformRev > 0 && partnerSummary
      ? Math.min(100, (partnerSummary.paidCommissions / platformRev) * 100)
      : 0
  const pendingPct =
    platformRev > 0 && partnerSummary
      ? Math.min(100 - paidPct, (partnerSummary.pendingCommissions / platformRev) * 100)
      : 0
  const retainedPct = Math.max(0, 100 - paidPct - pendingPct)
  const topMarketers = partner
    ? [...(partner.marketers || [])]
        .sort(
          (a, b) =>
            b.paidCommission +
            b.pendingCommission -
            (a.paidCommission + a.pendingCommission)
        )
        .slice(0, 5)
    : []
  const topInvestors = partner
    ? [...(partner.investors || [])]
        .sort((a, b) => b.investmentAmount - a.investmentAmount)
        .slice(0, 5)
    : []

  const exportMarketerCsv = () => {
    const rows = partner?.marketers || []
    if (!rows.length) {
      setFlash({ ok: false, text: "No marketer revenue data to export for this period." })
      return
    }
    const header = [
      "Marketer",
      "Email",
      "Status",
      "Commission %",
      "Customers",
      "Revenue collected",
      "Commission earned",
      "Pending / unpaid",
      "Paid",
      "Referral code",
    ]
    const lines = [
      header.join(","),
      ...rows.map((m) =>
        [
          `"${m.name.replace(/"/g, '""')}"`,
          m.email,
          m.status,
          m.commissionPercent,
          m.customersBrought,
          m.revenueCollected,
          m.commissionEarned,
          m.pendingCommission,
          m.paidCommission,
          m.referralCode || "",
        ].join(",")
      ),
    ]
    const s = partnerSummary
    if (s) {
      lines.push("")
      lines.push(
        [
          "TOTALS",
          "",
          "",
          "",
          s.attributedCustomers,
          s.attributedRevenue,
          s.totalCommissions,
          s.pendingCommissions,
          s.paidCommissions,
          "",
        ].join(",")
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute(
      "download",
      `tidyflow-marketer-revenue-${dateRange.start}-${dateRange.end}.csv`
    )
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    setFlash({ ok: true, text: "Marketer CSV downloaded." })
  }

  const copyMarketerSummary = async () => {
    const s = partnerSummary
    if (!s) return
    const text = [
      `TidyFlow partner revenue (${dateRange.start} → ${dateRange.end})`,
      `Platform revenue: ${formatMoney(s.platformRevenue)}`,
      `Paid to marketers: ${formatMoney(s.paidCommissions)} (${s.paidShareOfRevenuePct}% of revenue)`,
      `Pending marketer commissions: ${formatMoney(s.pendingCommissions)}`,
      `Total marketer commissions: ${formatMoney(s.totalCommissions)} (${s.marketerShareOfRevenuePct}% of revenue)`,
      `Retained after paid commissions: ${formatMoney(s.retainedRevenue)}`,
      `Investor capital: ${formatMoney(s.totalInvested)} · equity assigned: ${s.totalEquityAssigned}%`,
      `Active marketers: ${s.activeMarketers} · Active investors: ${s.activeInvestors}`,
    ].join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setFlash({ ok: true, text: "Partner summary copied — ready to share." })
    } catch {
      setFlash({ ok: false, text: "Could not copy to clipboard." })
    }
  }

  const showInitialSkeleton = loading && !opsData && !revenueData

  return (
    <AdminLayout>
      <RequirePermission permissions={[PERMISSIONS.REPORTS_VIEW]}>
        <div className="space-y-5">
          <OpsPageHeader
            eyebrow="Company workspace"
            title="Reporting"
            subtitle={`Ops performance, P&L, team scores & collections · ${currency}`}
            actions={
              <>
                <OpsRefreshButton onClick={loadReports} loading={loading} />
                <div className="flex overflow-hidden rounded-lg border border-control-border bg-white dark:border-control-darkBorder dark:bg-control-darkCard">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as "csv" | "pdf")}
                    className="border-none bg-transparent py-2 pl-3 pr-2 text-xs font-semibold text-slate-700 focus:outline-none dark:text-slate-200"
                  >
                    <option value="csv">CSV</option>
                    <option value="pdf">PDF</option>
                  </select>
                  <OpsPrimaryButton onClick={handleExport} disabled={isExporting}>
                    {isExporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Export
                  </OpsPrimaryButton>
                </div>
              </>
            }
          />

          {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}
          {flash && (
            <OpsFlash ok={flash.ok} text={flash.text} onClose={() => setFlash(null)} />
          )}

          {/* Date + tabs */}
          <OpsCard>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-navy-950">
                    <QuickDateBtn
                      label="This month"
                      active={activeFilter === "month"}
                      onClick={() => applyPreset("month")}
                    />
                    <QuickDateBtn
                      label="Last 30d"
                      active={activeFilter === "30d"}
                      onClick={() => applyPreset("30d")}
                    />
                    <QuickDateBtn
                      label="Last 90d"
                      active={activeFilter === "90d"}
                      onClick={() => applyPreset("90d")}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-control-border bg-white px-3 py-2 dark:border-control-darkBorder dark:bg-control-darkCard">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => {
                        setDateRange({ ...dateRange, start: e.target.value })
                        setActiveFilter("custom")
                      }}
                      className="w-28 border-none bg-transparent p-0 text-sm text-slate-700 focus:outline-none dark:text-slate-200"
                    />
                    <span className="text-slate-300">–</span>
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => {
                        setDateRange({ ...dateRange, end: e.target.value })
                        setActiveFilter("custom")
                      }}
                      className="w-28 border-none bg-transparent p-0 text-sm text-slate-700 focus:outline-none dark:text-slate-200"
                    />
                  </div>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Period · {dateRange.start} → {dateRange.end}
                </p>
              </div>

              <div className="flex flex-wrap gap-1 rounded-lg border border-control-border bg-slate-50 p-1 dark:border-navy-800 dark:bg-navy-950">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`rounded-md px-3.5 py-2 text-xs font-bold transition ${
                      tab === t.id
                        ? "bg-navy-900 text-amber-300 shadow-sm dark:bg-amber-600 dark:text-white"
                        : "text-slate-500 hover:text-navy-900 dark:hover:text-white"
                    }`}
                  >
                    {t.label}
                    {t.id === "collections" && summary?.unpaidInvoiceCount
                      ? ` (${summary.unpaidInvoiceCount})`
                      : ""}
                  </button>
                ))}
              </div>
            </div>
          </OpsCard>

          {showInitialSkeleton ? (
            <div className="space-y-4">
              <KpiSkeleton />
              <OpsCard>
                <OpsSkeleton rows={6} cols={4} message="Loading reporting suite…" />
              </OpsCard>
            </div>
          ) : (
            <>
              {/* ═══════════════ FINANCE ═══════════════ */}
              {tab === "finance" && (
                <div className="space-y-5">
                  {summary?.revenueBasis && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        API basis:{" "}
                        <span className="font-semibold text-navy-900 dark:text-white">
                          {summary.revenueBasis}
                        </span>
                        {" · "}
                        Viewing:
                      </p>
                      <OpsFilterChips
                        options={[
                          { id: "cash", label: "Cash" },
                          { id: "accrual", label: "Accrual" },
                        ]}
                        value={basisView}
                        onChange={(id) => setBasisView(id as RevenueBasisView)}
                      />
                    </div>
                  )}

                  {loading && !summary ? (
                    <KpiSkeleton />
                  ) : summary ? (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                      <OpsKpi
                        label="Revenue"
                        value={formatMoney(displayRevenue)}
                        hint={useCashView ? "Paid invoices" : "Job budgets"}
                      />
                      <OpsKpi
                        label="Expenses"
                        value={formatMoney(displayExpenses)}
                        hint={`Labor ${formatMoney(summary.laborCost)}`}
                      />
                      <OpsKpi
                        label="Net profit"
                        value={formatMoney(displayProfit)}
                        hint={displayProfit >= 0 ? "In the black" : "Loss period"}
                      />
                      <OpsKpi
                        label="Outstanding AR"
                        value={formatMoney(summary.outstandingAR)}
                        hint={`${summary.unpaidInvoiceCount || 0} unpaid`}
                      />
                      <OpsKpi
                        label="Overdue AR"
                        value={formatMoney(summary.overdueAR)}
                        hint="Past due date"
                      />
                      <OpsKpi
                        label="Margin %"
                        value={`${marginPct}%`}
                        hint={useCashView ? "Cash margin" : "Accrual margin"}
                      />
                    </div>
                  ) : (
                    <OpsCard>
                      <OpsEmpty
                        message="No finance data for this period"
                        hint="Create invoices, log expenses, or complete billed jobs"
                      />
                    </OpsCard>
                  )}

                  {/* AI analyze */}
                  <OpsCard>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                          <Sparkles size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-navy-900 dark:text-white">
                            AI profit analysis
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Narrative P&amp;L insights using your company AI config
                          </p>
                        </div>
                      </div>
                      <OpsPrimaryButton
                        onClick={runAiAnalysis}
                        disabled={aiLoading || !revenueData}
                      >
                        {aiLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {aiLoading ? "Analyzing…" : "Analyze"}
                      </OpsPrimaryButton>
                    </div>

                    {aiReport && (
                      <div className="mt-4 space-y-4 rounded-xl border border-control-border bg-slate-50 p-4 dark:border-navy-800 dark:bg-navy-950">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700">
                              {aiReport.periodLabel || "Analysis"}
                            </p>
                            <h3 className="mt-1 text-base font-extrabold text-navy-900 dark:text-white">
                              {aiReport.title}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                              {aiReport.executiveSummary}
                            </p>
                          </div>
                          {aiReport.profitHealth && (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase ${ratingClass(
                                aiReport.profitHealth.rating
                              )}`}
                            >
                              <TrendingUp size={12} />
                              {aiReport.profitHealth.rating} ·{" "}
                              {aiReport.profitHealth.score}
                            </span>
                          )}
                        </div>

                        {aiReport.profitHealth?.explanation && (
                          <p className="text-xs text-slate-500">
                            {aiReport.profitHealth.explanation}
                          </p>
                        )}

                        {(aiReport.highlights?.length > 0 ||
                          aiReport.risks?.length > 0) && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {aiReport.highlights?.length > 0 && (
                              <div>
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Insights
                                </p>
                                <ul className="space-y-1.5">
                                  {aiReport.highlights.map((h, i) => (
                                    <li
                                      key={i}
                                      className="flex gap-2 text-sm text-slate-700 dark:text-slate-300"
                                    >
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                      {h}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {aiReport.risks?.length > 0 && (
                              <div>
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Risks
                                </p>
                                <ul className="space-y-1.5">
                                  {aiReport.risks.map((r, i) => (
                                    <li
                                      key={i}
                                      className="flex gap-2 text-sm text-slate-700 dark:text-slate-300"
                                    >
                                      <AlertTriangle
                                        size={12}
                                        className="mt-0.5 shrink-0 text-amber-600"
                                      />
                                      {r}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {aiReport.recommendations?.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Recommendations
                            </p>
                            <div className="space-y-2">
                              {aiReport.recommendations.map((rec, i) => (
                                <div
                                  key={i}
                                  className="rounded-lg border border-control-border bg-white px-3 py-2.5 dark:border-navy-800 dark:bg-control-darkCard"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${priorityClass(
                                        rec.priority
                                      )}`}
                                    >
                                      {rec.priority}
                                    </span>
                                    <span className="text-sm font-semibold text-navy-900 dark:text-white">
                                      {rec.action}
                                    </span>
                                  </div>
                                  {rec.why && (
                                    <p className="mt-1 text-xs text-slate-500">{rec.why}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {aiReport.closingNote && (
                          <p className="border-t border-control-border pt-3 text-xs italic text-slate-400 dark:border-navy-800">
                            {aiReport.closingNote}
                            {!aiReport.aiGenerated ? " · Rule-based fallback" : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </OpsCard>

                  {/* Chart + expense pie */}
                  {summary && (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                      <OpsCard className="lg:col-span-2">
                        <SectionTitle
                          title="Revenue vs expenses"
                          subtitle={
                            useCashView
                              ? "Cash in (paid) vs outflows"
                              : "Accrual revenue vs outflows"
                          }
                        />
                        <div className="mt-4 h-[280px] w-full">
                          {chartSeries.every((d) => !d.revenue && !d.expenses) ? (
                            <OpsEmpty message="No chart activity in this range." />
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={chartSeries}
                                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                              >
                                <defs>
                                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop
                                      offset="0%"
                                      stopColor={CHART_EMERALD}
                                      stopOpacity={0.35}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor={CHART_EMERALD}
                                      stopOpacity={0.02}
                                    />
                                  </linearGradient>
                                  <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop
                                      offset="0%"
                                      stopColor={CHART_ROSE}
                                      stopOpacity={0.3}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor={CHART_ROSE}
                                      stopOpacity={0.02}
                                    />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#e2e8f0"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey="label"
                                  tick={{ fontSize: 10, fill: "#64748b" }}
                                  axisLine={false}
                                  tickLine={false}
                                  interval="preserveStartEnd"
                                />
                                <YAxis
                                  tick={{ fontSize: 10, fill: "#64748b" }}
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(v) =>
                                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                                  }
                                />
                                <RechartsTooltip
                                  formatter={(value: number, name: string) => [
                                    formatMoney(value),
                                    name === "revenue" ? "Revenue" : "Expenses",
                                  ]}
                                  labelFormatter={(l) => String(l)}
                                  contentStyle={{
                                    borderRadius: 8,
                                    border: "1px solid #e2e8f0",
                                    fontSize: 12,
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="revenue"
                                  stroke={CHART_EMERALD}
                                  fill="url(#revFill)"
                                  strokeWidth={2}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="expenses"
                                  stroke={CHART_ROSE}
                                  fill="url(#expFill)"
                                  strokeWidth={2}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </OpsCard>

                      <OpsCard>
                        <SectionTitle title="Expenses by category" />
                        <div className="mt-4 h-56 w-full">
                          {expensePie.length === 0 ? (
                            <OpsEmpty message="No expense categories yet." />
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={expensePie}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={48}
                                  outerRadius={72}
                                  paddingAngle={3}
                                  dataKey="value"
                                >
                                  {expensePie.map((entry, index) => (
                                    <Cell key={index} fill={entry.color} />
                                  ))}
                                </Pie>
                                <RechartsTooltip
                                  formatter={(v: number) => formatMoney(v)}
                                />
                                <Legend
                                  verticalAlign="bottom"
                                  height={48}
                                  wrapperStyle={{ fontSize: 10 }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </OpsCard>
                    </div>
                  )}

                  {/* Margin tables */}
                  {summary && (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <MarginTable
                        title="Top margin by property"
                        rows={(revenueData?.marginByProperty || []).slice(0, 8)}
                      />
                      <MarginTable
                        title="Top margin by client"
                        rows={(revenueData?.marginByClient || []).slice(0, 8)}
                      />
                    </div>
                  )}

                  {/* Partner / investor — secondary */}
                  {partner && partnerSummary && (
                    <OpsCard padding={false}>
                      <button
                        type="button"
                        onClick={() => setPartnerOpen((o) => !o)}
                        className="flex w-full items-center justify-between px-5 py-4 text-left"
                      >
                        <div>
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            Partners
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-navy-900 dark:text-white">
                            Marketer payouts &amp; investor capital
                          </p>
                        </div>
                        {partnerOpen ? (
                          <ChevronUp className="text-slate-400" size={18} />
                        ) : (
                          <ChevronDown className="text-slate-400" size={18} />
                        )}
                      </button>
                      {partnerOpen && (
                        <div className="space-y-3 border-t border-control-border px-5 pb-5 pt-4 dark:border-navy-800">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={copyMarketerSummary}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 dark:border-control-darkBorder dark:bg-control-darkCard dark:text-slate-200"
                            >
                              <Copy size={14} /> Copy summary
                            </button>
                            <button
                              type="button"
                              onClick={exportMarketerCsv}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 dark:border-control-darkBorder dark:bg-control-darkCard dark:text-slate-200"
                            >
                              <Download size={14} /> CSV
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                            <div className="rounded-xl border border-control-border p-4 dark:border-navy-800">
                              <div className="mb-3 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Revenue split
                                </p>
                                <Wallet className="h-4 w-4 text-amber-600" />
                              </div>
                              <p className="text-2xl font-extrabold tabular-nums text-navy-900 dark:text-white">
                                {formatMoney(platformRev)}
                              </p>
                              <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${paidPct}%` }}
                                />
                                <div
                                  className="h-full bg-amber-500"
                                  style={{ width: `${pendingPct}%` }}
                                />
                                <div
                                  className="h-full bg-navy-800/30"
                                  style={{ width: `${retainedPct}%` }}
                                />
                              </div>
                              <ul className="mt-4 space-y-2 text-sm">
                                <li className="flex justify-between">
                                  <span className="text-slate-600">Paid</span>
                                  <span className="font-bold tabular-nums">
                                    {formatMoney(partnerSummary.paidCommissions)}
                                  </span>
                                </li>
                                <li className="flex justify-between">
                                  <span className="text-slate-600">Pending</span>
                                  <span className="font-bold tabular-nums">
                                    {formatMoney(partnerSummary.pendingCommissions)}
                                  </span>
                                </li>
                                <li className="flex justify-between">
                                  <span className="text-slate-600">Retained</span>
                                  <span className="font-bold tabular-nums">
                                    {formatMoney(partnerSummary.retainedRevenue)}
                                  </span>
                                </li>
                              </ul>
                            </div>

                            <div className="rounded-xl border border-control-border p-4 dark:border-navy-800">
                              <div className="mb-3 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Top marketers
                                </p>
                                <Handshake className="h-4 w-4 text-amber-600" />
                              </div>
                              {topMarketers.length === 0 ? (
                                <OpsEmpty message="No marketer commissions." />
                              ) : (
                                <div className="space-y-2">
                                  {topMarketers.map((m) => (
                                    <div
                                      key={m.partnerId}
                                      className="flex justify-between gap-2 text-sm"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate font-semibold text-navy-900 dark:text-white">
                                          {m.name}
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                          {m.customersBrought} customers ·{" "}
                                          {m.commissionPercent}%
                                        </div>
                                      </div>
                                      <div className="shrink-0 text-right font-bold tabular-nums">
                                        {formatMoney(m.paidCommission)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl border border-control-border p-4 dark:border-navy-800">
                              <div className="mb-3 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Investors
                                </p>
                                <PiggyBank className="h-4 w-4 text-amber-600" />
                              </div>
                              <div className="mb-3 grid grid-cols-2 gap-2">
                                <div className="rounded-lg bg-slate-50 p-2 dark:bg-navy-950">
                                  <p className="text-[10px] uppercase text-slate-400">
                                    Invested
                                  </p>
                                  <p className="font-extrabold tabular-nums">
                                    {formatMoney(partnerSummary.totalInvested)}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-slate-50 p-2 dark:bg-navy-950">
                                  <p className="text-[10px] uppercase text-slate-400">
                                    Equity
                                  </p>
                                  <p className="font-extrabold tabular-nums">
                                    {partnerSummary.totalEquityAssigned}%
                                  </p>
                                </div>
                              </div>
                              {topInvestors.length === 0 ? (
                                <OpsEmpty message="No investor records." />
                              ) : (
                                <div className="space-y-2">
                                  {topInvestors.map((inv) => (
                                    <div
                                      key={inv.partnerId}
                                      className="flex justify-between text-sm"
                                    >
                                      <span className="truncate font-semibold">
                                        {inv.name}
                                      </span>
                                      <span className="font-bold tabular-nums">
                                        {formatMoney(inv.investmentAmount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </OpsCard>
                  )}
                </div>
              )}

              {/* ═══════════════ OPERATIONS ═══════════════ */}
              {tab === "operations" && (
                <div className="space-y-5">
                  {!opsData ? (
                    <OpsCard>
                      <OpsEmpty message="No operations data for this period." />
                    </OpsCard>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <OpsKpi
                          label="Tasks completed"
                          value={opsData.taskCompletion.completed}
                          hint={`${opsData.taskCompletion.completionRate}% completion`}
                        />
                        <OpsKpi
                          label="In progress"
                          value={opsData.taskCompletion.inProgress}
                          hint={`${opsData.taskCompletion.pending} pending`}
                        />
                        <OpsKpi
                          label="Open issues"
                          value={opsData.issueStats.open}
                          hint={`${opsData.issueStats.highSeverity} high severity`}
                        />
                        <OpsKpi
                          label="Active subs"
                          value={opsData.billingSummary.activeSubscriptions}
                          hint={`${opsData.billingSummary.failedPayments} failed payments`}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                        <div className="space-y-5 lg:col-span-2">
                          <OpsCard>
                            <SectionTitle title="Task distribution" />
                            <div className="mt-3 flex items-center justify-between text-sm">
                              <span className="text-slate-600">Completion progress</span>
                              <span className="font-extrabold tabular-nums text-navy-900 dark:text-white">
                                {opsData.taskCompletion.completionRate}%
                              </span>
                            </div>
                            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-amber-600 transition-all"
                                style={{
                                  width: `${opsData.taskCompletion.completionRate}%`,
                                }}
                              />
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-3">
                              <div className="rounded-lg border border-control-border bg-slate-50 p-3 text-center dark:border-control-darkBorder dark:bg-navy-950">
                                <div className="text-xl font-extrabold tabular-nums text-navy-900 dark:text-white">
                                  {opsData.taskCompletion.completed}
                                </div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Done
                                </div>
                              </div>
                              <div className="rounded-lg border border-control-border bg-slate-50 p-3 text-center dark:border-control-darkBorder dark:bg-navy-950">
                                <div className="text-xl font-extrabold tabular-nums text-amber-700">
                                  {opsData.taskCompletion.inProgress}
                                </div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Active
                                </div>
                              </div>
                              <div className="rounded-lg border border-control-border bg-slate-50 p-3 text-center dark:border-control-darkBorder dark:bg-navy-950">
                                <div className="text-xl font-extrabold tabular-nums text-slate-400">
                                  {opsData.taskCompletion.pending}
                                </div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Pending
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 h-[200px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={[
                                    {
                                      name: "Done",
                                      value: opsData.taskCompletion.completed,
                                    },
                                    {
                                      name: "Active",
                                      value: opsData.taskCompletion.inProgress,
                                    },
                                    {
                                      name: "Pending",
                                      value: opsData.taskCompletion.pending,
                                    },
                                  ]}
                                  margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="#e2e8f0"
                                    vertical={false}
                                  />
                                  <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <RechartsTooltip />
                                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                    <Cell fill={CHART_NAVY} />
                                    <Cell fill={CHART_AMBER} />
                                    <Cell fill="#94a3b8" />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </OpsCard>
                        </div>

                        <div className="space-y-5">
                          <OpsCard>
                            <SectionTitle
                              title="Issue breakdown"
                              subtitle={`${opsData.issueStats.total} total reported`}
                            />
                            <div className="mt-4 h-56 w-full">
                              {opsData.issueStats.total === 0 ? (
                                <OpsEmpty message="No issues in this period." />
                              ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={issueChartData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={55}
                                      outerRadius={75}
                                      paddingAngle={4}
                                      dataKey="value"
                                    >
                                      {issueChartData.map((entry, index) => (
                                        <Cell key={index} fill={entry.color} />
                                      ))}
                                    </Pie>
                                    <RechartsTooltip />
                                    <Legend verticalAlign="bottom" height={36} />
                                  </PieChart>
                                </ResponsiveContainer>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-control-border pt-3 text-sm dark:border-navy-800">
                              <span className="flex items-center gap-2 text-slate-600">
                                Critical <OpsBadge status="high" />
                              </span>
                              <span className="font-bold tabular-nums text-navy-900 dark:text-white">
                                {opsData.issueStats.highSeverity}
                              </span>
                            </div>
                          </OpsCard>

                          <div className="overflow-hidden rounded-xl border border-navy-800 bg-navy-900 p-5 text-white shadow-sm">
                            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                              Billing snapshot
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Workspace subscription revenue
                            </p>
                            <p className="mt-3 text-3xl font-extrabold tabular-nums">
                              {formatMoney(opsData.billingSummary.totalRevenue)}
                            </p>
                            <div className="mt-4 space-y-2">
                              <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-sm">
                                <span className="text-slate-300">Active subs</span>
                                <span className="font-bold tabular-nums">
                                  {opsData.billingSummary.activeSubscriptions}
                                </span>
                              </div>
                              <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm">
                                <span className="text-red-200">Failed payments</span>
                                <span className="font-bold tabular-nums text-red-100">
                                  {opsData.billingSummary.failedPayments}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ═══════════════ TEAM ═══════════════ */}
              {tab === "team" && (
                <OpsTableShell
                  title="Cleaner performance"
                  badge={
                    <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                      {(opsData?.cleanerPerformance || []).length}
                    </span>
                  }
                  footer={<span>TEAM SCOREBOARD · PERIOD</span>}
                >
                  {!opsData?.cleanerPerformance?.length ? (
                    <OpsEmpty message="No performance data for this period." />
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-control-border dark:border-navy-800">
                          <th className={opsTh}>Cleaner</th>
                          <th className={`${opsTh} text-center`}>Tasks</th>
                          <th className={`${opsTh} text-center`}>Avg score</th>
                          <th className={`${opsTh} text-center`}>On-time %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {opsData.cleanerPerformance.map((performer) => (
                          <tr
                            key={performer.cleanerId}
                            className="border-b border-control-border last:border-0 dark:border-navy-800"
                          >
                            <td
                              className={`${opsTd} font-semibold text-navy-900 dark:text-white`}
                            >
                              {performer.name}
                            </td>
                            <td
                              className={`${opsTd} text-center tabular-nums text-slate-600`}
                            >
                              {performer.tasksCompleted}
                            </td>
                            <td className={`${opsTd} text-center`}>
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${scoreBadgeClass(
                                  performer.averageScore
                                )}`}
                              >
                                {performer.averageScore.toFixed(1)}
                              </span>
                            </td>
                            <td
                              className={`${opsTd} text-center tabular-nums text-slate-600`}
                            >
                              {performer.onTimeRate}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </OpsTableShell>
              )}

              {/* ═══════════════ COLLECTIONS (AR) ═══════════════ */}
              {tab === "collections" && (
                <div className="space-y-5">
                  {summary && (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                      <OpsKpi
                        label="Outstanding AR"
                        value={formatMoney(summary.outstandingAR)}
                        hint={`${summary.unpaidInvoiceCount || 0} invoices`}
                      />
                      <OpsKpi
                        label="Overdue AR"
                        value={formatMoney(summary.overdueAR)}
                        hint="Past due"
                      />
                      <OpsKpi
                        label="Cash collected"
                        value={formatMoney(summary.cashRevenue)}
                        hint={`${summary.paidInvoicesCount || 0} paid invoices`}
                      />
                    </div>
                  )}

                  <OpsTableShell
                    title="Unpaid invoices"
                    badge={
                      <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                        {(revenueData?.unpaidInvoices || []).length}
                      </span>
                    }
                    footer={<span>ACCOUNTS RECEIVABLE · COLLECTIONS</span>}
                  >
                    {!(revenueData?.unpaidInvoices || []).length ? (
                      <OpsEmpty
                        message="No unpaid invoices"
                        hint="All invoices in this range are paid — or none issued yet"
                      />
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-control-border dark:border-navy-800">
                            <th className={opsTh}>Invoice</th>
                            <th className={opsTh}>Client</th>
                            <th className={opsTh}>Amount</th>
                            <th className={opsTh}>Status</th>
                            <th className={opsTh}>Due</th>
                            <th className={opsTh}>Property</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revenueData!.unpaidInvoices.map((inv) => (
                            <tr
                              key={inv.id}
                              className="border-b border-control-border last:border-0 dark:border-navy-800"
                            >
                              <td
                                className={`${opsTd} font-semibold text-navy-900 dark:text-white`}
                              >
                                {inv.invoiceNumber}
                              </td>
                              <td className={`${opsTd} text-slate-600`}>
                                {inv.clientName || "—"}
                              </td>
                              <td className={`${opsTd} font-bold tabular-nums`}>
                                {formatMoney(inv.amount)}
                              </td>
                              <td className={opsTd}>
                                {inv.overdue ? (
                                  <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                    Overdue
                                  </span>
                                ) : (
                                  <OpsBadge status={inv.status} />
                                )}
                              </td>
                              <td className={`${opsTd} tabular-nums text-slate-600`}>
                                {formatDate(inv.dueDate)}
                              </td>
                              <td
                                className={`${opsTd} max-w-[160px] truncate text-slate-500`}
                              >
                                {inv.propertyAddress || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </OpsTableShell>
                </div>
              )}
            </>
          )}
        </div>
      </RequirePermission>
    </AdminLayout>
  )
}

function MarginTable({ title, rows }: { title: string; rows: MarginRow[] }) {
  const { formatMoney } = useCurrency()
  return (
    <OpsTableShell title={title} footer={<span>MARGIN RANKING</span>}>
      {rows.length === 0 ? (
        <OpsEmpty message="No margin rows for this period." />
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-control-border dark:border-navy-800">
              <th className={opsTh}>Name</th>
              <th className={`${opsTh} text-right`}>Revenue</th>
              <th className={`${opsTh} text-right`}>Margin</th>
              <th className={`${opsTh} text-right`}>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-control-border last:border-0 dark:border-navy-800"
              >
                <td className={`${opsTd} max-w-[180px] truncate font-semibold text-navy-900 dark:text-white`}>
                  {row.label}
                </td>
                <td className={`${opsTd} text-right tabular-nums text-slate-600`}>
                  {formatMoney(row.revenue)}
                </td>
                <td
                  className={`${opsTd} text-right font-bold tabular-nums ${
                    row.margin >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {formatMoney(row.margin)}
                </td>
                <td className={`${opsTd} text-right tabular-nums text-slate-600`}>
                  {row.marginPct != null ? `${row.marginPct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </OpsTableShell>
  )
}
