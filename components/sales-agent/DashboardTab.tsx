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
import { saGet, saDelete, StatCard, LoadingBlock, MessageBanner } from "./shared"
import { Trash2 } from "lucide-react"

// Cold-to-hot lead spectrum: navy (cold) through to amber (hot) — the same
// meaning amber carries in the tab rail ("live / ready to act").
const PIE_COLORS = ["#0B1B3B", "#4A5A7A", "#E3B04B", "#D98E04"]

function scoreTier(score: number | null | undefined) {
  if (score == null) return { label: "—", cls: "bg-[#EEF0F5] text-[#5B6478] border-[#E3E7F0]" }
  if (score >= 80) return { label: score, cls: "bg-[#FCEACB] text-[#8A5A00] border-[#F3D89B]" }
  if (score >= 50) return { label: score, cls: "bg-[#E9ECF3] text-[#16294F] border-[#D8DCE6]" }
  return { label: score, cls: "bg-[#EEF0F5] text-[#8890A0] border-[#E3E7F0]" }
}

export default function DashboardTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    saGet("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const deleteLead = async (l: any) => {
    if (!window.confirm(`Delete lead "${l.name}"?`)) return
    setDeletingId(l.id)
    try {
      await saDelete(`/leads/${l.id}`)
      setData((prev: any) =>
        prev
          ? {
              ...prev,
              recentLeads: (prev.recentLeads || []).filter((x: any) => x.id !== l.id),
            }
          : prev
      )
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeletingId(null)
    }
  }

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

      {/* Bar Charts Section — navy = discovery, amber = sent, so the color itself tells you which side of the pipeline you're looking at */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-[#E3E7F0] p-5 shadow-[0_1px_2px_rgba(11,27,59,0.04)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-[#0B1B3B]" />
            <h3 className="text-sm font-semibold text-[#0B1B3B] tracking-tight">Leads (14 days)</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F5" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8890A0" }} tickLine={false} axisLine={{ stroke: "#E3E7F0" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8890A0" }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "#F6F7FB" }}
                  contentStyle={{ borderRadius: 8, borderColor: "#E3E7F0", fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#0B1B3B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E3E7F0] p-5 shadow-[0_1px_2px_rgba(11,27,59,0.04)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-[#D98E04]" />
            <h3 className="text-sm font-semibold text-[#0B1B3B] tracking-tight">Emails Sent (14 days)</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emailsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F5" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8890A0" }} tickLine={false} axisLine={{ stroke: "#E3E7F0" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8890A0" }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "#FCF7EC" }}
                  contentStyle={{ borderRadius: 8, borderColor: "#E3E7F0", fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#D98E04" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Distribution & Recent Leads Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-[#E3E7F0] p-5 shadow-[0_1px_2px_rgba(11,27,59,0.04)]">
          <h3 className="text-sm font-semibold text-[#0B1B3B] mb-1 tracking-tight">Lead Score Distribution</h3>
          <p className="text-xs text-[#A6ADBD] mb-3">Navy is cold, amber is ready to send</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={scoreChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={{ fill: "#5B6478", fontSize: 11 }}
                >
                  {scoreChart.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#E3E7F0", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E3E7F0] p-5 shadow-[0_1px_2px_rgba(11,27,59,0.04)]">
          <h3 className="text-sm font-semibold text-[#0B1B3B] mb-4 tracking-tight">Recent Leads</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#A6ADBD] border-b border-[#EEF0F5]">
                  <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider">Company</th>
                  <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider">Location</th>
                  <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider">Score</th>
                  <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider">Status</th>
                  <th className="pb-3 text-[11px] font-semibold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF0F5]">
                {(data.recentLeads || []).map((l: any) => {
                  const tier = scoreTier(l.leadScore)
                  return (
                    <tr key={l.id} className="hover:bg-[#F6F7FB] transition-colors">
                      <td className="py-3 font-medium text-[#0B1B3B]">{l.name}</td>
                      <td className="py-3 text-[#5B6478]">
                        {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border tabular-nums ${tier.cls}`}>
                          {tier.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-[#EEF0F5] text-[#0B1B3B] font-medium border border-[#E3E7F0]">
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-800 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                          disabled={deletingId === l.id}
                          onClick={() => deleteLead(l)}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}