"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import Link from "next/link"
import { ArrowLeft, RefreshCw, CheckCircle2, Banknote, FileText, Megaphone } from "lucide-react"

function authHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  return { Authorization: `Bearer ${token}` }
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

export default function AdminPartnerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || "")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [commissionPercent, setCommissionPercent] = useState(10)
  const [manualCompanyId, setManualCompanyId] = useState("")
  const [updateTitle, setUpdateTitle] = useState("")
  const [updateBody, setUpdateBody] = useState("")
  const [docTitle, setDocTitle] = useState("")
  const [docUrl, setDocUrl] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/admin/partners/${id}`, { headers: authHeaders() })
      if (res.data.success) {
        setData(res.data.data)
        setCommissionPercent(Number(res.data.data?.partner?.commissionPercent || 10))
      }
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) void load()
  }, [id])

  const action = async (payload: any) => {
    setMessage(null)
    try {
      const res = await axios.post(`/api/admin/partners/${id}/actions`, payload, {
        headers: authHeaders(),
      })
      if (!res.data.success) throw new Error(res.data.message)
      setMessage("Done")
      await load()
    } catch (err: any) {
      setMessage(err?.response?.data?.message || err.message || "Action failed")
    }
  }

  const saveCommission = async () => {
    try {
      await axios.patch(
        `/api/admin/partners/${id}`,
        { commissionPercent },
        { headers: authHeaders() }
      )
      setMessage("Commission updated")
      await load()
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "Update failed")
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-10 text-center text-gray-500">Loading…</div>
      </AdminLayout>
    )
  }

  if (!data?.partner) {
    return (
      <AdminLayout>
        <div className="p-10 text-center">
          <p className="text-gray-600 mb-4">Partner not found</p>
          <button type="button" onClick={() => router.push("/admin/partners")} className="text-indigo-600">
            Back
          </button>
        </div>
      </AdminLayout>
    )
  }

  const p = data.partner
  const isMarketer = p.type === "MARKETER"
  const summary = data.summary
  const investment = data.investment

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin/partners" className="inline-flex items-center gap-1 text-sm text-gray-500 mb-2">
              <ArrowLeft size={14} /> All partners
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.email}
            </h1>
            <p className="text-sm text-gray-600">
              {p.type} · {p.email} · {p.status}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {message && (
          <p className="text-sm bg-teal-50 border border-teal-200 text-teal-800 rounded-lg px-4 py-2">{message}</p>
        )}

        {isMarketer ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Customers" value={String(summary?.customersBrought ?? 0)} />
              <Stat label="Revenue collected" value={money(summary?.totalRevenueCollected || 0)} />
              <Stat label="Commission earned" value={money(summary?.totalCommissionEarned || 0)} />
              <Stat label="Pending commission" value={money(summary?.pendingCommission || 0)} />
            </div>

            <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500">Commission %</label>
                <input
                  type="number"
                  className="block border rounded-lg px-3 py-2 text-sm mt-1 w-28"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(Number(e.target.value))}
                />
              </div>
              <button type="button" onClick={saveCommission} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                Save rate
              </button>
              <button
                type="button"
                onClick={() => action({ action: "sync-commissions" })}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                Sync from billing
              </button>
              <button
                type="button"
                onClick={() => action({ action: "approve-commissions" })}
                className="inline-flex items-center gap-1 px-3 py-2 border rounded-lg text-sm"
              >
                <CheckCircle2 size={14} /> Approve pending
              </button>
              <button
                type="button"
                onClick={() => action({ action: "create-payout" })}
                className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm"
              >
                <Banknote size={14} /> Create payout
              </button>
            </div>

            <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500">Manual attribute company ID</label>
                <input
                  className="block border rounded-lg px-3 py-2 text-sm mt-1 w-40"
                  value={manualCompanyId}
                  onChange={(e) => setManualCompanyId(e.target.value)}
                  placeholder="e.g. 42"
                />
              </div>
              <button
                type="button"
                className="px-3 py-2 border rounded-lg text-sm"
                onClick={() =>
                  action({ action: "manual-referral", companyId: Number(manualCompanyId) })
                }
              >
                Attribute company
              </button>
              {p.referralCode && (
                <p className="text-xs text-gray-500 w-full">
                  Referral link: /account/login?ref={p.referralCode}
                </p>
              )}
            </div>

            <Panel title="Referred companies">
              <Table
                headers={["Company", "Plan", "Status", "Joined"]}
                rows={(data.companies || []).map((c: any) => [
                  c.name,
                  c.planTier,
                  c.subscriptionStatus,
                  new Date(c.createdAt).toLocaleDateString(),
                ])}
              />
            </Panel>

            <Panel title="Commissions">
              <Table
                headers={["Company", "Revenue", "Commission", "Rate", "Status", "Period"]}
                rows={(data.commissions || []).map((c: any) => [
                  c.company?.name || "—",
                  money(Number(c.revenueAmount)),
                  money(Number(c.commissionAmount)),
                  `${c.commissionRate}%`,
                  c.status,
                  c.periodLabel || "—",
                ])}
              />
            </Panel>

            <Panel title="Payouts">
              <Table
                headers={["Amount", "Status", "Method", "Paid at"]}
                rows={(data.payouts || []).map((payout: any) => [
                  money(Number(payout.amount)),
                  payout.status,
                  payout.method || "—",
                  payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : "—",
                ])}
              />
            </Panel>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Investment" value={money(Number(investment?.amount || 0))} />
              <Stat label="Equity" value={`${Number(investment?.equityPercent || 0)}%`} />
              <Stat label="MRR (approx)" value={money(data.platformMetrics?.mrrApprox || 0)} />
              <Stat label="Customers" value={String(data.platformMetrics?.totalCompanies || 0)} />
            </div>

            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Megaphone size={16} /> Publish investor update
              </h3>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Title"
                value={updateTitle}
                onChange={(e) => setUpdateTitle(e.target.value)}
              />
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={3}
                placeholder="Update body / narrative"
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
              />
              <button
                type="button"
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm"
                onClick={() =>
                  action({
                    action: "publish-update",
                    title: updateTitle,
                    body: updateBody,
                    metrics: data.platformMetrics,
                  })
                }
              >
                Publish to this investor
              </button>
            </div>

            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText size={16} /> Add data-room document
              </h3>
              <div className="grid md:grid-cols-2 gap-2">
                <input
                  className="border rounded-lg px-3 py-2 text-sm"
                  placeholder="Title"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2 text-sm"
                  placeholder="URL"
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="px-3 py-2 border rounded-lg text-sm"
                onClick={() =>
                  action({ action: "add-document", title: docTitle, url: docUrl, category: "report" })
                }
              >
                Add document
              </button>
            </div>

            <Panel title="Updates">
              <ul className="divide-y">
                {(data.updates || []).map((u: any) => (
                  <li key={u.id} className="py-3">
                    <div className="font-medium">{u.title}</div>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{u.body}</p>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Documents">
              <ul className="space-y-2">
                {(data.documents || []).map((d: any) => (
                  <li key={d.id}>
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-indigo-600 text-sm font-medium">
                      {d.title}
                    </a>
                    <span className="text-xs text-gray-400 ml-2">{d.category}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b font-semibold text-gray-900">{title}</div>
      <div className="p-2">{children}</div>
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="p-4 text-sm text-gray-500">No rows yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
