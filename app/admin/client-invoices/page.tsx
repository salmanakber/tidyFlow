"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, formatDate, formatMoney } from "@/lib/admin-session"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import { FileText, Loader2, Send, Plus } from "lucide-react"
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
  const [tab, setTab] = useUrlQueryState("status", "all")
  const [page, setPage] = useState(1)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [invRes, elRes] = await Promise.all([
        adminGet("/api/client-invoices"),
        adminGet("/api/client-invoices/eligible-tasks").catch(() => ({ data: { success: false } })),
      ])
      if (invRes.data.success) {
        const raw = invRes.data.data
        setInvoices(Array.isArray(raw) ? raw : [])
      } else {
        setInvoices([])
        setError(invRes.data.message || "Failed to load invoices")
      }
      if (elRes.data?.success) {
        const raw = elRes.data.data
        setEligible(Array.isArray(raw) ? raw : raw?.tasks || [])
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load")
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [tab])

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

  const safeInvoices = Array.isArray(invoices) ? invoices : []
  const filtered =
    tab === "all"
      ? safeInvoices
      : tab === "unpaid"
        ? safeInvoices.filter((i) => i.status !== "paid")
        : safeInvoices.filter((i) => String(i.status) === tab)
  const unpaid = safeInvoices.filter((i) => i.status !== "paid").length
  const revenue = safeInvoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total ?? i.amount ?? 0), 0)
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const safeEligible = Array.isArray(eligible) ? eligible : []

  return (
    <div className="space-y-5">
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

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OpsKpi label="Invoices" value={safeInvoices.length} />
        <OpsKpi label="Unpaid" value={unpaid} />
        <OpsKpi label="Paid total" value={formatMoney(revenue)} />
      </div>

      {showCreate && (
        <OpsCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900 dark:text-white">
                <FileText size={16} className="text-amber-600" /> Select eligible jobs
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-sm font-semibold text-slate-500"
              >
                Close
              </button>
            </div>
            {safeEligible.length === 0 ? (
              <p className="text-sm text-slate-500">No eligible jobs found for invoicing.</p>
            ) : (
              <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                {safeEligible.map((t: any) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.includes(t.id)}
                      onChange={() => toggleTask(t.id)}
                      className="rounded text-amber-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{t.title}</div>
                      <div className="truncate text-xs text-slate-400">
                        {t.property?.address || t.propertyAddress || "—"}
                      </div>
                    </div>
                    <span className="font-mono text-xs text-slate-500">#{t.id}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <OpsPrimaryButton
                onClick={create}
                disabled={creating || !selectedTaskIds.length}
              >
                {creating ? <Loader2 className="animate-spin" size={14} /> : null}
                Create from {selectedTaskIds.length} job(s)
              </OpsPrimaryButton>
            </div>
          </div>
        </OpsCard>
      )}

      <OpsTableShell
        title="Invoices"
        stickyHeader
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {filtered.length}
          </span>
        }
        tabs={[
          { id: "all", label: "All" },
          { id: "unpaid", label: "Unpaid" },
          { id: "paid", label: "Paid" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No client invoices yet"
            ctaLabel="Create invoice"
            onCta={() => setShowCreate(true)}
          />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Invoice</th>
                  <th className={opsTh}>Client</th>
                  <th className={opsTh}>Total</th>
                  <th className={opsTh}>Status</th>
                  <th className={opsTh}>Date</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80">
                    <td className={`${opsTd} font-semibold`}>
                      #{inv.invoiceNumber || inv.id}
                      <div className="text-xs font-normal text-slate-400">
                        {inv.task?.title || inv.property?.address || ""}
                      </div>
                    </td>
                    <td className={opsTd}>
                      {inv.clientName || inv.property?.clientName || "—"}
                      <div className="text-xs text-slate-400">{inv.clientEmail || ""}</div>
                    </td>
                    <td className={`${opsTd} font-bold`}>
                      {formatMoney(inv.total ?? inv.amount ?? inv.totalAmount)}
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={inv.status} />
                    </td>
                    <td className={opsTd}>{formatDate(inv.createdAt || inv.issuedAt)}</td>
                    <td className={`${opsTd} text-right`}>
                      <div className="inline-flex gap-2">
                        {inv.status !== "paid" && (
                          <button
                            disabled={busyId === inv.id}
                            onClick={() => markPaid(inv.id)}
                            className="text-xs font-bold text-emerald-700 hover:underline disabled:opacity-50"
                          >
                            Mark paid
                          </button>
                        )}
                        <button
                          disabled={busyId === inv.id}
                          onClick={() => sendInvoice(inv.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline disabled:opacity-50"
                        >
                          <Send size={12} /> Send
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
