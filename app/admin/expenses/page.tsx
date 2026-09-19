"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate, formatMoney } from "@/lib/admin-session"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import { Plus, Receipt, Check, X } from "lucide-react"
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
  OpsField,
  OpsSecondaryButton,
  OpsRowAction,
  opsFieldCls,
} from "@/components/ops/OpsForm"
import { OpsSpinner } from "@/components/ops/OpsLoader"

const PAGE_SIZE = 10

const CATEGORIES = [
  { id: "supplies", label: "Supplies" },
  { id: "travel", label: "Travel" },
  { id: "equipment", label: "Equipment" },
  { id: "other", label: "Other" },
]

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
  const approved = safeItems.filter((i) => i.status === "approved").length
  const totalPending = safeItems
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + Number(i.amount || 0), 0)
  const totalApproved = safeItems
    .filter((i) => i.status === "approved")
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
        subtitle="Track claims, approve spend, and keep books clean"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton
              onClick={() => {
                setForm({ category: "supplies", amount: "", description: "" })
                setShowForm(true)
              }}
            >
              <Plus size={14} /> Add expense
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsKpi label="Pending" value={pending} />
        <OpsKpi label="Pending $" value={formatMoney(totalPending)} />
        <OpsKpi label="Approved" value={approved} />
        <OpsKpi label="Approved $" value={formatMoney(totalApproved)} />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {selected.size} claim{selected.size === 1 ? "" : "s"} selected
          </p>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={bulkApprove}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50"
          >
            {bulkBusy ? <OpsSpinner className="border-emerald-100 border-t-white" /> : <Check size={14} />}
            Approve selected
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
        footer={<span>STAFF SPEND · BULK APPROVE</span>}
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <OpsEmpty
            message="No expenses yet"
            hint="Log supplies, travel, or equipment claims for approval"
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
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
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
                  <tr key={item.id} className="hover:bg-amber-50/40 dark:hover:bg-navy-900/50">
                    <td className={opsTd}>
                      {item.status === "pending" ? (
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleOne(item.id)}
                          aria-label={`Select expense ${item.id}`}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                      ) : null}
                    </td>
                    <td className={opsTd}>
                      <p className="font-bold text-navy-900 dark:text-white">
                        {[item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") ||
                          "—"}
                      </p>
                    </td>
                    <td className={opsTd}>
                      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300">
                        {item.category}
                      </span>
                    </td>
                    <td className={`${opsTd} font-mono text-base font-black text-navy-900 dark:text-white`}>
                      {formatMoney(item.amount)}
                    </td>
                    <td className={`${opsTd} max-w-[240px] text-slate-500`}>
                      <p className="line-clamp-2">{item.description}</p>
                    </td>
                    <td className={`${opsTd} text-slate-500`}>{formatDate(item.createdAt)}</td>
                    <td className={opsTd}>
                      <OpsBadge status={item.status} />
                    </td>
                    <td className={`${opsTd} text-right`}>
                      {item.status === "pending" && (
                        <div className="inline-flex gap-1">
                          <OpsRowAction
                            tone="emerald"
                            disabled={busyId === item.id}
                            onClick={() => approve(item.id, "approved")}
                          >
                            <Check size={12} /> Approve
                          </OpsRowAction>
                          <OpsRowAction
                            tone="danger"
                            disabled={busyId === item.id}
                            onClick={() => approve(item.id, "rejected")}
                          >
                            <X size={12} /> Reject
                          </OpsRowAction>
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

      <OpsDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        eyebrow="New claim"
        title="Add expense"
        subtitle="Submit a staff spend claim for manager approval"
        footer={
          <>
            <OpsSecondaryButton onClick={() => setShowForm(false)}>Cancel</OpsSecondaryButton>
            <OpsPrimaryButton
              type="submit"
              disabled={saving || !form.amount || !form.description}
              onClick={() => {
                const formEl = document.getElementById("expense-create-form") as HTMLFormElement | null
                formEl?.requestSubmit()
              }}
            >
              {saving ? <OpsSpinner className="border-amber-100 border-t-white" /> : <Receipt size={14} />}
              Submit claim
            </OpsPrimaryButton>
          </>
        }
      >
        <form id="expense-create-form" onSubmit={create} className="space-y-4">
          <div className="rounded-xl border border-control-border bg-slate-50 p-4 dark:border-navy-800 dark:bg-navy-950">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Category
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setForm({ ...form, category: c.id })}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm font-bold transition ${
                    form.category === c.id
                      ? "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
                      : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 dark:border-navy-800 dark:bg-navy-900 dark:text-slate-300"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <OpsField label="Amount" required hint="Enter the total claimed in your company currency">
            <input
              required
              type="number"
              step="0.01"
              min="0"
              className={opsFieldCls}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </OpsField>

          <OpsField label="Description" required>
            <textarea
              required
              rows={4}
              className={`${opsFieldCls} resize-none`}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What was purchased and why…"
            />
          </OpsField>
        </form>
      </OpsDrawer>
    </div>
  )
}
