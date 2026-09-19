"use client"

import { useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate, formatMoney } from "@/lib/admin-session"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import {
  Wallet,
  AlertCircle,
  Play,
  FileDown,
  CheckCircle2,
  Banknote,
} from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsKpi,
  OpsTableShell,
  OpsPagination,
  OpsSkeleton,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import {
  OpsDrawer,
  OpsField,
  OpsSecondaryButton,
  OpsRowAction,
  OpsDateField,
  opsFieldCls,
} from "@/components/ops/OpsForm"
import { OpsSpinner } from "@/components/ops/OpsLoader"

const PAGE_SIZE = 10

interface PayrollRecord {
  id: number
  status: string
  periodStart: string
  periodEnd: string
  totalAmount?: number
  netSalary?: number | null
  grossSalary?: number | null
  hoursWorked?: number | null
  payrollType?: string | null
  user?: { id: number; firstName?: string; lastName?: string; email?: string }
}

interface Alerts {
  pendingHoursCount: number
  unpaidPayrollCount: number
  pendingPayrollCount: number
  totalActionCount: number
}

function personName(u?: PayrollRecord["user"]) {
  if (!u) return "—"
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ")
  return n || u.email || "—"
}

export default function PayrollPage() {
  return (
    <AdminLayout>
      <ProtectedPage>
        <PayrollContent />
      </ProtectedPage>
    </AdminLayout>
  )
}

function PayrollContent() {
  const now = new Date()
  const [records, setRecords] = useState<PayrollRecord[]>([])
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [generating, setGenerating] = useState(false)
  const [showRun, setShowRun] = useState(false)
  const [periodStart, setPeriodStart] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  )
  const [periodEnd, setPeriodEnd] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  )
  const [payrollType, setPayrollType] = useState<"hourly" | "fixed">("hourly")
  const [actionId, setActionId] = useState<number | null>(null)
  const [tab, setTab] = useUrlQueryState("status", "all")
  const [page, setPage] = useState(1)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [listRes, alertsRes] = await Promise.all([
        adminGet("/api/payroll", { params: { page: 1, limit: 50, month, year } }),
        adminGet("/api/payroll/alerts"),
      ])
      if (listRes.data.success) {
        const raw = listRes.data.data
        setRecords(Array.isArray(raw) ? raw : [])
      } else {
        setRecords([])
        setError(listRes.data.message || "Failed to load payroll")
      }
      if (alertsRes.data.success) setAlerts(alertsRes.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load payroll")
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [month, year])

  useEffect(() => {
    setPage(1)
  }, [tab, month, year])

  const safeRecords = Array.isArray(records) ? records : []

  const stats = useMemo(() => {
    const pending = safeRecords.filter((r) => r.status === "pending").length
    const approved = safeRecords.filter((r) => r.status === "approved").length
    const paid = safeRecords.filter((r) => r.status === "paid").length
    const total = safeRecords.reduce(
      (s, r) => s + Number(r.netSalary ?? r.totalAmount ?? 0),
      0
    )
    return { pending, approved, paid, total }
  }, [safeRecords])

  const filtered =
    tab === "all" ? safeRecords : safeRecords.filter((r) => String(r.status) === tab)
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openRunForMonth = () => {
    const start = new Date(year, month - 1, 1).toISOString().slice(0, 10)
    const end = new Date(year, month, 0).toISOString().slice(0, 10)
    setPeriodStart(start)
    setPeriodEnd(end)
    setShowRun(true)
  }

  const generate = async () => {
    try {
      setGenerating(true)
      setError("")
      const res = await adminPost("/api/payroll/generate", {
        periodStart,
        periodEnd,
        payrollType,
        useAutoTax: true,
        autoApproveHours: false,
      })
      if (res.data.success) {
        const count = res.data.data?.generated ?? res.data.generated ?? 0
        setToast(res.data.message || `Generated ${count} record(s)`)
        setShowRun(false)
        await load()
      } else {
        setError(res.data.message || "Generate failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Generate failed")
    } finally {
      setGenerating(false)
    }
  }

  const setStatus = async (id: number, status: string) => {
    try {
      setActionId(id)
      const res = await adminPost(`/api/payroll/${id}/approve`, { status })
      if (res.data.success) {
        setToast(`Payroll marked ${status}`)
        await load()
      } else setError(res.data.message || "Update failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Update failed")
    } finally {
      setActionId(null)
    }
  }

  const openInvoice = async (id: number) => {
    try {
      setActionId(id)
      const res = await adminGet(`/api/payroll/${id}/invoice`)
      const url = res.data?.data?.downloadUrl || res.data?.data?.invoiceUrl
      if (url) window.open(url, "_blank")
      else setError("Invoice URL not available")
    } catch (e: any) {
      setError(e.response?.data?.message || "Could not open invoice")
    } finally {
      setActionId(null)
    }
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="Payroll"
        subtitle="Generate, approve, and pay staff for the selected period"
        actions={
          <div className="flex flex-wrap gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton onClick={openRunForMonth}>
              <Play size={14} /> Run payroll
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {alerts && alerts.totalActionCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-navy-950 p-4 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
              <AlertCircle className="text-amber-400" size={18} />
            </span>
            <div className="text-sm">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Actions needed
              </span>
              <p className="mt-0.5 text-slate-300">
                {alerts.pendingHoursCount} pending hours · {alerts.pendingPayrollCount} pending
                payroll · {alerts.unpaidPayrollCount} unpaid
              </p>
            </div>
          </div>
          <OpsPrimaryButton onClick={openRunForMonth}>
            <Wallet size={14} /> Run now
          </OpsPrimaryButton>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsKpi label="Pending" value={stats.pending} />
        <OpsKpi label="Approved" value={stats.approved} />
        <OpsKpi label="Paid" value={stats.paid} />
        <OpsKpi label="Period total" value={formatMoney(stats.total)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-control-border bg-white px-4 py-3 dark:border-amber-900/40 dark:bg-control-darkCard">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Viewing period
          </p>
          <p className="text-sm font-bold text-navy-900 dark:text-white">{monthLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className={`${opsFieldCls} h-9 w-auto py-1.5 text-xs font-semibold`}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={`${opsFieldCls} h-9 w-auto py-1.5 text-xs font-semibold`}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <OpsTableShell
        title="Payroll records"
        stickyHeader
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {filtered.length}
          </span>
        }
        tabs={[
          { id: "all", label: "All" },
          { id: "pending", label: "Pending" },
          { id: "approved", label: "Approved" },
          { id: "paid", label: "Paid" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        footer={<span>STAFF PAY · {monthLabel.toUpperCase()}</span>}
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No payroll records for this month"
            hint="Run payroll for the period to generate staff payment lines"
            ctaLabel="Run payroll"
            onCta={openRunForMonth}
          />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Employee</th>
                  <th className={opsTh}>Period</th>
                  <th className={opsTh}>Hours</th>
                  <th className={opsTh}>Net</th>
                  <th className={opsTh}>Status</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((r) => (
                  <tr key={r.id} className="hover:bg-amber-50/40 dark:hover:bg-navy-900/50">
                    <td className={opsTd}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-100 text-xs font-bold text-navy-800 dark:bg-navy-900 dark:text-amber-400">
                          {personName(r.user).slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-bold text-navy-900 dark:text-white">
                            {personName(r.user)}
                          </p>
                          <p className="font-mono text-[10px] uppercase text-slate-400">
                            {r.payrollType || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={`${opsTd} text-slate-600 dark:text-slate-300`}>
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </td>
                    <td className={`${opsTd} font-mono text-slate-600`}>
                      {r.hoursWorked != null ? Number(r.hoursWorked).toFixed(1) : "—"}
                    </td>
                    <td className={`${opsTd} font-mono text-base font-black text-navy-900 dark:text-white`}>
                      {formatMoney(r.netSalary ?? r.totalAmount)}
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={r.status} />
                    </td>
                    <td className={opsTd}>
                      <div className="flex flex-wrap justify-end gap-1">
                        {r.status === "pending" && (
                          <OpsRowAction
                            tone="emerald"
                            onClick={() => setStatus(r.id, "approved")}
                            disabled={actionId === r.id}
                          >
                            <CheckCircle2 size={12} /> Approve
                          </OpsRowAction>
                        )}
                        {(r.status === "approved" || r.status === "pending") && (
                          <OpsRowAction
                            tone="amber"
                            onClick={() => setStatus(r.id, "paid")}
                            disabled={actionId === r.id}
                          >
                            <Banknote size={12} /> Mark paid
                          </OpsRowAction>
                        )}
                        <OpsRowAction
                          tone="neutral"
                          onClick={() => openInvoice(r.id)}
                          disabled={actionId === r.id}
                        >
                          <FileDown size={12} /> Payslip
                        </OpsRowAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <OpsPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </OpsTableShell>

      <OpsDrawer
        open={showRun}
        onClose={() => setShowRun(false)}
        eyebrow="Payroll run"
        title="Generate payroll"
        subtitle="Create payment lines for the selected period"
        footer={
          <>
            <OpsSecondaryButton onClick={() => setShowRun(false)}>Cancel</OpsSecondaryButton>
            <OpsPrimaryButton onClick={generate} disabled={generating}>
              {generating ? <OpsSpinner className="border-amber-100 border-t-white" /> : <Wallet size={14} />}
              Generate records
            </OpsPrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-4 dark:border-amber-900/40 dark:from-amber-950/20 dark:via-navy-950 dark:to-navy-950">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Run preview
            </p>
            <p className="mt-1 text-lg font-black text-navy-900 dark:text-white">
              {formatDate(periodStart)} → {formatDate(periodEnd)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Type: <span className="font-bold capitalize text-navy-800 dark:text-slate-200">{payrollType}</span>
              {" · "}Tax auto-calc enabled
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <OpsDateField
              label="Period start"
              required
              value={periodStart}
              onChange={setPeriodStart}
            />
            <OpsDateField
              label="Period end"
              required
              value={periodEnd}
              onChange={setPeriodEnd}
            />
          </div>

          <OpsField label="Pay type" required>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "hourly", label: "Hourly", hint: "From approved hours" },
                  { id: "fixed", label: "Fixed", hint: "Salary schedule" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPayrollType(opt.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    payrollType === opt.id
                      ? "border-amber-500 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40"
                      : "border-slate-200 bg-white hover:border-amber-300 dark:border-navy-800 dark:bg-navy-950"
                  }`}
                >
                  <p className="text-sm font-bold text-navy-900 dark:text-white">{opt.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{opt.hint}</p>
                </button>
              ))}
            </div>
          </OpsField>

          <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500 dark:border-navy-800 dark:bg-navy-950">
            Generated lines appear as <strong>pending</strong>. Approve each (or mark paid) from the
            ledger. Hours still pending approval are not auto-included.
          </p>
        </div>
      </OpsDrawer>
    </div>
  )
}
