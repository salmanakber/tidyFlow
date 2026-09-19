"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, formatDate, formatMoney } from "@/lib/admin-session"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import {
  FileText,
  Send,
  Plus,
  CheckCircle2,
  Mail,
  Search,
  Filter,
  MapPin,
  User as UserIcon,
  X,
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
  OpsSecondaryButton,
  OpsRowAction,
  OpsSelectCard,
  OpsField,
  opsFieldCls,
} from "@/components/ops/OpsForm"
import { OpsSpinner } from "@/components/ops/OpsLoader"

const PAGE_SIZE = 10

type EligibleTask = {
  id: number
  title?: string
  status?: string
  budget?: number | string | null
  scheduledDate?: string | null
  completedAt?: string | null
  property?: {
    id?: number
    address?: string | null
    clientName?: string | null
    clientEmail?: string | null
    clientPhone?: string | null
    defaultServiceRate?: number | string | null
  } | null
}

type ClientGroup = {
  key: string
  label: string
  clientName: string | null
  clientEmail: string | null
  propertyId: number | null
  address: string | null
  taskCount: number
  taskIds: number[]
  estimatedTotal: number
}

function taskClientKey(t: EligibleTask) {
  const p = t.property
  return (p?.clientEmail || p?.clientName || p?.address || `prop:${p?.id || "none"}`)
    .trim()
    .toLowerCase()
}

function taskRate(t: EligibleTask) {
  if (t.budget != null && t.budget !== "") return Number(t.budget) || 0
  if (t.property?.defaultServiceRate != null) return Number(t.property.defaultServiceRate) || 0
  return 0
}

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
  const [eligible, setEligible] = useState<EligibleTask[]>([])
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([])
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [tab, setTab] = useUrlQueryState("status", "all")
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")

  // Create-drawer filters
  const [createQ, setCreateQ] = useState("")
  const [createQDebounced, setCreateQDebounced] = useState("")
  const [clientFilter, setClientFilter] = useState("")
  const [propertyFilter, setPropertyFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const invRes = await adminGet("/api/client-invoices")
      if (invRes.data.success) {
        const raw = invRes.data.data
        setInvoices(Array.isArray(raw) ? raw : [])
      } else {
        setInvoices([])
        setError(invRes.data.message || "Failed to load invoices")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load")
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadEligible = useCallback(async (opts?: {
    q?: string
    propertyId?: string
    from?: string
    to?: string
  }) => {
    try {
      setEligibleLoading(true)
      const params: Record<string, string> = { groupBy: "client" }
      if (opts?.q?.trim()) params.q = opts.q.trim()
      if (opts?.propertyId) params.propertyId = opts.propertyId
      if (opts?.from) params.from = opts.from
      if (opts?.to) params.to = opts.to

      const elRes = await adminGet("/api/client-invoices/eligible-tasks", { params })
      if (elRes.data?.success) {
        const raw = elRes.data.data
        setEligible(Array.isArray(raw) ? raw : raw?.tasks || [])
        setClientGroups(Array.isArray(elRes.data.groups) ? elRes.data.groups : [])
      } else {
        setEligible([])
        setClientGroups([])
      }
    } catch {
      setEligible([])
      setClientGroups([])
    } finally {
      setEligibleLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  useEffect(() => {
    setPage(1)
  }, [tab, query])

  useEffect(() => {
    const t = setTimeout(() => setCreateQDebounced(createQ), 280)
    return () => clearTimeout(t)
  }, [createQ])

  useEffect(() => {
    if (!showCreate) return
    void loadEligible({
      q: createQDebounced,
      propertyId: propertyFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    })
  }, [showCreate, createQDebounced, propertyFilter, fromDate, toDate, loadEligible])

  const openCreate = () => {
    setSelectedTaskIds([])
    setCreateQ("")
    setCreateQDebounced("")
    setClientFilter("")
    setPropertyFilter("")
    setFromDate("")
    setToDate("")
    setShowCreate(true)
  }

  const visibleEligible = useMemo(() => {
    if (!clientFilter) return eligible
    return eligible.filter((t) => taskClientKey(t) === clientFilter)
  }, [eligible, clientFilter])

  const propertyOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const t of eligible) {
      const id = t.property?.id
      if (!id) continue
      if (clientFilter && taskClientKey(t) !== clientFilter) continue
      map.set(id, t.property?.address || `Property #${id}`)
    }
    return Array.from(map.entries()).map(([id, address]) => ({ id, address }))
  }, [eligible, clientFilter])

  const toggleTask = (id: number) => {
    const task = eligible.find((t) => t.id === id)
    if (!task) return
    const key = taskClientKey(task)

    setSelectedTaskIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      // Enforce single-client batch (matches API rule)
      const existing = prev
        .map((pid) => eligible.find((t) => t.id === pid))
        .filter(Boolean) as EligibleTask[]
      if (existing.length && existing.some((t) => taskClientKey(t) !== key)) {
        setToast("Invoice jobs must share the same client — selection reset")
        setClientFilter(key)
        return [id]
      }
      return [...prev, id]
    })
  }

  const selectClientGroup = (g: ClientGroup) => {
    const key = g.key.replace(/^client:/, "")
    // group key is `client:${clientKey}` — match via taskClientKey
    const matchKey =
      (g.clientEmail || g.clientName || g.address || "").trim().toLowerCase() || key
    setClientFilter((prev) => (prev === matchKey ? "" : matchKey))
    setPropertyFilter("")
    setSelectedTaskIds([])
  }

  const create = async () => {
    if (!selectedTaskIds.length) {
      setError("Select at least one completed / approved job")
      return
    }
    try {
      setCreating(true)
      setError("")
      const res = await adminPost("/api/client-invoices", {
        taskIds: selectedTaskIds,
      })
      if (res.data.success) {
        setToast("Invoice created")
        setShowCreate(false)
        setSelectedTaskIds([])
        await loadInvoices()
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
        await loadInvoices()
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
        await loadInvoices()
      } else setError(res.data.message || "Send failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Send failed")
    } finally {
      setBusyId(null)
    }
  }

  const safeInvoices = Array.isArray(invoices) ? invoices : []

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

  const selectedJobs = eligible.filter((t) => selectedTaskIds.includes(t.id))
  const estimatedTotal = selectedJobs.reduce((s, t) => s + taskRate(t), 0)
  const selectedClientLabel =
    selectedJobs[0]?.property?.clientName ||
    selectedJobs[0]?.property?.clientEmail ||
    selectedJobs[0]?.property?.address ||
    null

  const clearCreateFilters = () => {
    setCreateQ("")
    setCreateQDebounced("")
    setClientFilter("")
    setPropertyFilter("")
    setFromDate("")
    setToDate("")
    setSelectedTaskIds([])
  }

  const hasCreateFilters = !!(createQ || clientFilter || propertyFilter || fromDate || toDate)

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="Client invoices"
        subtitle="Bill clients for completed / approved jobs and track collections"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={loadInvoices} loading={loading} />
            <OpsPrimaryButton onClick={openCreate}>
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
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search invoice, client, job…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15 dark:border-navy-800 dark:bg-navy-950"
          />
        </div>
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
          <OpsSkeleton rows={6} cols={6} message="Loading invoices…" />
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No client invoices yet"
            hint="Only completed / approved jobs can be billed — filter by client when creating"
            ctaLabel="Create invoice"
            onCta={openCreate}
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
        subtitle="Only completed / approved jobs — filter by client or property"
        wide
        footer={
          <>
            <OpsSecondaryButton onClick={() => setShowCreate(false)}>Cancel</OpsSecondaryButton>
            <OpsPrimaryButton onClick={create} disabled={creating || !selectedTaskIds.length}>
              {creating ? (
                <OpsSpinner className="border-amber-100 border-t-white" />
              ) : (
                <FileText size={14} />
              )}
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
                <p className="text-xs text-slate-500">
                  {selectedClientLabel
                    ? `Client · ${selectedClientLabel}`
                    : "Select jobs for one client"}
                </p>
              </div>
              {estimatedTotal > 0 ? (
                <div className="text-right">
                  <p className="font-mono text-lg font-black text-amber-700 dark:text-amber-400">
                    {formatMoney(estimatedTotal)}
                  </p>
                  <p className="text-[10px] uppercase text-slate-400">Est. total</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Strong filters */}
          <div className="space-y-3 rounded-xl border border-control-border bg-slate-50/80 p-3 dark:border-navy-800 dark:bg-navy-950/50">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <Filter size={12} className="text-amber-600" /> Filters
              </p>
              {hasCreateFilters && (
                <button
                  type="button"
                  onClick={clearCreateFilters}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800"
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={createQ}
                onChange={(e) => setCreateQ(e.target.value)}
                placeholder="Search client, property, job title, #id…"
                className={`${opsFieldCls} pl-9`}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <OpsField label="From date">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={opsFieldCls}
                />
              </OpsField>
              <OpsField label="To date">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={opsFieldCls}
                />
              </OpsField>
            </div>

            <OpsField label="Property">
              <select
                value={propertyFilter}
                onChange={(e) => {
                  setPropertyFilter(e.target.value)
                  setSelectedTaskIds([])
                }}
                className={opsFieldCls}
              >
                <option value="">All properties</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.address}
                  </option>
                ))}
              </select>
            </OpsField>

            {clientGroups.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Clients with billable jobs
                </p>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {clientGroups.map((g) => {
                    const matchKey = (
                      g.clientEmail ||
                      g.clientName ||
                      g.address ||
                      ""
                    )
                      .trim()
                      .toLowerCase()
                    const active = clientFilter === matchKey
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => selectClientGroup(g)}
                        className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] font-bold transition ${
                          active
                            ? "border-navy-950 bg-navy-950 text-amber-300"
                            : "border-slate-200 bg-white text-slate-700 hover:border-amber-400 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
                        }`}
                        title={g.clientEmail || g.address || g.label}
                      >
                        <UserIcon size={11} className={active ? "text-amber-400" : "text-slate-400"} />
                        <span className="truncate">{g.label}</span>
                        <span
                          className={`rounded-full px-1.5 font-mono text-[9px] ${
                            active ? "bg-white/10 text-amber-200" : "bg-slate-100 text-slate-500 dark:bg-navy-800"
                          }`}
                        >
                          {g.taskCount}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {eligibleLoading ? (
            <div className="py-8">
              <OpsSpinner className="mx-auto block h-6 w-6" />
              <p className="mt-3 text-center font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Finding billable jobs…
              </p>
            </div>
          ) : visibleEligible.length === 0 ? (
            <OpsEmpty
              message="No billable jobs match"
              hint="Only SUBMITTED / QA / APPROVED / COMPLETED jobs without an open invoice appear here. Try another client or clear filters."
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Billable jobs · {visibleEligible.length}
                  {clientFilter ? " · filtered by client" : ""}
                </p>
                <button
                  type="button"
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-800"
                  onClick={() => {
                    const ids = visibleEligible.map((t) => t.id)
                    const allOn = ids.length > 0 && ids.every((id) => selectedTaskIds.includes(id))
                    setSelectedTaskIds(allOn ? [] : ids)
                    if (!allOn && visibleEligible[0]) {
                      setClientFilter(taskClientKey(visibleEligible[0]))
                    }
                  }}
                >
                  {visibleEligible.length > 0 &&
                  visibleEligible.every((t) => selectedTaskIds.includes(t.id))
                    ? "Clear selection"
                    : "Select all shown"}
                </button>
              </div>
              <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                {visibleEligible.map((t) => {
                  const rate = taskRate(t)
                  return (
                    <OpsSelectCard
                      key={t.id}
                      selected={selectedTaskIds.includes(t.id)}
                      onClick={() => toggleTask(t.id)}
                      title={t.title || `Job #${t.id}`}
                      meta={[
                        t.property?.clientName || t.property?.clientEmail || "No client name",
                        t.property?.address || "No address",
                      ].join(" · ")}
                      trailing={
                        <span className="flex flex-col items-end gap-1">
                          <OpsBadge status={t.status} />
                          <span className="font-mono text-[10px] font-bold text-slate-400">
                            #{t.id}
                            {rate > 0 ? ` · ${formatMoney(rate)}` : ""}
                          </span>
                          {t.property?.address ? (
                            <span className="inline-flex max-w-[120px] items-center gap-0.5 truncate text-[9px] text-slate-400">
                              <MapPin size={9} />
                              {t.property.address}
                            </span>
                          ) : null}
                        </span>
                      }
                    />
                  )
                })}
              </div>
            </div>
          )}

          <p className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:border-navy-800 dark:bg-navy-950">
            <Mail size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
            Multi-job invoices must be for the same client. After creating, use Send on the row to
            email them.
          </p>
        </div>
      </OpsDrawer>
    </div>
  )
}
