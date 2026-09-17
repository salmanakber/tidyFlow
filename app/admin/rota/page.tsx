"use client"

import { useState, useEffect, useMemo } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  AlertTriangle,
  GripVertical,
  CalendarDays,
  Users,
  RefreshCw,
  X,
} from "lucide-react"

interface Task {
  id: number
  title: string
  scheduledDate: string
  status: string
  property: { id: number; address: string }
  assignedUser?: {
    id: number
    firstName?: string
    lastName?: string
    email: string
  }
}

interface Cleaner {
  id: number
  email: string
  firstName?: string
  lastName?: string
  workload: number
  availability: Array<{
    dayOfWeek: number
    startTime: string
    endTime: string
    isAvailable: boolean
  }>
}

interface RotaData {
  tasks: Task[]
  cleaners: Cleaner[]
  conflicts: Array<{ taskId: number; cleanerId: number; reason: string }>
}

const STATUS_STYLE: Record<string, string> = {
  PLANNED: "bg-blue-50 border-blue-200 text-blue-900",
  ASSIGNED: "bg-violet-50 border-violet-200 text-violet-900",
  IN_PROGRESS: "bg-amber-50 border-amber-300 text-amber-950",
  SUBMITTED: "bg-cyan-50 border-cyan-200 text-cyan-900",
  APPROVED: "bg-emerald-50 border-emerald-200 text-emerald-900",
  COMPLETED: "bg-emerald-50 border-emerald-200 text-emerald-900",
  QA_REVIEW: "bg-pink-50 border-pink-200 text-pink-900",
}

function cleanerName(c: Cleaner) {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ")
  return n || c.email
}

function mondayOf(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function RotaBuilderPage() {
  const [rotaData, setRotaData] = useState<RotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(() =>
    mondayOf(new Date()).toISOString().split("T")[0]
  )
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [showConflicts, setShowConflicts] = useState(false)
  const [toast, setToast] = useState("")
  const [error, setError] = useState("")

  const weekDates = useMemo(() => {
    const start = new Date(selectedWeek + "T12:00:00")
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [selectedWeek])

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const authHeaders = () => {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
    return { Authorization: `Bearer ${token}` }
  }

  const companyParams = () => {
    const selectedCompanyId = localStorage.getItem("selectedCompanyId")
    return selectedCompanyId ? { companyId: selectedCompanyId } : {}
  }

  const weekRange = () => {
    const start = selectedWeek
    const endDate = new Date(selectedWeek + "T12:00:00")
    endDate.setDate(endDate.getDate() + 6)
    return { weekStart: start, weekEnd: endDate.toISOString().split("T")[0] }
  }

  const loadRota = async () => {
    try {
      setLoading(true)
      setError("")
      const params = { ...weekRange(), ...companyParams() }
      const [rotaRes, conflictsRes] = await Promise.all([
        axios.get("/api/admin/rota", { headers: authHeaders(), params }),
        axios.get("/api/admin/rota/conflicts", { headers: authHeaders(), params }),
      ])
      if (rotaRes.data.success) {
        setRotaData({
          tasks: rotaRes.data.data.tasks || [],
          cleaners: rotaRes.data.data.cleaners || [],
          conflicts: conflictsRes.data?.data?.conflicts || [],
        })
      } else {
        setError(rotaRes.data.message || "Failed to load rota")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load rota")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRota()
  }, [selectedWeek])

  const handleAssign = async (taskId: number, cleanerId: number | null) => {
    try {
      await axios.post(
        "/api/admin/rota/assign",
        { taskId, cleanerId },
        { headers: authHeaders(), params: companyParams() }
      )
      setToast(cleanerId ? "Assignment updated" : "Task unassigned")
      await loadRota()
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to assign")
    }
  }

  const handleCloneWeek = async () => {
    if (!confirm("Clone this week’s assignments to the next week?")) return
    try {
      const { weekStart, weekEnd } = weekRange()
      const payload: any = { weekStart, weekEnd, ...companyParams() }
      if (payload.companyId) payload.companyId = parseInt(payload.companyId, 10)
      await axios.post("/api/admin/rota/week-clone", payload, { headers: authHeaders() })
      setToast("Week cloned")
      const next = new Date(selectedWeek + "T12:00:00")
      next.setDate(next.getDate() + 7)
      setSelectedWeek(next.toISOString().split("T")[0])
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to clone week")
    }
  }

  const dateKey = (d: Date) => d.toISOString().split("T")[0]

  const tasksFor = (cleanerId: number | null, date: Date) => {
    if (!rotaData) return []
    const key = dateKey(date)
    return rotaData.tasks.filter((t) => {
      if (!t.scheduledDate || t.scheduledDate.split("T")[0] !== key) return false
      if (cleanerId === null) return !t.assignedUser
      return t.assignedUser?.id === cleanerId
    })
  }

  const shiftWeek = (delta: number) => {
    const d = new Date(selectedWeek + "T12:00:00")
    d.setDate(d.getDate() + delta * 7)
    setSelectedWeek(mondayOf(d).toISOString().split("T")[0])
  }

  const stats = useMemo(() => {
    if (!rotaData) return { jobs: 0, assigned: 0, unassigned: 0, cleaners: 0 }
    const assigned = rotaData.tasks.filter((t) => t.assignedUser).length
    return {
      jobs: rotaData.tasks.length,
      assigned,
      unassigned: rotaData.tasks.length - assigned,
      cleaners: rotaData.cleaners.length,
    }
  }, [rotaData])

  const todayKey = new Date().toISOString().split("T")[0]

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <CalendarDays size={12} className="text-amber-600" />
              Fleet rota matrix
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 dark:text-white">
              Schedule &amp; assignments
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Drag jobs onto cleaners · week of{" "}
              {weekDates[0]?.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              –{" "}
              {weekDates[6]?.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => shiftWeek(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-control-border bg-white text-slate-600 hover:bg-slate-50 dark:bg-control-darkCard dark:border-control-darkBorder"
            >
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) =>
                setSelectedWeek(mondayOf(new Date(e.target.value + "T12:00:00")).toISOString().split("T")[0])
              }
              className="h-9 rounded-lg border border-control-border bg-white px-3 text-sm font-medium dark:bg-control-darkCard dark:border-control-darkBorder"
            />
            <button
              onClick={() => shiftWeek(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-control-border bg-white text-slate-600 hover:bg-slate-50 dark:bg-control-darkCard dark:border-control-darkBorder"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setSelectedWeek(mondayOf(new Date()).toISOString().split("T")[0])}
              className="h-9 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 dark:bg-control-darkCard"
            >
              This week
            </button>
            <button
              onClick={loadRota}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 dark:bg-control-darkCard"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={handleCloneWeek}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-xs font-bold text-white hover:bg-navy-800"
            >
              <Copy size={14} /> Clone week
            </button>
            {rotaData && rotaData.conflicts.length > 0 && (
              <button
                onClick={() => setShowConflicts(!showConflicts)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-bold text-white"
              >
                <AlertTriangle size={14} /> {rotaData.conflicts.length} conflicts
              </button>
            )}
          </div>
        </div>

        {toast && (
          <Flash ok text={toast} onClose={() => setToast("")} />
        )}
        {error && <Flash ok={false} text={error} onClose={() => setError("")} />}

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Jobs this week" value={stats.jobs} />
          <Kpi label="Assigned" value={stats.assigned} accent="emerald" />
          <Kpi label="Unassigned" value={stats.unassigned} accent={stats.unassigned ? "amber" : "slate"} />
          <Kpi label="Cleaners" value={stats.cleaners} icon />
        </div>

        {showConflicts && rotaData && rotaData.conflicts.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:bg-red-950/30 dark:border-red-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-red-900 dark:text-red-200">Scheduling conflicts</h3>
              <button onClick={() => setShowConflicts(false)} className="text-red-400 hover:text-red-600">
                <X size={16} />
              </button>
            </div>
            <ul className="space-y-1 text-sm text-red-800 dark:text-red-300">
              {rotaData.conflicts.map((c, i) => (
                <li key={i} className="font-medium">
                  · {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Matrix */}
        <div className="overflow-hidden rounded-xl border border-control-border bg-white shadow-sm dark:bg-control-darkCard dark:border-control-darkBorder">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-amber-600" />
            </div>
          ) : !rotaData ? (
            <div className="py-20 text-center text-sm text-slate-500">No rota data for this week</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-control-border bg-navy-950 text-slate-300 dark:border-navy-800">
                    <th className="sticky left-0 z-10 w-48 bg-navy-950 px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={12} className="text-amber-500" /> Cleaner
                      </span>
                    </th>
                    {weekDates.map((date, idx) => {
                      const isToday = dateKey(date) === todayKey
                      return (
                        <th
                          key={idx}
                          className={`min-w-[140px] border-l border-navy-800 px-3 py-3 text-center ${
                            isToday ? "bg-amber-600/20" : ""
                          }`}
                        >
                          <div
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isToday ? "text-amber-400" : "text-slate-400"
                            }`}
                          >
                            {dayNames[idx]}
                          </div>
                          <div
                            className={`mt-0.5 font-mono text-sm font-bold ${
                              isToday ? "text-amber-300" : "text-white"
                            }`}
                          >
                            {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rotaData.cleaners.map((cleaner, rowIdx) => (
                    <tr
                      key={cleaner.id}
                      className={`border-b border-slate-100 dark:border-navy-900 ${
                        rowIdx % 2 === 0 ? "bg-white dark:bg-control-darkCard" : "bg-slate-50/80 dark:bg-navy-950/40"
                      }`}
                    >
                      <td className="sticky left-0 z-10 border-r border-slate-100 bg-inherit px-4 py-3 dark:border-navy-900">
                        <div className="text-sm font-bold text-navy-900 dark:text-white">
                          {cleanerName(cleaner)}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {tasksFor(cleaner.id, weekDates[0]).length >= 0
                            ? `${rotaData.tasks.filter((t) => t.assignedUser?.id === cleaner.id).length} jobs`
                            : ""}
                          {cleaner.workload != null ? ` · load ${cleaner.workload}` : ""}
                        </div>
                      </td>
                      {weekDates.map((date, dayIdx) => {
                        const cellKey = `${cleaner.id}-${dateKey(date)}`
                        const dayTasks = tasksFor(cleaner.id, date)
                        const isToday = dateKey(date) === todayKey
                        return (
                          <td
                            key={dayIdx}
                            onDragOver={(e) => {
                              e.preventDefault()
                              setDropTarget(cellKey)
                            }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={(e) => {
                              e.preventDefault()
                              setDropTarget(null)
                              if (draggedTask) {
                                handleAssign(draggedTask.id, cleaner.id)
                                setDraggedTask(null)
                              }
                            }}
                            className={`min-h-[88px] border-l border-slate-100 p-1.5 align-top dark:border-navy-900 ${
                              isToday ? "bg-amber-50/40 dark:bg-amber-950/10" : ""
                            } ${
                              dropTarget === cellKey
                                ? "bg-amber-100/80 ring-2 ring-inset ring-amber-500 dark:bg-amber-900/30"
                                : ""
                            }`}
                          >
                            <div className="min-h-[72px] space-y-1.5">
                              {dayTasks.map((task) => (
                                <JobChip
                                  key={task.id}
                                  task={task}
                                  onDragStart={() => setDraggedTask(task)}
                                  onUnassign={() => handleAssign(task.id, null)}
                                />
                              ))}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  {/* Unassigned row */}
                  <tr className="border-t-2 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                    <td className="sticky left-0 z-10 border-r border-amber-100 bg-amber-50 px-4 py-3 dark:bg-amber-950/40 dark:border-amber-900">
                      <div className="text-sm font-extrabold text-amber-900 dark:text-amber-300">
                        Unassigned
                      </div>
                      <div className="mt-0.5 text-[10px] font-medium text-amber-700/80">
                        Drag onto a cleaner
                      </div>
                    </td>
                    {weekDates.map((date, dayIdx) => (
                      <td
                        key={dayIdx}
                        className="min-h-[88px] border-l border-amber-100 p-1.5 align-top dark:border-amber-900/50"
                      >
                        <div className="min-h-[72px] space-y-1.5">
                          {tasksFor(null, date).map((task) => (
                            <JobChip
                              key={task.id}
                              task={task}
                              unassigned
                              onDragStart={() => setDraggedTask(task)}
                            />
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

function JobChip({
  task,
  unassigned,
  onDragStart,
  onUnassign,
}: {
  task: Task
  unassigned?: boolean
  onDragStart: () => void
  onUnassign?: () => void
}) {
  const style =
    (unassigned
      ? "bg-amber-100 border-amber-300 text-amber-950"
      : STATUS_STYLE[task.status]) || "bg-slate-50 border-slate-200 text-slate-800"

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`group cursor-grab rounded-lg border px-2 py-1.5 shadow-sm active:cursor-grabbing ${style}`}
    >
      <div className="flex items-start gap-1">
        <GripVertical size={12} className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-70" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold leading-tight">
            {task.property?.address || "No address"}
          </div>
          <div className="mt-0.5 truncate text-[10px] opacity-70">{task.title}</div>
          <div className="mt-1 flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-bold uppercase opacity-60">
              {task.status?.replace(/_/g, " ")}
            </span>
            {onUnassign && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onUnassign()
                }}
                className="text-[9px] font-bold uppercase text-red-600 opacity-0 hover:underline group-hover:opacity-100"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  accent = "slate",
  icon,
}: {
  label: string
  value: number
  accent?: "slate" | "emerald" | "amber"
  icon?: boolean
}) {
  const colors = {
    slate: "text-navy-900 dark:text-white",
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
  }
  return (
    <div className="rounded-xl border border-control-border bg-white p-4 shadow-sm dark:bg-control-darkCard dark:border-control-darkBorder">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${colors[accent]}`}>
        {value}
        {icon ? "" : ""}
      </p>
    </div>
  )
}

function Flash({
  ok,
  text,
  onClose,
}: {
  ok: boolean
  text: string
  onClose: () => void
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
        ok
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {text}
      <button onClick={onClose} className="text-xs font-bold opacity-70">
        Dismiss
      </button>
    </div>
  )
}
