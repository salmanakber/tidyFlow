"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsEmpty,
  OpsFlash,
} from "@/components/ops/OpsChrome"
import JobInspectorDrawer, {
  JobStatusBadge,
  type JobTask,
  type JobProperty,
  type JobCleaner,
} from "@/components/ops/JobInspectorDrawer"
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  User as UserIcon,
  CalendarDays,
  Clock,
} from "lucide-react"

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  const dow = (first.getDay() + 6) % 7
  start.setDate(first.getDate() - dow)
  const weeks: Date[][] = []
  const cur = new Date(start)
  for (let w = 0; w < 6; w++) {
    const row: Date[] = []
    for (let d = 0; d < 7; d++) {
      row.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(row)
  }
  return weeks
}

function key(d: Date) {
  return d.toISOString().slice(0, 10)
}

function assigneeLabel(t: JobTask) {
  const u = t.assignedUser
  if (!u) return null
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || null
}

function chipTone(status: string) {
  const s = String(status || "").toUpperCase()
  if (["COMPLETED", "APPROVED", "ARCHIVED"].includes(s)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200"
  }
  if (["IN_PROGRESS", "ASSIGNED", "SUBMITTED", "QA_REVIEW"].includes(s)) {
    return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
  }
  if (["REJECTED", "DRAFT"].includes(s)) {
    return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-200"
  }
  return "border-navy-200 bg-navy-50 text-navy-900 dark:border-navy-700 dark:bg-navy-900/60 dark:text-slate-200"
}

function timeLabel(iso?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [properties, setProperties] = useState<JobProperty[]>([])
  const [cleaners, setCleaners] = useState<JobCleaner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [selected, setSelected] = useState<string | null>(key(now))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTask, setActiveTask] = useState<JobTask | null>(null)

  const weeks = useMemo(() => monthMatrix(year, month), [year, month])

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const companyId = localStorage.getItem("selectedCompanyId")
      const headers = { Authorization: `Bearer ${token}` }
      const params = companyId ? { companyId } : {}
      const from = new Date(year, month, 1)
      const to = new Date(year, month + 1, 0, 23, 59, 59)
      const [tasksRes, propsRes, usersRes] = await Promise.all([
        axios.get("/api/tasks", {
          headers,
          params: {
            ...params,
            from: from.toISOString(),
            to: to.toISOString(),
            limit: 500,
          },
        }),
        axios.get("/api/properties", { headers, params }),
        axios.get("/api/users", { headers, params }),
      ])
      const list = tasksRes.data?.data?.tasks || tasksRes.data?.data || []
      setTasks(Array.isArray(list) ? list : [])
      const props = propsRes.data?.data?.properties || propsRes.data?.data || []
      setProperties(Array.isArray(props) ? props : [])
      const usersRaw = usersRes.data?.data?.users || usersRes.data?.data || []
      const users = Array.isArray(usersRaw) ? usersRaw : []
      setCleaners(
        users.filter(
          (u: JobCleaner) =>
            String(u.role || "").toUpperCase() === "CLEANER" && u.isActive !== false
        )
      )
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load calendar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [year, month])

  const byDay = useMemo(() => {
    const map: Record<string, JobTask[]> = {}
    for (const t of tasks) {
      if (!t.scheduledDate) continue
      const k = t.scheduledDate.slice(0, 10)
      if (!map[k]) map[k] = []
      map[k].push(t)
    }
    return map
  }, [tasks])

  const selectedTasks = selected ? byDay[selected] || [] : []
  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  })
  const monthJobCount = useMemo(() => {
    return Object.entries(byDay).reduce((sum, [k, list]) => {
      const d = new Date(k + "T12:00:00")
      if (d.getMonth() === month && d.getFullYear() === year) return sum + list.length
      return sum
    }, 0)
  }, [byDay, month, year])

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const goToday = () => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
    setSelected(key(t))
  }

  const openJob = (t: JobTask) => {
    setActiveTask(t)
    setDrawerOpen(true)
  }

  const todayKey = key(new Date())

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Navigate"
          title="Calendar"
          subtitle="Dense month control panel — select a day, inspect a job"
          actions={
            <>
              <button
                type="button"
                onClick={goToday}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300"
              >
                Today
              </button>
              <OpsRefreshButton onClick={load} loading={loading} />
            </>
          }
        />

        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Month grid */}
          <OpsCard className="xl:col-span-2 overflow-hidden" padding={false}>
            {/* Month toolbar */}
            <div className="flex flex-col gap-3 border-b border-navy-900 bg-navy-950 px-4 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15 text-amber-400">
                  <CalendarDays size={16} />
                </div>
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Ops schedule
                  </p>
                  <h2 className="text-lg font-extrabold tracking-tight">{monthLabel}</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="mr-1 hidden rounded-md bg-white/10 px-2 py-1 font-mono text-[10px] font-bold text-amber-300 sm:inline">
                  {monthJobCount} JOBS
                </span>
                <button
                  type="button"
                  onClick={() => shift(-1)}
                  aria-label="Previous month"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:border-amber-500/50 hover:bg-amber-500/15 hover:text-amber-300"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => shift(1)}
                  aria-label="Next month"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:border-amber-500/50 hover:bg-amber-500/15 hover:text-amber-300"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div
                  key={d}
                  className="border-r border-control-border/60 px-1 py-2.5 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 last:border-r-0 dark:border-navy-800 dark:text-slate-400"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {weeks.flat().map((day, i) => {
                const k = key(day)
                const inMonth = day.getMonth() === month
                const dayTasks = byDay[k] || []
                const isSel = selected === k
                const isToday = k === todayKey
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(k)}
                    className={`group relative min-h-[108px] border-b border-r border-control-border p-2 text-left transition last:border-r-0 dark:border-navy-800 ${
                      !inMonth
                        ? "bg-slate-50/90 text-slate-300 dark:bg-navy-950/50 dark:text-slate-600"
                        : "bg-white hover:bg-amber-50/40 dark:bg-control-darkCard dark:hover:bg-amber-950/15"
                    } ${
                      isSel
                        ? "z-[1] bg-amber-50/70 ring-2 ring-inset ring-amber-600 dark:bg-amber-950/25"
                        : ""
                    } ${
                      isToday && inMonth && !isSel
                        ? "bg-amber-50/35 dark:bg-amber-950/10"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold tabular-nums ${
                          isToday && inMonth
                            ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
                            : isSel
                              ? "bg-navy-950 text-amber-300"
                              : inMonth
                                ? "text-navy-900 dark:text-white"
                                : "text-slate-300 dark:text-slate-600"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {inMonth && dayTasks.length > 0 && (
                        <span className="rounded bg-navy-950/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300 opacity-80 group-hover:opacity-100">
                          {dayTasks.length}
                        </span>
                      )}
                    </div>

                    {inMonth && dayTasks.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {dayTasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation()
                              openJob(t)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation()
                                openJob(t)
                              }
                            }}
                            className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight transition hover:brightness-95 ${chipTone(
                              t.status
                            )}`}
                            title={t.title}
                          >
                            {t.title}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="font-mono text-[10px] font-bold text-slate-400">
                            +{dayTasks.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </OpsCard>

          {/* Side panel */}
          <OpsCard className="flex flex-col overflow-hidden" padding={false}>
            <div className="border-b border-navy-900 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950 px-4 py-4 text-white">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Day inspector
              </p>
              <h2 className="mt-1 text-base font-extrabold tracking-tight">
                {selected
                  ? new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : "Select a day"}
              </h2>
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-1 font-mono text-[10px] font-bold text-amber-300">
                  {selectedTasks.length} JOB{selectedTasks.length === 1 ? "" : "S"}
                </span>
                {selected === todayKey && (
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] font-bold text-slate-300">
                    TODAY
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-[560px] flex-1 space-y-2.5 overflow-y-auto bg-slate-50/60 p-3 dark:bg-navy-950/30">
              {loading ? (
                <div className="py-12 text-center font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
                  Loading schedule…
                </div>
              ) : selectedTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-control-border bg-white p-6 dark:border-navy-800 dark:bg-control-darkCard">
                  <OpsEmpty message="No jobs scheduled" />
                </div>
              ) : (
                selectedTasks.map((t) => {
                  const assignee = assigneeLabel(t)
                  const time = timeLabel(t.scheduledDate)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openJob(t)}
                      className="group w-full rounded-xl border border-control-border bg-white p-3.5 text-left shadow-sm transition hover:border-amber-600 hover:shadow-md hover:shadow-amber-600/10 dark:border-control-darkBorder dark:bg-control-darkCard"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy-900 group-hover:text-amber-800 dark:text-white dark:group-hover:text-amber-300">
                            <span className="mr-1.5 font-mono text-[10px] text-amber-700">
                              #{t.id}
                            </span>
                            {t.title}
                          </p>
                          <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-slate-500">
                            <MapPin size={11} className="shrink-0 text-slate-400" />
                            {t.property?.address || "—"}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <UserIcon size={11} />
                              {assignee || (
                                <span className="font-semibold text-amber-700">Unassigned</span>
                              )}
                            </span>
                            {time && (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Clock size={11} />
                                {time}
                              </span>
                            )}
                          </div>
                        </div>
                        <JobStatusBadge status={t.status} />
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-navy-800">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${chipTone(
                            t.status
                          )}`}
                        >
                          Open inspector
                        </span>
                        <span className="font-mono text-[10px] font-bold text-amber-600 opacity-0 transition group-hover:opacity-100">
                          VIEW →
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </OpsCard>
        </div>
      </div>

      <JobInspectorDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        task={activeTask}
        properties={properties}
        cleaners={cleaners}
        onSaved={() => {
          setToast("Job updated")
          load()
        }}
        onError={(msg) => setError(msg)}
      />
    </AdminLayout>
  )
}
