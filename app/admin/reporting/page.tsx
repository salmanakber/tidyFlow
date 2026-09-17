"use client"

import { useEffect, useState } from "react"
import axios from "axios"
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
} from "@/components/ops/OpsChrome"
import {
  Calendar,
  Download,
  Loader2,
  Copy,
  Handshake,
  PiggyBank,
  Wallet,
} from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts"

interface ReportData {
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
  dateRange: {
    start: string
    end: string
  }
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

function scoreBadgeClass(score: number) {
  if (score >= 4.5) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (score >= 4.0) return "bg-amber-50 text-amber-800 border-amber-200"
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

export default function ReportingPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState("")
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  })
  const [activeFilter, setActiveFilter] = useState("30d")
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv")

  const loadReports = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")

      const params: Record<string, string> = {
        startDate: dateRange.start,
        endDate: dateRange.end,
      }
      if (selectedCompanyId) params.companyId = selectedCompanyId

      const response = await axios.get("/api/admin/reporting", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })

      if (response.data.success) {
        setReportData(response.data.data)
      } else {
        setError(response.data.message || "Failed to load reports")
      }
    } catch (err: unknown) {
      console.error("Error loading reports:", err)
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not load workspace reports"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [dateRange])

  const handleQuickFilter = (days: number, label: string) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days)
    setDateRange({
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    })
    setActiveFilter(label)
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const selectedCompanyId = localStorage.getItem("selectedCompanyId")
      const response = await axios.get("/api/analytics/export", {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          format: exportFormat,
          startDate: dateRange.start,
          endDate: dateRange.end,
          companyId: selectedCompanyId,
        },
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
      setFlash({ ok: true, text: "Report downloaded." })
    } catch (err) {
      console.error("Error exporting report:", err)
      setFlash({ ok: false, text: "Failed to export report." })
    } finally {
      setIsExporting(false)
    }
  }

  const exportMarketerCsv = () => {
    const rows = reportData?.partnerReport?.marketers || []
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
    const s = reportData?.partnerReport?.summary
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
      lines.push(
        [
          "PLATFORM REVENUE",
          s.platformRevenue,
          "PAID % OF REVENUE",
          s.paidShareOfRevenuePct,
          "INVESTED CAPITAL",
          s.totalInvested,
          "EQUITY %",
          s.totalEquityAssigned,
          "",
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
    setFlash({ ok: true, text: "Marketer CSV downloaded." })
  }

  const copyMarketerSummary = async () => {
    const s = reportData?.partnerReport?.summary
    if (!s) return
    const text = [
      `TidyFlow partner revenue (${dateRange.start} → ${dateRange.end})`,
      `Platform revenue: ${money(s.platformRevenue)}`,
      `Paid to marketers: ${money(s.paidCommissions)} (${s.paidShareOfRevenuePct}% of revenue)`,
      `Pending marketer commissions: ${money(s.pendingCommissions)}`,
      `Total marketer commissions: ${money(s.totalCommissions)} (${s.marketerShareOfRevenuePct}% of revenue)`,
      `Retained after paid commissions: ${money(s.retainedRevenue)}`,
      `Investor capital: ${money(s.totalInvested)} · equity assigned: ${s.totalEquityAssigned}%`,
      `Active marketers: ${s.activeMarketers} · Active investors: ${s.activeInvestors}`,
    ].join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setFlash({ ok: true, text: "Partner summary copied — ready to share." })
    } catch {
      setFlash({ ok: false, text: "Could not copy to clipboard." })
    }
  }

  const issueChartData = reportData
    ? [
        { name: "Resolved", value: reportData.issueStats.resolved, color: "#059669" },
        { name: "Open", value: reportData.issueStats.open, color: "#D97706" },
        { name: "High sev", value: reportData.issueStats.highSeverity, color: "#DC2626" },
      ]
    : []

  if (loading && !reportData) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="animate-spin text-amber-600" size={28} />
        </div>
      </AdminLayout>
    )
  }

  const partner = reportData?.partnerReport
  const partnerSummary = partner?.summary
  const platformRev =
    partnerSummary?.platformRevenue || reportData?.billingSummary.totalRevenue || 0
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
            b.paidCommission + b.pendingCommission - (a.paidCommission + a.pendingCommission)
        )
        .slice(0, 5)
    : []
  const topInvestors = partner
    ? [...(partner.investors || [])]
        .sort((a, b) => b.investmentAmount - a.investmentAmount)
        .slice(0, 5)
    : []

  return (
    <AdminLayout>
      <RequirePermission permissions={[PERMISSIONS.REPORTS_VIEW]}>
        <div className="space-y-5">
          <OpsPageHeader
            eyebrow="Company workspace"
            title="Reporting"
            subtitle="Performance, billing, and ops health for your company"
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

          <OpsCard>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-navy-950">
                  <QuickDateBtn
                    label="7D"
                    active={activeFilter === "7d"}
                    onClick={() => handleQuickFilter(7, "7d")}
                  />
                  <QuickDateBtn
                    label="30D"
                    active={activeFilter === "30d"}
                    onClick={() => handleQuickFilter(30, "30d")}
                  />
                  <QuickDateBtn
                    label="90D"
                    active={activeFilter === "90d"}
                    onClick={() => handleQuickFilter(90, "90d")}
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
          </OpsCard>

          {reportData && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <OpsKpi
                label="Total revenue"
                value={money(reportData.billingSummary.totalRevenue)}
                hint="Workspace billing"
              />
              <OpsKpi
                label="Tasks completed"
                value={reportData.taskCompletion.completed}
                hint={`${reportData.taskCompletion.completionRate}% completion`}
              />
              <OpsKpi
                label="Active subs"
                value={reportData.billingSummary.activeSubscriptions}
                hint={`${reportData.billingSummary.failedPayments} failed payments`}
              />
              <OpsKpi
                label="Open issues"
                value={reportData.issueStats.open}
                hint={`${reportData.issueStats.highSeverity} high severity`}
              />
            </div>
          )}

          {partner && partnerSummary && (
            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 font-mono">
                    Partners
                  </p>
                  <h2 className="text-sm font-bold text-navy-900 dark:text-white">
                    Payouts vs revenue
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Marketer commissions and investor capital for this period.
                  </p>
                </div>
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
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <OpsCard>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Revenue split
                    </p>
                    <Wallet className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="text-2xl font-extrabold tabular-nums text-navy-900 dark:text-white">
                    {money(platformRev)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">Total revenue this period</p>
                  <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
                    <div className="h-full bg-amber-500" style={{ width: `${pendingPct}%` }} />
                    <div className="h-full bg-navy-800/30" style={{ width: `${retainedPct}%` }} />
                  </div>
                  <ul className="mt-4 space-y-2 text-sm">
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Paid to marketers
                      </span>
                      <span className="font-bold tabular-nums text-navy-900 dark:text-white">
                        {money(partnerSummary.paidCommissions)}
                        <span className="ml-1 text-[11px] font-normal text-slate-400">
                          {partnerSummary.paidShareOfRevenuePct}%
                        </span>
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Pending
                      </span>
                      <span className="font-bold tabular-nums text-navy-900 dark:text-white">
                        {money(partnerSummary.pendingCommissions)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 rounded-full bg-navy-800/40" />
                        Retained
                      </span>
                      <span className="font-bold tabular-nums text-navy-900 dark:text-white">
                        {money(partnerSummary.retainedRevenue)}
                      </span>
                    </li>
                  </ul>
                </OpsCard>

                <OpsCard>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Marketer payouts
                    </p>
                    <Handshake className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-control-border bg-slate-50 p-3 dark:border-control-darkBorder dark:bg-navy-950">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Paid out
                      </p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums text-navy-900 dark:text-white">
                        {money(partnerSummary.paidCommissions)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Still owed
                      </p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums text-amber-900">
                        {money(partnerSummary.pendingCommissions)}
                      </p>
                    </div>
                  </div>
                  <p className="mb-3 text-[11px] text-slate-500">
                    {partnerSummary.activeMarketers} active · {partnerSummary.attributedCustomers}{" "}
                    customers · {partnerSummary.marketerShareOfRevenuePct}% of revenue
                  </p>
                  {topMarketers.length === 0 ? (
                    <OpsEmpty message="No marketer commissions in this period." />
                  ) : (
                    <div className="space-y-2">
                      {topMarketers.map((m) => (
                        <div
                          key={m.partnerId}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-navy-900 dark:text-white">
                              {m.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {m.customersBrought} customers · {m.commissionPercent}%
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-bold tabular-nums text-navy-900 dark:text-white">
                              {money(m.paidCommission)}
                            </div>
                            <div className="text-[11px] tabular-nums text-amber-700">
                              +{money(m.pendingCommission)} due
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </OpsCard>

                <OpsCard>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Partner capital
                    </p>
                    <PiggyBank className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-control-border bg-slate-50 p-3 dark:border-control-darkBorder dark:bg-navy-950">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Invested
                      </p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums text-navy-900 dark:text-white">
                        {money(partnerSummary.totalInvested)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-control-border bg-slate-50 p-3 dark:border-control-darkBorder dark:bg-navy-950">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Equity
                      </p>
                      <p className="mt-1 text-lg font-extrabold tabular-nums text-navy-900 dark:text-white">
                        {partnerSummary.totalEquityAssigned}%
                      </p>
                    </div>
                  </div>
                  <p className="mb-3 text-[11px] text-slate-500">
                    {partnerSummary.activeInvestors} active · {partnerSummary.totalInvestors} on
                    record
                  </p>
                  {topInvestors.length === 0 ? (
                    <OpsEmpty message="No investor records yet." />
                  ) : (
                    <div className="space-y-2">
                      {topInvestors.map((inv) => (
                        <div
                          key={inv.partnerId}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-navy-900 dark:text-white">
                              {inv.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {inv.equityPercent}% equity
                            </div>
                          </div>
                          <div className="shrink-0 font-bold tabular-nums text-navy-900 dark:text-white">
                            {money(inv.investmentAmount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </OpsCard>
              </div>
            </section>
          )}

          {reportData && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                <OpsTableShell
                  title="Top performing cleaners"
                  badge={
                    <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                      Top 10
                    </span>
                  }
                  footer={<span>CLEANER SCOREBOARD · PERIOD</span>}
                >
                  {reportData.cleanerPerformance.length === 0 ? (
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
                        {reportData.cleanerPerformance.slice(0, 10).map((performer) => (
                          <tr
                            key={performer.cleanerId}
                            className="border-b border-control-border last:border-0 dark:border-navy-800"
                          >
                            <td className={`${opsTd} font-semibold text-navy-900 dark:text-white`}>
                              {performer.name}
                            </td>
                            <td className={`${opsTd} text-center tabular-nums text-slate-600`}>
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
                            <td className={`${opsTd} text-center tabular-nums text-slate-600`}>
                              {performer.onTimeRate}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </OpsTableShell>

                <OpsCard>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Task distribution
                  </p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-600">Completion progress</span>
                    <span className="font-extrabold tabular-nums text-navy-900 dark:text-white">
                      {reportData.taskCompletion.completionRate}%
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-600 transition-all"
                      style={{ width: `${reportData.taskCompletion.completionRate}%` }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-control-border bg-slate-50 p-3 text-center dark:border-control-darkBorder dark:bg-navy-950">
                      <div className="text-xl font-extrabold tabular-nums text-navy-900 dark:text-white">
                        {reportData.taskCompletion.completed}
                      </div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Done
                      </div>
                    </div>
                    <div className="rounded-lg border border-control-border bg-slate-50 p-3 text-center dark:border-control-darkBorder dark:bg-navy-950">
                      <div className="text-xl font-extrabold tabular-nums text-amber-700">
                        {reportData.taskCompletion.inProgress}
                      </div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Active
                      </div>
                    </div>
                    <div className="rounded-lg border border-control-border bg-slate-50 p-3 text-center dark:border-control-darkBorder dark:bg-navy-950">
                      <div className="text-xl font-extrabold tabular-nums text-slate-400">
                        {reportData.taskCompletion.pending}
                      </div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Pending
                      </div>
                    </div>
                  </div>
                </OpsCard>
              </div>

              <div className="space-y-5">
                <OpsCard>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Issue breakdown
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {reportData.issueStats.total} total reported issues
                  </p>
                  <div className="mt-4 h-56 w-full">
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
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-control-border pt-3 text-sm dark:border-navy-800">
                    <span className="flex items-center gap-2 text-slate-600">
                      Critical <OpsBadge status="high" />
                    </span>
                    <span className="font-bold tabular-nums text-navy-900 dark:text-white">
                      {reportData.issueStats.highSeverity}
                    </span>
                  </div>
                </OpsCard>

                <div className="overflow-hidden rounded-xl border border-navy-800 bg-navy-900 p-5 text-white shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                    Billing snapshot
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Period recurring revenue</p>
                  <p className="mt-3 text-3xl font-extrabold tabular-nums">
                    {money(reportData.billingSummary.totalRevenue)}
                  </p>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-sm">
                      <span className="text-slate-300">Active subs</span>
                      <span className="font-bold tabular-nums">
                        {reportData.billingSummary.activeSubscriptions}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-sm">
                      <span className="text-red-200">Failed payments</span>
                      <span className="font-bold tabular-nums text-red-100">
                        {reportData.billingSummary.failedPayments}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && !reportData && !error && (
            <OpsCard>
              <OpsEmpty message="No report data for this period yet." />
            </OpsCard>
          )}
        </div>
      </RequirePermission>
    </AdminLayout>
  )
}
