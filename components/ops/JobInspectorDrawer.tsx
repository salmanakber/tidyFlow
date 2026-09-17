"use client"

/**
 * Job inspector slide-over — matches control-panel reference drawer
 * (navy head, amber accents, dense form).
 */
import React, { useEffect, useState } from "react"
import axios from "axios"
import {
  X,
  MapPin,
  User as UserIcon,
  ChevronDown,
  Loader2,
  Calendar,
  ClipboardList,
} from "lucide-react"

export interface JobTask {
  id: number
  title: string
  description?: string
  status: string
  scheduledDate?: string
  isRecurring?: boolean
  recurringPattern?: string
  property?: { id: number; address: string; clientName?: string | null }
  assignedUser?: {
    id: number
    firstName?: string
    lastName?: string
    email?: string
    profileImage?: string
  } | null
}

export interface JobProperty {
  id: number
  address: string
  clientName?: string | null
}

export interface JobCleaner {
  id: number
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  isActive?: boolean
}

export const JOB_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  DRAFT: { label: "Draft", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
  PLANNED: { label: "Planned", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  ASSIGNED: {
    label: "Assigned",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-amber-800",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  SUBMITTED: {
    label: "Submitted",
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
  },
  QA_REVIEW: {
    label: "QA Review",
    color: "text-pink-700",
    bg: "bg-pink-50",
    border: "border-pink-200",
  },
  APPROVED: {
    label: "Approved",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  COMPLETED: {
    label: "Completed",
    color: "text-emerald-800",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  REJECTED: { label: "Rejected", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  ARCHIVED: {
    label: "Archived",
    color: "text-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
}

const fieldCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-100"

export function JobStatusBadge({ status }: { status: string }) {
  const config = JOB_STATUS_CONFIG[status] || JOB_STATUS_CONFIG.DRAFT
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.bg} ${config.color} ${config.border}`}
    >
      {config.label}
    </span>
  )
}

function cleanerLabel(u?: JobCleaner | JobTask["assignedUser"] | null) {
  if (!u) return ""
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ")
  return n || ("email" in u ? u.email : "") || ""
}

type Tab = "details" | "schedule"

export default function JobInspectorDrawer({
  open,
  onClose,
  task,
  properties,
  cleaners,
  onSaved,
  onError,
}: {
  open: boolean
  onClose: () => void
  task: JobTask | null
  properties: JobProperty[]
  cleaners: JobCleaner[]
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [tab, setTab] = useState<Tab>("details")
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: "",
    description: "",
    propertyId: "",
    assignedUserId: "",
    status: "PLANNED",
    scheduledDate: "",
    isRecurring: false,
    recurringPattern: "weekly",
  })

  useEffect(() => {
    if (!open) return
    setTab("details")
    if (task) {
      setForm({
        title: task.title || "",
        description: task.description || "",
        propertyId: String(task.property?.id || ""),
        assignedUserId: task.assignedUser?.id ? String(task.assignedUser.id) : "",
        status: task.status || "PLANNED",
        scheduledDate: task.scheduledDate
          ? new Date(task.scheduledDate).toISOString().slice(0, 16)
          : "",
        isRecurring: !!task.isRecurring,
        recurringPattern: task.recurringPattern || "weekly",
      })
    } else {
      setForm({
        title: "",
        description: "",
        propertyId: "",
        assignedUserId: "",
        status: "PLANNED",
        scheduledDate: "",
        isRecurring: false,
        recurringPattern: "weekly",
      })
    }
  }, [task, open])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.propertyId) {
      onError("Title and property are required")
      return
    }
    try {
      setSaving(true)
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const payload = {
        title: form.title.trim(),
        description: form.description || undefined,
        propertyId: parseInt(form.propertyId, 10),
        assignedUserId: form.assignedUserId ? parseInt(form.assignedUserId, 10) : null,
        status: form.status,
        scheduledDate: form.scheduledDate
          ? new Date(form.scheduledDate).toISOString()
          : null,
        isRecurring: form.isRecurring,
        recurringPattern: form.isRecurring ? form.recurringPattern : null,
      }
      if (task?.id) {
        await axios.patch(`/api/tasks/${task.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } else {
        await axios.post("/api/tasks", payload, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      onSaved()
      onClose()
    } catch (err: any) {
      onError(err.response?.data?.message || "Could not save job")
    } finally {
      setSaving(false)
    }
  }

  const headline = task
    ? `#JOB-${task.id} · ${task.property?.address || task.title}`
    : "New job dispatch"

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-navy-950/60 backdrop-blur-[1px] transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[70] flex w-full max-w-[560px] flex-col border-l border-control-border bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-control-darkBorder dark:bg-control-darkCard ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-navy-900 bg-navy-950 p-5 text-white">
          <div className="min-w-0 pr-3">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="font-bold uppercase text-amber-500">Job inspector</span>
              <span className="text-slate-500">|</span>
              {task ? (
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-bold text-amber-300">
                  {(JOB_STATUS_CONFIG[task.status] || JOB_STATUS_CONFIG.DRAFT).label}
                </span>
              ) : (
                <span className="font-bold text-emerald-400">CREATE</span>
              )}
            </div>
            <h2 className="mt-0.5 truncate text-base font-extrabold tracking-tight">{headline}</h2>
            {task?.assignedUser && (
              <p className="mt-1 truncate text-xs text-slate-400">
                Assigned · {cleanerLabel(task.assignedUser)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-900 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-6 border-b border-control-border bg-slate-50 px-5 font-mono text-xs font-bold dark:border-navy-800 dark:bg-navy-950">
          {(
            [
              { id: "details" as const, label: "Details", icon: ClipboardList },
              { id: "schedule" as const, label: "Schedule", icon: Calendar },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 py-3 transition ${
                tab === t.id
                  ? "border-amber-600 text-amber-600"
                  : "border-transparent text-slate-400 hover:text-navy-900 dark:hover:text-white"
              }`}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
            {tab === "details" && (
              <>
                <Field label="Job title" required>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. End of tenancy clean"
                    className={fieldCls}
                  />
                </Field>
                <Field label="Property" required>
                  <div className="relative">
                    <select
                      required
                      value={form.propertyId}
                      onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                      className={`${fieldCls} appearance-none pr-9`}
                    >
                      <option value="">Select property…</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.address}
                          {p.clientName ? ` · ${p.clientName}` : ""}
                        </option>
                      ))}
                    </select>
                    <MapPin
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </Field>
                <Field label="Assign cleaner">
                  <div className="relative">
                    <select
                      value={form.assignedUserId}
                      onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
                      className={`${fieldCls} appearance-none pr-9`}
                    >
                      <option value="">Unassigned</option>
                      {cleaners.map((u) => (
                        <option key={u.id} value={u.id}>
                          {cleanerLabel(u) || `Cleaner #${u.id}`}
                        </option>
                      ))}
                    </select>
                    <UserIcon
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </Field>
                <Field label="Status">
                  <div className="relative">
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className={`${fieldCls} appearance-none pr-9`}
                    >
                      {Object.entries(JOB_STATUS_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </Field>
                <Field label="Notes">
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`${fieldCls} resize-none`}
                    placeholder="Access codes, special instructions…"
                  />
                </Field>
              </>
            )}

            {tab === "schedule" && (
              <>
                <Field label="Scheduled date & time">
                  <input
                    type="datetime-local"
                    value={form.scheduledDate}
                    onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                    className={fieldCls}
                  />
                </Field>
                <label className="flex items-center gap-2 rounded-lg border border-control-border bg-slate-50 px-3 py-3 text-sm dark:border-navy-800 dark:bg-navy-950">
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                  />
                  <span className="font-semibold text-navy-900 dark:text-white">Recurring job</span>
                </label>
                {form.isRecurring && (
                  <Field label="Pattern">
                    <select
                      value={form.recurringPattern}
                      onChange={(e) => setForm({ ...form, recurringPattern: e.target.value })}
                      className={fieldCls}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </Field>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-control-border bg-slate-50 p-4 dark:border-navy-800 dark:bg-navy-950">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-navy-700 dark:text-slate-300"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-1.5 font-mono text-xs font-bold text-white shadow-amber-glow hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {task ? "Save changes" : "Create job"}
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
        {required && <span className="text-amber-600"> *</span>}
      </span>
      {children}
    </label>
  )
}
