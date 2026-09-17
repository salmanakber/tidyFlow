"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsFlash,
  OpsPrimaryButton,
} from "@/components/ops/OpsChrome"
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react"

export default function IntegrationsPage() {
  const [qb, setQb] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      // Mobile parity: GET /api/integrations/quickbooks
      const res = await axios.get("/api/integrations/quickbooks", { headers: headers() })
      if (res?.data?.success) setQb(res.data.data)
      else if (res?.data) setQb(res.data.data || res.data)
      else setQb(null)
    } catch (e: any) {
      setError(e.response?.data?.message || "Could not load integrations")
      setQb(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const connect = async () => {
    try {
      const redirect =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : ""
      const res = await axios.get("/api/integrations/quickbooks/connect", {
        headers: headers(),
        params: redirect ? { redirect } : {},
      })
      const url =
        res.data?.data?.url ||
        res.data?.url ||
        res.data?.data?.authorizeUrl ||
        res.data?.data?.authUrl
      if (url) window.location.href = url
      else setError("Connect URL not available")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to start QuickBooks connect")
    }
  }

  const disconnect = async () => {
    if (!confirm("Disconnect QuickBooks?")) return
    try {
      // Mobile parity: DELETE /api/integrations/quickbooks
      await axios.delete("/api/integrations/quickbooks", { headers: headers() })
      setToast("QuickBooks disconnected")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Disconnect failed")
    }
  }

  const connected = !!(qb?.connected || qb?.isConnected || qb?.realmId || qb?.companyName)

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Finance"
          title="Integrations"
          subtitle="Connect accounting tools for your company"
          actions={<OpsRefreshButton onClick={load} loading={loading} />}
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <OpsCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2CA01C]/10 font-black text-[#2CA01C]">
                QB
              </div>
              <div>
                <h2 className="text-base font-bold text-navy-900 dark:text-white">
                  QuickBooks Online
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sync payroll vendors and client invoices with QuickBooks.
                </p>
                {qb?.companyName && (
                  <p className="mt-1 text-xs font-medium text-slate-400">{qb.companyName}</p>
                )}
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                  {connected ? (
                    <>
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span className="text-emerald-700">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={14} className="text-slate-400" />
                      <span className="text-slate-500">Not connected</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {connected ? (
                <button
                  onClick={disconnect}
                  className="h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50"
                >
                  Disconnect
                </button>
              ) : (
                <OpsPrimaryButton onClick={connect} disabled={loading}>
                  <ExternalLink size={14} /> Connect QuickBooks
                </OpsPrimaryButton>
              )}
            </div>
          </div>
        </OpsCard>

        <OpsCard>
          <h3 className="text-sm font-bold text-navy-900 dark:text-white">Google Sheets</h3>
          <p className="mt-2 text-sm text-slate-500">
            Spreadsheet sync and platform Google connections are managed by TidyFlow platform
            administrators — not from the company workspace.
          </p>
        </OpsCard>
      </div>
    </AdminLayout>
  )
}
