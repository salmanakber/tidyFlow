"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, adminDelete, formatMoney } from "@/lib/admin-session"
import { RefreshCw, Plus, Package, Trash2, Loader2, AlertTriangle } from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsPrimaryButton,
} from "@/components/ops/OpsChrome"

export default function SuppliesPage() {
  return (
    <AdminLayout>
      <ProtectedPage>
        <Content />
      </ProtectedPage>
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
      if (listRes.data.success) setItems(listRes.data.data || [])
      else setError(listRes.data.message || "Failed")
      if (forecastRes?.data?.success) setForecast(forecastRes.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load supplies")
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

  const lowStock = items.filter(
    (i) => Number(i.currentStock) <= Number(i.minStock ?? 0)
  ).length

  return (
    <div className="space-y-6">
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

      {toast && <Flash ok text={toast} onClose={() => setToast("")} />}
      {error && <Flash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-4">
          <p className="text-[11px] font-bold uppercase text-slate-400">Active items</p>
          <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1">{items.length}</p>
        </div>
        <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-4">
          <p className="text-[11px] font-bold uppercase text-slate-400 flex items-center gap-1">
            {lowStock > 0 && <AlertTriangle size={12} className="text-amber-600" />} Low stock
          </p>
          <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1">{lowStock}</p>
        </div>
      </div>

      {forecast && (
        <div className="bg-navy-900 text-white rounded-xl p-4 text-sm">
          <span className="font-bold text-amber-400 font-mono text-xs">FORECAST</span>
          <p className="text-slate-300 mt-1 text-xs">
            {typeof forecast === "string"
              ? forecast
              : forecast.message ||
                forecast.summary ||
                "Supply forecast data available for your plan."}
          </p>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={create}
          className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-5 grid grid-cols-1 md:grid-cols-5 gap-3"
        >
          {(
            [
              ["name", "Name", "text"],
              ["unit", "Unit", "text"],
              ["currentStock", "Stock", "number"],
              ["minStock", "Min stock", "number"],
              ["unitCost", "Unit cost", "number"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="text-xs font-semibold space-y-1">
              {label}
              <input
                required={key === "name"}
                type={type}
                step={type === "number" ? "0.01" : undefined}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="md:col-span-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-navy-900 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {saving && <Loader2 className="animate-spin" size={14} />} Save
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No supply items yet</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Min</th>
                <th className="px-4 py-3">Unit cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {items.map((item) => {
                const low = Number(item.currentStock) <= Number(item.minStock ?? 0)
                return (
                  <tr key={item.id} className={low ? "bg-amber-50/40" : ""}>
                    <td className="px-4 py-3 font-semibold">
                      {item.name}
                      <div className="text-xs text-slate-400 font-normal">{item.unit}</div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-sm font-mono"
                        defaultValue={item.currentStock}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value)
                          if (!Number.isNaN(v) && v !== Number(item.currentStock)) {
                            adjustStock(item.id, v)
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono">{item.minStock ?? "—"}</td>
                    <td className="px-4 py-3 font-bold">{formatMoney(item.unitCost)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove(item.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
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
      </div>
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
