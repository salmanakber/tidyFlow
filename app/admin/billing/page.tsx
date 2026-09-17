"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsKpi,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
} from "@/components/ops/OpsChrome"
import { formatMoney, formatDate } from "@/lib/admin-session"

export default function BillingPage() {
  const [status, setStatus] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [st, bill] = await Promise.all([
        axios.get("/api/subscription/status", { headers: headers() }).catch(() => null),
        axios.get("/api/billing", { headers: headers() }).catch(() => null),
      ])
      if (st?.data?.success) setStatus(st.data.data)
      else if (st?.data) setStatus(st.data.data || st.data)
      if (bill?.data?.success) setRecords(bill.data.data || [])
      else if (Array.isArray(bill?.data?.data)) setRecords(bill.data.data)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load billing")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const plan =
    status?.planTier || status?.plan || status?.subscription?.planTier || "—"
  const subStatus =
    status?.subscriptionStatus || status?.status || status?.subscription?.status || "—"

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Finance"
          title="Billing"
          subtitle="Your TidyFlow subscription and invoices"
          actions={<OpsRefreshButton onClick={load} loading={loading} />}
        />
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <OpsKpi label="Plan" value={String(plan)} />
          <OpsKpi label="Status" value={String(subStatus)} />
          <OpsKpi label="Invoices" value={records.length} />
        </div>

        <OpsCard padding={false}>
          <div className="border-b border-control-border px-5 py-4">
            <h2 className="text-sm font-bold text-navy-900 dark:text-white">Billing history</h2>
          </div>
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : records.length === 0 ? (
            <OpsEmpty message="No billing records yet" />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-navy-950">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3">{formatDate(r.createdAt || r.periodStart)}</td>
                    <td className="px-5 py-3 font-medium">
                      {r.description || r.planTier || `Invoice #${r.id}`}
                    </td>
                    <td className="px-5 py-3 font-bold">
                      {formatMoney(r.amount ?? r.total ?? r.totalAmount)}
                    </td>
                    <td className="px-5 py-3">
                      <OpsBadge status={r.status || "paid"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OpsCard>
      </div>
    </AdminLayout>
  )
}
