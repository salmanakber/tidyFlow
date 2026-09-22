"use client"

import { useCallback, useEffect, useMemo, useState, Suspense, type ReactNode } from "react"
import AdminLayout from "@/components/AdminLayout"
import { adminGet, adminPost, adminPatch, formatDate } from "@/lib/admin-session"
import { useCurrency } from "@/contexts/CurrencyContext"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsKpi,
  OpsTableShell,
  OpsSkeleton,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import {
  OpsDrawer,
  OpsSecondaryButton,
  OpsRowAction,
  OpsField,
  opsFieldCls,
} from "@/components/ops/OpsForm"
import {
  Check,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react"

type ClientRow = {
  id: number
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
  source?: string | null
  isActive?: boolean
  updatedAt?: string
  _count?: { properties?: number; bookingRequests?: number }
}

type Summary = {
  totalClients: number
  pendingBookings: number
  bookingsThisMonth: number
  legacyPropertyClients?: number
}

type BookingRequest = {
  id: number
  guestName: string
  guestEmail?: string | null
  guestPhone?: string | null
  address?: string | null
  serviceType?: string | null
  notes?: string | null
  status: string
  requestedStart?: string | null
  requestedEnd?: string | null
  createdAt?: string
  client?: { id: number; name: string; email?: string | null } | null
  property?: { id: number; address?: string | null } | null
  task?: { id: number; title?: string; status?: string } | null
}

export default function ClientsPage() {
  return (
    <AdminLayout>
      <Suspense
        fallback={
          <div className="p-6">
            <OpsSkeleton rows={4} cols={4} message="Loading clients…" />
          </div>
        }
      >
        <Content />
      </Suspense>
    </AdminLayout>
  )
}

function Content() {
  const { formatMoney } = useCurrency()
  const [tab, setTab] = useUrlQueryState("tab", "clients")
  const [clients, setClients] = useState<ClientRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [query, setQuery] = useState("")
  const [queryDebounced, setQueryDebounced] = useState("")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  })

  useEffect(() => {
    const t = setTimeout(() => setQueryDebounced(query.trim()), 280)
    return () => clearTimeout(t)
  }, [query])

  const loadClients = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const params = queryDebounced ? `?q=${encodeURIComponent(queryDebounced)}` : ""
      const res = await adminGet(`/api/clients${params}`)
      if (res.data?.success) {
        const data = res.data.data
        setClients(Array.isArray(data?.clients) ? data.clients : [])
        setSummary(data?.summary || null)
      } else {
        setClients([])
        setError(res.data?.message || "Failed to load clients")
      }
    } catch (e: any) {
      setClients([])
      setError(e.response?.data?.message || "Failed to load clients")
    } finally {
      setLoading(false)
    }
  }, [queryDebounced])

  const loadBookings = useCallback(async () => {
    try {
      setBookingsLoading(true)
      const res = await adminGet("/api/booking-requests?status=pending")
      if (res.data?.success) {
        setBookings(Array.isArray(res.data.data) ? res.data.data : [])
      } else {
        setBookings([])
      }
    } catch {
      setBookings([])
    } finally {
      setBookingsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  useEffect(() => {
    if (tab === "bookings") loadBookings()
  }, [tab, loadBookings])

  const openDetail = async (id: number) => {
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await adminGet(`/api/clients?id=${id}`)
      if (res.data?.success) setDetail(res.data.data)
      else setError(res.data?.message || "Failed to load client")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load client")
    } finally {
      setDetailLoading(false)
    }
  }

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError("")
      const res = await adminPost("/api/clients", {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })
      if (res.data?.success) {
        setToast("Client created")
        setShowCreate(false)
        setForm({ name: "", email: "", phone: "", notes: "" })
        await loadClients()
        if (res.data.data?.id) openDetail(res.data.data.id)
      } else setError(res.data?.message || "Create failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Create failed")
    } finally {
      setSaving(false)
    }
  }

  const bookingAction = async (id: number, action: "approve" | "reject") => {
    try {
      setBusyId(id)
      setError("")
      const res = await adminPatch("/api/booking-requests", { id, action })
      if (res.data?.success) {
        setToast(action === "approve" ? "Booking approved" : "Booking rejected")
        await Promise.all([loadBookings(), loadClients()])
      } else setError(res.data?.message || "Action failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  const refreshAll = async () => {
    await loadClients()
    if (tab === "bookings") await loadBookings()
    if (selectedId) await openDetail(selectedId)
  }

  const pendingCount = summary?.pendingBookings ?? bookings.length

  const filteredClients = useMemo(() => clients, [clients])

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Manage"
        title="Clients"
        subtitle="CRM for property clients and online booking requests"
        actions={
          <div className="flex flex-wrap gap-2">
            <OpsRefreshButton onClick={refreshAll} loading={loading || bookingsLoading} />
            <OpsPrimaryButton onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Add client
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OpsKpi label="Total clients" value={summary?.totalClients ?? clients.length} />
        <OpsKpi
          label="Pending bookings"
          value={pendingCount}
          hint="Awaiting approve / reject"
        />
        <OpsKpi
          label="Bookings this month"
          value={summary?.bookingsThisMonth ?? "—"}
        />
      </div>

      <OpsTableShell
        title={tab === "bookings" ? "Booking inbox" : "Client directory"}
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {tab === "bookings" ? bookings.length : filteredClients.length}
          </span>
        }
        tabs={[
          { id: "clients", label: "Clients" },
          { id: "bookings", label: `Booking requests${pendingCount ? ` (${pendingCount})` : ""}` },
        ]}
        activeTab={tab === "bookings" ? "bookings" : "clients"}
        onTabChange={(id) => setTab(id === "bookings" ? "bookings" : "clients")}
      >
        {tab !== "bookings" ? (
          <>
            <div className="border-b border-control-border px-4 py-3 dark:border-navy-800">
              <div className="relative max-w-md">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, phone…"
                  className={`${opsFieldCls} pl-9`}
                />
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
            ) : filteredClients.length === 0 ? (
              <OpsEmpty message="No clients yet — add one or approve a booking" />
            ) : (
              <table className="w-full text-left">
                <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                  <tr>
                    <th className={opsTh}>Name</th>
                    <th className={opsTh}>Contact</th>
                    <th className={opsTh}>Properties</th>
                    <th className={opsTh}>Bookings</th>
                    <th className={opsTh}>Source</th>
                    <th className={`${opsTh} text-right`}>Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                  {filteredClients.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer hover:bg-amber-50/40 dark:hover:bg-navy-900/40"
                      onClick={() => openDetail(c.id)}
                    >
                      <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                        <span className="inline-flex items-center gap-2">
                          <Users size={14} className="text-amber-600" />
                          {c.name}
                        </span>
                      </td>
                      <td className={`${opsTd} text-sm`}>
                        <div>{c.email || "—"}</div>
                        <div className="text-xs text-slate-400">{c.phone || ""}</div>
                      </td>
                      <td className={`${opsTd} font-mono text-xs`}>
                        {c._count?.properties ?? 0}
                      </td>
                      <td className={`${opsTd} font-mono text-xs`}>
                        {c._count?.bookingRequests ?? 0}
                      </td>
                      <td className={opsTd}>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-navy-900 dark:text-slate-300">
                          {c.source || "—"}
                        </span>
                      </td>
                      <td className={`${opsTd} text-right text-xs text-slate-500`}>
                        {formatDate(c.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : bookingsLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : bookings.length === 0 ? (
          <OpsEmpty message="No pending booking requests" />
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
              <tr>
                <th className={opsTh}>Guest</th>
                <th className={opsTh}>Service</th>
                <th className={opsTh}>When</th>
                <th className={opsTh}>Address</th>
                <th className={opsTh}>Status</th>
                <th className={`${opsTh} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/80">
                  <td className={`${opsTd}`}>
                    <p className="font-bold text-navy-900 dark:text-white">{b.guestName}</p>
                    <p className="text-xs text-slate-400">{b.guestEmail || b.guestPhone || "—"}</p>
                  </td>
                  <td className={`${opsTd} text-sm`}>{b.serviceType || "—"}</td>
                  <td className={`${opsTd} text-xs`}>
                    {b.requestedStart
                      ? new Date(b.requestedStart).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className={`${opsTd} max-w-[200px] truncate text-sm`}>
                    {b.address || b.property?.address || "—"}
                  </td>
                  <td className={opsTd}>
                    <OpsBadge status={b.status} />
                  </td>
                  <td className={`${opsTd} text-right`}>
                    <div className="inline-flex gap-1">
                      <OpsRowAction
                        tone="emerald"
                        disabled={busyId === b.id}
                        onClick={() => bookingAction(b.id, "approve")}
                      >
                        {busyId === b.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Approve
                      </OpsRowAction>
                      <OpsRowAction
                        tone="danger"
                        disabled={busyId === b.id}
                        onClick={() => bookingAction(b.id, "reject")}
                      >
                        <X size={12} /> Reject
                      </OpsRowAction>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </OpsTableShell>

      {/* Create client */}
      <OpsDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        eyebrow="CRM"
        title="New client"
        subtitle="Add a client manually to your directory"
        footer={
          <div className="flex justify-end gap-2">
            <OpsSecondaryButton onClick={() => setShowCreate(false)}>Cancel</OpsSecondaryButton>
            <OpsPrimaryButton
              type="submit"
              disabled={saving || !form.name.trim()}
              onClick={() => {
                const el = document.getElementById("create-client-form") as HTMLFormElement | null
                el?.requestSubmit()
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Create
            </OpsPrimaryButton>
          </div>
        }
      >
        <form id="create-client-form" onSubmit={createClient} className="space-y-4">
          <OpsField label="Name" required>
            <input
              required
              className={opsFieldCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </OpsField>
          <OpsField label="Email">
            <input
              type="email"
              className={opsFieldCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </OpsField>
          <OpsField label="Phone">
            <input
              className={opsFieldCls}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </OpsField>
          <OpsField label="Notes">
            <textarea
              rows={3}
              className={opsFieldCls}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </OpsField>
        </form>
      </OpsDrawer>

      {/* Client detail */}
      <OpsDrawer
        open={selectedId != null}
        onClose={() => {
          setSelectedId(null)
          setDetail(null)
        }}
        eyebrow="Client"
        title={detail?.name || (detailLoading ? "Loading…" : "Client")}
        subtitle={detail?.email || detail?.phone || undefined}
        wide
        footer={
          <div className="flex justify-end">
            <OpsSecondaryButton
              onClick={() => {
                setSelectedId(null)
                setDetail(null)
              }}
            >
              Close
            </OpsSecondaryButton>
          </div>
        }
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading detail…</div>
        ) : !detail ? (
          <OpsEmpty message="Client not found" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-navy-800 dark:bg-navy-950/50">
                <p className="text-[10px] font-bold uppercase text-slate-400">Phone</p>
                <p className="mt-1 text-sm font-semibold">{detail.phone || "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-navy-800 dark:bg-navy-950/50">
                <p className="text-[10px] font-bold uppercase text-slate-400">Source</p>
                <p className="mt-1 text-sm font-semibold">{detail.source || "—"}</p>
              </div>
            </div>
            {detail.notes ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{detail.notes}</p>
            ) : null}

            <DetailBlock title="Properties" count={detail.properties?.length}>
              {(detail.properties || []).length === 0 ? (
                <p className="text-xs text-slate-400">No linked properties</p>
              ) : (
                <ul className="space-y-2">
                  {detail.properties.map((p: any) => (
                    <li
                      key={p.id}
                      className="rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-navy-800"
                    >
                      <p className="font-semibold text-navy-900 dark:text-white">
                        {p.address || p.name || `Property #${p.id}`}
                      </p>
                      <p className="text-xs text-slate-400">
                        {[p.city, p.postcode].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </DetailBlock>

            <DetailBlock title="Tasks" count={detail.tasks?.length}>
              {(detail.tasks || []).length === 0 ? (
                <p className="text-xs text-slate-400">No tasks</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase text-slate-400">
                      <th className="pb-2 font-bold">Job</th>
                      <th className="pb-2 font-bold">Status</th>
                      <th className="pb-2 font-bold">Date</th>
                      <th className="pb-2 text-right font-bold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                    {detail.tasks.map((t: any) => (
                      <tr key={t.id}>
                        <td className="py-2 font-semibold">{t.title || `#${t.id}`}</td>
                        <td className="py-2">
                          <OpsBadge status={t.status} />
                        </td>
                        <td className="py-2 text-xs text-slate-500">
                          {formatDate(t.scheduledDate)}
                        </td>
                        <td className="py-2 text-right font-mono text-xs">
                          {t.budget != null && t.budget !== ""
                            ? formatMoney(Number(t.budget))
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DetailBlock>

            <DetailBlock title="Invoices" count={detail.invoices?.length}>
              {(detail.invoices || []).length === 0 ? (
                <p className="text-xs text-slate-400">No invoices</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase text-slate-400">
                      <th className="pb-2 font-bold">Invoice</th>
                      <th className="pb-2 font-bold">Status</th>
                      <th className="pb-2 font-bold">Date</th>
                      <th className="pb-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                    {detail.invoices.map((inv: any) => (
                      <tr key={inv.id}>
                        <td className="py-2 font-semibold">
                          {inv.invoiceNumber || `#${inv.id}`}
                        </td>
                        <td className="py-2">
                          <OpsBadge status={inv.status} />
                        </td>
                        <td className="py-2 text-xs text-slate-500">
                          {formatDate(inv.createdAt || inv.issuedAt)}
                        </td>
                        <td className="py-2 text-right font-mono text-xs">
                          {formatMoney(Number(inv.total ?? inv.amount ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DetailBlock>

            <DetailBlock title="Bookings" count={detail.bookingRequests?.length}>
              {(detail.bookingRequests || []).length === 0 ? (
                <p className="text-xs text-slate-400">No booking history</p>
              ) : (
                <ul className="space-y-2">
                  {detail.bookingRequests.map((b: any) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-navy-800"
                    >
                      <div>
                        <p className="font-semibold">{b.serviceType || "Booking"}</p>
                        <p className="text-xs text-slate-400">
                          {formatDate(b.requestedStart || b.createdAt)}
                        </p>
                      </div>
                      <OpsBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              )}
            </DetailBlock>
          </div>
        )}
      </OpsDrawer>
    </div>
  )
}

function DetailBlock({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
        {typeof count === "number" ? (
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}
