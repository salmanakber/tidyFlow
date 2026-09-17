"use client"

import { useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import {
  adminGet,
  adminPost,
  formatDate,
  formatMoney,
  statusBadgeClass,
} from "@/lib/admin-session"
import {
  RefreshCw,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  FileDown,
} from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
} from "@/components/ops/OpsChrome"

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

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [listRes, alertsRes] = await Promise.all([
        adminGet("/api/payroll", { params: { page: 1, limit: 50, month, year } }),
        adminGet("/api/payroll/alerts"),
      ])
      if (listRes.data.success) setRecords(listRes.data.data || [])
      else setError(listRes.data.message || "Failed to load payroll")
      if (alertsRes.data.success) setAlerts(alertsRes.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load payroll")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [month, year])

  const stats = useMemo(() => {
    const pending = records.filter((r) => r.status === "pending").length
    const approved = records.filter((r) => r.status === "approved").length
    const paid = records.filter((r) => r.status === "paid").length
    const total = records.reduce(
      (s, r) => s + Number(r.netSalary ?? r.totalAmount ?? 0),
      0
    )
    return { pending, approved, paid, total }
  }, [records])

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

  return (
    <div className="space-y-6">
      <OpsPageHeader
        eyebrow="Finance"
        title="Payroll"
        subtitle="Generate, approve, and pay staff for the selected period"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {toast && <Banner kind="ok" text={toast} onClose={() => setToast("")} />}
      {error && <Banner kind="err" text={error} onClose={() => setError("")} />}

      {alerts && alerts.totalActionCount > 0 && (
        <div className="bg-navy-900 text-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-400" size={18} />
            <div className="text-sm">
              <span className="font-bold text-amber-400 font-mono">ACTIONS NEEDED</span>
              <span className="text-slate-300 ml-2">
                {alerts.pendingHoursCount} pending hours · {alerts.pendingPayrollCount} pending
                payroll · {alerts.unpaidPayrollCount} unpaid
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Pending" value={stats.pending} />
        <Stat label="Approved" value={stats.approved} />
        <Stat label="Paid" value={stats.paid} />
        <Stat label="Period total" value={formatMoney(stats.total)} />
      </div>

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border dark:border-control-darkBorder p-5 space-y-4">
        <h2 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
          <Play size={16} className="text-amber-600" /> Run payroll
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Period start">
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Period end">
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Type">
            <select
              value={payrollType}
              onChange={(e) => setPayrollType(e.target.value as any)}
              className="input"
            >
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed salary</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button
              onClick={generate}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm px-4 py-2.5 rounded-lg disabled:opacity-50"
            >
              {generating ? <Loader2 className="animate-spin" size={16} /> : <Wallet size={16} />}
              Generate
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border dark:border-control-darkBorder overflow-hidden">
        <div className="p-4 border-b border-control-border dark:border-control-darkBorder flex flex-wrap gap-3 items-center justify-between">
          <h2 className="font-bold text-navy-900 dark:text-white">Payroll records</h2>
          <div className="flex gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="input !py-1.5 !text-xs"
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
              className="input !py-1.5 !text-xs"
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingRows />
        ) : records.length === 0 ? (
          <Empty text="No payroll records for this month" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Net</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-navy-900/40">
                    <td className="px-4 py-3 font-semibold text-navy-900 dark:text-white">
                      {personName(r.user)}
                      <div className="text-[11px] text-slate-400 font-normal">
                        {r.payrollType || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {r.hoursWorked != null ? Number(r.hoursWorked).toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-navy-900 dark:text-white">
                      {formatMoney(r.netSalary ?? r.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${statusBadgeClass(
                          r.status
                        )}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {r.status === "pending" && (
                          <button
                            onClick={() => setStatus(r.id, "approved")}
                            disabled={actionId === r.id}
                            className="text-xs font-bold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded"
                          >
                            Approve
                          </button>
                        )}
                        {(r.status === "approved" || r.status === "pending") && (
                          <button
                            onClick={() => setStatus(r.id, "paid")}
                            disabled={actionId === r.id}
                            className="text-xs font-bold text-amber-700 hover:bg-amber-50 px-2 py-1 rounded"
                          >
                            Mark paid
                          </button>
                        )}
                        <button
                          onClick={() => openInvoice(r.id)}
                          disabled={actionId === r.id}
                          className="text-xs font-bold text-slate-600 hover:bg-slate-100 px-2 py-1 rounded inline-flex items-center gap-1"
                        >
                          <FileDown size={12} /> Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: white;
        }
        .dark .input {
          background: #070e1e;
          border-color: #16233b;
          color: #f1f5f9;
        }
      `}</style>
    </div>
  )
}

function Header({
  title,
  subtitle,
  onRefresh,
  loading,
}: {
  title: string
  subtitle: string
  onRefresh: () => void
  loading: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      </div>
      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-control-darkCard border border-control-border dark:border-control-darkBorder rounded-lg text-sm font-semibold"
      >
        <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
      </button>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border dark:border-control-darkBorder p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 space-y-1">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Banner({
  kind,
  text,
  onClose,
}: {
  kind: "ok" | "err"
  text: string
  onClose: () => void
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3 ${
        kind === "ok"
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      <span className="flex items-center gap-2">
        {kind === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
        {text}
      </span>
      <button onClick={onClose} className="text-xs font-bold opacity-70 hover:opacity-100">
        Dismiss
      </button>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-16 text-center text-sm text-slate-500">{text}</div>
}

function LoadingRows() {
  return (
    <div className="p-6 space-y-3 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 bg-slate-100 dark:bg-navy-900 rounded" />
      ))}
    </div>
  )
}
