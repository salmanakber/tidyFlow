"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, formatDate } from "@/lib/admin-session"
import { RefreshCw, ShieldCheck, Star } from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
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

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [qaRes, perfRes] = await Promise.all([
        adminGet("/api/qa"),
        adminGet("/api/qa/performance"),
      ])
      if (qaRes.data.success) setScores(qaRes.data.data || [])
      if (perfRes.data.success) setPerformance(perfRes.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load QA data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = performance?.stats || []
  const summary = performance?.summary || {}
  const chartData = stats.slice(0, 8).map((s: any) => ({
    name: (s.cleaner?.name || s.cleanerName || s.name || `ID ${s.cleaner?.id || s.cleanerId}`)
      .split(" ")[0],
    score: Number(s.combinedScore ?? s.averageOverall ?? 0),
  }))

  return (
    <div className="space-y-6">
      <OpsPageHeader
        eyebrow="Finance"
        title="QA Performance"
        subtitle="Cleaner QA scores, on-time rates, and recent reviews"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="QA reviews" value={scores.length} />
        <Stat
          label="Avg QA score"
          value={
            summary.averageOverallScore != null
              ? Number(summary.averageOverallScore).toFixed(1)
              : "—"
          }
        />
        <Stat
          label="Avg completion %"
          value={
            summary.averageCompletionRate != null
              ? `${Number(summary.averageCompletionRate).toFixed(0)}%`
              : "—"
          }
        />
        <Stat label="Cleaners scored" value={summary.cleanersWithScores ?? stats.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-5">
          <h2 className="font-bold text-navy-900 dark:text-white mb-4">Cleaner combined scores</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              No performance data yet
            </div>
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
        </div>

        <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-5">
          <h2 className="font-bold text-navy-900 dark:text-white mb-4">Top performers</h2>
          <div className="space-y-3">
            {stats.slice(0, 5).map((s: any, idx: number) => (
              <div key={s.cleaner?.id || s.cleanerId || idx} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      idx === 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-sm font-semibold truncate">
                    {s.cleaner?.name || s.cleanerName || s.name || `Cleaner ${s.cleanerId}`}
                  </span>
                </div>
                <span className="font-mono font-bold text-sm text-amber-700">
                  {Number(s.combinedScore ?? s.averageOverall ?? 0).toFixed(0)}
                </span>
              </div>
            ))}
            {!loading && stats.length === 0 && (
              <p className="text-sm text-slate-500">No cleaner stats yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border overflow-hidden">
        <div className="p-4 border-b border-control-border font-bold text-navy-900 dark:text-white">
          Recent QA scores
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : scores.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No QA scores recorded</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Overall</th>
                <th className="px-4 py-3">Cleanliness</th>
                <th className="px-4 py-3">Timeliness</th>
                <th className="px-4 py-3">Reviewer</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {scores.slice(0, 40).map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-semibold">
                    {s.task?.title || `Task #${s.taskId}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                      <Star size={12} /> {s.overallScore}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{s.cleanlinessScore ?? "—"}</td>
                  <td className="px-4 py-3 font-mono">{s.timelinessScore ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {[s.reviewer?.firstName, s.reviewer?.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3">{formatDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-4">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1">{value}</p>
    </div>
  )
}
