"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import AdminLayout from "@/components/AdminLayout"
import {
  adminGet,
  adminPost,
  adminPatch,
  adminDelete,
  getSelectedCompanyId,
} from "@/lib/admin-session"
import {
  OpsPageHeader,
  OpsKpi,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsTableShell,
  OpsPagination,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import {
  Plus,
  Trash2,
  Loader2,
  Building2,
  X,
  Home,
  Building,
  Users,
} from "lucide-react"

const PAGE_SIZE = 10

const PROPERTY_TYPES = [
  { id: "apartment", label: "Apartment / Flat", icon: Building2 },
  { id: "house", label: "House", icon: Home },
  { id: "block", label: "Block", icon: Building },
  { id: "hmo", label: "HMO", icon: Users },
] as const

function asList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.properties)) return data.properties
  if (Array.isArray(data?.items)) return data.items
  return []
}

function propName(p: any) {
  return p?.name || p?.clientName || p?.address || "—"
}

function propStatus(p: any) {
  if (typeof p?.status === "string") return p.status
  return p?.isActive === false ? "inactive" : "active"
}

const emptyForm = {
  name: "",
  address: "",
  city: "",
  bedrooms: "1",
  bathrooms: "1",
  status: "active",
  propertyType: "",
}

export default function PropertiesPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [items, setItems] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [tab, setTab] = useState("all")
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const modalRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const openCreateModal = () => {
    setForm(emptyForm)
    setShowForm(true)
  }

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [listRes, statsRes] = await Promise.all([
        adminGet("/api/properties"),
        adminGet("/api/properties/stats").catch(() => null),
      ])
      if (listRes.data?.success) setItems(asList(listRes.data.data))
      else {
        setItems([])
        setError(listRes.data?.message || "Failed")
      }
      if (statsRes?.data?.success) setStats(statsRes.data.data)
      else setStats(null)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load properties")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Open create modal from onboarding / deep link ?create=1
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("create") === "1") {
      openCreateModal()
      params.delete("create")
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`
      window.history.replaceState({}, "", next)
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [tab])

  useEffect(() => {
    if (!showForm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowForm(false)
    }
    window.addEventListener("keydown", onKey)
    const t = setTimeout(() => nameInputRef.current?.focus(), 50)
    return () => {
      window.removeEventListener("keydown", onKey)
      clearTimeout(t)
    }
  }, [showForm])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.propertyType) {
      setError("Please select a property type")
      return
    }
    try {
      setSaving(true)
      setError("")
      const companyId = getSelectedCompanyId()
      const res = await adminPost("/api/properties", {
        name: form.name.trim(),
        clientName: form.name.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim() || undefined,
        bedrooms: parseInt(form.bedrooms, 10) || 0,
        bathrooms: parseInt(form.bathrooms, 10) || 0,
        status: form.status,
        isActive: form.status === "active",
        propertyType: form.propertyType,
        ...(companyId ? { companyId } : {}),
      })
      if (res.data?.success) {
        setToast("Property created")
        setShowForm(false)
        setForm(emptyForm)
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create property")
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (p: any) => {
    const active = propStatus(p) === "active"
    try {
      const res = await adminPatch(`/api/properties/${p.id}`, {
        isActive: !active,
        status: active ? "inactive" : "active",
      })
      if (res.data?.success) {
        setToast("Status updated")
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const remove = async (id: number) => {
    if (!confirm("Delete this property?")) return
    try {
      const res = await adminDelete(`/api/properties/${id}`)
      if (res.data?.success) {
        setToast("Property deleted")
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const safe = Array.isArray(items) ? items : []
  const filtered = useMemo(() => {
    if (tab === "active") return safe.filter((p) => propStatus(p) === "active")
    if (tab === "inactive") return safe.filter((p) => propStatus(p) !== "active")
    return safe
  }, [safe, tab])

  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const activeCount =
    stats?.active ?? safe.filter((p) => propStatus(p) === "active").length

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Manage"
        title="Properties"
        subtitle="Portfolio addresses, rooms, and active status"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton onClick={openCreateModal}>
              <Plus size={14} /> Add property
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OpsKpi label="Total" value={stats?.total ?? safe.length} />
        <OpsKpi label="Active" value={activeCount} />
        <OpsKpi label="Inactive" value={safe.length - activeCount} />
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false)
          }}
        >
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-[3px]" />

          <div
            ref={modalRef}
            className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-control-border bg-white shadow-2xl sm:rounded-2xl dark:border-navy-800 dark:bg-control-darkCard"
          >
            <div className="relative overflow-hidden border-b border-control-border px-6 py-5 dark:border-navy-800">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.12),_transparent_55%)]" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-amber-300">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Portfolio
                    </p>
                    <h2 className="text-lg font-extrabold text-navy-900 dark:text-white">
                      Add property
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Choose a type, then enter the address details
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-800"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <form onSubmit={create} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Property type <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {PROPERTY_TYPES.map((t) => {
                      const Icon = t.icon
                      const selected = form.propertyType === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setForm({ ...form, propertyType: t.id })}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition ${
                            selected
                              ? "border-amber-500 bg-amber-50 shadow-sm dark:border-amber-600 dark:bg-amber-950/30"
                              : "border-slate-200 bg-white hover:border-slate-300 dark:border-navy-800 dark:bg-navy-950 dark:hover:border-navy-700"
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                              selected
                                ? "bg-navy-900 text-amber-300"
                                : "bg-slate-100 text-slate-500 dark:bg-navy-900 dark:text-slate-400"
                            }`}
                          >
                            <Icon size={16} />
                          </span>
                          <span
                            className={`text-sm font-bold ${
                              selected
                                ? "text-navy-900 dark:text-white"
                                : "text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {t.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Name <span className="text-red-500">*</span>
                    </span>
                    <input
                      ref={nameInputRef}
                      required
                      type="text"
                      placeholder="e.g. Maple Court"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-700 dark:bg-navy-950"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>

                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Address <span className="text-red-500">*</span>
                    </span>
                    <input
                      required
                      type="text"
                      placeholder="Street address"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-700 dark:bg-navy-950"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      City
                    </span>
                    <input
                      type="text"
                      placeholder="City"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-700 dark:bg-navy-950"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Status
                    </span>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-700 dark:bg-navy-950"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Bedrooms
                    </span>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-700 dark:bg-navy-950"
                      value={form.bedrooms}
                      onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Bathrooms
                    </span>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-700 dark:bg-navy-950"
                      value={form.bathrooms}
                      onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-control-border bg-slate-50/80 px-6 py-4 dark:border-navy-800 dark:bg-navy-950/50">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
                >
                  Cancel
                </button>
                <OpsPrimaryButton type="submit" disabled={saving || !form.propertyType}>
                  {saving ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Building2 size={14} />
                  )}
                  {saving ? "Saving…" : "Save property"}
                </OpsPrimaryButton>
              </div>
            </form>
          </div>
        </div>
      )}

      <OpsTableShell
        title="Property list"
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {filtered.length}
          </span>
        }
        tabs={[
          { id: "all", label: "All" },
          { id: "active", label: "Active" },
          { id: "inactive", label: "Inactive" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No properties yet"
            ctaLabel="Add property"
            onCta={openCreateModal}
          />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Name</th>
                  <th className={opsTh}>Type</th>
                  <th className={opsTh}>Address</th>
                  <th className={opsTh}>City</th>
                  <th className={opsTh}>Beds</th>
                  <th className={opsTh}>Baths</th>
                  <th className={opsTh}>Status</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((p) => {
                  const st = propStatus(p)
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-navy-900/50">
                      <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                        {propName(p)}
                      </td>
                      <td className={`${opsTd} font-mono text-[10px] uppercase text-slate-500`}>
                        {p.propertyType || "—"}
                      </td>
                      <td className={`${opsTd} text-sm`}>{p.address || "—"}</td>
                      <td className={`${opsTd} text-sm`}>{p.city || p.postcode || "—"}</td>
                      <td className={`${opsTd} font-mono text-xs`}>{p.bedrooms ?? "—"}</td>
                      <td className={`${opsTd} font-mono text-xs`}>{p.bathrooms ?? "—"}</td>
                      <td className={opsTd}>
                        <OpsBadge status={st} />
                      </td>
                      <td className={`${opsTd} text-right`}>
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => toggleStatus(p)}
                            className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-navy-700 hover:bg-navy-50 dark:text-amber-400 dark:hover:bg-navy-800"
                          >
                            {st === "active" ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p.id)}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
