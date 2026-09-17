"use client"

import { useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate, formatMoney } from "@/lib/admin-session"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import {
  Wallet,
  AlertCircle,
  Loader2,
  Play,
  FileDown,
} from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsKpi,
  OpsCard,
  OpsTableShell,
  OpsPagination,
  OpsSkeleton,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"

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

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="Payroll"
        subtitle="Generate, approve, and pay staff for the selected period"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {alerts && alerts.totalActionCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-900 p-4 text-white">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-400" size={18} />
            <div className="text-sm">
              <span className="font-mono font-bold text-amber-400">ACTIONS NEEDED</span>
              <span className="ml-2 text-slate-300">
                {alerts.pendingHoursCount} pending hours · {alerts.pendingPayrollCount} pending
                payroll · {alerts.unpaidPayrollCount} unpaid
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsKpi label="Pending" value={stats.pending} />
        <OpsKpi label="Approved" value={stats.approved} />
        <OpsKpi label="Paid" value={stats.paid} />
        <OpsKpi label="Period total" value={formatMoney(stats.total)} />
      </div>

      <OpsCard>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-navy-900 dark:text-white">
          <Play size={16} className="text-amber-600" /> Run payroll
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Period start
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Period end
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Type
            <select
              value={payrollType}
              onChange={(e) => setPayrollType(e.target.value as any)}
              className={inputCls}
            >
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed salary</option>
            </select>
          </label>
          <div className="flex items-end">
            <OpsPrimaryButton onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="animate-spin" size={16} /> : <Wallet size={16} />}
              Generate
            </OpsPrimaryButton>
          </div>
        </div>
      </OpsCard>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-navy-800 dark:bg-navy-950"
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
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-navy-800 dark:bg-navy-950"
        >
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
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
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <OpsEmpty message="No payroll records for this month" />
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
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-navy-900/40">
                    <td className={`${opsTd} font-semibold text-navy-900 dark:text-white`}>
                      {personName(r.user)}
                      <div className="text-[11px] font-normal text-slate-400">
                        {r.payrollType || "—"}
                      </div>
                    </td>
                    <td className={`${opsTd} text-slate-600 dark:text-slate-300`}>
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </td>
                    <td className={`${opsTd} font-mono text-slate-600`}>
                      {r.hoursWorked != null ? Number(r.hoursWorked).toFixed(1) : "—"}
                    </td>
                    <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                      {formatMoney(r.netSalary ?? r.totalAmount)}
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={r.status} />
                    </td>
                    <td className={opsTd}>
                      <div className="flex justify-end gap-2">
                        {r.status === "pending" && (
                          <button
                            onClick={() => setStatus(r.id, "approved")}
                            disabled={actionId === r.id}
                            className="rounded px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {(r.status === "approved" || r.status === "pending") && (
                          <button
                            onClick={() => setStatus(r.id, "paid")}
                            disabled={actionId === r.id}
                            className="rounded px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          >
                            Mark paid
                          </button>
                        )}
                        <button
                          onClick={() => openInvoice(r.id)}
                          disabled={actionId === r.id}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          <FileDown size={12} /> Invoice
                        </button>
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
    </div>
  )
}
