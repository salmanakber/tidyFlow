
"use client"

import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { saGet, StatCard, LoadingBlock, MessageBanner } from "./shared"

// Reconfigured colors utilizing a deep navy to light slate-blue spectrum
const PIE_COLORS = ["#0f172a", "#1d4ed8", "#3b82f6", "#93c5fd"]

export default function DashboardTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    saGet("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingBlock />
  if (error) return <MessageBanner message={{ type: "error", text: error }} />
  if (!data) return null

  const s = data.stats
  const leadsChart = (s.dailyActivity?.leadsByDay || []).map((r: any) => ({
    day: String(r.day).slice(5, 10),
    count: r.count,
  }))
  const emailsChart = (s.dailyActivity?.emailsByDay || []).map((r: any) => ({
    day: String(r.day).slice(5, 10),
    count: r.count,
  }))
  const scoreChart = (data.scoreDistribution || []).map((r: any) => ({
    name: r.bucket,
    value: r.count,
  }))

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Total Companies" value={s.totalCompanies} />
        <StatCard label="New Leads Today" value={s.newLeadsToday} />
        <StatCard label="Companies Analyzed" value={s.companiesAnalyzed} />
        <StatCard label="Emails Found" value={s.emailsFound} />
        <StatCard label="Emails Sent" value={s.emailsSent} />
        <StatCard label="Pending Emails" value={s.pendingEmails} />
        <StatCard label="Open Rate" value={`${s.openRate}%`} />
        <StatCard label="Reply Rate" value={`${s.replyRate}%`} />
        <StatCard label="Positive Replies" value={s.positiveReplies} />
        <StatCard label="Negative Replies" value={s.negativeReplies} />
        <StatCard label="Demo Requests" value={s.demoRequests} />
        <StatCard label="Failed Emails" value={s.failedEmails} />
        <StatCard label="Failed Crawls" value={s.failedCrawls} />
        <StatCard label="AI Usage Today" value={s.aiUsage.today} sub={`Month: ${s.aiUsage.month}`} />
        <StatCard label="API Usage Today" value={s.apiUsage.today} />
        <StatCard
          label="Monthly Activity"
          value={s.monthlyActivity.leads}
          sub={`${s.monthlyActivity.emails} emails · ${s.monthlyActivity.replies} replies`}
        />
      </div>

      {/* Bar Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 tracking-tight">Leads (14 days)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', borderColor: '#e2e8f0' }} />
                <Bar dataKey="count" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 tracking-tight">Emails Sent (14 days)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emailsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', borderColor: '#e2e8f0' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Distribution & Recent Leads Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 tracking-tight">Lead Score Distribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={scoreChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={{ fill: '#475569', fontSize: 11 }}>
                  {scoreChart.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', borderColor: '#e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 tracking-tight">Recent Leads</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider">Company</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider">Location</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider">Score</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.recentLeads || []).map((l: any) => (
                  <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 font-medium text-slate-900">{l.name}</td>
                    <td className="py-3 text-slate-600">
                      {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="py-3 text-slate-700 font-medium">{l.leadScore ?? "—"}</td>
                    <td className="py-3">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-medium border border-slate-200/40">
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}




