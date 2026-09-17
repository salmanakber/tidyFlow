"use client"

import { useState, useEffect, useMemo } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsFlash,
  OpsEmpty,
  OpsKpi,
  OpsRefreshButton,
  OpsPagination,
  OpsSkeleton,
} from "@/components/ops/OpsChrome"
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  AlertTriangle,
  GripVertical,
  Users,
  X,
  Sparkles,
  Loader2,
} from "lucide-react"
import { getCleanerRecommendations } from "@/lib/ops-ai"

const PAGE_SIZE = 10

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
  const [page, setPage] = useState(1)
  const [smartBusy, setSmartBusy] = useState(false)

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
        const tasks = Array.isArray(rotaRes.data.data?.tasks) ? rotaRes.data.data.tasks : []
        const cleaners = Array.isArray(rotaRes.data.data?.cleaners)
          ? rotaRes.data.data.cleaners
          : []
        const conflicts = Array.isArray(conflictsRes.data?.data?.conflicts)
          ? conflictsRes.data.data.conflicts
          : []
        setRotaData({ tasks, cleaners, conflicts })
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

  useEffect(() => {
    setPage(1)
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

  /** Uses existing /api/ai/recommend-cleaners — does not change mobile contracts */
  const smartFillUnassigned = async () => {
    const unassigned = (Array.isArray(rotaData?.tasks) ? rotaData!.tasks : []).filter(
      (t) => !t.assignedUser
    )
    if (unassigned.length === 0) {
      setToast("No unassigned jobs this week")
      return
    }
    if (
      !confirm(
        `AI will suggest and assign cleaners for ${unassigned.length} unassigned job${
          unassigned.length === 1 ? "" : "s"
        }. Continue?`
      )
    ) {
      return
    }
    try {
      setSmartBusy(true)
      setError("")
      let filled = 0
      for (const task of unassigned) {
        const rec = await getCleanerRecommendations({
          taskId: task.id,
          propertyId: task.property?.id,
          scheduledDate: task.scheduledDate,
        })
        const pick = rec?.recommended?.userId
        if (!pick) continue
        try {
          await axios.post(
            "/api/admin/rota/assign",
            { taskId: task.id, cleanerId: pick },
            { headers: authHeaders(), params: companyParams() }
          )
          filled += 1
        } catch {
          /* skip failed assign */
        }
      }
      setToast(`Smart scheduling filled ${filled} of ${unassigned.length} jobs`)
      await loadRota()
    } catch (e: any) {
      setError(e.response?.data?.message || "Smart scheduling failed")
    } finally {
      setSmartBusy(false)
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
    const tasks = Array.isArray(rotaData.tasks) ? rotaData.tasks : []
    const key = dateKey(date)
    return tasks.filter((t) => {
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

  const safeCleaners = Array.isArray(rotaData?.cleaners) ? rotaData!.cleaners : []
  const safeTasks = Array.isArray(rotaData?.tasks) ? rotaData!.tasks : []
  const safeConflicts = Array.isArray(rotaData?.conflicts) ? rotaData!.conflicts : []

  const stats = useMemo(() => {
    const assigned = safeTasks.filter((t) => t.assignedUser).length
    return {
      jobs: safeTasks.length,
      assigned,
      unassigned: safeTasks.length - assigned,
      cleaners: safeCleaners.length,
    }
  }, [safeTasks, safeCleaners])

  const cleanerSlice = safeCleaners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const todayKey = new Date().toISOString().split("T")[0]

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Fleet rota matrix"
          title="Schedule & assignments"
          subtitle={`Drag jobs onto cleaners · week of ${weekDates[0]?.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })} – ${weekDates[6]?.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => shiftWeek(-1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-control-border bg-white text-slate-600 hover:bg-slate-50 dark:border-control-darkBorder dark:bg-control-darkCard"
              >
                <ChevronLeft size={18} />
              </button>
              <input
                type="date"
                value={selectedWeek}
                onChange={(e) =>
                  setSelectedWeek(
                    mondayOf(new Date(e.target.value + "T12:00:00")).toISOString().split("T")[0]
                  )
                }
                className="h-9 rounded-lg border border-control-border bg-white px-3 text-sm font-medium dark:border-control-darkBorder dark:bg-control-darkCard"
              />
              <button
                onClick={() => shiftWeek(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-control-border bg-white text-slate-600 hover:bg-slate-50 dark:border-control-darkBorder dark:bg-control-darkCard"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setSelectedWeek(mondayOf(new Date()).toISOString().split("T")[0])}
                className="h-9 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 dark:bg-control-darkCard"
              >
                This week
              </button>
              <OpsRefreshButton onClick={loadRota} loading={loading} />
              <button
                type="button"
                onClick={smartFillUnassigned}
                disabled={smartBusy || stats.unassigned === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {smartBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Smart fill
              </button>
              <button
                onClick={handleCloneWeek}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-xs font-bold text-white hover:bg-navy-800"
              >
                <Copy size={14} /> Clone week
              </button>
              {safeConflicts.length > 0 && (
                <button
                  onClick={() => setShowConflicts(!showConflicts)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-bold text-white"
                >
                  <AlertTriangle size={14} /> {safeConflicts.length} conflicts
                </button>
              )}
            </div>
          }
        />

        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <OpsKpi label="Jobs this week" value={stats.jobs} />
          <OpsKpi label="Assigned" value={stats.assigned} />
          <OpsKpi
            label="Unassigned"
            value={stats.unassigned}
            hint={stats.unassigned ? "Needs assignment" : undefined}
          />
          <OpsKpi label="Cleaners" value={stats.cleaners} />
        </div>

        {showConflicts && safeConflicts.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-red-900 dark:text-red-200">
                Scheduling conflicts
              </h3>
              <button
                onClick={() => setShowConflicts(false)}
                className="text-red-400 hover:text-red-600"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="space-y-1 text-sm text-red-800 dark:text-red-300">
              {safeConflicts.map((c, i) => (
                <li key={i} className="font-medium">
                  · {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-control-border bg-white shadow-sm dark:border-control-darkBorder dark:bg-control-darkCard">
          {loading ? (
            <OpsSkeleton rows={8} cols={8} />
          ) : !rotaData ? (
            <OpsEmpty message="No rota data for this week" />
          ) : (
            <>
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
                              {date.toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                              })}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {cleanerSlice.map((cleaner, rowIdx) => (
                      <tr
                        key={cleaner.id}
                        className={`border-b border-slate-100 dark:border-navy-900 ${
                          rowIdx % 2 === 0
                            ? "bg-white dark:bg-control-darkCard"
                            : "bg-slate-50/80 dark:bg-navy-950/40"
                        }`}
                      >
                        <td className="sticky left-0 z-10 border-r border-slate-100 bg-inherit px-4 py-3 dark:border-navy-900">
                          <div className="text-sm font-bold text-navy-900 dark:text-white">
                            {cleanerName(cleaner)}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                            {`${safeTasks.filter((t) => t.assignedUser?.id === cleaner.id).length} jobs`}
                            {cleaner.workload != null ? ` · load ${cleaner.workload}` : ""}
                          </div>
                        </td>
                        {weekDates.map((date, dayIdx) => {
                          const cellKey = `${cleaner.id}-${dateKey(date)}`
                          const dayTasks = tasksFor(cleaner.id, date)
                          const isToday = dateKey(date) === todayKey
                          const isDropTarget = dropTarget === cellKey
                          const showDropConflict =
                            isDropTarget &&
                            !!draggedTask &&
                            safeConflicts.some(
                              (c) =>
                                c.cleanerId === cleaner.id &&
                                (c.taskId === draggedTask.id ||
                                  dayTasks.some((t) => t.id === c.taskId))
                            )
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
                                isDropTarget
                                  ? "bg-amber-100/80 ring-2 ring-inset ring-amber-500 dark:bg-amber-900/30"
                                  : ""
                              }`}
                            >
                              <div className="min-h-[72px] space-y-1.5">
                                {showDropConflict && (
                                  <div className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                                    Conflict risk
                                  </div>
                                )}
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

                    <tr className="border-t-2 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                      <td className="sticky left-0 z-10 border-r border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
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
              <OpsPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={safeCleaners.length}
                onPageChange={setPage}
              />
            </>
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
