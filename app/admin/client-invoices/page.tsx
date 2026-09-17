"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, formatDate, formatMoney, statusBadgeClass } from "@/lib/admin-session"
import { RefreshCw, FileText, Loader2, Send, Plus } from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsPrimaryButton,
} from "@/components/ops/OpsChrome"

export default function ClientInvoicesPage() {
  return (
    <AdminLayout>
      <ProtectedPage>
        <Content />
      </ProtectedPage>
    </AdminLayout>
  )
}

function Content() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [eligible, setEligible] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([])
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [invRes, elRes] = await Promise.all([
        adminGet("/api/client-invoices"),
        adminGet("/api/client-invoices/eligible-tasks").catch(() => ({ data: { success: false } })),
      ])
      if (invRes.data.success) setInvoices(invRes.data.data || [])
      else setError(invRes.data.message || "Failed to load invoices")
      if (elRes.data?.success) {
        const raw = elRes.data.data
        setEligible(Array.isArray(raw) ? raw : raw?.tasks || [])
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleTask = (id: number) => {
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const create = async () => {
    if (!selectedTaskIds.length) {
      setError("Select at least one job")
      return
    }
    try {
      setCreating(true)
      const res = await adminPost("/api/client-invoices", {
        taskIds: selectedTaskIds,
      })
      if (res.data.success) {
        setToast("Invoice created")
        setShowCreate(false)
        setSelectedTaskIds([])
        await load()
      } else setError(res.data.message || "Create failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Create failed")
    } finally {
      setCreating(false)
    }
  }

  const markPaid = async (id: number) => {
    try {
      setBusyId(id)
      const res = await adminPatch(`/api/client-invoices/${id}`, { status: "paid" })
      if (res.data.success) {
        setToast("Marked paid")
        await load()
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const sendInvoice = async (id: number) => {
    try {
      setBusyId(id)
      const res = await adminPost(`/api/client-invoices/${id}/send`, { channel: "email" })
      if (res.data.success) {
        setToast(res.data.message || "Invoice sent")
        await load()
      } else setError(res.data.message || "Send failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Send failed")
    } finally {
      setBusyId(null)
    }
  }

  const unpaid = invoices.filter((i) => i.status !== "paid").length
  const revenue = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total ?? i.amount ?? 0), 0)

  return (
    <div className="space-y-6">
      <OpsPageHeader
        eyebrow="Finance"
        title="Client invoices"
        subtitle="Bill clients for completed jobs"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create invoice
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <Flash ok text={toast} onClose={() => setToast("")} />}
      {error && <Flash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Invoices" value={invoices.length} />
        <Stat label="Unpaid" value={unpaid} />
        <Stat label="Paid total" value={formatMoney(revenue)} />
      </div>

      {showCreate && (
        <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy-900 dark:text-white flex items-center gap-2">
              <FileText size={16} className="text-amber-600" /> Select eligible jobs
            </h2>
            <button onClick={() => setShowCreate(false)} className="text-sm font-semibold text-slate-500">
              Close
            </button>
          </div>
          {eligible.length === 0 ? (
            <p className="text-sm text-slate-500">No eligible jobs found for invoicing.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {eligible.map((t: any) => (
                <label
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.includes(t.id)}
                    onChange={() => toggleTask(t.id)}
                    className="rounded text-amber-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{t.title}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {t.property?.address || t.propertyAddress || "—"}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-slate-500">#{t.id}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={create}
              disabled={creating || !selectedTaskIds.length}
              className="inline-flex items-center gap-2 bg-navy-900 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {creating ? <Loader2 className="animate-spin" size={14} /> : null}
              Create from {selectedTaskIds.length} job(s)
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No client invoices yet</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-semibold">
                    #{inv.invoiceNumber || inv.id}
                    <div className="text-xs text-slate-400 font-normal">
                      {inv.task?.title || inv.property?.address || ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {inv.clientName || inv.property?.clientName || "—"}
                    <div className="text-xs text-slate-400">{inv.clientEmail || ""}</div>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {formatMoney(inv.total ?? inv.amount ?? inv.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${statusBadgeClass(
                        inv.status
                      )}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatDate(inv.createdAt || inv.issuedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      {inv.status !== "paid" && (
                        <button
                          disabled={busyId === inv.id}
                          onClick={() => markPaid(inv.id)}
                          className="text-xs font-bold text-emerald-700 hover:underline"
                        >
                          Mark paid
                        </button>
                      )}
                      <button
                        disabled={busyId === inv.id}
                        onClick={() => sendInvoice(inv.id)}
                        className="text-xs font-bold text-amber-700 hover:underline inline-flex items-center gap-1"
                      >
                        <Send size={12} /> Send
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-4">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1">{value}</p>
    </div>
  )
}

function Flash({ ok, text, onClose }: { ok: boolean; text: string; onClose: () => void }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm flex justify-between ${
        ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      {text}
      <button onClick={onClose} className="font-bold text-xs">
        Dismiss
      </button>
    </div>
  )
}
