"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate, formatMoney, statusBadgeClass } from "@/lib/admin-session"
import { RefreshCw, Plus, Loader2, Receipt } from "lucide-react"

export default function ExpensesPage() {
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: "supplies", amount: "", description: "" })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await adminGet("/api/expenses")
      if (res.data.success) setItems(res.data.data || [])
      else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load expenses")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const approve = async (id: number, status: "approved" | "rejected") => {
    try {
      setBusyId(id)
      const res = await adminPost(`/api/expenses/${id}/approve`, { status })
      if (res.data.success) {
        setToast(`Expense ${status}`)
        await load()
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const res = await adminPost("/api/expenses", {
        category: form.category,
        amount: parseFloat(form.amount),
        description: form.description,
      })
      if (res.data.success) {
        setToast("Expense submitted")
        setShowForm(false)
        setForm({ category: "supplies", amount: "", description: "" })
        await load()
      } else setError(res.data.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed")
    } finally {
      setSaving(false)
    }
  }

  const pending = items.filter((i) => i.status === "pending").length
  const totalPending = items
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + Number(i.amount || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white">Expenses</h1>
          <p className="text-sm text-slate-500 mt-1">Track and approve staff expense claims</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={16} /> Add expense
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-control-border rounded-lg text-sm font-semibold"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {toast && <Flash ok text={toast} onClose={() => setToast("")} />}
      {error && <Flash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3">
        <Card label="Pending approvals" value={pending} />
        <Card label="Pending amount" value={formatMoney(totalPending)} />
      </div>

      {showForm && (
        <form
          onSubmit={create}
          className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-5 grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          <label className="text-xs font-semibold space-y-1">
            Category
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="supplies">Supplies</option>
              <option value="travel">Travel</option>
              <option value="equipment">Equipment</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-semibold space-y-1">
            Amount
            <input
              required
              type="number"
              step="0.01"
              min="0"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold space-y-1 md:col-span-2">
            Description
            <input
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="md:col-span-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-navy-900 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Receipt size={14} />}
              Submit
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No expenses yet</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-semibold">
                    {[item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{item.category}</td>
                  <td className="px-4 py-3 font-bold">{formatMoney(item.amount)}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate">
                    {item.description}
                  </td>
                  <td className="px-4 py-3">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${statusBadgeClass(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.status === "pending" && (
                      <div className="inline-flex gap-2">
                        <button
                          disabled={busyId === item.id}
                          onClick={() => approve(item.id, "approved")}
                          className="text-xs font-bold text-emerald-700 hover:underline"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busyId === item.id}
                          onClick={() => approve(item.id, "rejected")}
                          className="text-xs font-bold text-red-600 hover:underline"
                        >
                          Reject
                        </button>
                      </div>
                    )}
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

function Card({ label, value }: { label: string; value: string | number }) {
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
