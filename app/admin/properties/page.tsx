"use client"

import { useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import {
  adminGet,
  adminPost,
  adminPatch,
  adminDelete,
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
import { Plus, Trash2, Loader2, Building2 } from "lucide-react"

const PAGE_SIZE = 10

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
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    bedrooms: "1",
    bathrooms: "1",
    status: "active",
  })

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

  useEffect(() => {
    setPage(1)
  }, [tab])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const res = await adminPost("/api/properties", {
        name: form.name.trim(),
        clientName: form.name.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim() || undefined,
        bedrooms: parseInt(form.bedrooms, 10) || 0,
        bathrooms: parseInt(form.bathrooms, 10) || 0,
        status: form.status,
        isActive: form.status === "active",
        propertyType: "apartment",
      })
      if (res.data?.success) {
        setToast("Property created")
        setShowForm(false)
        setForm({
          name: "",
          address: "",
          city: "",
          bedrooms: "1",
          bathrooms: "1",
          status: "active",
        })
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
            <OpsPrimaryButton onClick={() => setShowForm(true)}>
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
        <form
          onSubmit={create}
          className="grid grid-cols-1 gap-3 rounded-xl border border-control-border bg-white p-5 dark:border-navy-800 dark:bg-control-darkCard md:grid-cols-3"
        >
          {(
            [
              ["name", "Name", "text"],
              ["address", "Address", "text"],
              ["city", "City", "text"],
              ["bedrooms", "Bedrooms", "number"],
              ["bathrooms", "Bathrooms", "number"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="space-y-1 text-xs font-semibold">
              {label}
              <input
                required={key === "address" || key === "name"}
                type={type}
                min={type === "number" ? 0 : undefined}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="space-y-1 text-xs font-semibold">
            Status
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 md:col-span-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <OpsPrimaryButton type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Building2 size={14} />}
              Save
            </OpsPrimaryButton>
          </div>
        </form>
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
          <OpsEmpty message="No properties yet" />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Name</th>
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
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                        {propName(p)}
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
                            className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-navy-700 hover:bg-navy-50 dark:text-amber-400"
                          >
                            {st === "active" ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p.id)}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
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
            <OpsPagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </>
        )}
      </OpsTableShell>
    </div>
  )
}
