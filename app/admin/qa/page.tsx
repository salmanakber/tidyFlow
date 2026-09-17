"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, formatDate } from "@/lib/admin-session"
import { Star } from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsKpi,
  OpsCard,
  OpsTableShell,
  OpsPagination,
  OpsSkeleton,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

const PAGE_SIZE = 10

export default function QAPage() {
  return (
    <AdminLayout>
      <ProtectedPage>
        <Content />
      </ProtectedPage>
    </AdminLayout>
  )
}

function Content() {
  const [scores, setScores] = useState<any[]>([])
  const [performance, setPerformance] = useState<{ stats: any[]; summary?: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [qaRes, perfRes] = await Promise.all([
        adminGet("/api/qa"),
        adminGet("/api/qa/performance"),
      ])
      if (qaRes.data.success) {
        const raw = qaRes.data.data
        setScores(Array.isArray(raw) ? raw : [])
      }
      if (perfRes.data.success) setPerformance(perfRes.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load QA data")
      setScores([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const safeScores = Array.isArray(scores) ? scores : []
  const stats = Array.isArray(performance?.stats) ? performance!.stats : []
  const summary = performance?.summary || {}
  const chartData = stats.slice(0, 8).map((s: any) => ({
    name: (s.cleaner?.name || s.cleanerName || s.name || `ID ${s.cleaner?.id || s.cleanerId}`)
      .split(" ")[0],
    score: Number(s.combinedScore ?? s.averageOverall ?? 0),
  }))

  const pageSlice = safeScores.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="QA Performance"
        subtitle="Cleaner QA scores, on-time rates, and recent reviews"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsKpi label="QA reviews" value={safeScores.length} />
        <OpsKpi
          label="Avg QA score"
          value={
            summary.averageOverallScore != null
              ? Number(summary.averageOverallScore).toFixed(1)
              : "—"
          }
        />
        <OpsKpi
          label="Avg completion %"
          value={
            summary.averageCompletionRate != null
              ? `${Number(summary.averageCompletionRate).toFixed(0)}%`
              : "—"
          }
        />
        <OpsKpi label="Cleaners scored" value={summary.cleanersWithScores ?? stats.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <OpsCard className="xl:col-span-2">
          <h2 className="mb-4 text-sm font-bold text-navy-900 dark:text-white">
            Cleaner combined scores
          </h2>
          {loading ? (
            <OpsSkeleton rows={5} cols={4} />
          ) : chartData.length === 0 ? (
            <OpsEmpty message="No performance data yet" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="score" fill="#D97706" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </OpsCard>

        <OpsCard>
          <h2 className="mb-4 text-sm font-bold text-navy-900 dark:text-white">Top performers</h2>
          <div className="space-y-3">
            {stats.slice(0, 5).map((s: any, idx: number) => (
              <div
                key={s.cleaner?.id || s.cleanerId || idx}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      idx === 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="truncate text-sm font-semibold">
                    {s.cleaner?.name || s.cleanerName || s.name || `Cleaner ${s.cleanerId}`}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-amber-700">
                  {Number(s.combinedScore ?? s.averageOverall ?? 0).toFixed(0)}
                </span>
              </div>
            ))}
            {!loading && stats.length === 0 && (
              <p className="text-sm text-slate-500">No cleaner stats yet</p>
            )}
          </div>
        </OpsCard>
      </div>

      <OpsTableShell
        title="Recent QA scores"
        stickyHeader
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {safeScores.length}
          </span>
        }
      >
        {loading ? (
          <OpsSkeleton rows={6} cols={6} />
        ) : safeScores.length === 0 ? (
          <OpsEmpty message="No QA scores recorded" />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Job</th>
                  <th className={opsTh}>Overall</th>
                  <th className={opsTh}>Cleanliness</th>
                  <th className={opsTh}>Timeliness</th>
                  <th className={opsTh}>Reviewer</th>
                  <th className={opsTh}>Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className={`${opsTd} font-semibold`}>
                      {s.task?.title || `Task #${s.taskId}`}
                    </td>
                    <td className={opsTd}>
                      <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                        <Star size={12} /> {s.overallScore}
                      </span>
                    </td>
                    <td className={`${opsTd} font-mono`}>{s.cleanlinessScore ?? "—"}</td>
                    <td className={`${opsTd} font-mono`}>{s.timelinessScore ?? "—"}</td>
                    <td className={`${opsTd} text-slate-500`}>
                      {[s.reviewer?.firstName, s.reviewer?.lastName].filter(Boolean).join(" ") ||
                        "—"}
                    </td>
                    <td className={opsTd}>{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <OpsPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={safeScores.length}
              onPageChange={setPage}
            />
          </>
        )}
      </OpsTableShell>
    </div>
  )
}
