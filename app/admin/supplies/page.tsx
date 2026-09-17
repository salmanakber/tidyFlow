"use client"

import { useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import {
  adminGet,
  adminPost,
  adminPatch,
  adminDelete,
  formatMoney,
} from "@/lib/admin-session"
import {
  OpsPageHeader,
  OpsCard,
  OpsKpi,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsTableShell,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { Plus, Trash2, Loader2, AlertTriangle, Package } from "lucide-react"

function asList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.supplies)) return data.supplies
  return []
}

export default function SuppliesPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [items, setItems] = useState<any[]>([])
  const [forecast, setForecast] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState("all")
  const [form, setForm] = useState({
    name: "",
    unit: "pcs",
    currentStock: "0",
    minStock: "5",
    unitCost: "0",
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [listRes, forecastRes] = await Promise.all([
        adminGet("/api/supplies"),
        adminGet("/api/supplies/forecast").catch(() => null),
      ])
      if (listRes.data.success) setItems(asList(listRes.data.data))
      else {
        setItems([])
        setError(listRes.data.message || "Failed")
      }
      if (forecastRes?.data?.success) setForecast(forecastRes.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load supplies")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const res = await adminPost("/api/supplies", {
        name: form.name,
        unit: form.unit,
        currentStock: parseFloat(form.currentStock) || 0,
        minStock: parseFloat(form.minStock) || 0,
        unitCost: parseFloat(form.unitCost) || 0,
      })
      if (res.data.success) {
        setToast("Supply item added")
        setShowForm(false)
        setForm({ name: "", unit: "pcs", currentStock: "0", minStock: "5", unitCost: "0" })
        await load()
      } else setError(res.data.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed")
    } finally {
      setSaving(false)
    }
  }

  const adjustStock = async (id: number, currentStock: number) => {
    try {
      const res = await adminPatch(`/api/supplies/${id}`, { currentStock })
      if (res.data.success) {
        setToast("Stock updated")
        await load()
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const remove = async (id: number) => {
    if (!confirm("Archive this supply item?")) return
    try {
      const res = await adminDelete(`/api/supplies/${id}`)
      if (res.data.success) {
        setToast("Item archived")
        await load()
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const isLow = (i: any) => Number(i.currentStock) <= Number(i.minStock ?? 0)

  const filtered = useMemo(() => {
    if (tab === "low") return items.filter(isLow)
    if (tab === "ok") return items.filter((i) => !isLow(i))
    return items
  }, [items, tab])

  const lowStock = items.filter(isLow).length

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Manage"
        title="Supplies"
        subtitle="Inventory levels, costs, and low-stock alerts"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton onClick={() => setShowForm(true)}>
              <Plus size={14} /> Add item
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {lowStock > 0 && (
        <section className="flex items-center gap-3 rounded-xl border border-navy-800 bg-navy-900 p-4 text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
            <AlertTriangle size={16} />
          </div>
          <div className="font-mono text-xs">
            <span className="font-bold text-amber-400">LOW STOCK</span>
            <span className="text-slate-400"> · </span>
            <span className="text-slate-200">
              {lowStock} item{lowStock === 1 ? "" : "s"} at or below minimum
            </span>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OpsKpi label="Active items" value={items.length} />
        <OpsKpi label="Low stock" value={lowStock} hint={lowStock ? "Reorder soon" : undefined} />
        <OpsCard className="col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Forecast</p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            {forecast
              ? typeof forecast === "string"
                ? forecast
                : forecast.message || forecast.summary || "Forecast available"
              : "No forecast data"}
          </p>
        </OpsCard>
      </div>

      {showForm && (
        <OpsCard>
          <form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {(
              [
                ["name", "Name", "text"],
                ["unit", "Unit", "text"],
                ["currentStock", "Stock", "number"],
                ["minStock", "Min stock", "number"],
                ["unitCost", "Unit cost", "number"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key} className="space-y-1 text-xs font-semibold">
                {label}
                <input
                  required={key === "name"}
                  type={type}
                  step={type === "number" ? "0.01" : undefined}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <div className="flex justify-end gap-2 md:col-span-5">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <OpsPrimaryButton type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" size={14} />} Save
              </OpsPrimaryButton>
            </div>
          </form>
        </OpsCard>
      )}

      <OpsTableShell
        title="Supply inventory"
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {filtered.length}
          </span>
        }
        tabs={[
          { id: "all", label: "All" },
          { id: "low", label: "Low stock" },
          { id: "ok", label: "Healthy" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        footer={<span>INVENTORY LEDGER</span>}
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <OpsEmpty message="No supply items yet" />
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
              <tr>
                <th className={opsTh}>Item</th>
                <th className={opsTh}>Stock</th>
                <th className={opsTh}>Min</th>
                <th className={opsTh}>Unit cost</th>
                <th className={opsTh}>Status</th>
                <th className={`${opsTh} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {filtered.map((item) => {
                const low = isLow(item)
                const max = Math.max(Number(item.minStock) * 2 || 1, Number(item.currentStock) || 1)
                const pct = Math.min(100, (Number(item.currentStock) / max) * 100)
                return (
                  <tr
                    key={item.id}
                    className={low ? "bg-amber-50/40 dark:bg-amber-950/10" : "hover:bg-slate-50/80"}
                  >
                    <td className={opsTd}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-900 dark:text-amber-400">
                          <Package size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-navy-900 dark:text-white">{item.name}</p>
                          <p className="font-mono text-[10px] text-slate-400">{item.unit || "units"}</p>
                        </div>
                      </div>
                    </td>
                    <td className={opsTd}>
                      <input
                        type="number"
                        className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-sm dark:border-navy-800 dark:bg-navy-950"
                        defaultValue={item.currentStock}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value)
                          if (!Number.isNaN(v) && v !== Number(item.currentStock)) {
                            adjustStock(item.id, v)
                          }
                        }}
                      />
                      <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-900">
                        <div
                          className={`h-1 rounded-full ${low ? "bg-amber-600" : "bg-emerald-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className={`${opsTd} font-mono text-xs`}>{item.minStock ?? "—"}</td>
                    <td className={`${opsTd} font-bold`}>{formatMoney(item.unitCost)}</td>
                    <td className={opsTd}>
                      {low ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                          <AlertTriangle size={10} /> Low
                        </span>
                      ) : (
                        <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                          OK
                        </span>
                      )}
                    </td>
                    <td className={`${opsTd} text-right`}>
                      <button
                        onClick={() => remove(item.id)}
                        className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                        title="Archive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </OpsTableShell>
    </div>
  )
}
