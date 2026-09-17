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
import { ChevronLeft, ChevronRight, MapPin, User as UserIcon } from "lucide-react"

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

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const openJob = (t: JobTask) => {
    setActiveTask(t)
    setDrawerOpen(true)
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Navigate"
          title="Calendar"
          subtitle="Month view of scheduled jobs — click a job to inspect"
          actions={
            <>
              <button
                onClick={() => shift(-1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-control-border bg-white dark:bg-control-darkCard"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-[150px] text-center text-sm font-bold text-navy-900 dark:text-white">
                {monthLabel}
              </span>
              <button
                onClick={() => shift(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-control-border bg-white dark:bg-control-darkCard"
              >
                <ChevronRight size={18} />
              </button>
              <OpsRefreshButton onClick={load} loading={loading} />
            </>
          }
        />

        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <OpsCard className="xl:col-span-2 overflow-hidden" padding={false}>
            <div className="grid grid-cols-7 border-b border-navy-900 bg-navy-950 text-center">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div
                  key={d}
                  className="px-1 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {weeks.flat().map((day, i) => {
                const k = key(day)
                const inMonth = day.getMonth() === month
                const dayTasks = byDay[k] || []
                const isSel = selected === k
                const isToday = k === key(new Date())
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(k)}
                    className={`min-h-[96px] border-b border-r border-control-border p-2 text-left transition hover:bg-amber-50/50 dark:hover:bg-amber-950/20 ${
                      !inMonth ? "bg-slate-50/80 text-slate-300 dark:bg-navy-950/40" : ""
                    } ${isSel ? "ring-2 ring-inset ring-amber-600" : ""} ${
                      isToday && inMonth ? "bg-amber-50/50 dark:bg-amber-950/15" : ""
                    }`}
                  >
                    <div
                      className={`font-mono text-xs font-bold ${
                        isToday ? "text-amber-700" : "text-navy-900 dark:text-white"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                    {inMonth && dayTasks.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {dayTasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              openJob(t)
                            }}
                            className="truncate rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950 hover:border-amber-600 hover:bg-amber-100"
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

          <OpsCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-navy-900 dark:text-white">
                {selected
                  ? new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : "Select a day"}
              </h2>
              <span className="rounded-md bg-navy-950 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                {selectedTasks.length} jobs
              </span>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
              ) : selectedTasks.length === 0 ? (
                <OpsEmpty message="No jobs scheduled" />
              ) : (
                selectedTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openJob(t)}
                    className="w-full rounded-xl border border-control-border p-3 text-left transition hover:border-amber-600 hover:shadow-sm dark:border-control-darkBorder"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy-900 dark:text-white">
                          <span className="mr-1.5 font-mono text-[10px] text-amber-700">
                            #{t.id}
                          </span>
                          {t.title}
                        </p>
                        <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                          <MapPin size={11} /> {t.property?.address || "—"}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <UserIcon size={11} />
                          {assigneeLabel(t) || "Unassigned"}
                        </p>
                      </div>
                      <JobStatusBadge status={t.status} />
                    </div>
                  </button>
                ))
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
