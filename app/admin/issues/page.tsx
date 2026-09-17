"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsKpi,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsTableShell,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { formatDate } from "@/lib/admin-session"
import { AlertTriangle, MapPin, Search } from "lucide-react"

interface Issue {
  id: number
  content?: string
  message?: string
  description?: string
  severity?: string
  status?: string
  task?: {
    id: number
    title?: string
    property?: { address?: string } | null
  } | null
  user?: {
    firstName?: string
    lastName?: string
    email?: string
  } | null
  createdAt?: string
}

function issueText(i: Issue) {
  return i.content || i.message || i.description || "—"
}

function propertyAddress(i: Issue) {
  return i.task?.property?.address || "—"
}

function taskTitle(i: Issue) {
  return i.task?.title || (i.task?.id ? `Task #${i.task.id}` : "—")
}

function reporter(i: Issue) {
  if (!i.user) return "—"
  const n = [i.user.firstName, i.user.lastName].filter(Boolean).join(" ")
  return n || i.user.email || "—"
}

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [tab, setTab] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      const companyId = localStorage.getItem("selectedCompanyId")
      const headers = { Authorization: `Bearer ${token}` }
      const params: any = companyId ? { companyId } : {}
      if (tab !== "all" && tab !== "exceptions") params.status = tab.toUpperCase()

      const [issuesRes, statsRes] = await Promise.all([
        axios.get("/api/issues", { headers, params }),
        axios.get("/api/issues/stats", { headers, params: companyId ? { companyId } : {} }).catch(() => null),
      ])

      if (issuesRes.data?.success) {
        const raw = issuesRes.data.data
        const list = Array.isArray(raw) ? raw : raw?.issues || []
        setIssues(Array.isArray(list) ? list : [])
      } else {
        setIssues([])
        setError(issuesRes.data?.message || "Failed to load issues")
      }
      if (statsRes?.data?.success) setStats(statsRes.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load issues")
      setIssues([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [tab])

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return issues.filter((issue) => {
      const matchesSearch =
        !q ||
        issueText(issue).toLowerCase().includes(q) ||
        propertyAddress(issue).toLowerCase().includes(q) ||
        taskTitle(issue).toLowerCase().includes(q)
      const matchesSeverity =
        severityFilter === "all" ||
        String(issue.severity || "").toUpperCase() === severityFilter.toUpperCase()
      const matchesTab =
        tab === "all" ||
        tab === "exceptions" ||
        String(issue.status || "").toUpperCase() === tab.toUpperCase() ||
        (tab === "exceptions" &&
          ["HIGH", "CRITICAL"].includes(String(issue.severity || "").toUpperCase()))
      return matchesSearch && matchesSeverity && matchesTab
    })
  }, [issues, searchTerm, severityFilter, tab])

  const openCount = stats?.openIssues ?? issues.filter((i) => String(i.status).toUpperCase() === "OPEN").length

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Manage"
          title="Issues"
          subtitle="Monitor and resolve operational incidents"
          actions={<OpsRefreshButton onClick={load} loading={loading} />}
        />

        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {openCount > 0 && (
          <section className="flex flex-col gap-3 rounded-xl border border-navy-800 bg-navy-900 p-4 text-white shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
                <AlertTriangle size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="font-bold text-amber-400">ATTENTION</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-200">
                    {openCount} open issue{openCount === 1 ? "" : "s"} need review
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Resolve blockers before they delay today&apos;s jobs.
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OpsKpi label="Total" value={stats?.totalIssues ?? issues.length} />
          <OpsKpi label="Open" value={openCount} />
          <OpsKpi label="In progress" value={stats?.inProgressIssues ?? 0} />
          <OpsKpi
            label="Resolved"
            value={
              stats
                ? Math.max(
                    0,
                    (stats.totalIssues || 0) -
                      (stats.openIssues || 0) -
                      (stats.inProgressIssues || 0)
                  )
                : 0
            }
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search issue, property, or job…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-amber-600 focus:outline-none dark:border-navy-800 dark:bg-navy-950"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-navy-800 dark:bg-navy-950"
          >
            <option value="all">All severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <OpsTableShell
          title="Issue queue"
          badge={
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {filtered.length}
            </span>
          }
          tabs={[
            { id: "all", label: "All" },
            { id: "open", label: "Open" },
            { id: "in_progress", label: "In progress" },
            { id: "resolved", label: "Resolved" },
            { id: "exceptions", label: "Exceptions" },
          ]}
          activeTab={tab}
          onTabChange={setTab}
          footer={<span>OPS INCIDENT LEDGER · LIVE</span>}
        >
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <OpsEmpty message="No issues found" />
          ) : (
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Issue ID</th>
                  <th className={opsTh}>Details</th>
                  <th className={opsTh}>Job / property</th>
                  <th className={opsTh}>Reporter</th>
                  <th className={opsTh}>Severity</th>
                  <th className={opsTh}>Status</th>
                  <th className={opsTh}>Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {filtered.map((issue) => (
                  <tr key={issue.id} className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10">
                    <td className={`${opsTd} font-mono text-xs font-bold text-amber-700`}>
                      #ISS-{issue.id}
                    </td>
                    <td className={opsTd}>
                      <p className="max-w-xs font-semibold text-navy-900 line-clamp-2 dark:text-white">
                        {issueText(issue)}
                      </p>
                    </td>
                    <td className={opsTd}>
                      <p className="text-xs font-bold text-navy-900 dark:text-white">{taskTitle(issue)}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin size={10} /> {propertyAddress(issue)}
                      </p>
                    </td>
                    <td className={`${opsTd} text-xs text-slate-600`}>{reporter(issue)}</td>
                    <td className={opsTd}>
                      <OpsBadge status={issue.severity || "medium"} />
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={issue.status || "open"} />
                    </td>
                    <td className={`${opsTd} text-xs text-slate-500`}>
                      {formatDate(issue.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OpsTableShell>
      </div>
    </AdminLayout>
  )
}
