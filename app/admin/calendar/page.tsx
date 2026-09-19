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
  OpsKpi,
  OpsPrimaryButton,
} from "@/components/ops/OpsChrome"
import { OpsLoader } from "@/components/ops/OpsLoader"
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
  Plus,
  Sparkles,
} from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"

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
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
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

function weekAround(anchor: Date) {
  const start = new Date(anchor)
  const dow = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export default function CalendarPage() {
  const { href } = useCompanyWorkspace()
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
  const [view, setView] = useState<"month" | "week">("month")

  const weeks = useMemo(() => monthMatrix(year, month), [year, month])
  const selectedDate = selected ? new Date(selected + "T12:00:00") : now
  const weekDays = useMemo(() => weekAround(selectedDate), [selected])

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
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)))
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

  const unassignedToday = (byDay[key(now)] || []).filter((t) => !t.assignedUser).length
  const inProgressMonth = tasks.filter((t) =>
    ["IN_PROGRESS", "ASSIGNED"].includes(String(t.status || "").toUpperCase())
  ).length

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

  const openCreate = () => {
    setActiveTask(null)
    setDrawerOpen(true)
  }

  const todayKey = key(new Date())

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Navigate"
          title="Calendar"
          subtitle="Plan the week, spot gaps, and open any job in one click"
          actions={
            <>
              <div className="flex rounded-lg border border-control-border bg-slate-50 p-0.5 dark:border-navy-800 dark:bg-navy-950">
                {(["month", "week"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                      view === v
                        ? "bg-navy-950 text-amber-300"
                        : "text-slate-500 hover:text-navy-900 dark:hover:text-white"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={goToday}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300"
              >
                Today
              </button>
              <OpsRefreshButton onClick={load} loading={loading} />
              <OpsPrimaryButton onClick={openCreate}>
                <Plus size={14} /> New job
              </OpsPrimaryButton>
            </>
          }
        />

        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OpsKpi label="This month" value={monthJobCount} />
          <OpsKpi label="Selected day" value={selectedTasks.length} />
          <OpsKpi label="Unassigned today" value={unassignedToday} />
          <OpsKpi label="Active / assigned" value={inProgressMonth} />
        </div>

        {/* Week strip — always visible for fast day jumping */}
        <div className="overflow-hidden rounded-2xl border border-control-border bg-white shadow-sm dark:border-amber-900/40 dark:bg-control-darkCard">
          <div className="flex items-center justify-between border-b border-control-border px-4 py-2.5 dark:border-navy-800">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Week strip
            </p>
            <p className="text-xs font-semibold text-slate-500">
              {weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {" – "}
              {weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          </div>
          <div className="grid grid-cols-7 gap-1 p-2 sm:gap-2 sm:p-3">
            {weekDays.map((d) => {
              const k = key(d)
              const count = (byDay[k] || []).length
              const isSel = selected === k
              const isToday = k === todayKey
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setSelected(k)
                    setYear(d.getFullYear())
                    setMonth(d.getMonth())
                  }}
                  className={`relative flex flex-col items-center rounded-xl px-1 py-3 transition sm:py-3.5 ${
                    isSel
                      ? "bg-navy-950 text-white shadow-lg shadow-navy-950/25"
                      : isToday
                        ? "bg-amber-50 text-navy-900 ring-1 ring-amber-400 dark:bg-amber-950/30 dark:text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-amber-50/80 dark:bg-navy-950 dark:text-slate-300 dark:hover:bg-navy-900"
                  }`}
                >
                  <span
                    className={`font-mono text-[9px] font-bold uppercase tracking-wider ${
                      isSel ? "text-amber-400" : "text-slate-400"
                    }`}
                  >
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="mt-1 text-lg font-black tabular-nums sm:text-xl">{d.getDate()}</span>
                  <span className="mt-1.5 flex h-1.5 items-center gap-0.5">
                    {count > 0 ? (
                      Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSel ? "bg-amber-400" : "bg-amber-500"
                          }`}
                        />
                      ))
                    ) : (
                      <span className={`h-1 w-1 rounded-full ${isSel ? "bg-white/20" : "bg-slate-200 dark:bg-navy-800"}`} />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {view === "month" && (
            <OpsCard className="xl:col-span-2 overflow-hidden" padding={false}>
              <div className="flex flex-col gap-3 border-b border-navy-900 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950 px-4 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-400">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      Month board
                    </p>
                    <h2 className="text-xl font-extrabold tracking-tight">{monthLabel}</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mr-1 hidden items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-mono text-[10px] font-bold text-amber-300 sm:inline-flex">
                    <Sparkles size={10} /> {monthJobCount} JOBS
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

              {loading ? (
                <OpsLoader message="Loading schedule…" />
              ) : (
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
                        className={`group relative min-h-[112px] border-b border-r border-control-border p-2 text-left transition last:border-r-0 dark:border-navy-800 ${
                          !inMonth
                            ? "bg-slate-50/90 text-slate-300 dark:bg-navy-950/50 dark:text-slate-600"
                            : "bg-white hover:bg-amber-50/50 dark:bg-control-darkCard dark:hover:bg-amber-950/15"
                        } ${
                          isSel
                            ? "z-[1] bg-amber-50/80 ring-2 ring-inset ring-amber-600 dark:bg-amber-950/30"
                            : ""
                        } ${
                          isToday && inMonth && !isSel
                            ? "bg-gradient-to-b from-amber-50/50 to-white dark:from-amber-950/15"
                            : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span
                            className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-1.5 font-mono text-xs font-bold tabular-nums ${
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
                            <span className="rounded-md bg-navy-950/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300">
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
                                className={`truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight transition hover:brightness-95 ${chipTone(
                                  t.status
                                )}`}
                                title={t.title}
                              >
                                {timeLabel(t.scheduledDate) ? (
                                  <span className="mr-1 font-mono opacity-70">
                                    {timeLabel(t.scheduledDate)}
                                  </span>
                                ) : null}
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
              )}
            </OpsCard>
          )}

          {view === "week" && (
            <OpsCard className="xl:col-span-2 overflow-hidden" padding={false}>
              <div className="border-b border-navy-900 bg-navy-950 px-4 py-3.5 text-white">
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Week agenda
                </p>
                <h2 className="text-lg font-extrabold">
                  {weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {" – "}
                  {weekDays[6].toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h2>
              </div>
              {loading ? (
                <OpsLoader message="Loading week…" />
              ) : (
                <div className="divide-y divide-control-border dark:divide-navy-800">
                  {weekDays.map((d) => {
                    const k = key(d)
                    const list = byDay[k] || []
                    return (
                      <div key={k} className="grid grid-cols-[88px_1fr] gap-3 p-3 sm:grid-cols-[110px_1fr]">
                        <button
                          type="button"
                          onClick={() => setSelected(k)}
                          className={`rounded-xl px-2 py-2 text-left ${
                            selected === k
                              ? "bg-navy-950 text-white"
                              : "bg-slate-50 hover:bg-amber-50 dark:bg-navy-950 dark:hover:bg-navy-900"
                          }`}
                        >
                          <p className={`font-mono text-[9px] font-bold uppercase ${selected === k ? "text-amber-400" : "text-slate-400"}`}>
                            {d.toLocaleDateString(undefined, { weekday: "short" })}
                          </p>
                          <p className="text-xl font-black tabular-nums">{d.getDate()}</p>
                        </button>
                        <div className="min-w-0 space-y-1.5">
                          {list.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400 dark:border-navy-800">
                              Clear day
                            </p>
                          ) : (
                            list.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => openJob(t)}
                                className="flex w-full items-center justify-between gap-2 rounded-xl border border-control-border bg-white px-3 py-2.5 text-left hover:border-amber-500 dark:border-navy-800 dark:bg-navy-950"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-navy-900 dark:text-white">
                                    {timeLabel(t.scheduledDate) && (
                                      <span className="mr-2 font-mono text-[10px] text-amber-700">
                                        {timeLabel(t.scheduledDate)}
                                      </span>
                                    )}
                                    {t.title}
                                  </p>
                                  <p className="truncate text-[11px] text-slate-400">
                                    {t.property?.address || "—"}
                                  </p>
                                </div>
                                <JobStatusBadge status={t.status} />
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </OpsCard>
          )}

          {/* Day inspector */}
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
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

            <div className="max-h-[560px] flex-1 space-y-2.5 overflow-y-auto bg-slate-50/70 p-3 dark:bg-navy-950/40">
              {loading ? (
                <OpsLoader message="Loading day…" size="sm" />
              ) : selectedTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-control-border bg-white p-4 dark:border-navy-800 dark:bg-control-darkCard">
                  <OpsEmpty
                    message="No jobs scheduled"
                    hint="Create a job for this day or pick another date"
                    ctaLabel="New job"
                    onCta={openCreate}
                  />
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

            <div className="border-t border-control-border p-3 dark:border-navy-800">
              <a
                href={`${href("jobs")}?create=1`}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 text-xs font-bold text-white hover:bg-amber-700"
              >
                <Plus size={14} /> Schedule for this day
              </a>
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
          setToast(activeTask ? "Job updated" : "Job created")
          load()
        }}
        onError={(msg) => setError(msg)}
      />
    </AdminLayout>
  )
}
