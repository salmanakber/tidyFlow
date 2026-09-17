"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsKpi,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
} from "@/components/ops/OpsChrome"
import JobInspectorDrawer, {
  JobStatusBadge,
  JOB_STATUS_CONFIG,
  type JobTask,
  type JobProperty,
  type JobCleaner,
} from "@/components/ops/JobInspectorDrawer"
import {
  Plus,
  Search,
  LayoutList,
  Grid3X3,
  MapPin,
  Calendar,
  Repeat,
  Trash2,
  Loader2,
  Clock,
  User as UserIcon,
  Filter,
} from "lucide-react"

const BOARD_COLUMNS = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "APPROVED"]

function formatSmartDate(dateString?: string) {
  if (!dateString) return "Unscheduled"
  const date = new Date(dateString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (d.getTime() === today.getTime()) return `Today · ${time}`
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.getTime() === tomorrow.getTime()) return `Tomorrow · ${time}`
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`
}

function assigneeName(t: JobTask) {
  const u = t.assignedUser
  if (!u) return null
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || null
}

function TasksContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tasks, setTasks] = useState<JobTask[]>([])
  const [properties, setProperties] = useState<JobProperty[]>([])
  const [cleaners, setCleaners] = useState<JobCleaner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [viewMode, setViewMode] = useState<"list" | "board">("list")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<JobTask | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [propertyFilter, setPropertyFilter] = useState("all")

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const companyId = localStorage.getItem("selectedCompanyId")
      const headers = { Authorization: `Bearer ${token}` }
      const params = companyId ? { companyId } : {}
      const [tasksRes, propsRes, usersRes] = await Promise.all([
        axios.get("/api/tasks", { headers, params: { ...params, limit: 500 } }),
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
      setError(e.response?.data?.message || "Failed to load jobs")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const create = searchParams?.get("create")
    const id = searchParams?.get("id")
    if (create === "1") {
      setSelected(null)
      setDrawerOpen(true)
      router.replace(window.location.pathname, { scroll: false })
    } else if (id && tasks.length) {
      const found = tasks.find((t) => String(t.id) === id)
      if (found) {
        setSelected(found)
        setDrawerOpen(true)
        router.replace(window.location.pathname, { scroll: false })
      }
    }
  }, [searchParams, tasks, router])

  const stats = useMemo(
    () => ({
      total: tasks.length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      pending: tasks.filter((t) => ["PLANNED", "ASSIGNED"].includes(t.status)).length,
      issues: tasks.filter((t) => t.status === "REJECTED").length,
    }),
    [tasks]
  )

  const filtered = tasks.filter((task) => {
    const q = searchTerm.toLowerCase()
    const matchesSearch =
      !q ||
      task.title.toLowerCase().includes(q) ||
      (task.property?.address || "").toLowerCase().includes(q) ||
      String(task.id).includes(q)
    const matchesStatus = statusFilter === "all" || task.status === statusFilter
    const matchesProperty =
      propertyFilter === "all" || String(task.property?.id) === propertyFilter
    return matchesSearch && matchesStatus && matchesProperty
  })

  const openCreate = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  const openEdit = (t: JobTask) => {
    setSelected(t)
    setDrawerOpen(true)
  }

  const handleDelete = async (taskId: number) => {
    if (!confirm("Delete this job?")) return
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      await axios.delete(`/api/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      setToast("Job deleted")
    } catch {
      setError("Failed to delete job")
    }
  }

  return (
    <>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Navigate"
          title="Jobs"
          subtitle="Dispatch board · list & kanban"
          actions={
            <>
              <OpsRefreshButton onClick={load} loading={loading} />
              <OpsPrimaryButton onClick={openCreate}>
                <Plus size={14} strokeWidth={2.5} /> New job
              </OpsPrimaryButton>
            </>
          }
        />

        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OpsKpi label="Total jobs" value={stats.total} />
          <OpsKpi label="In progress" value={stats.inProgress} />
          <OpsKpi label="Pending" value={stats.pending} />
          <OpsKpi
            label="Rejected"
            value={stats.issues}
            hint={stats.issues ? "Needs attention" : undefined}
          />
        </div>

        <OpsCard padding={false}>
          <div className="flex flex-col gap-3 border-b border-control-border p-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={14}
              />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search title, address, or job ID…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-amber-600 focus:outline-none dark:border-navy-800 dark:bg-navy-950"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold dark:border-navy-800 dark:bg-navy-950"
              >
                <option value="all">All statuses</option>
                {Object.entries(JOB_STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <select
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="max-w-[180px] truncate rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold dark:border-navy-800 dark:bg-navy-950"
              >
                <option value="all">All properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                  </option>
                ))}
              </select>
              <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5 dark:bg-navy-900">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`rounded-md p-1.5 ${
                    viewMode === "list"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-navy-800"
                      : "text-slate-400"
                  }`}
                >
                  <LayoutList size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("board")}
                  className={`rounded-md p-1.5 ${
                    viewMode === "board"
                      ? "bg-white text-amber-700 shadow-sm dark:bg-navy-800"
                      : "text-slate-400"
                  }`}
                >
                  <Grid3X3 size={16} />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin text-amber-600" size={28} />
            </div>
          ) : viewMode === "list" ? (
            filtered.length === 0 ? (
              <OpsEmpty message="No jobs match your filters" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-navy-950">
                    <tr>
                      <th className="px-5 py-3">Job</th>
                      <th className="px-5 py-3">Schedule</th>
                      <th className="px-5 py-3">Assignee</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                    {filtered.map((task) => (
                      <tr
                        key={task.id}
                        className="group cursor-pointer hover:bg-amber-50/40 dark:hover:bg-amber-950/10"
                        onClick={() => openEdit(task)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-navy-900 dark:text-white">
                            <span className="mr-2 font-mono text-[10px] text-amber-700">
                              #{task.id}
                            </span>
                            {task.title}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin size={11} />
                            <span className="max-w-[280px] truncate">
                              {task.property?.address || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                            <Calendar size={12} className="text-slate-400" />
                            {formatSmartDate(task.scheduledDate)}
                          </div>
                          {task.isRecurring && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                              <Repeat size={10} /> {task.recurringPattern || "recurring"}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {assigneeName(task) ? (
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white bg-navy-100 text-[10px] font-bold text-navy-800 shadow-sm dark:bg-navy-800 dark:text-amber-400">
                                {task.assignedUser?.firstName?.[0] || "C"}
                              </div>
                              <span className="text-sm font-medium">{assigneeName(task)}</span>
                            </div>
                          ) : (
                            <span className="rounded bg-slate-50 px-2 py-1 text-[11px] italic text-slate-400">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <JobStatusBadge status={task.status} />
                        </td>
                        <td
                          className="px-5 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleDelete(task.id)}
                            className="rounded-lg p-2 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="overflow-x-auto p-4">
              <div className="flex min-w-max gap-4">
                {BOARD_COLUMNS.map((status) => {
                  const columnTasks = filtered.filter((t) => t.status === status)
                  const cfg = JOB_STATUS_CONFIG[status]
                  return (
                    <div
                      key={status}
                      className="flex w-72 flex-col rounded-xl border border-control-border bg-slate-50/80 dark:border-control-darkBorder dark:bg-navy-950/40"
                    >
                      <div className="flex items-center justify-between border-b border-control-border px-3 py-2.5 dark:border-navy-800">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                        <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 shadow-sm dark:bg-navy-900">
                          {columnTasks.length}
                        </span>
                      </div>
                      <div className="max-h-[560px] space-y-2 overflow-y-auto p-2.5">
                        {columnTasks.length === 0 ? (
                          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 dark:border-navy-800">
                            Empty
                          </div>
                        ) : (
                          columnTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => openEdit(task)}
                              className="w-full rounded-lg border border-control-border bg-white p-3 text-left shadow-sm transition hover:border-amber-500 hover:shadow-md dark:border-control-darkBorder dark:bg-control-darkCard"
                            >
                              <div className="mb-1 flex items-start justify-between gap-2">
                                <p className="text-sm font-bold leading-snug text-navy-900 dark:text-white">
                                  {task.title}
                                </p>
                                {task.isRecurring && (
                                  <Repeat size={12} className="shrink-0 text-blue-500" />
                                )}
                              </div>
                              <p className="mb-2 flex items-center gap-1 truncate text-[11px] text-slate-500">
                                <MapPin size={10} /> {task.property?.address || "—"}
                              </p>
                              <div className="flex items-center justify-between border-t border-slate-50 pt-2 dark:border-navy-900">
                                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                  <Clock size={10} />
                                  {task.scheduledDate
                                    ? new Date(task.scheduledDate).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                      })
                                    : "No date"}
                                </span>
                                {task.assignedUser ? (
                                  <span className="flex items-center gap-1 rounded-full bg-navy-50 py-0.5 pl-0.5 pr-2 text-[10px] font-bold text-navy-800 dark:bg-navy-900 dark:text-amber-400">
                                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-navy-200 text-[8px] dark:bg-navy-700">
                                      {task.assignedUser.firstName?.[0] || "C"}
                                    </span>
                                    {task.assignedUser.firstName}
                                  </span>
                                ) : (
                                  <UserIcon size={12} className="text-slate-300" />
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </OpsCard>
      </div>

      <JobInspectorDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        task={selected}
        properties={properties}
        cleaners={cleaners}
        onSaved={() => {
          setToast(selected ? "Job updated" : "Job created")
          load()
        }}
        onError={(msg) => setError(msg)}
      />
    </>
  )
}

export default function TasksPage() {
  return (
    <AdminLayout>
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-amber-600" size={28} />
          </div>
        }
      >
        <TasksContent />
      </Suspense>
    </AdminLayout>
  )
}
