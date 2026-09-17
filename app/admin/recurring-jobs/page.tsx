"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import {
  adminGet,
  adminPost,
  adminDelete,
  formatDate,
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
import { Plus, Trash2, Loader2, Repeat } from "lucide-react"

const PAGE_SIZE = 10
const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 7, l: "Sun" },
]

function asList(data: any, keys: string[] = []): any[] {
  if (Array.isArray(data)) return data
  for (const k of keys) {
    if (Array.isArray(data?.[k])) return data[k]
  }
  if (Array.isArray(data?.items)) return data.items
  return []
}

function propLabel(p: any) {
  return p?.name || p?.address || (p?.id ? `#${p.id}` : "—")
}

function cleanerLabel(u: any) {
  const n = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim()
  return n || u?.email || (u?.id ? `#${u.id}` : "—")
}

function freqLabel(j: any) {
  if (j.frequency) return String(j.frequency)
  if (j.recurrenceType === "weekly") return "weekly"
  if (j.recurrenceType === "interval") {
    return j.intervalDays ? `every ${j.intervalDays}d` : "interval"
  }
  if (j.intervalDays) return `every ${j.intervalDays}d`
  return j.recurringPattern || "—"
}

export default function RecurringJobsPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [items, setItems] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [cleaners, setCleaners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    propertyId: "",
    cleanerId: "",
    frequency: "weekly",
    intervalDays: "7",
    dayOfWeek: "1",
    startDate: "",
    time: "09:00",
    taskTitle: "Recurring clean",
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [jobsRes, propsRes, usersRes] = await Promise.all([
        adminGet("/api/recurring-jobs"),
        adminGet("/api/properties"),
        adminGet("/api/users", { params: { role: "CLEANER" } }),
      ])
      if (jobsRes.data?.success) {
        setItems(asList(jobsRes.data.data, ["jobs", "recurringJobs"]))
      } else {
        setItems([])
        setError(jobsRes.data?.message || "Failed")
      }
      setProperties(asList(propsRes.data?.data, ["properties"]))
      setCleaners(
        asList(usersRes.data?.data, ["users"]).filter(
          (u) => !u.role || u.role === "CLEANER"
        )
      )
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load recurring jobs")
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
    if (!form.propertyId || !form.startDate) {
      setError("Property and start date are required")
      return
    }
    const nextRunAt = new Date(`${form.startDate}T${form.time || "09:00"}:00`)
    const isWeekly = form.frequency === "weekly"
    try {
      setSaving(true)
      const payload: any = {
        propertyId: parseInt(form.propertyId, 10),
        cleanerId: form.cleanerId ? parseInt(form.cleanerId, 10) : undefined,
        assignedUserId: form.cleanerId ? parseInt(form.cleanerId, 10) : undefined,
        frequency: form.frequency,
        recurrenceType: isWeekly ? "weekly" : "interval",
        intervalDays: isWeekly ? undefined : parseInt(form.intervalDays, 10) || 7,
        dayOfWeek: parseInt(form.dayOfWeek, 10),
        allowedDaysOfWeek: isWeekly ? [parseInt(form.dayOfWeek, 10)] : undefined,
        startDate: form.startDate,
        time: form.time,
        nextRunAt: nextRunAt.toISOString(),
        taskTitle: form.taskTitle.trim() || "Recurring clean",
      }
      const res = await adminPost("/api/recurring-jobs", payload)
      if (res.data?.success) {
        setToast("Recurring job created")
        setShowForm(false)
        setForm({
          propertyId: "",
          cleanerId: "",
          frequency: "weekly",
          intervalDays: "7",
          dayOfWeek: "1",
          startDate: "",
          time: "09:00",
          taskTitle: "Recurring clean",
        })
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create job")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm("Delete this recurring job?")) return
    try {
      const res = await adminDelete(`/api/recurring-jobs/${id}`)
      if (res.data?.success !== false) {
        setToast("Recurring job deleted")
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const safe = Array.isArray(items) ? items : []
  const pageSlice = safe.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const activeCount = safe.filter((j) => j.active !== false).length

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Schedule"
        title="Recurring jobs"
        subtitle="Auto-generate cleans by property, cleaner, and cadence"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton onClick={() => setShowForm(true)}>
              <Plus size={14} /> Add series
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OpsKpi label="Series" value={safe.length} />
        <OpsKpi label="Active" value={activeCount} />
        <OpsKpi label="Properties" value={properties.length} />
      </div>

      {showForm && (
        <form
          onSubmit={create}
          className="grid grid-cols-1 gap-3 rounded-xl border border-control-border bg-white p-5 dark:border-navy-800 dark:bg-control-darkCard md:grid-cols-3"
        >
          <label className="space-y-1 text-xs font-semibold md:col-span-2">
            Title
            <input
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.taskTitle}
              onChange={(e) => setForm({ ...form, taskTitle: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Frequency
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="weekly">Weekly</option>
              <option value="interval">Interval (days)</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Property
            <select
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.propertyId}
              onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
            >
              <option value="">Select…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {propLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Cleaner
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.cleanerId}
              onChange={(e) => setForm({ ...form, cleanerId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {cleaners.map((c) => (
                <option key={c.id} value={c.id}>
                  {cleanerLabel(c)}
                </option>
              ))}
            </select>
          </label>
          {form.frequency === "interval" ? (
            <label className="space-y-1 text-xs font-semibold">
              Interval (days)
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                value={form.intervalDays}
                onChange={(e) => setForm({ ...form, intervalDays: e.target.value })}
              />
            </label>
          ) : (
            <label className="space-y-1 text-xs font-semibold">
              Day of week
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
              >
                {DAYS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.l}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs font-semibold">
            Start date
            <input
              required
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Time
            <input
              type="time"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <OpsPrimaryButton type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Repeat size={14} />}
              Create
            </OpsPrimaryButton>
          </div>
        </form>
      )}

      <OpsTableShell
        title="Recurring series"
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {safe.length}
          </span>
        }
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : safe.length === 0 ? (
          <OpsEmpty message="No recurring jobs yet" />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Job</th>
                  <th className={opsTh}>Property</th>
                  <th className={opsTh}>Cleaner</th>
                  <th className={opsTh}>Cadence</th>
                  <th className={opsTh}>Next / start</th>
                  <th className={opsTh}>Status</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/80">
                    <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                      {j.taskTitle || j.title || `Series #${j.id}`}
                    </td>
                    <td className={`${opsTd} text-sm`}>
                      {propLabel(j.property) || j.propertyId}
                    </td>
                    <td className={`${opsTd} text-sm`}>
                      {cleanerLabel(j.cleaner || j.assignedUser) ||
                        j.cleanerId ||
                        j.assignedUserId ||
                        "—"}
                    </td>
                    <td className={`${opsTd} font-mono text-xs`}>{freqLabel(j)}</td>
                    <td className={`${opsTd} text-xs text-slate-500`}>
                      {formatDate(j.nextRunAt || j.startDate)}
                      {j.time ? ` · ${j.time}` : ""}
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={j.active === false ? "inactive" : "active"} />
                    </td>
                    <td className={`${opsTd} text-right`}>
                      <button
                        type="button"
                        onClick={() => remove(j.id)}
                        className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <OpsPagination page={page} pageSize={PAGE_SIZE} total={safe.length} onPageChange={setPage} />
          </>
        )}
      </OpsTableShell>
    </div>
  )
}
