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
  Camera,
  CheckSquare,
  Clock,
  Radio,
} from "lucide-react"
import SmartAssignPanel from "@/components/ops/SmartAssignPanel"
import LiveMapPanel from "@/components/ops/LiveMapPanel"
import {
  fetchLiveCleaners,
  fetchTaskLocationLogs,
  type LiveCleaner,
  type LocationLog,
} from "@/lib/ops-tracking"

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

type Tab = "details" | "schedule" | "checklist" | "proofs" | "hours" | "gps"

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
  const [detailLoading, setDetailLoading] = useState(false)
  const [photos, setPhotos] = useState<any[]>([])
  const [checklists, setChecklists] = useState<any[]>([])
  const [timeLogs, setTimeLogs] = useState<any[]>([])
  const [locationLogs, setLocationLogs] = useState<LocationLog[]>([])
  const [liveForJob, setLiveForJob] = useState<LiveCleaner[]>([])
  const [gpsLoading, setGpsLoading] = useState(false)
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
      ;(async () => {
        try {
          setDetailLoading(true)
          const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
          const headers = { Authorization: `Bearer ${token}` }
          const [detailRes, logsRes] = await Promise.all([
            axios.get(`/api/tasks/${task.id}`, { headers }).catch(() => null),
            axios.get(`/api/tasks/${task.id}/time-logs`, { headers }).catch(() => null),
          ])
          const d = detailRes?.data?.data?.task || detailRes?.data?.data || detailRes?.data
          setPhotos(Array.isArray(d?.photos) ? d.photos : [])
          setChecklists(Array.isArray(d?.checklists) ? d.checklists : Array.isArray(d?.checklistItems) ? d.checklistItems : [])
          const logs = logsRes?.data?.data?.logs || logsRes?.data?.data || []
          setTimeLogs(Array.isArray(logs) ? logs : [])
          setLocationLogs([])
          setLiveForJob([])
        } finally {
          setDetailLoading(false)
        }
      })()
    } else {
      setPhotos([])
      setChecklists([])
      setTimeLogs([])
      setLocationLogs([])
      setLiveForJob([])
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

  useEffect(() => {
    if (!open || !task?.id || tab !== "gps") return
    let cancelled = false
    ;(async () => {
      try {
        setGpsLoading(true)
        const [logs, live] = await Promise.all([
          fetchTaskLocationLogs(task.id),
          fetchLiveCleaners(),
        ])
        if (cancelled) return
        setLocationLogs(logs)
        const assignedId = task.assignedUser?.id
        setLiveForJob(
          live.filter(
            (c) =>
              c.taskId === task.id ||
              (assignedId != null && c.userId === assignedId)
          )
        )
      } finally {
        if (!cancelled) setGpsLoading(false)
      }
    })()
    const poll = setInterval(async () => {
      const live = await fetchLiveCleaners()
      if (cancelled) return
      const assignedId = task.assignedUser?.id
      setLiveForJob(
        live.filter(
          (c) =>
            c.taskId === task.id ||
            (assignedId != null && c.userId === assignedId)
        )
      )
    }, 30000)
    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [open, task, tab])

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

  const doneCount = checklists.filter((c) => c.isCompleted || c.completed).length
  const checklistPct = checklists.length
    ? Math.round((doneCount / checklists.length) * 100)
    : 0

  const tabs: { id: Tab; label: string; icon: any; show?: boolean }[] = [
    { id: "details", label: "Details", icon: ClipboardList },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "checklist", label: `SOP (${doneCount}/${checklists.length || 0})`, icon: CheckSquare, show: !!task },
    { id: "proofs", label: `Proofs (${photos.length})`, icon: Camera, show: !!task },
    { id: "hours", label: "Hours", icon: Clock, show: !!task },
    { id: "gps", label: "Live GPS", icon: Radio, show: !!task },
  ]

  const gpsPoints = [
    ...liveForJob
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => ({
        id: `live-${c.userId}`,
        lat: Number(c.latitude),
        lng: Number(c.longitude),
        label: c.name || `Cleaner #${c.userId}`,
        sub: [
          c.isLive ? "Live now" : "Last seen",
          c.withinGeofence === false ? "Off-site" : c.withinGeofence ? "On-site" : null,
          c.propertyAddress,
        ]
          .filter(Boolean)
          .join(" · "),
        kind: "cleaner" as const,
        warn: c.withinGeofence === false,
      })),
    ...locationLogs
      .filter((l) => l.latitude != null && l.longitude != null)
      .slice(0, 8)
      .map((l) => ({
        id: `log-${l.id}`,
        lat: Number(l.latitude),
        lng: Number(l.longitude),
        label: l.checkType || "GPS ping",
        sub: l.createdAt || l.recordedAt || undefined,
        kind: "log" as const,
        warn: l.withinGeofence === false,
      })),
  ]

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

        <div className="flex gap-4 overflow-x-auto border-b border-control-border bg-slate-50 px-5 font-mono text-xs font-bold dark:border-navy-800 dark:bg-navy-950">
          {tabs
            .filter((t) => t.show !== false)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 py-3 transition ${
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
                <SmartAssignPanel
                  taskId={task?.id}
                  propertyId={form.propertyId ? parseInt(form.propertyId, 10) : undefined}
                  scheduledDate={
                    form.scheduledDate
                      ? new Date(form.scheduledDate).toISOString()
                      : undefined
                  }
                  selectedUserId={form.assignedUserId}
                  onSelect={(userId) => {
                    setForm((f) => ({
                      ...f,
                      assignedUserId: String(userId),
                      status: f.status === "PLANNED" || f.status === "DRAFT" ? "ASSIGNED" : f.status,
                    }))
                  }}
                />
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

            {tab === "checklist" && (
              <div className="space-y-3">
                {detailLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-amber-600" size={22} />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono dark:border-navy-800 dark:bg-navy-950">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">SOP progress</p>
                        <p className="text-sm font-bold text-navy-900 dark:text-white">
                          {doneCount} / {checklists.length} complete
                        </p>
                      </div>
                      <span className="rounded bg-amber-600 px-2.5 py-1 text-xs font-bold text-white">
                        {checklistPct}%
                      </span>
                    </div>
                    {checklists.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-400">No checklist items yet</p>
                    ) : (
                      checklists.map((c) => {
                        const done = !!(c.isCompleted || c.completed)
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center justify-between rounded-lg border p-3 ${
                              done
                                ? "border-slate-200 bg-white dark:border-navy-800"
                                : "border-amber-500/40 bg-amber-50/30"
                            }`}
                          >
                            <span
                              className={`text-sm font-medium ${
                                done ? "text-slate-400 line-through" : "text-navy-900 dark:text-white"
                              }`}
                            >
                              {c.title || c.name || `Item #${c.id}`}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {done ? "DONE" : "OPEN"}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "proofs" && (
              <div className="space-y-3">
                {detailLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-amber-600" size={22} />
                  </div>
                ) : photos.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No photo proofs yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {photos.map((p) => (
                      <div
                        key={p.id}
                        className="overflow-hidden rounded-lg border border-control-border dark:border-navy-800"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url || p.imageUrl || p.secureUrl}
                          alt=""
                          className="h-28 w-full object-cover"
                        />
                        <div className="flex justify-between bg-navy-950 px-2 py-1.5 font-mono text-[10px] text-white">
                          <span>{(p.type || p.photoType || "PHOTO").toString().toUpperCase()}</span>
                          <span className="text-amber-400">
                            {p.createdAt
                              ? new Date(p.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "hours" && (
              <div className="space-y-2">
                {detailLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-amber-600" size={22} />
                  </div>
                ) : timeLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No time logs yet</p>
                ) : (
                  timeLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-control-border p-3 dark:border-navy-800"
                    >
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-navy-900 dark:text-white">
                          {[log.user?.firstName, log.user?.lastName].filter(Boolean).join(" ") ||
                            `Session #${log.id}`}
                        </span>
                        <span className="font-mono text-amber-700">
                          {log.durationMinutes != null
                            ? `${log.durationMinutes} min`
                            : log.hours != null
                              ? `${log.hours}h`
                              : "—"}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">
                        {log.startedAt || log.startTime
                          ? new Date(log.startedAt || log.startTime).toLocaleString()
                          : ""}
                        {log.endedAt || log.endTime
                          ? ` → ${new Date(log.endedAt || log.endTime).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "gps" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-navy-800 bg-navy-950 px-3 py-2.5 text-white">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase text-amber-400">
                      Live cleaner location
                    </p>
                    <p className="text-xs text-slate-400">
                      {liveForJob.filter((c) => c.isLive).length} live · refreshes every 30s
                    </p>
                  </div>
                  {gpsLoading && <Loader2 size={16} className="animate-spin text-amber-400" />}
                </div>

                {gpsLoading && gpsPoints.length === 0 ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-amber-600" size={22} />
                  </div>
                ) : (
                  <LiveMapPanel
                    points={gpsPoints}
                    emptyMessage="No live GPS for this job yet — cleaner must have tracking on"
                  />
                )}

                <div>
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Location history
                  </p>
                  {locationLogs.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">No location logs yet</p>
                  ) : (
                    <ul className="space-y-2">
                      {locationLogs.slice(0, 20).map((l) => (
                        <li
                          key={l.id}
                          className="flex items-center justify-between rounded-lg border border-control-border px-3 py-2 dark:border-navy-800"
                        >
                          <div>
                            <p className="text-xs font-bold text-navy-900 dark:text-white">
                              {(l.checkType || "ping").toString().toUpperCase()}
                              {l.withinGeofence === false ? (
                                <span className="ml-1.5 text-red-600">Off-site</span>
                              ) : l.withinGeofence ? (
                                <span className="ml-1.5 text-emerald-600">On-site</span>
                              ) : null}
                            </p>
                            <p className="font-mono text-[10px] text-slate-400">
                              {l.createdAt || l.recordedAt
                                ? new Date(l.createdAt || l.recordedAt || "").toLocaleString()
                                : "—"}
                              {l.distanceFromProperty != null
                                ? ` · ${Math.round(Number(l.distanceFromProperty))}m from property`
                                : ""}
                            </p>
                          </div>
                          {l.latitude != null && l.longitude != null && (
                            <a
                              href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-bold uppercase text-amber-700"
                            >
                              Map
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
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
            {(tab === "details" || tab === "schedule") && (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-1.5 font-mono text-xs font-bold text-white shadow-amber-glow hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {task ? "Save changes" : "Create job"}
              </button>
            )}
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
