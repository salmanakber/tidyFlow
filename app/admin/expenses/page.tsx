"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate, formatMoney } from "@/lib/admin-session"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import { Plus, Loader2, Receipt } from "lucide-react"
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
  const [tab, setTab] = useUrlQueryState("status", "all")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await adminGet("/api/expenses")
      if (res.data.success) {
        const raw = res.data.data
        setItems(Array.isArray(raw) ? raw : [])
      } else {
        setItems([])
        setError(res.data.message || "Failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load expenses")
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
    setSelected(new Set())
  }, [tab])

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

  const bulkApprove = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    try {
      setBulkBusy(true)
      const results = await Promise.allSettled(
        ids.map((id) => adminPost(`/api/expenses/${id}/approve`, { status: "approved" }))
      )
      const failed = results.filter((r) => r.status === "rejected").length
      setSelected(new Set())
      if (failed) setError(`${failed} could not be approved`)
      else setToast(`Approved ${ids.length} expense${ids.length === 1 ? "" : "s"}`)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Bulk approve failed")
    } finally {
      setBulkBusy(false)
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

  const safeItems = Array.isArray(items) ? items : []
  const filtered =
    tab === "all" ? safeItems : safeItems.filter((i) => String(i.status) === tab)
  const pending = safeItems.filter((i) => i.status === "pending").length
  const totalPending = safeItems
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + Number(i.amount || 0), 0)
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const pendingOnPage = pageSlice.filter((i) => i.status === "pending")
  const pendingIds = pendingOnPage.map((i) => i.id as number)
  const allPendingSelected =
    pendingIds.length > 0 && pendingIds.every((id) => selected.has(id))

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePagePending = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPendingSelected) pendingIds.forEach((id) => next.delete(id))
      else pendingIds.forEach((id) => next.add(id))
      return next
    })
  }

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="Expenses"
        subtitle="Track and approve staff expense claims"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton onClick={() => setShowForm(true)}>
              <Plus size={14} /> Add expense
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3">
        <OpsKpi label="Pending approvals" value={pending} />
        <OpsKpi label="Pending amount" value={formatMoney(totalPending)} />
      </div>

      {showForm && (
        <OpsCard>
          <form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="space-y-1 text-xs font-semibold">
              Category
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="supplies">Supplies</option>
                <option value="travel">Travel</option>
                <option value="equipment">Equipment</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Amount
              <input
                required
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-xs font-semibold md:col-span-2">
              Description
              <input
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2 md:col-span-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <OpsPrimaryButton type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Receipt size={14} />}
                Submit
              </OpsPrimaryButton>
            </div>
          </form>
        </OpsCard>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {selected.size} selected
          </p>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={bulkApprove}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase text-white disabled:opacity-50"
          >
            {bulkBusy ? "Approving…" : "Approve selected"}
          </button>
        </div>
      )}

      <OpsTableShell
        title="Expense claims"
        stickyHeader
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {filtered.length}
          </span>
        }
        tabs={[
          { id: "all", label: "All" },
          { id: "pending", label: "Pending" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No expenses yet"
            ctaLabel="Add expense"
            onCta={() => setShowForm(true)}
          />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={`${opsTh} w-10`}>
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={togglePagePending}
                      disabled={pendingIds.length === 0}
                      aria-label="Select pending on page"
                      className="rounded border-slate-300 disabled:opacity-40"
                    />
                  </th>
                  <th className={opsTh}>Staff</th>
                  <th className={opsTh}>Category</th>
                  <th className={opsTh}>Amount</th>
                  <th className={opsTh}>Description</th>
                  <th className={opsTh}>Date</th>
                  <th className={opsTh}>Status</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className={opsTd}>
                      {item.status === "pending" ? (
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleOne(item.id)}
                          aria-label={`Select expense ${item.id}`}
                          className="rounded border-slate-300"
                        />
                      ) : null}
                    </td>
                    <td className={`${opsTd} font-semibold`}>
                      {[item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") ||
                        "—"}
                    </td>
                    <td className={`${opsTd} capitalize`}>{item.category}</td>
                    <td className={`${opsTd} font-bold`}>{formatMoney(item.amount)}</td>
                    <td className={`${opsTd} max-w-[220px] truncate text-slate-500`}>
                      {item.description}
                    </td>
                    <td className={opsTd}>{formatDate(item.createdAt)}</td>
                    <td className={opsTd}>
                      <OpsBadge status={item.status} />
                    </td>
                    <td className={`${opsTd} text-right`}>
                      {item.status === "pending" && (
                        <div className="inline-flex gap-2">
                          <button
                            disabled={busyId === item.id}
                            onClick={() => approve(item.id, "approved")}
                            className="text-xs font-bold text-emerald-700 hover:underline disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busyId === item.id}
                            onClick={() => approve(item.id, "rejected")}
                            className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
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
