"use client"

import { useCallback, useEffect, useMemo, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, formatDate } from "@/lib/admin-session"
import { useCurrency } from "@/contexts/CurrencyContext"
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
  Sparkles,
  ChevronDown,
  ChevronUp,
  Calendar,
  SlidersHorizontal,
  Zap,
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
import { getAiBillPriority } from "@/lib/ops-ai"

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
        <Suspense
          fallback={
            <div className="p-6">
              <OpsSkeleton rows={4} cols={4} message="Loading invoices…" />
            </div>
          }
        >
          <Content />
        </Suspense>
      </ProtectedPage>
    </AdminLayout>
  )
}

function Content() {
  const searchParams = useSearchParams()
  const { formatMoney, currency } = useCurrency()
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
  const [draftBusyKey, setDraftBusyKey] = useState<string | null>(null)
  const [tab, setTab] = useUrlQueryState("status", "all")
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")

  // List advanced filters
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [listFrom, setListFrom] = useState("")
  const [listTo, setListTo] = useState("")
  const [listClient, setListClient] = useState("")
  const [listMin, setListMin] = useState("")
  const [listMax, setListMax] = useState("")
  const [listProperty, setListProperty] = useState("")

  // Create-drawer filters
  const [createQ, setCreateQ] = useState("")
  const [createQDebounced, setCreateQDebounced] = useState("")
  const [clientFilter, setClientFilter] = useState("")
  const [propertyFilter, setPropertyFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [createStatus, setCreateStatus] = useState("all")
  const [billReasons, setBillReasons] = useState<Record<string, string>>({})
  const [billAiGenerated, setBillAiGenerated] = useState(false)

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
    void loadEligible({})
  }, [loadInvoices, loadEligible])

  // Rank ready-to-bill via company AI config (/api/ai/bill-priority → getAIConfig)
  useEffect(() => {
    if (!clientGroups.length) {
      setBillReasons({})
      setBillAiGenerated(false)
      return
    }
    let cancelled = false
    void getAiBillPriority(
      clientGroups.slice(0, 20).map((g) => ({
        key: g.key,
        label: g.label,
        taskCount: g.taskCount,
        estimatedTotal: g.estimatedTotal,
      }))
    ).then((res) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const r of res.ranked) map[r.key] = r.reason
      setBillReasons(map)
      setBillAiGenerated(res.aiGenerated)
      if (res.ranked.length) {
        const order = new Map(res.ranked.map((r, i) => [r.key, r.priority || i]))
        setClientGroups((prev) =>
          [...prev].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [clientGroups.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link ?create=1 or ?q=
  useEffect(() => {
    const q = searchParams.get("q")
    if (q) setQuery(q)
    if (searchParams.get("create") === "1") {
      openCreate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    setPage(1)
  }, [tab, query, listFrom, listTo, listClient, listMin, listMax, listProperty])

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
    setCreateStatus("all")
    setShowCreate(true)
  }

  const visibleEligible = useMemo(() => {
    let list = eligible
    if (clientFilter) list = list.filter((t) => taskClientKey(t) === clientFilter)
    if (createStatus !== "all") {
      list = list.filter((t) => String(t.status || "").toUpperCase() === createStatus)
    }
    return list
  }, [eligible, clientFilter, createStatus])

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

  const listClientOptions = useMemo(() => {
    const set = new Set<string>()
    for (const i of invoices) {
      const n = (i.clientName || i.property?.clientName || "").trim()
      if (n) set.add(n)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [invoices])

  const listPropertyOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of invoices) {
      const addr = i.property?.address
      if (addr) map.set(addr, addr)
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b))
  }, [invoices])

  const toggleTask = (id: number) => {
    const task = eligible.find((t) => t.id === id)
    if (!task) return
    const key = taskClientKey(task)

    setSelectedTaskIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
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
    const matchKey = (
      g.clientEmail ||
      g.clientName ||
      g.address ||
      ""
    )
      .trim()
      .toLowerCase()
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
        await loadEligible({})
      } else setError(res.data.message || "Create failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Create failed")
    } finally {
      setCreating(false)
    }
  }

  /** One-click draft invoice for a client group (AI draft = prefilled confirm). */
  const draftFromGroup = async (g: ClientGroup) => {
    if (!g.taskIds?.length) return
    try {
      setDraftBusyKey(g.key)
      setError("")
      const res = await adminPost("/api/client-invoices", { taskIds: g.taskIds })
      if (res.data.success) {
        setToast(`Draft invoice for ${g.label} · ${g.taskCount} job${g.taskCount === 1 ? "" : "s"}`)
        await loadInvoices()
        await loadEligible({})
      } else setError(res.data.message || "Draft failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Draft failed")
    } finally {
      setDraftBusyKey(null)
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

  const activeListFilterCount = [
    listFrom,
    listTo,
    listClient,
    listMin,
    listMax,
    listProperty,
  ].filter(Boolean).length

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

    if (listClient) {
      list = list.filter((i) => {
        const n = (i.clientName || i.property?.clientName || "").trim()
        return n === listClient
      })
    }
    if (listProperty) {
      list = list.filter((i) => (i.property?.address || "") === listProperty)
    }
    if (listFrom) {
      const fromMs = new Date(listFrom).getTime()
      list = list.filter((i) => {
        const d = i.createdAt || i.issuedAt
        return d && new Date(d).getTime() >= fromMs
      })
    }
    if (listTo) {
      const toMs = new Date(listTo)
      toMs.setHours(23, 59, 59, 999)
      list = list.filter((i) => {
        const d = i.createdAt || i.issuedAt
        return d && new Date(d).getTime() <= toMs.getTime()
      })
    }
    const min = listMin !== "" ? Number(listMin) : null
    const max = listMax !== "" ? Number(listMax) : null
    if (min != null && !Number.isNaN(min)) {
      list = list.filter((i) => Number(i.total ?? i.amount ?? i.totalAmount ?? 0) >= min)
    }
    if (max != null && !Number.isNaN(max)) {
      list = list.filter((i) => Number(i.total ?? i.amount ?? i.totalAmount ?? 0) <= max)
    }

    return list
  }, [
    safeInvoices,
    tab,
    query,
    listFrom,
    listTo,
    listClient,
    listMin,
    listMax,
    listProperty,
  ])

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
    setCreateStatus("all")
    setSelectedTaskIds([])
  }

  const clearListFilters = () => {
    setListFrom("")
    setListTo("")
    setListClient("")
    setListMin("")
    setListMax("")
    setListProperty("")
  }

  const hasCreateFilters = !!(
    createQ ||
    clientFilter ||
    propertyFilter ||
    fromDate ||
    toDate ||
    createStatus !== "all"
  )

  const topDrafts = clientGroups.slice(0, 6)

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="Client invoices"
        subtitle={`Bill clients for completed jobs · company currency ${currency}`}
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton
              onClick={() => {
                void loadInvoices()
                void loadEligible({})
              }}
              loading={loading}
            />
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

      {/* AI ready-to-bill drafts */}
      {(topDrafts.length > 0 || eligibleLoading) && (
        <section className="overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-slate-50 shadow-sm dark:border-amber-900/40 dark:from-amber-950/20 dark:via-navy-950 dark:to-navy-950">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 px-4 py-2.5 dark:border-navy-800">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <Sparkles size={12} /> Ready to bill
                {billAiGenerated ? " · AI priority" : ""}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {billAiGenerated
                  ? "Ranked by your AI config — draft still needs your confirm"
                  : "Completed jobs without an open invoice — draft with one confirm"}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-navy-900 dark:text-amber-300"
            >
              Review all <Filter size={11} />
            </button>
          </div>
          {eligibleLoading && topDrafts.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-slate-400">
              <OpsSpinner className="h-4 w-4" /> Scanning billable jobs…
            </div>
          ) : (
            <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {topDrafts.map((g) => (
                <li
                  key={g.key}
                  className="flex flex-col rounded-lg border border-slate-200 bg-white p-3 dark:border-navy-800 dark:bg-navy-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy-900 dark:text-white">
                        {g.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {g.taskCount} job{g.taskCount === 1 ? "" : "s"}
                        {g.estimatedTotal > 0 ? ` · ~${formatMoney(g.estimatedTotal)}` : ""}
                      </p>
                      {billReasons[g.key] && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-amber-800/90 dark:text-amber-300/80">
                          {billReasons[g.key]}
                        </p>
                      )}
                    </div>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-950 text-amber-400">
                      <UserIcon size={14} />
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={draftBusyKey === g.key}
                    onClick={() => draftFromGroup(g)}
                    className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 text-[11px] font-bold uppercase text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {draftBusyKey === g.key ? (
                      <OpsSpinner className="h-3.5 w-3.5 border-amber-100 border-t-white" />
                    ) : (
                      <Zap size={12} />
                    )}
                    Draft invoice
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Search + advanced filters */}
      <div className="overflow-hidden rounded-xl border border-control-border bg-white shadow-sm dark:border-navy-800 dark:bg-navy-950">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-navy-800">
          <div className="relative min-w-[200px] flex-1 sm:max-w-md">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search invoice #, client, property, job…"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15 dark:border-navy-700 dark:bg-navy-900"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${
              filtersOpen || activeListFilterCount > 0
                ? "border-navy-950 bg-navy-950 text-amber-300"
                : "border-slate-200 bg-white text-slate-600 hover:border-amber-400 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
            }`}
          >
            <SlidersHorizontal size={14} />
            Advanced
            {activeListFilterCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 font-mono text-[9px] text-navy-950">
                {activeListFilterCount}
              </span>
            )}
            {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {activeListFilterCount > 0 && (
            <button
              type="button"
              onClick={clearListFilters}
              className="inline-flex h-9 items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="grid gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white p-4 dark:border-navy-800 dark:from-navy-950 dark:to-navy-950 sm:grid-cols-2 lg:grid-cols-3">
            <OpsField label="Client">
              <select
                value={listClient}
                onChange={(e) => setListClient(e.target.value)}
                className={opsFieldCls}
              >
                <option value="">All clients</option>
                {listClientOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </OpsField>
            <OpsField label="Property">
              <select
                value={listProperty}
                onChange={(e) => setListProperty(e.target.value)}
                className={opsFieldCls}
              >
                <option value="">All properties</option>
                {listPropertyOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </OpsField>
            <OpsField label="Issued from">
              <div className="relative">
                <Calendar
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={listFrom}
                  onChange={(e) => setListFrom(e.target.value)}
                  className={`${opsFieldCls} pl-9`}
                />
              </div>
            </OpsField>
            <OpsField label="Issued to">
              <div className="relative">
                <Calendar
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={listTo}
                  onChange={(e) => setListTo(e.target.value)}
                  className={`${opsFieldCls} pl-9`}
                />
              </div>
            </OpsField>
            <OpsField label="Min amount">
              <input
                type="number"
                min={0}
                step="0.01"
                value={listMin}
                onChange={(e) => setListMin(e.target.value)}
                placeholder="0"
                className={opsFieldCls}
              />
            </OpsField>
            <OpsField label="Max amount">
              <input
                type="number"
                min={0}
                step="0.01"
                value={listMax}
                onChange={(e) => setListMax(e.target.value)}
                placeholder="Any"
                className={opsFieldCls}
              />
            </OpsField>
          </div>
        )}
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
        footer={<span>CLIENT BILLING · ADVANCED FILTERS</span>}
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={6} message="Loading invoices…" />
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No invoices match"
            hint="Try clearing advanced filters, or create from Ready to bill"
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
                    <td
                      className={`${opsTd} font-mono text-base font-black text-navy-900 dark:text-white`}
                    >
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
        subtitle="Only billable statuses — filter by client, property, dates"
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

          <div className="space-y-3 rounded-xl border border-control-border bg-slate-50/80 p-3 dark:border-navy-800 dark:bg-navy-950/50">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <SlidersHorizontal size={12} className="text-amber-600" /> Advanced filters
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

            <div className="grid gap-2 sm:grid-cols-2">
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
              <OpsField label="Job status">
                <select
                  value={createStatus}
                  onChange={(e) => setCreateStatus(e.target.value)}
                  className={opsFieldCls}
                >
                  <option value="all">All billable</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="APPROVED">Approved</option>
                  <option value="QA_REVIEW">QA review</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </OpsField>
            </div>

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
                        <UserIcon
                          size={11}
                          className={active ? "text-amber-400" : "text-slate-400"}
                        />
                        <span className="truncate">{g.label}</span>
                        <span
                          className={`rounded-full px-1.5 font-mono text-[9px] ${
                            active
                              ? "bg-white/10 text-amber-200"
                              : "bg-slate-100 text-slate-500 dark:bg-navy-800"
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
              hint="Only SUBMITTED / QA / APPROVED / COMPLETED jobs without an open invoice appear here."
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
