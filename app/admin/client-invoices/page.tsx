"use client"

import { useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, formatDate, formatMoney } from "@/lib/admin-session"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import { FileText, Send, Plus, CheckCircle2, Mail } from "lucide-react"
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
  OpsSecondaryButton,
  OpsRowAction,
  OpsSelectCard,
} from "@/components/ops/OpsForm"
import { OpsSpinner } from "@/components/ops/OpsLoader"

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
  const [query, setQuery] = useState("")

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
  }, [tab, query])

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
  const safeEligible = Array.isArray(eligible) ? eligible : []

  const filtered = useMemo(() => {
    let list = safeInvoices
    if (tab === "unpaid") list = list.filter((i) => i.status !== "paid")
    else if (tab !== "all") list = list.filter((i) => String(i.status) === tab)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((i) => {
        const hay = [
          i.invoiceNumber,
          i.id,
          i.clientName,
          i.clientEmail,
          i.property?.clientName,
          i.task?.title,
          i.property?.address,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
    }
    return list
  }, [safeInvoices, tab, query])

  const unpaid = safeInvoices.filter((i) => i.status !== "paid").length
  const revenue = safeInvoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total ?? i.amount ?? 0), 0)
  const outstanding = safeInvoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + Number(i.total ?? i.amount ?? 0), 0)
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectedJobs = safeEligible.filter((t) => selectedTaskIds.includes(t.id))
  const estimatedTotal = selectedJobs.reduce(
    (s, t) => s + Number(t.price ?? t.amount ?? t.clientPrice ?? 0),
    0
  )

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="Client invoices"
        subtitle="Bill clients for completed jobs and track collections"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton
              onClick={() => {
                setSelectedTaskIds([])
                setShowCreate(true)
              }}
            >
              <Plus size={14} /> Create invoice
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsKpi label="Invoices" value={safeInvoices.length} />
        <OpsKpi label="Unpaid" value={unpaid} />
        <OpsKpi label="Outstanding" value={formatMoney(outstanding)} />
        <OpsKpi label="Collected" value={formatMoney(revenue)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice, client, job…"
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15 dark:border-navy-800 dark:bg-navy-950 sm:max-w-xs"
        />
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {safeEligible.length} jobs ready to bill
        </span>
      </div>

      <OpsTableShell
        title="Invoice ledger"
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
        footer={<span>CLIENT BILLING · PAGINATED</span>}
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No client invoices yet"
            hint="Pick completed jobs and generate a professional invoice in one step"
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
                  <th className={opsTh}>Issued</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((inv) => (
                  <tr key={inv.id} className="hover:bg-amber-50/40 dark:hover:bg-navy-900/50">
                    <td className={opsTd}>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-navy-950 text-amber-400">
                          <FileText size={14} />
                        </span>
                        <div>
                          <p className="font-bold text-navy-900 dark:text-white">
                            #{inv.invoiceNumber || inv.id}
                          </p>
                          <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-400">
                            {inv.task?.title || inv.property?.address || "Client invoice"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={opsTd}>
                      <p className="font-semibold text-navy-900 dark:text-white">
                        {inv.clientName || inv.property?.clientName || "—"}
                      </p>
                      <p className="text-xs text-slate-400">{inv.clientEmail || ""}</p>
                    </td>
                    <td className={`${opsTd} font-mono text-base font-black text-navy-900 dark:text-white`}>
                      {formatMoney(inv.total ?? inv.amount ?? inv.totalAmount)}
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={inv.status} />
                    </td>
                    <td className={`${opsTd} text-slate-500`}>
                      {formatDate(inv.createdAt || inv.issuedAt)}
                    </td>
                    <td className={`${opsTd} text-right`}>
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        {inv.status !== "paid" && (
                          <OpsRowAction
                            tone="emerald"
                            disabled={busyId === inv.id}
                            onClick={() => markPaid(inv.id)}
                          >
                            <CheckCircle2 size={12} /> Mark paid
                          </OpsRowAction>
                        )}
                        <OpsRowAction
                          tone="amber"
                          disabled={busyId === inv.id}
                          onClick={() => sendInvoice(inv.id)}
                        >
                          <Send size={12} /> Send
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
        open={showCreate}
        onClose={() => setShowCreate(false)}
        eyebrow="Create"
        title="New client invoice"
        subtitle="Select completed jobs to bill together"
        wide
        footer={
          <>
            <OpsSecondaryButton onClick={() => setShowCreate(false)}>Cancel</OpsSecondaryButton>
            <OpsPrimaryButton onClick={create} disabled={creating || !selectedTaskIds.length}>
              {creating ? <OpsSpinner className="border-amber-100 border-t-white" /> : <FileText size={14} />}
              Create from {selectedTaskIds.length || 0} job
              {selectedTaskIds.length === 1 ? "" : "s"}
            </OpsPrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-navy-950">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Draft summary
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-2xl font-black text-navy-900 dark:text-white">
                  {selectedTaskIds.length} job{selectedTaskIds.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-slate-500">Selected for this invoice</p>
              </div>
              {estimatedTotal > 0 ? (
                <div className="text-right">
                  <p className="font-mono text-lg font-black text-amber-700 dark:text-amber-400">
                    {formatMoney(estimatedTotal)}
                  </p>
                  <p className="text-[10px] uppercase text-slate-400">Est. from job prices</p>
                </div>
              ) : null}
            </div>
          </div>

          {safeEligible.length === 0 ? (
            <OpsEmpty
              message="No eligible jobs"
              hint="Complete jobs with billable amounts first, then come back here"
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Eligible jobs · {safeEligible.length}
                </p>
                <button
                  type="button"
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-800"
                  onClick={() =>
                    setSelectedTaskIds(
                      selectedTaskIds.length === safeEligible.length
                        ? []
                        : safeEligible.map((t) => t.id)
                    )
                  }
                >
                  {selectedTaskIds.length === safeEligible.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {safeEligible.map((t: any) => (
                  <OpsSelectCard
                    key={t.id}
                    selected={selectedTaskIds.includes(t.id)}
                    onClick={() => toggleTask(t.id)}
                    title={t.title || `Job #${t.id}`}
                    meta={t.property?.address || t.propertyAddress || "No address"}
                    trailing={
                      <span className="font-mono text-[10px] font-bold text-slate-400">
                        #{t.id}
                        {t.price != null || t.amount != null
                          ? ` · ${formatMoney(t.price ?? t.amount)}`
                          : ""}
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <p className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:border-navy-800 dark:bg-navy-950">
            <Mail size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
            After creating, use Send on the row to email the client. Mark paid when payment lands.
          </p>
        </div>
      </OpsDrawer>
    </div>
  )
}
